import { describe, expect, it } from "vitest";

import { whipUrl, whepUrl } from "@/lib/sfu";

describe("local relay WHIP/WHEP url builders", () => {
  it("builds <base>/<stream>/whip and /whep", () => {
    expect(whipUrl("https://r.local.sundaysuite.app", "sess_human-en")).toBe(
      "https://r.local.sundaysuite.app/sess_human-en/whip",
    );
    expect(whepUrl("https://r.local.sundaysuite.app", "sess_human-en")).toBe(
      "https://r.local.sundaysuite.app/sess_human-en/whep",
    );
  });

  it("tolerates a trailing slash on the base", () => {
    expect(whipUrl("https://r.local.sundaysuite.app/", "s")).toBe(
      "https://r.local.sundaysuite.app/s/whip",
    );
    expect(whepUrl("https://r.local.sundaysuite.app///", "s")).toBe(
      "https://r.local.sundaysuite.app/s/whep",
    );
  });
});
