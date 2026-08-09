/**
 * POST /api/relay/enroll — broker for a local relay (sundaytranslate-relay).
 *
 *   Body:    { pairing_code, lan_ip, slug }   (snake_case — matches the Rust engine)
 *   Returns: { host, cert_pem, key_pem, expires_at }
 *
 * The relay can't get a public CA cert for a raw 192.168.x.x, so the cloud (which
 * owns the sundaysuite.app zone) brokers it:
 *   1. validate a shared pairing token,
 *   2. point `<slug>.local.sundaysuite.app` at the relay's LAN IP via Cloudflare
 *      DNS — crucially UN-proxied (a direct A-record), so traffic stays on the LAN,
 *   3. hand back the pre-provisioned `*.local.sundaysuite.app` wildcard cert so the
 *      relay serves valid HTTPS and the browser reaches it without mixed-content.
 *
 * Wildcard-shortcut (per the approved plan): all relays share one wildcard cert.
 * Acceptable for LAN use; revisit per-device ACME if isolation ever matters.
 *
 * Required Worker config: RELAY_ENROLL_TOKEN, RELAY_WILDCARD_CERT_PEM,
 * RELAY_WILDCARD_KEY_PEM, CF_DNS_TOKEN (zone DNS-edit only), CF_ZONE_ID
 * (the sundaysuite.app zone). Optional: RELAY_WILDCARD_EXPIRES_AT.
 */
import { ok, fail, readJson, rateLimit, clientIp } from "@/lib/server/http";

const HOST_SUFFIX = ".local.sundaysuite.app";

/** Constant-time string compare (avoid leaking the token via timing). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** RFC-1918 private IPv4 — the relay must be reporting a real LAN address. */
function isPrivateIpv4(ip: string): boolean {
  return (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(ip)
  );
}

/** Single DNS label (the wildcard cert only covers one level). Both ends must
 * be alphanumeric: a trailing hyphen (`menighet-`) is not a legal DNS label,
 * and the old pattern accepted it — the record would be created and then fail
 * to resolve. Length 2–41, hyphens allowed only in the middle. */
const isSlug = (s: string) => /^[a-z0-9][a-z0-9-]{0,39}[a-z0-9]$/.test(s);

export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`enroll:${clientIp(req)}`, 30, 60_000)) return fail(429, "rate_limited");

  const enrollToken = process.env.RELAY_ENROLL_TOKEN;
  const certPem = process.env.RELAY_WILDCARD_CERT_PEM;
  const keyPem = process.env.RELAY_WILDCARD_KEY_PEM;
  const cfToken = process.env.CF_DNS_TOKEN;
  const zoneId = process.env.CF_ZONE_ID;
  if (!enrollToken || !certPem || !keyPem || !cfToken || !zoneId) {
    return fail(503, "relay_broker_unconfigured");
  }

  const body = await readJson<{ pairing_code?: string; lan_ip?: string; slug?: string }>(req);
  if (!body?.pairing_code || !safeEqual(body.pairing_code, enrollToken)) {
    return fail(401, "bad_pairing_code");
  }
  if (!body.lan_ip || !isPrivateIpv4(body.lan_ip)) return fail(400, "bad_lan_ip");
  if (!body.slug || !isSlug(body.slug)) return fail(400, "bad_slug");

  const host = `${body.slug}${HOST_SUFFIX}`;
  try {
    await upsertARecord(zoneId, cfToken, host, body.lan_ip);
  } catch (e) {
    return fail(502, "dns_update_failed", {
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  return ok({
    host,
    cert_pem: certPem,
    key_pem: keyPem,
    expires_at: process.env.RELAY_WILDCARD_EXPIRES_AT ?? "",
  });
}

/** Create or update an UN-proxied A record `name → ip` in the zone. Bounded:
 * a stalled Cloudflare API must never hang the Worker (the suite-wide
 * timedFetch gotcha) — one deadline covers both round-trips incl. body reads. */
async function upsertARecord(
  zoneId: string,
  token: string,
  name: string,
  ip: string,
): Promise<void> {
  const base = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const record = { type: "A", name, content: ip, ttl: 120, proxied: false };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const listRes = await fetch(`${base}?type=A&name=${encodeURIComponent(name)}`, {
      headers,
      signal: ctrl.signal,
    });
    const list = (await listRes.json()) as { result?: Array<{ id: string }> };
    const existingId = list.result?.[0]?.id;

    const res = existingId
      ? await fetch(`${base}/${existingId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify(record),
          signal: ctrl.signal,
        })
      : await fetch(base, { method: "POST", headers, body: JSON.stringify(record), signal: ctrl.signal });

    const j = (await res.json()) as { success?: boolean; errors?: unknown };
    if (!res.ok || !j.success) {
      throw new Error(`cloudflare dns ${res.status} ${JSON.stringify(j.errors ?? "")}`);
    }
  } finally {
    clearTimeout(timer);
  }
}
