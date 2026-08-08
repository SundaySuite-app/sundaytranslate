import { describe, expect, it } from "vitest";

import { readJson, rateLimit } from "@/lib/server/http";

function jsonReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request("http://test.local/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("readJson — bounded body parsing", () => {
  it("parses a normal small body", async () => {
    expect(await readJson<{ a: number }>(jsonReq('{"a":1}'))).toEqual({ a: 1 });
  });

  it("returns null on malformed JSON", async () => {
    expect(await readJson(jsonReq("{nope"))).toBeNull();
  });

  it("rejects a body larger than maxBytes even without Content-Length", async () => {
    const big = JSON.stringify({ pad: "x".repeat(100) });
    expect(await readJson(jsonReq(big), 50)).toBeNull();
  });

  it("rejects on the declared Content-Length alone", async () => {
    // Body itself is tiny; the declared length is what gets rejected first.
    const req = jsonReq('{"a":1}', { "content-length": "999999999" });
    expect(await readJson(req, 64_000)).toBeNull();
  });

  it("accepts a body just under the cap", async () => {
    const body = JSON.stringify({ pad: "x".repeat(100) });
    expect(await readJson(jsonReq(body), body.length)).not.toBeNull();
  });
});

describe("rateLimit — fixed-window limiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    const key = `t:${Math.random()}`;
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(true);
    expect(rateLimit(key, 3, 60_000)).toBe(false);
  });

  it("keys are independent", () => {
    const a = `a:${Math.random()}`;
    const b = `b:${Math.random()}`;
    expect(rateLimit(a, 1, 60_000)).toBe(true);
    expect(rateLimit(a, 1, 60_000)).toBe(false);
    expect(rateLimit(b, 1, 60_000)).toBe(true);
  });
});
