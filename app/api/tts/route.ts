/**
 * POST /api/tts — phase 3 synthetic voice. Turns one caption line into spoken
 * audio (Workers AI MeloTTS). The listener plays these in sequence as an
 * automatic AI interpreter. Public read-side, rate-limited.
 *   Body: { text, locale } → audio/mpeg bytes (503 if no voice for the language)
 */
import { fail, readJson, rateLimit, clientIp } from "@/lib/server/http";
import { synthesize } from "@/lib/server/tts";

export async function POST(req: Request): Promise<Response> {
  if (!rateLimit(`tts:${clientIp(req)}`, 240, 60_000)) return fail(429, "rate_limited");
  const body = await readJson<{ text?: string; locale?: string }>(req);
  if (!body?.text || !body?.locale) return fail(400, "missing_fields");

  const bytes = await synthesize(body.text.slice(0, 800), body.locale);
  if (!bytes) return fail(503, "tts_unavailable");

  return new Response(bytes.buffer as ArrayBuffer, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
