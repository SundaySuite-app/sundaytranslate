import { afterEach, describe, expect, it, vi } from "vitest";

// Controllable Cloudflare context: tests set `mock.env` to shape the AI binding
// (or throw to simulate "no Cloudflare context", e.g. plain `next dev`).
const mock = vi.hoisted(() => ({
  env: undefined as { AI?: { run: (m: string, i: unknown) => Promise<unknown> } } | undefined,
  throws: false,
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (mock.throws) throw new Error("no cloudflare context");
    return { env: mock.env };
  },
}));

import { synthesize, ttsSupports } from "@/lib/server/tts";

afterEach(() => {
  mock.env = undefined;
  mock.throws = false;
  vi.restoreAllMocks();
});

describe("ttsSupports", () => {
  it("covers the MeloTTS languages (incl. region-tagged locales)", () => {
    for (const loc of ["en", "es", "fr", "zh", "ja", "ko", "en-US", "fr-CA"]) {
      expect(ttsSupports(loc)).toBe(true);
    }
  });

  it("rejects languages MeloTTS does not cover (captions-only)", () => {
    for (const loc of ["no", "ar", "uk", "vi", "fa", "so"]) {
      expect(ttsSupports(loc)).toBe(false);
    }
  });
});

describe("synthesize — language + input guards", () => {
  it("returns null for an unsupported language before touching the AI binding", async () => {
    mock.throws = true; // would throw if reached
    expect(await synthesize("Hei", "no")).toBeNull();
  });

  it("returns null for empty text", async () => {
    expect(await synthesize("   ", "en")).toBeNull();
  });

  it("returns null when there is no Cloudflare AI binding", async () => {
    mock.env = {}; // context present, but no AI
    expect(await synthesize("Hello", "en")).toBeNull();
  });
});

describe("synthesize — happy path + failure handling", () => {
  it("decodes the base64 mp3 from MeloTTS and maps the locale to MeloTTS lang", async () => {
    const run = vi.fn(async () => ({ audio: btoa("ID3-bytes") }));
    mock.env = { AI: { run } };

    const out = await synthesize("Hello", "ja");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(out!)).toBe("ID3-bytes");
    // ja → "jp" in the MeloTTS map
    expect(run).toHaveBeenCalledWith("@cf/myshell-ai/melotts", {
      prompt: "Hello",
      lang: "jp",
    });
  });

  it("returns null when the model returns no audio", async () => {
    mock.env = { AI: { run: vi.fn(async () => ({})) } };
    expect(await synthesize("Hello", "en")).toBeNull();
  });

  it("returns null when the model run throws", async () => {
    mock.env = {
      AI: {
        run: vi.fn(async () => {
          throw new Error("ai down");
        }),
      },
    };
    expect(await synthesize("Hello", "en")).toBeNull();
  });
});
