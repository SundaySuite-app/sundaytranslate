/**
 * POST /api/sessions — create a translation session.
 * Body: { title?, sourceLocale? }
 * Returns { id, pin, secret } — the SECRET IS RETURNED EXACTLY ONCE. The
 * operator keeps it (URL fragment) and shares staff links that carry it to the
 * source + interpreters; listeners only ever get the PIN.
 */
import { ok, fail, readJson, rateLimit, clientIp } from "@/lib/server/http";
import { createSession } from "@/lib/server/sessions";
import { currentHost } from "@/lib/server/host-auth";

export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`create:${clientIp(req)}`, 20, 60_000)) return fail(429, "rate_limited");
  const body = await readJson<{ title?: string; sourceLocale?: string }>(req);
  const title = typeof body?.title === "string" ? body.title.slice(0, 120) : "";
  const sourceLocale =
    typeof body?.sourceLocale === "string" ? body.sourceLocale.slice(0, 8) : "no";

  // Best-effort owner provenance: if (and only if) an allow-listed Sunday
  // Account host is signed in, stamp the session so it shows in their
  // dashboard. NEVER blocks anonymous create — any failure leaves owner null.
  let hostUserId: string | null = null;
  try {
    hostUserId = (await currentHost())?.id ?? null;
  } catch {
    hostUserId = null;
  }

  try {
    const session = await createSession({ title, sourceLocale, hostUserId });
    return ok(session, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A misconfigured deploy (missing Supabase env in the Worker) must not look
    // like a generic crash — surface a clear 503 so the cause is obvious.
    if (msg.includes("Supabase env missing")) {
      return fail(503, "service_unconfigured", { detail: msg });
    }
    console.error("[create session]", msg);
    return fail(500, "create_failed");
  }
}
