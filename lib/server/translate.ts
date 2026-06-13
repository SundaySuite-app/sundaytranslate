import "server-only";

import { langName } from "@/lib/locales";

// Live caption translation via Claude (server-side key), mirroring the
// SundayStage translator. Guarded: no key → null, captions degrade to the
// source-language transcript only. Haiku for speed/cost on live captions.
const MODEL = "claude-haiku-4-5-20251001";

interface AnthropicResponse {
  content?: Array<{ text?: string }>;
}

export function translatorReady(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** Translate one spoken line. Returns null on any failure (caller falls back to
 * the original). */
export async function translateLine(
  text: string,
  sourceLocale: string,
  targetLocale: string,
): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || !text.trim()) return null;

  const system =
    `You are a live interpreter for a church service. Translate the speaker's words ` +
    `from ${langName(sourceLocale)} into ${langName(targetLocale)}. Output ONLY the ` +
    `translation — natural, faithful, reverent where appropriate. No notes, no quotes, ` +
    `no transliteration. If the input is empty or just noise, output nothing.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as AnthropicResponse;
    const out = data.content?.[0]?.text;
    return typeof out === "string" ? out.trim() : null;
  } catch {
    return null;
  }
}
