import { describe, expect, it } from "vitest";
import {
  LANGS,
  UI_LOCALES,
  isRtl,
  lang,
  langName,
} from "@/lib/locales";

describe("lang / langName lookup", () => {
  it("resolves a known code to its endonym", () => {
    expect(lang("no")?.name).toBe("Norsk (bokmål)");
    expect(langName("en")).toBe("English");
    expect(langName("ar")).toBe("العربية");
  });

  it("langName falls back to the raw code, then empty string", () => {
    expect(langName("xx")).toBe("xx"); // unknown but truthy → echo it
    expect(langName(null)).toBe("");
    expect(langName(undefined)).toBe("");
    expect(langName("")).toBe("");
  });

  it("lang returns null for unknown / nullish codes", () => {
    expect(lang("zz")).toBeNull();
    expect(lang(null)).toBeNull();
    expect(lang(undefined)).toBeNull();
  });
});

describe("LANGS catalogue", () => {
  it("has unique, non-empty codes and names", () => {
    const codes = LANGS.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length); // no dupes
    for (const l of LANGS) {
      expect(l.code).toMatch(/^[a-z]{2}$/);
      expect(l.name.length).toBeGreaterThan(0);
    }
  });

  it("every UI locale is also a known language", () => {
    for (const loc of UI_LOCALES) {
      expect(lang(loc)).not.toBeNull();
    }
  });
});

describe("isRtl", () => {
  it("flags Arabic and Farsi as right-to-left, others not", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("fa")).toBe(true);
    expect(isRtl("no")).toBe(false);
    expect(isRtl("en")).toBe(false);
  });
});
