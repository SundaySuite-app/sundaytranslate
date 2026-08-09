import { beforeEach, describe, expect, it, vi } from "vitest";

// Every write to a live session is gated by ONE thing: the session secret in an
// Authorization: Bearer header (verifySecret, which also rejects ended/expired
// sessions). This file pins that gate on all six write handlers at once, so a
// new route — or a refactor that moves the check below the body parsing — can't
// quietly open a hole.

const mock = vi.hoisted(() => ({
  /** verifySecret returns null: unknown secret, or ended/expired session. */
  verified: null as { id: string; source_locale: string } | null,
  seen: [] as Array<string | null>,
}));

vi.mock("@/lib/server/sessions", () => ({
  verifySecret: async (_id: string, secret: string | null) => {
    mock.seen.push(secret);
    return mock.verified;
  },
  // Touched only after a successful verify; present so the imports resolve.
  endSession: vi.fn(),
  setChannelPublish: vi.fn(),
  setSessionRelay: vi.fn(),
  upsertCaption: vi.fn(),
  upsertChannel: vi.fn(),
  deleteChannel: vi.fn(),
  listChannels: vi.fn(async () => []),
}));

const broadcast = vi.fn(async () => {});
vi.mock("@/lib/server/broadcast", () => ({ broadcast }));

// The asr route pulls in Workers AI through @opennextjs/cloudflare.
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: {} }),
}));

type Handler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

const ROUTES: Array<{
  name: string;
  method: "POST" | "DELETE";
  path: string;
  load: () => Promise<Record<string, unknown>>;
}> = [
  {
    name: "POST /api/sessions/[id]/end",
    method: "POST",
    path: "end",
    load: () => import("@/app/api/sessions/[id]/end/route"),
  },
  {
    name: "POST /api/sessions/[id]/publish",
    method: "POST",
    path: "publish",
    load: () => import("@/app/api/sessions/[id]/publish/route"),
  },
  {
    name: "POST /api/sessions/[id]/asr",
    method: "POST",
    path: "asr",
    load: () => import("@/app/api/sessions/[id]/asr/route"),
  },
  {
    name: "POST /api/sessions/[id]/relay",
    method: "POST",
    path: "relay",
    load: () => import("@/app/api/sessions/[id]/relay/route"),
  },
  {
    name: "POST /api/sessions/[id]/channels",
    method: "POST",
    path: "channels",
    load: () => import("@/app/api/sessions/[id]/channels/route"),
  },
  {
    name: "DELETE /api/sessions/[id]/channels",
    method: "DELETE",
    path: "channels",
    load: () => import("@/app/api/sessions/[id]/channels/route"),
  },
];

async function callRoute(
  route: (typeof ROUTES)[number],
  auth: string | null,
): Promise<Response> {
  const handler = (await route.load())[route.method] as Handler;
  const headers = new Headers({ "content-type": "application/json" });
  if (auth !== null) headers.set("authorization", auth);
  // A fully valid body, so a 200 could only mean the gate itself let it past.
  const body = JSON.stringify({
    channelId: "c1",
    sfuSessionId: "sfu-1",
    trackName: "t1",
    live: true,
    kind: "human",
    targetLocale: "en",
    label: "Engelsk",
    relayUrl: "https://r.local.sundaysuite.app",
  });
  return handler(
    new Request(`http://x/api/sessions/s1/${route.path}`, {
      method: route.method,
      headers,
      body,
    }),
    { params: Promise.resolve({ id: "s1" }) },
  );
}

beforeEach(() => {
  mock.verified = null;
  mock.seen = [];
  broadcast.mockClear();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://data.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
});

describe("session-secret gate — 401 unauthorized on every write route", () => {
  it.each(ROUTES)("$name — no Authorization header", async (route) => {
    const res = await callRoute(route, null);
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });
    expect(mock.seen.at(-1)).toBeNull();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it.each(ROUTES)("$name — wrong Bearer secret", async (route) => {
    const res = await callRoute(route, "Bearer not-the-secret");
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "unauthorized" });
    // The bearer reached verifySecret; verifySecret is what said no.
    expect(mock.seen.at(-1)).toBe("not-the-secret");
    expect(broadcast).not.toHaveBeenCalled();
  });

  it.each(ROUTES)("$name — malformed Authorization value", async (route) => {
    const res = await callRoute(route, "Basic aGk6aGk=");
    expect(res.status).toBe(401);
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe("session-secret gate — the gate is what blocks, not a missing body", () => {
  it("a verified secret gets past the gate (publish reaches the handler body)", async () => {
    mock.verified = { id: "s1", source_locale: "no" };
    const res = await callRoute(ROUTES[1], "Bearer real-secret");
    // 404 channel_not_found = past the gate, into setChannelPublish (mocked
    // to return undefined). The point is only that 401 is no longer the answer.
    expect(res.status).not.toBe(401);
    expect(mock.seen.at(-1)).toBe("real-secret");
  });
});
