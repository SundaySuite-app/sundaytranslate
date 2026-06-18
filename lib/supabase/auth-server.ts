import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { sharedCookieOptions } from "./cookies";

/**
 * Sunday Account auth client (SERVER) — points at the ISSUER Supabase project
 * (the suite-wide identity project), NOT this app's DATA project. The data
 * project (`translator` schema on the shared "Sunday" project) keeps its own
 * env (`NEXT_PUBLIC_SUPABASE_URL` / service role) completely unchanged.
 *
 * Used only to resolve the signed-in HOST/operatør from the request cookies.
 * Authorization is a separate, fail-closed allowlist check (see
 * `lib/server/host-auth.ts`); nothing here grants access on its own.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_URL!,
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_ANON_KEY!,
    {
      cookieOptions: sharedCookieOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // In Server Components cookie writes throw; the middleware refreshes
          // the session, so swallowing here is safe.
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // no-op in RSC render context
          }
        },
      },
    },
  );
}
