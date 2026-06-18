"use client";

import { createBrowserClient } from "@supabase/ssr";

import { sharedCookieOptions } from "./cookies";

/**
 * Sunday Account auth client (BROWSER) — points at the ISSUER Supabase project
 * (the suite-wide identity project), NOT this app's DATA project. Used only on
 * the host login page to start magic-link / Google sign-in for the operatør.
 *
 * The DATA/anon client (`lib/supabase/client.ts`) is session-LESS and is the
 * only one the anonymous listener/source/interpreter surfaces ever use, so the
 * two never fight over the `sb-*` cookie.
 */
export function createAuthBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_URL!,
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_ANON_KEY!,
    { cookieOptions: sharedCookieOptions() },
  );
}
