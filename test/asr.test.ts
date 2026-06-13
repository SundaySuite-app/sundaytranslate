import { afterEach, describe, expect, it, vi } from "vitest";

// Same controllable Cloudflare context pattern as the TTS test.
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

import { transcribe } from "@/lib/server/asr";

afterEach(() => {
  mock.env = undefined;
  mock.throws = false;
  vi.restoreAllMocks();
});

const CHUNK = new Uint8Array([1, 2, 3, 4]);

describe("transcribe — degraded environments", () => {
  it("returns null with no Cloudflare context (plain next dev)", async () => {
    mock.throws = true;
    expect(await transcribe(CHUNK)).toBeNull();
  });

  it("returns null when the AI binding is absent", async () => {
    mock.env = {};
    expect(await transcribe(CHUNK)).toBeNull();
  });
});

describe("transcribe — Whisper invocation", () => {
  it("calls whisper-large-v3-turbo with the chunk as a byte array and trims the text", async () => {
    const run = vi.fn(async () => ({ text: "  Velkommen til gudstjenesten  " }));
    mock.env = { AI: { run } };

    const out = await transcribe(CHUNK);
    expect(out).toBe("Velkommen til gudstjenesten");
    expect(run).toHaveBeenCalledWith("@cf/openai/whisper-large-v3-turbo", {
      audio: [1, 2, 3, 4],
    });
  });

  it("returns null when the result has no text", async () => {
    mock.env = { AI: { run: vi.fn(async () => ({})) } };
    expect(await transcribe(CHUNK)).toBeNull();
  });

  it("returns null when the model run throws", async () => {
    mock.env = {
      AI: {
        run: vi.fn(async () => {
          throw new Error("ai down");
        }),
      },
    };
    expect(await transcribe(CHUNK)).toBeNull();
  });
});
