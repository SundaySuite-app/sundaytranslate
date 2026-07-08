/**
 * POST /api/sessions/<id>/asr — phase 2 live captions.
 *
 * The source device streams short audio chunks here while publishing. We
 * transcribe (Workers AI Whisper), translate to each requested locale (Claude),
 * store the latest line per locale and broadcast it. Subtitles in the SOURCE
 * language are emitted too (reading-along for the hard-of-hearing).
 *
 *   Body:  raw audio bytes (whatever MediaRecorder produced)
 *   Query: ?source=no&targets=en,pl,uk
 *   Auth:  session secret (Bearer)
 *
 * Degrades gracefully: no AI binding / no key → returns { transcript: null }
 * and the listener simply sees no captions. Never blocks the audio path.
 */
import { ok, fail, rateLimit } from "@/lib/server/http";
import { broadcast } from "@/lib/server/broadcast";
import { channels as rtChannels, events } from "@/lib/realtime";
import { upsertCaption, verifySecret } from "@/lib/server/sessions";
import { transcribe } from "@/lib/server/asr";
import { translateLine } from "@/lib/server/translate";

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

  // Cost guard: one healthy captioner sends ~12 chunks/min; anything well past
  // that is a bug or abuse burning Whisper + up to 12 Claude calls per chunk.
  if (!rateLimit(`asr:${id}`, 30, 60_000)) return fail(429, "rate_limited");

  const url = new URL(req.url);
  const source = (url.searchParams.get("source") || session.source_locale).slice(0, 8);
  const targets = Array.from(
    new Set(
      (url.searchParams.get("targets") || "")
        .split(",")
        .map((s) => s.trim().slice(0, 8))
        .filter(Boolean),
    ),
  ).slice(0, 12);

  // A ~5s opus chunk is tens of kB; cap well above that so an oversized body
  // can't balloon Worker memory (asr expands every byte into a JS array).
  const MAX_BYTES = 2_000_000;
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BYTES) return fail(413, "too_large");
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_BYTES) return fail(413, "too_large");
  if (bytes.length < 1200) return ok({ transcript: null, reason: "too_short" });

  const transcript = await transcribe(bytes);
  if (!transcript) return ok({ transcript: null, reason: "no_asr" });

  const seq = Date.now();
  const topic = rtChannels.session(id);
  const locales = Array.from(new Set([source, ...targets]));

  await Promise.all(
    locales.map(async (loc) => {
      const text = loc === source ? transcript : await translateLine(transcript, source, loc);
      if (!text) return;
      await upsertCaption(id, loc, seq, text);
      await broadcast(topic, events.caption, { locale: loc, seq, text });
    }),
  );

  return ok({ transcript });
}
