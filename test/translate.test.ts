import { afterEach, describe, expect, it, vi } from "vitest";
import { translateLine, translatorReady } from "@/lib/server/translate";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Build a fetch stub returning a canned Anthropic message envelope. */
function fetchReturning(payload: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  })) as unknown as typeof fetch;
}

describe("translatorReady", () => {
  it("is true only when the API key is present", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(translatorReady()).toBe(true);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(translatorReady()).toBe(false);
  });
});

describe("translateLine — guards (no network)", () => {
  it("returns null when no key is configured (captions fall back to source)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await translateLine("Hallo", "no", "en")).toBeNull();
    expect(spy).not.toHaveBeenCalled(); // no wasted API call
  });

  it("returns null on empty / whitespace input without calling the API", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    expect(await translateLine("   ", "no", "en")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("translateLine — request shape + parsing", () => {
  it("posts to Anthropic with the key, model and language-aware system prompt", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    const f = fetchReturning({ content: [{ text: "  Hello  " }] });
    vi.stubGlobal("fetch", f);

    const out = await translateLine("Hallo", "no", "en");
    expect(out).toBe("Hello"); // trimmed

    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.system).toContain("Norsk (bokmål)"); // source endonym
    expect(body.system).toContain("English"); // target endonym
    expect(body.messages[0].content).toBe("Hallo");
  });

  it("returns null on a non-OK response (caller keeps the original)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubGlobal("fetch", fetchReturning({}, false, 529));
    expect(await translateLine("Hallo", "no", "en")).toBeNull();
  });

  it("returns null when the response carries no text block", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubGlobal("fetch", fetchReturning({ content: [] }));
    expect(await translateLine("Hallo", "no", "en")).toBeNull();
  });

  it("returns null when fetch throws (network error)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }) as unknown as typeof fetch,
    );
    expect(await translateLine("Hallo", "no", "en")).toBeNull();
  });
});
