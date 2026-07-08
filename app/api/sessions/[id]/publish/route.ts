/**
 * POST /api/sessions/<id>/publish — a source/interpreter (re)registers or drops
 * a channel's coordinates, so listeners can pull its track.
 *   Body: { channelId, sfuSessionId, trackName, live, localStream?, localLive? }
 *   Auth: session secret (Bearer). live=false marks the channel offline.
 *   localStream/localLive are set when the publisher also dual-published to the
 *   church's local relay (mediamtx); omitted = cloud-only (unchanged behaviour).
 */
import { ok, fail, readJson } from "@/lib/server/http";
import { broadcast } from "@/lib/server/broadcast";
import { channels as rtChannels, events } from "@/lib/realtime";
import { setChannelPublish, verifySecret } from "@/lib/server/sessions";

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

  const body = await readJson<{
    channelId?: string;
    sfuSessionId?: string;
    trackName?: string;
    live?: boolean;
    localStream?: string | null;
    localLive?: boolean;
  }>(req);
  if (!body?.channelId) return fail(400, "missing_fields");
  const live = body.live !== false;
  // Going live needs the coordinates; going offline just needs the channel.
  if (live && (!body.sfuSessionId || !body.trackName)) return fail(400, "missing_fields");
  // Length-cap stored coordinates — they ride every public channel-list response.
  if (
    (body.sfuSessionId ?? "").length > 200 ||
    (body.trackName ?? "").length > 120 ||
    (body.localStream ?? "").length > 200
  )
    return fail(400, "invalid_fields");

  const matched = await setChannelPublish(id, body.channelId, {
    sfuSessionId: body.sfuSessionId,
    trackName: body.trackName,
    live,
    ...(body.localStream !== undefined
      ? { localStream: body.localStream, localLive: body.localLive ?? false }
      : {}),
  });
  if (!matched) return fail(404, "channel_not_found");
  await broadcast(rtChannels.session(id), events.channels, {});
  return ok({});
}
