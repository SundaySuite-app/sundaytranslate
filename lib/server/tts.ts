import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";

interface TtsResult {
  audio?: string; // base64 mp3 (MeloTTS)
}
interface AiBinding {
  run: (model: string, input: unknown) => Promise<TtsResult>;
}

// Workers AI text-to-speech. MeloTTS covers a limited language set; unsupported
// languages simply get no AI voice (captions still work). Confirm/extend the
// model + language map at rig-test (Deepgram Aura is another option for English).
const MELO_LANGS: Record<string, string> = {
  en: "en",
  es: "es",
  fr: "fr",
  zh: "zh",
  ja: "jp",
  ko: "kr",
};

export function ttsSupports(locale: string): boolean {
  return locale.split("-")[0] in MELO_LANGS;
}

/** Synthesize one line. Returns mp3 bytes, or null when unavailable (no AI
 * binding, or no voice for this language). */
export async function synthesize(text: string, locale: string): Promise<Uint8Array | null> {
  const lang = MELO_LANGS[locale.split("-")[0]];
  if (!lang || !text.trim()) return null;

  let ai: AiBinding | undefined;
  try {
    const env = getCloudflareContext().env as unknown as { AI?: AiBinding };
    ai = env.AI;
  } catch {
    return null;
  }
  if (!ai) return null;

  try {
    const res = await ai.run("@cf/myshell-ai/melotts", { prompt: text, lang });
    if (!res?.audio) return null;
    const bin = atob(res.audio);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}
