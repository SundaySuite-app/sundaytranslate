import { describe, expect, it } from "vitest";
import { generatePin, generateUniquePin, isValidPin } from "@/lib/codes";

/** Deterministic RNG cycling through fixed values in [0,1). */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("generatePin", () => {
  it("produces exactly 6 digits", () => {
    const rng = seqRng([0.0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(generatePin(rng)).toBe("012345"); // floor(v*10) per digit
  });

  it("preserves leading zeros", () => {
    expect(generatePin(seqRng([0]))).toBe("000000");
  });

  it("random pins are always valid 6-digit pins", () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidPin(generatePin())).toBe(true);
    }
  });
});

describe("isValidPin", () => {
  it("accepts 6 digits, trimming whitespace", () => {
    expect(isValidPin("402815")).toBe(true);
    expect(isValidPin("  402815 ")).toBe(true);
  });

  it("rejects wrong length or non-digits", () => {
    expect(isValidPin("12345")).toBe(false);
    expect(isValidPin("1234567")).toBe(false);
    expect(isValidPin("40a815")).toBe(false);
    expect(isValidPin("")).toBe(false);
  });
});

describe("generateUniquePin", () => {
  it("retries until it finds a pin not already taken", () => {
    // First draw collides with the taken set, second is free.
    const taken = new Set(["000000"]);
    const rng = seqRng([0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]);
    expect(generateUniquePin(taken, rng)).toBe("111111");
  });

  it("throws when it cannot find a free pin within maxTries", () => {
    const taken = new Set(["000000"]);
    const alwaysZero = seqRng([0]);
    expect(() => generateUniquePin(taken, alwaysZero, 5)).toThrow();
  });
});
