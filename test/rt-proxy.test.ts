import { beforeEach, describe, expect, it, vi } from "vitest";

// The SFU proxy carries our App Token, so its allowlist is a security boundary:
// anything it forwards is minted under our Realtime budget. These tests pin the
// full guard matrix — env, session binding, method, path shape and traversal.

const mock = vi.hoisted(() => ({
  session: null as { id: string; status: string } | null,
}));

vi.mock("@/lib/server/sessions", () => ({
  getSession: async () => mock.session,
}));

import { POST, PUT } from "@/app/api/rt/[...path]/route";

const APP_ID = "app-123";
const SFU_BASE = `https://rtc.live.cloudflare.com/v1/apps/${APP_ID}`;

let upstream: ReturnType<typeof vi.fn>;
/** Each request gets its own client IP so the 240/min limiter never bleeds
 * between cases (the bucket is keyed on session+IP and lives per isolate). */
let ip = 0;

/** Invoke a handler the way Next does. `method` drives BOTH the handler and the
 * Request verb — the allowlist is keyed on `req.method`, so they must agree. */
function call(
  method: "POST" | "PUT",
  path: string[],
  opts: { sessionId?: string | null; ip?: string } = {},
) {
  const headers = new Headers({ "cf-connecting-ip": opts.ip ?? `10.0.0.${++ip % 250}` });
  const sessionId = opts.sessionId === undefined ? "sess-1" : opts.sessionId;
  if (sessionId) headers.set("x-session-id", sessionId);
  const handler = method === "POST" ? POST : PUT;
  return handler(
    new Request(`http://x/api/rt/${path.join("/")}`, {
      method,
      headers,
      body: JSON.stringify({ sessionDescription: { type: "offer", sdp: "v=0" } }),
    }),
    { params: Promise.resolve({ path }) },
  );
}

beforeEach(() => {
  mock.session = { id: "sess-1", status: "live" };
  vi.stubEnv("CF_REALTIME_APP_ID", APP_ID);
  vi.stubEnv("CF_REALTIME_APP_TOKEN", "token-abc");
  upstream = vi.fn(async () => new Response(JSON.stringify({ sessionId: "sfu-1" }), { status: 200 }));
  vi.stubGlobal("fetch", upstream);
});

// ── allowlisted paths reach the SFU ─────────────────────────────────────────
describe("rt proxy — allowlisted paths", () => {
  it("POST sessions/new forwards with the bearer injected", async () => {
    const res = await call("POST", ["sessions", "new"]);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ sessionId: "sfu-1" });
    expect(upstream).toHaveBeenCalledTimes(1);
    const [url, init] = upstream.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${SFU_BASE}/sessions/new`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-abc");
  });

  it("POST sessions/<id>/tracks/new forwards", async () => {
    const res = await call("POST", ["sessions", "abc123", "tracks", "new"]);
    expect(res.status).toBe(200);
    expect(upstream.mock.calls[0][0]).toBe(`${SFU_BASE}/sessions/abc123/tracks/new`);
  });

  it("PUT sessions/<id>/renegotiate forwards", async () => {
    const res = await call("PUT", ["sessions", "abc123", "renegotiate"]);
    expect(res.status).toBe(200);
    expect(upstream.mock.calls[0][0]).toBe(`${SFU_BASE}/sessions/abc123/renegotiate`);
  });

  it("accepts the punctuation Cloudflare ids may carry (dot, dash, underscore)", async () => {
    const res = await call("POST", ["sessions", "a.b-c_d9", "tracks", "new"]);
    expect(res.status).toBe(200);
  });

  it("passes the upstream status straight through", async () => {
    upstream.mockResolvedValueOnce(new Response(JSON.stringify({ errorCode: 1 }), { status: 400 }));
    const res = await call("POST", ["sessions", "new"]);
    expect(res.status).toBe(400);
  });

  it("answers 502 sfu_unreachable when the upstream fetch fails", async () => {
    upstream.mockRejectedValueOnce(new Error("boom"));
    const res = await call("POST", ["sessions", "new"]);
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "sfu_unreachable" });
  });
});

// ── traversal + shape: nothing unlisted may reach the SFU ───────────────────
describe("rt proxy — path traversal and bad shapes are 404", () => {
  const cases: Array<[string, "POST" | "PUT", string[]]> = [
    ["dot-dot segment (sessions/../tracks/new)", "POST", ["sessions", "..", "tracks", "new"]],
    ["dot segment (sessions/./tracks/new)", "POST", ["sessions", ".", "tracks", "new"]],
    ["dot-dot on renegotiate", "PUT", ["sessions", "..", "renegotiate"]],
    ["leading dot-dot", "POST", ["..", "sessions", "new"]],
    ["trailing dot-dot", "POST", ["sessions", "abc123", "tracks", "new", ".."]],
    // ctx.params hands us DECODED segments, so an encoded slash arrives as a
    // literal "/" inside one segment — the class has no slash, so it can't match.
    ["segment carrying a decoded slash", "POST", ["sessions", "../..", "tracks", "new"]],
    ["punctuation-only id (...)", "POST", ["sessions", "...", "tracks", "new"]],
    ["punctuation-only id (-)", "POST", ["sessions", "-", "tracks", "new"]],
    ["empty id segment", "POST", ["sessions", "", "tracks", "new"]],
    ["unlisted verb", "POST", ["sessions", "abc123", "tracks", "close"]],
    ["open relay attempt", "POST", ["apps", "other", "sessions", "new"]],
  ];

  it.each(cases)("404 not_found: %s", async (_name, method, path) => {
    const res = await call(method, path);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "not_found" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("404 on the wrong method for an allowed path (PUT sessions/new)", async () => {
    const res = await call("PUT", ["sessions", "new"]);
    expect(res.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("404 on the wrong method for renegotiate (POST)", async () => {
    const res = await call("POST", ["sessions", "abc123", "renegotiate"]);
    expect(res.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});

// ── session binding ─────────────────────────────────────────────────────────
describe("rt proxy — session binding", () => {
  it("401 session_required without x-session-id", async () => {
    const res = await call("POST", ["sessions", "new"], { sessionId: null });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "session_required" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("401 session_required when the session is unknown (or expired)", async () => {
    mock.session = null;
    const res = await call("POST", ["sessions", "new"]);
    expect(res.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("401 session_required when the session has ended", async () => {
    mock.session = { id: "sess-1", status: "ended" };
    const res = await call("POST", ["sessions", "new"]);
    expect(res.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});

// ── configuration gate ──────────────────────────────────────────────────────
describe("rt proxy — 503 without SFU credentials", () => {
  it("503 sfu_not_configured when both app id and token are missing", async () => {
    vi.stubEnv("CF_REALTIME_APP_ID", "");
    vi.stubEnv("CF_REALTIME_APP_TOKEN", "");
    const res = await call("POST", ["sessions", "new"]);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "sfu_not_configured" });
  });

  it("503 when only the token is missing", async () => {
    vi.stubEnv("CF_REALTIME_APP_TOKEN", "");
    const res = await call("POST", ["sessions", "new"]);
    expect(res.status).toBe(503);
  });

  it("the config gate precedes the session gate (503, not 401)", async () => {
    vi.stubEnv("CF_REALTIME_APP_ID", "");
    const res = await call("POST", ["sessions", "new"], { sessionId: null });
    expect(res.status).toBe(503);
  });
});

// ── rate limit (240/min per session+IP) ─────────────────────────────────────
describe("rt proxy — rate limit", () => {
  it("429 rate_limited past 240 requests in the window", async () => {
    const opts = { sessionId: "burst", ip: "203.0.113.9" };
    for (let i = 0; i < 240; i++) {
      const res = await call("POST", ["sessions", "new"], opts);
      expect(res.status).toBe(200);
    }
    const res = await call("POST", ["sessions", "new"], opts);
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({ error: "rate_limited" });
  });
});
