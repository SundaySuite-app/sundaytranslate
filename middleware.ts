import { type NextRequest } from "next/server";

import { updateHostSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateHostSession(request);
}

export const config = {
  // ONLY the optional host-login surface. Anonymous join/play/board/projector/
  // display and every code-based staff route (/[pin], /kilde, /tolk, /o, all
  // /api/*) are intentionally NOT matched, so they are never touched by auth.
  matcher: ["/host/:path*", "/auth/:path*"],
};
