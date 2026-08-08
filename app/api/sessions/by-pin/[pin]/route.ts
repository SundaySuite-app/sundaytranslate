/**
 * GET /api/sessions/by-pin/<pin> — listener/staff join. Resolves a live session
 * and returns its current channel list so the page can render immediately.
 */
import { ok, fail, rateLimit, clientIp } from "@/lib/server/http";
import { isValidPin } from "@/lib/codes";
import { sessionByPin, listChannels } from "@/lib/server/sessions";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ pin: string }> },
): Promise<Response> {
  const { pin } = await ctx.params;
  if (!isValidPin(pin)) return fail(400, "invalid_pin");
  // Blunt remote PIN-space scanning (10^6 codes). Generous per-IP budget: a
  // whole congregation joins from the church wifi's single IP, and each join
  // costs one lookup — 240/min never throttles a real service start.
  if (!rateLimit(`bypin:${clientIp(req)}`, 240, 60_000)) return fail(429, "rate_limited");
  const session = await sessionByPin(pin);
  if (!session) return fail(404, "not_found");
  const channels = await listChannels(session.id);
  return ok({ session, channels });
}
