"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key) for the DATA project. Used ONLY for
 * Realtime broadcast + presence subscriptions (live channel list, "who is
 * speaking", captions). All authoritative reads/writes go through server API
 * routes — RLS denies direct table access to anon.
 *
 * SESSION-LESS on purpose: the OPTIONAL Sunday-Account host login uses a
 * separate auth client pointed at the ISSUER project (`auth-browser.ts`). If
 * this DATA client persisted a session it would write a competing `sb-*`
 * cookie and clobber the host's issuer session. `persistSession:false` keeps
 * the anonymous data path completely independent of host auth. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
