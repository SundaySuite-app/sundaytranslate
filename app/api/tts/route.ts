/**
 * POST /api/tts — phase 3 synthetic voice. Turns one caption line into spoken
 * audio (Workers AI MeloTTS). The listener plays these in sequence as an
 * automatic AI interpreter. Bound to a live session (listeners carry the
 * session id) so this billable inference isn't an open endpoint anyone can run.
 *   Header: x-session-id · Body: { text, locale } → audio/mpeg (503 if no voice)
 */
import { fail, readJson, rateLimit, clientIp } from "@/lib/server/http";
import { synthesize } from "@/lib/server/tts";
import { getSession } from "@/lib/server/sessions";

export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`tts:${clientIp(req)}`, 240, 60_000)) return fail(429, "rate_limited");

  const sessionId = req.headers.get("x-session-id");
  if (!sessionId) return fail(401, "session_required");
  const session = await getSession(sessionId);
  if (!session || session.status !== "live") return fail(401, "session_required");

  const body = await readJson<{ text?: string; locale?: string }>(req);
  if (!body?.text || !body?.locale) return fail(400, "missing_fields");

  const bytes = await synthesize(body.text.slice(0, 800), body.locale);
  if (!bytes) return fail(503, "tts_unavailable");

  return new Response(bytes.buffer as ArrayBuffer, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
