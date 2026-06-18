import { NextResponse } from "next/server";

import { createAuthClient } from "@/lib/supabase/auth-server";

/**
 * OAuth / magic-link landing for the OPTIONAL Sunday-Account host login.
 * Exchanges the code for an ISSUER session cookie, then sends the host to the
 * dashboard. Whitelisted in middleware (no session yet at this point).
 *
 * Hardened: only ever redirects to a SAME-ORIGIN path so a crafted `next`
 * cannot turn this into an open redirect; on any error it falls back to the
 * login page rather than leaking a stack.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Only same-origin relative paths under /host are honoured.
  const rawNext = searchParams.get("next") ?? "/host";
  const next =
    rawNext.startsWith("/host") && !rawNext.startsWith("//") ? rawNext : "/host";

  if (!code) {
    return NextResponse.redirect(`${origin}/host/login`);
  }

  try {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(`${origin}/host/login`);
    }
  } catch {
    return NextResponse.redirect(`${origin}/host/login`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
