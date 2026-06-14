/**
 * POST /api/sessions/<id>/relay — register (or clear) the local relay that
 * hosts this session, so on-wifi listeners can discover it and prefer it over
 * the cloud SFU.
 *   Body: { relayUrl: string | null, expiresAt?: string | null }
 *   Auth: session secret (Bearer). relayUrl must be https (mixed-content rule).
 */
import { ok, fail, readJson } from "@/lib/server/http";
import { broadcast } from "@/lib/server/broadcast";
import { channels as rtChannels, events } from "@/lib/realtime";
import { setSessionRelay, verifySecret } from "@/lib/server/sessions";

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

  const body = await readJson<{ relayUrl?: string | null; expiresAt?: string | null }>(req);
  const relayUrl =
    typeof body?.relayUrl === "string" && body.relayUrl.trim() ? body.relayUrl.trim() : null;
  // A listener fetches the page over https; calling an http relay would be
  // blocked as mixed content, so a relay must be https.
  if (relayUrl && !/^https:\/\//i.test(relayUrl)) {
    return fail(400, "relay_must_be_https");
  }
  const expiresAt = typeof body?.expiresAt === "string" ? body.expiresAt : null;

  await setSessionRelay(id, relayUrl, expiresAt);
  await broadcast(rtChannels.session(id), events.session, {});
  return ok({});
}
