import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/relay/enroll brokers a DNS record + the shared wildcard cert for a
// church's local relay. It is unauthenticated apart from a shared pairing code,
// so its input validation IS the boundary: a bad slug or a non-LAN IP would
// have us publish a public A-record pointing wherever the caller asked.

import { POST } from "@/app/api/relay/enroll/route";

const ENV = {
  RELAY_ENROLL_TOKEN: "pair-code-secret",
  RELAY_WILDCARD_CERT_PEM: "-----BEGIN CERTIFICATE-----",
  RELAY_WILDCARD_KEY_PEM: "-----BEGIN PRIVATE KEY-----",
  CF_DNS_TOKEN: "cf-dns-token",
  CF_ZONE_ID: "zone-123",
} as const;

let dns: ReturnType<typeof vi.fn>;
/** The enroll limiter is 30/min per IP; give every request its own so a matrix
 * of >30 cases doesn't start answering 429 halfway through. */
let ip = 0;

function call(
  body: Record<string, unknown> | string,
  opts: { ip?: string } = {},
): Promise<Response> {
  return POST(
    new Request("http://x/api/relay/enroll", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": opts.ip ?? `198.51.100.${++ip % 250}`,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const GOOD = { pairing_code: ENV.RELAY_ENROLL_TOKEN, lan_ip: "192.168.1.50", slug: "menighet" };

beforeEach(() => {
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  vi.stubEnv("RELAY_WILDCARD_EXPIRES_AT", "2027-01-01T00:00:00Z");
  // Cloudflare DNS API: list (no existing record) then create.
  dns = vi.fn(async (url: string) =>
    url.includes("?type=A")
      ? new Response(JSON.stringify({ result: [] }), { status: 200 })
      : new Response(JSON.stringify({ success: true, result: { id: "rec-1" } }), { status: 200 }),
  );
  vi.stubGlobal("fetch", dns);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ── configuration gate ──────────────────────────────────────────────────────
describe("enroll — 503 until every broker secret is present", () => {
  it("200 when all five are set", async () => {
    const res = await call(GOOD);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      host: "menighet.local.sundaysuite.app",
      cert_pem: ENV.RELAY_WILDCARD_CERT_PEM,
      key_pem: ENV.RELAY_WILDCARD_KEY_PEM,
      expires_at: "2027-01-01T00:00:00Z",
    });
  });

  it.each(Object.keys(ENV))("503 relay_broker_unconfigured without %s", async (missing) => {
    vi.stubEnv(missing, "");
    const res = await call(GOOD);
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: "relay_broker_unconfigured" });
    expect(dns).not.toHaveBeenCalled();
  });

  it("the config gate precedes the pairing code (503, not 401)", async () => {
    vi.stubEnv("CF_ZONE_ID", "");
    const res = await call({ ...GOOD, pairing_code: "wrong" });
    expect(res.status).toBe(503);
  });
});

// ── pairing code ────────────────────────────────────────────────────────────
describe("enroll — pairing code", () => {
  it.each([
    ["wrong code", "not-the-code"],
    ["same length, one char off", "pair-code-secreT"],
    ["empty", ""],
  ])("401 bad_pairing_code: %s", async (_name, code) => {
    const res = await call({ ...GOOD, pairing_code: code });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "bad_pairing_code" });
    expect(dns).not.toHaveBeenCalled();
  });

  it("401 when the body is missing entirely", async () => {
    const res = await call("not json");
    expect(res.status).toBe(401);
  });
});

// ── LAN IP ──────────────────────────────────────────────────────────────────
describe("enroll — lan_ip must be RFC-1918", () => {
  it.each([
    ["public IPv4", "8.8.8.8"],
    ["link-local", "169.254.10.1"],
    ["loopback", "127.0.0.1"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["just below the 172 block", "172.15.0.1"],
    ["just above the 172 block", "172.32.0.1"],
    ["not an address", "min-relay"],
    ["hostname smuggled in", "192.168.1.1.evil.example"],
    ["empty", ""],
  ])("400 bad_lan_ip: %s", async (_name, lan_ip) => {
    const res = await call({ ...GOOD, lan_ip });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "bad_lan_ip" });
    expect(dns).not.toHaveBeenCalled();
  });

  it.each([
    ["10/8", "10.0.0.5"],
    ["192.168/16", "192.168.1.50"],
    ["172.16 (low edge)", "172.16.0.2"],
    ["172.31 (high edge)", "172.31.255.254"],
  ])("accepts %s and writes it as an UN-proxied A record", async (_name, lan_ip) => {
    const res = await call({ ...GOOD, lan_ip });
    expect(res.status).toBe(200);
    const create = dns.mock.calls.at(-1) as [string, RequestInit];
    expect(JSON.parse(String(create[1].body))).toMatchObject({
      type: "A",
      name: "menighet.local.sundaysuite.app",
      content: lan_ip,
      proxied: false,
    });
  });
});

// ── slug ────────────────────────────────────────────────────────────────────
describe("enroll — slug must be a legal single DNS label", () => {
  it.each([
    ["trailing hyphen", "menighet-"],
    ["leading hyphen", "-menighet"],
    ["uppercase", "Menighet"],
    ["single character", "a"],
    ["42 characters", "a".repeat(42)],
    ["dot (would escape the single label)", "a.b"],
    ["underscore", "a_b"],
    ["empty", ""],
    ["whitespace", "min relay"],
  ])("400 bad_slug: %s", async (_name, slug) => {
    const res = await call({ ...GOOD, slug });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "bad_slug" });
    expect(dns).not.toHaveBeenCalled();
  });

  it.each([
    ["two characters", "ab"],
    ["inner hyphen", "salem-kirke"],
    ["digits", "kirke2"],
    ["41 characters (the cap)", "a".repeat(41)],
  ])("accepts %s", async (_name, slug) => {
    const res = await call({ ...GOOD, slug });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      host: `${slug}.local.sundaysuite.app`,
    });
  });
});

// ── DNS failures + limiter ──────────────────────────────────────────────────
describe("enroll — upstream DNS and rate limit", () => {
  it("updates the existing record instead of creating a duplicate", async () => {
    dns.mockImplementationOnce(
      async () => new Response(JSON.stringify({ result: [{ id: "rec-9" }] }), { status: 200 }),
    );
    const res = await call(GOOD);
    expect(res.status).toBe(200);
    const [url, init] = dns.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toContain("/dns_records/rec-9");
    expect(init.method).toBe("PUT");
  });

  it("502 dns_update_failed when Cloudflare rejects the write", async () => {
    dns.mockImplementation(async (url: string) =>
      url.includes("?type=A")
        ? new Response(JSON.stringify({ result: [] }), { status: 200 })
        : new Response(JSON.stringify({ success: false, errors: ["nope"] }), { status: 403 }),
    );
    const res = await call(GOOD);
    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({ error: "dns_update_failed" });
  });

  it("429 rate_limited past 30 enrolments a minute from one IP", async () => {
    const opts = { ip: "203.0.113.77" };
    for (let i = 0; i < 30; i++) expect((await call(GOOD, opts)).status).toBe(200);
    const res = await call(GOOD, opts);
    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toMatchObject({ error: "rate_limited" });
  });
});
