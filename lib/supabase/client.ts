"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (anon key). Used ONLY for Realtime broadcast +
 * presence subscriptions (live channel list, "who is speaking", captions).
 * All authoritative reads/writes go through server API routes — RLS denies
 * direct table access to anon. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
