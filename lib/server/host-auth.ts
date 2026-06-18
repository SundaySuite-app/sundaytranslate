import "server-only";

import { createAuthClient } from "@/lib/supabase/auth-server";

/**
 * Host/operatør authorization for SundayTranslate.
 *
 * This is the OPTIONAL "Sign in with Sunday Account" path — it gates ONLY the
 * /host/* surface (the my-oversettelses-sesjons dashboard + owner-gated
 * delete). The anonymous, code-based flow (landing join, /[pin] listener,
 * /kilde, /tolk, /o operator-by-secret) is untouched and never calls this.
 *
 * Identity comes from the ISSUER Supabase project (the suite-wide Sunday
 * Account); authorization is a SINGLE fail-closed allowlist check against
 * TRANSLATE_ADMIN_EMAILS. This is the one and only authz spot.
 */

export class HostAuthError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.name = "HostAuthError";
  }
}

/** Parse the comma/space/newline-separated allowlist, lowercased + trimmed. */
function adminEmails(): string[] {
  return (process.env.TRANSLATE_ADMIN_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Is this email allowed to be a host? Fail-closed: empty allowlist → nobody. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.trim().toLowerCase());
}

export interface Host {
  id: string;
  email: string;
}

/**
 * Resolve + authorize the signed-in host.
 *  - 401 `not_signed_in`  — no valid issuer session cookie.
 *  - 403 `not_allowlisted` — signed in but not in TRANSLATE_ADMIN_EMAILS.
 * Returns the host (issuer user id + email) on success.
 */
export async function requireHost(): Promise<Host> {
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HostAuthError(401, "not_signed_in");
  if (!isAdminEmail(user.email)) throw new HostAuthError(403, "not_allowlisted");
  return { id: user.id, email: user.email ?? "" };
}

/** Resolve the host without throwing — null when not signed in / not allowed.
 * Used on best-effort owner stamping so anonymous create never breaks. */
export async function currentHost(): Promise<Host | null> {
  try {
    return await requireHost();
  } catch {
    return null;
  }
}

/** Uniform catch → Response for host API routes. */
export function hostAuthFail(err: unknown): Response | null {
  if (err instanceof HostAuthError) {
    return Response.json({ ok: false, error: err.message }, { status: err.status });
  }
  return null;
}
