import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

interface WhisperResult {
  text?: string;
}
interface AiBinding {
  run: (model: string, input: unknown) => Promise<WhisperResult>;
}

/** Base64-encode bytes without blowing the call stack. `btoa(String.fromCharCode
 * (...bytes))` spreads every byte as an argument and overflows on chunks past a
 * few tens of kB — an ~5s Opus clip is exactly that size. Encode in 32 kB slices. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Transcribe an audio chunk via Workers AI Whisper. Returns null when the AI
 * binding is absent (local dev / not configured) — captions then degrade off,
 * and human interpretation is unaffected.
 *
 * The current `whisper-large-v3-turbo` schema takes a **base64 string** (or
 * `{ body, contentType }`), NOT the raw byte array the old `@cf/openai/whisper`
 * accepted — passing an array silently fails the schema and every chunk comes
 * back empty. NOTE: the chunk is whatever MediaRecorder produced (webm/opus);
 * confirm the model accepts that container at rig-test, else transcode or switch
 * to a streaming STT (see the research report's STT track). */
export async function transcribe(bytes: Uint8Array): Promise<string | null> {
  let ai: AiBinding | undefined;
  try {
    const env = getCloudflareContext().env as unknown as { AI?: AiBinding };
    ai = env.AI;
  } catch {
    return null; // no Cloudflare context (e.g. plain `next dev`)
  }
  if (!ai) return null;
  try {
    const res = await ai.run("@cf/openai/whisper-large-v3-turbo", {
      audio: toBase64(bytes),
    });
    const text = res?.text;
    return typeof text === "string" ? text.trim() : null;
  } catch (err) {
    // Log so rig-test can tell "Whisper rejected the container" apart from
    // "binding missing" / quota — captions still just degrade off.
    console.warn("[asr] whisper failed", err);
    return null;
  }
}
