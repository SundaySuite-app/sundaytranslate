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
// btoa(String.fromCharCode(1,2,3,4)) — the base64 the model schema requires.
const CHUNK_B64 = "AQIDBA==";

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
  it("calls whisper-large-v3-turbo with the chunk as a base64 string and trims the text", async () => {
    const run = vi.fn(async () => ({ text: "  Velkommen til gudstjenesten  " }));
    mock.env = { AI: { run } };

    const out = await transcribe(CHUNK);
    expect(out).toBe("Velkommen til gudstjenesten");
    // The current model schema takes a base64 string, not a byte array — the
    // old array form silently failed the schema and returned no text.
    expect(run).toHaveBeenCalledWith("@cf/openai/whisper-large-v3-turbo", {
      audio: CHUNK_B64,
    });
  });

  it("base64-encodes a large chunk without a stack overflow", async () => {
    // A real ~5s Opus clip is tens of kB; the naive spread-into-btoa overflows
    // there. 200 kB exercises the chunked encoder.
    const big = new Uint8Array(200_000).fill(65); // 'A'
    const run = vi.fn(async (_model: string, _input: unknown) => ({ text: "ok" }));
    mock.env = { AI: { run } };

    expect(await transcribe(big)).toBe("ok");
    const arg = run.mock.calls[0][1] as { audio: string };
    expect(typeof arg.audio).toBe("string");
    expect(arg.audio).toBe(btoa("A".repeat(200_000)));
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
