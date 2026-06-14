/**
 * POST /api/sessions — create a translation session.
 * Body: { title?, sourceLocale? }
 * Returns { id, pin, secret } — the SECRET IS RETURNED EXACTLY ONCE. The
 * operator keeps it (URL fragment) and shares staff links that carry it to the
 * source + interpreters; listeners only ever get the PIN.
 */
import { ok, fail, readJson, rateLimit, clientIp } from "@/lib/server/http";
import { createSession } from "@/lib/server/sessions";

export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`create:${clientIp(req)}`, 20, 60_000)) return fail(429, "rate_limited");
  const body = await readJson<{ title?: string; sourceLocale?: string }>(req);
  const title = typeof body?.title === "string" ? body.title.slice(0, 120) : "";
  const sourceLocale =
    typeof body?.sourceLocale === "string" ? body.sourceLocale.slice(0, 8) : "no";

  try {
    const session = await createSession({ title, sourceLocale });
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
