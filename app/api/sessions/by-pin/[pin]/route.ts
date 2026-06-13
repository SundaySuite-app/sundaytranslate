/**
 * GET /api/sessions/by-pin/<pin> — listener/staff join. Resolves a live session
 * and returns its current channel list so the page can render immediately.
 */
import { ok, fail } from "@/lib/server/http";
import { isValidPin } from "@/lib/codes";
import { sessionByPin, listChannels } from "@/lib/server/sessions";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ pin: string }> },
): Promise<Response> {
  const { pin } = await ctx.params;
  if (!isValidPin(pin)) return fail(400, "invalid_pin");
  const session = await sessionByPin(pin);
  if (!session) return fail(404, "not_found");
  const channels = await listChannels(session.id);
  return ok({ session, channels });
}
