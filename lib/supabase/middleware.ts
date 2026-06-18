import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { sharedCookieOptions } from "./cookies";

/**
 * Host-only session refresh + gate. Points at the ISSUER Supabase project (the
 * Sunday Account), NOT this app's DATA project.
 *
 * Scope is deliberately TINY — the matcher in `middleware.ts` only sends
 * /host/* and /auth/* here. Everything else (anonymous join, /[pin] listener,
 * /kilde source, /tolk interpreter, /o operator-by-secret, every /api/*) never
 * reaches this code and stays exactly as it was.
 *
 *  - refreshes the issuer cookie so a logged-in host stays logged in;
 *  - redirects an unauthenticated /host/* request → /host/login;
 *  - /host/login and /auth/* are always allowed (the login + code-exchange
 *    surfaces). Allowlist authorization happens later in `requireHost()`.
 */
export async function updateHostSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_URL!,
    process.env.NEXT_PUBLIC_SUNDAY_AUTH_ANON_KEY!,
    {
      cookieOptions: sharedCookieOptions(),
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet)
            response.cookies.set(name, value, options);
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  // Surfaces reachable without a session: the login page itself and the
  // OAuth/magic-link code-exchange landing.
  const isOpen = path === "/host/login" || path.startsWith("/auth/");

  if (!user && path.startsWith("/host") && !isOpen) {
    const url = request.nextUrl.clone();
    url.pathname = "/host/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
