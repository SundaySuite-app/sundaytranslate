/**
 * POST/PUT /api/rt/<path> — server-side proxy to the Cloudflare Realtime SFU.
 *
 * The SFU App Token is a SECRET and must never reach the browser. The browser
 * runs the WebRTC peer connection (lib/sfu.ts) and calls these routes to relay
 * the three SFU operations; we inject the bearer here.
 *
 * Allowlisted paths only (no open proxy):
 *   POST sessions/new
 *   POST sessions/<sfuSessionId>/tracks/new
 *   PUT  sessions/<sfuSessionId>/renegotiate
 *
 * Base: https://rtc.live.cloudflare.com/v1/apps/<APP_ID>/<path>
 * (Cloudflare Calls / Realtime SFU "tracks" API.)
 */
import { fail, rateLimit, clientIp } from "@/lib/server/http";
import { getSession } from "@/lib/server/sessions";

const SFU_BASE = "https://rtc.live.cloudflare.com/v1/apps";

// The SFU session id. Dots/underscores/hyphens occur in Cloudflare's ids, but a
// segment made ONLY of punctuation is never an id — the leading lookahead
// demands at least one alphanumeric so `..`, `.` and `...` can't stand in for
// one. Length-bounded so the class can't be walked far.
const SFU_ID = "(?=[A-Za-z0-9._-]*[A-Za-z0-9])[A-Za-z0-9._-]{1,128}";

const ALLOW: Record<string, RegExp> = {
  POST: new RegExp(`^sessions/new$|^sessions/${SFU_ID}/tracks/new$`),
  PUT: new RegExp(`^sessions/${SFU_ID}/renegotiate$`),
};

async function proxy(req: Request, path: string[]): Promise<Response> {
  const appId = process.env.CF_REALTIME_APP_ID;
  const appToken = process.env.CF_REALTIME_APP_TOKEN;
  if (!appId || !appToken) return fail(503, "sfu_not_configured");

  // Bind every proxied SFU op to a real live session (publisher or listener both
  // carry the session id). Without this the proxy is an open relay that mints SFU
  // sessions/tracks under our App Token — anyone could burn the Realtime budget.
  const sessionId = req.headers.get("x-session-id");
  if (!sessionId) return fail(401, "session_required");

  // Key the limit on IP+session: a whole congregation shares the church wifi's
  // single IP, and a service-start join burst must not 429 legitimate listeners.
  if (!rateLimit(`rt:${sessionId.slice(0, 64)}:${clientIp(req)}`, 240, 60_000))
    return fail(429, "rate_limited");
  const session = await getSession(sessionId);
  if (!session || session.status !== "live") return fail(401, "session_required");

  // Defence in depth against path traversal: a `.`/`..` segment must never
  // reach the upstream URL. The id class allows dots, so `sessions/../tracks/new`
  // would otherwise satisfy the allowlist and let WHATWG URL normalisation
  // rewrite the path we thought we had approved (…/apps/<id>/tracks/new).
  // Rejected exactly like any other unlisted path — same 404, no new error code.
  if (path.some((seg) => seg === "." || seg === "..")) return fail(404, "not_found");

  const sub = path.join("/");
  const allow = ALLOW[req.method];
  if (!allow || !allow.test(sub)) return fail(404, "not_found");

  const body = await req.text();
  let upstream: Response;
  // Bounded: a stalled SFU fetch must never hang the Worker (timedFetch gotcha).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    upstream = await fetch(`${SFU_BASE}/${appId}/${sub}`, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Content-Type": "application/json",
      },
      body: body || undefined,
      signal: ctrl.signal,
    });
  } catch {
    return fail(502, "sfu_unreachable");
  } finally {
    clearTimeout(timer);
  }

  // Pass the SFU's JSON response straight through (SDP answers/offers etc.).
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}

export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await ctx.params).path);
}
