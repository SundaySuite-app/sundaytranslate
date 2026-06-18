/**
 * DELETE /api/host/sessions/<id> — owner-gated delete of a host's own
 * oversettelses-sesjon (Sunday Account login).
 *
 *   401 not_signed_in   — no issuer session.
 *   403 not_allowlisted — signed in but not in TRANSLATE_ADMIN_EMAILS.
 *   404 not_found       — the session does not exist OR is owned by someone
 *                         else (we never reveal another host's ids).
 *   200 ok              — deleted; channels cascade, captions cleared.
 *
 * This is the ONLY delete path tied to ownership. The anonymous code-based flow
 * (operator "end session" via secret) is untouched.
 */
import { ok, fail } from "@/lib/server/http";
import { requireHost, hostAuthFail } from "@/lib/server/host-auth";
import { deleteSessionOwned, getOwnedSessionSecret } from "@/lib/server/sessions";

/**
 * GET /api/host/sessions/<id> — return { pin, secret } for an owned session so
 * the dashboard can deep-link the host straight into the operator console
 * (`/o/<id>?pin=...#secret`) without re-typing anything. Owner-gated: a host
 * can only read the secret of a session they own.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const host = await requireHost();
    const { id } = await ctx.params;
    const found = await getOwnedSessionSecret(id, host.id);
    if (!found) return fail(404, "not_found");
    return ok(found);
  } catch (e) {
    const authResponse = hostAuthFail(e);
    if (authResponse) return authResponse;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Supabase env missing")) {
      return fail(503, "service_unconfigured", { detail: msg });
    }
    console.error("[host open session]", msg);
    return fail(500, "open_failed");
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const host = await requireHost();
    const { id } = await ctx.params;
    const removed = await deleteSessionOwned(id, host.id);
    if (!removed) return fail(404, "not_found");
    return ok({});
  } catch (e) {
    const authResponse = hostAuthFail(e);
    if (authResponse) return authResponse;
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Supabase env missing")) {
      return fail(503, "service_unconfigured", { detail: msg });
    }
    console.error("[host delete session]", msg);
    return fail(500, "delete_failed");
  }
}
