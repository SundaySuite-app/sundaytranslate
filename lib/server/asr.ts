import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

interface WhisperResult {
  text?: string;
}
interface AiBinding {
  run: (model: string, input: unknown) => Promise<WhisperResult>;
}

/** Transcribe an audio chunk via Workers AI Whisper. Returns null when the AI
 * binding is absent (local dev / not configured) — captions then degrade off,
 * and human interpretation is unaffected.
 *
 * NOTE: the chunk is whatever MediaRecorder produced (webm/opus). Confirm the
 * model accepts that container at rig-test; if not, switch to Deepgram Nova-3
 * streaming or transcode. */
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
      audio: Array.from(bytes),
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
