/**
 * POST /api/sessions/<id>/end — end the session (operator; secret). Frees the
 * PIN and tells every listener to stop.
 */
import { ok, fail } from "@/lib/server/http";
import { broadcast } from "@/lib/server/broadcast";
import { channels as rtChannels, events } from "@/lib/realtime";
import { endSession, verifySecret } from "@/lib/server/sessions";

function bearer(req: Request): string | null {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? null;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const session = await verifySecret(id, bearer(req));
  if (!session) return fail(401, "unauthorized");
  await endSession(id);
  await broadcast(rtChannels.session(id), events.session, { status: "ended" });
  return ok({});
}
