/**
 * GET  /api/sessions/<id>/channels — current channel list (public; listeners poll).
 * POST /api/sessions/<id>/channels — define/relabel a channel (operator; secret).
 *   Body: { kind: "original"|"human"|"ai", targetLocale?, sourceLocale?, label }
 */
import { ok, fail, readJson, bearer } from "@/lib/server/http";
import { broadcast } from "@/lib/server/broadcast";
import { channels as rtChannels, events } from "@/lib/realtime";
import { deleteChannel, listChannels, upsertChannel, verifySecret } from "@/lib/server/sessions";
import type { ChannelKind } from "@/lib/types";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  return ok({ channels: await listChannels(id) });
}

const KINDS: ChannelKind[] = ["original", "human", "ai"];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const session = await verifySecret(id, bearer(req));
  if (!session) return fail(401, "unauthorized");

  const body = await readJson<{
    kind?: string;
    targetLocale?: string | null;
    sourceLocale?: string;
    label?: string;
  }>(req);
  const kind = body?.kind as ChannelKind;
  if (!KINDS.includes(kind)) return fail(400, "invalid_kind");
  const targetLocale =
    kind === "original"
      ? null
      : typeof body?.targetLocale === "string"
        ? body.targetLocale.slice(0, 8)
        : null;
  if (kind !== "original" && !targetLocale) return fail(400, "missing_target");

  const channel = await upsertChannel(id, {
    kind,
    sourceLocale: body?.sourceLocale?.slice(0, 8) || session.source_locale,
    targetLocale,
    label: (body?.label ?? "").slice(0, 60),
  });
  await broadcast(rtChannels.session(id), events.channels, {});
  return ok({ channel }, { status: 201 });
}

/** DELETE — operator removes a mistakenly added channel. Body: { channelId }. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const session = await verifySecret(id, bearer(req));
  if (!session) return fail(401, "unauthorized");

  const body = await readJson<{ channelId?: string }>(req);
  if (!body?.channelId) return fail(400, "missing_fields");
  const removed = await deleteChannel(id, body.channelId);
  if (!removed) return fail(404, "channel_not_found");
  await broadcast(rtChannels.session(id), events.channels, {});
  return ok({});
}
