import { describe, expect, it } from "vitest";

import { normalizeUiLocale } from "@/lib/locales";
import { strings } from "@/lib/locale";

describe("normalizeUiLocale", () => {
  it("maps Norwegian browser tags (nb / nb-NO) to the app's 'no'", () => {
    expect(normalizeUiLocale("nb")).toBe("no");
    expect(normalizeUiLocale("nb-NO")).toBe("no");
    expect(normalizeUiLocale("NB-no")).toBe("no");
  });

  it("collapses region tags to the base code", () => {
    expect(normalizeUiLocale("en-GB")).toBe("en");
    expect(normalizeUiLocale("uk-UA")).toBe("uk");
    expect(normalizeUiLocale("no-NO")).toBe("no");
  });

  it("keeps nynorsk distinct", () => {
    expect(normalizeUiLocale("nn")).toBe("nn");
    expect(normalizeUiLocale("nn-NO")).toBe("nn");
  });

  it("passes through unknown / empty codes unchanged (strings() handles the fallback)", () => {
    expect(normalizeUiLocale("de")).toBe("de");
    expect(normalizeUiLocale("")).toBe("");
    expect(normalizeUiLocale(null)).toBe("");
    expect(normalizeUiLocale(undefined)).toBe("");
  });
});

describe("strings — dictionary pick", () => {
  it("gives Norwegian to nb/nb-NO browsers (the pre-fix regression: they got English)", () => {
    expect(strings("nb").choose).toBe("Velg ditt språk");
    expect(strings("nb-NO").choose).toBe("Velg ditt språk");
  });

  it("resolves exact and region-tagged known locales", () => {
    expect(strings("no").choose).toBe("Velg ditt språk");
    expect(strings("nn").choose).toBe("Vel ditt språk");
    expect(strings("pl-PL").choose).toBe("Wybierz swój język");
  });

  it("falls back to English for unknown locales", () => {
    expect(strings("de").choose).toBe("Choose your language");
    expect(strings("").choose).toBe("Choose your language");
  });
});
