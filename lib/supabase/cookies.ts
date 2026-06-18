import type { CookieOptions } from "@supabase/ssr";

/**
 * Shared cookie options for every Sunday-Account auth client (browser, server,
 * middleware) so the issuer session cookie is written identically everywhere.
 *
 * Cross-subdomain SSO (Sunday Account): when `NEXT_PUBLIC_COOKIE_DOMAIN` is set
 * (`.sundaysuite.app` in production), the session cookie is scoped to the
 * parent domain so every Sunday web app shares one host login. Left unset in
 * local dev so cookies keep working on `localhost`.
 *
 * NOTE: this is for the OPTIONAL host/operatør login only. Listeners, the
 * source desk and interpreters keep their anonymous, code-based flow and never
 * touch this cookie.
 */
export function sharedCookieOptions(): CookieOptions {
  const domain = process.env.NEXT_PUBLIC_COOKIE_DOMAIN?.trim();
  if (!domain) return {};
  return {
    domain,
    path: "/",
    sameSite: "lax",
    secure: true,
  };
}
