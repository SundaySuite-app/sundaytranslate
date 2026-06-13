// Join PIN generation. A session is reached by a 6-digit PIN (shown on the
// operator's screen + encoded in the QR). Pure + injectable RNG for tests.

export type Rng = () => number; // returns [0,1)

/** 6-digit room PIN, e.g. "402815". Leading zeros allowed. */
export function generatePin(rng: Rng = Math.random): string {
  let pin = "";
  for (let i = 0; i < 6; i++) pin += Math.floor(rng() * 10).toString();
  return pin;
}

const PIN_RE = /^\d{6}$/;
export function isValidPin(input: string): boolean {
  return PIN_RE.test(input.trim());
}

/** Generate a PIN guaranteed unique against an existing set (retry on clash). */
export function generateUniquePin(
  taken: ReadonlySet<string>,
  rng: Rng = Math.random,
  maxTries = 50,
): string {
  for (let i = 0; i < maxTries; i++) {
    const pin = generatePin(rng);
    if (!taken.has(pin)) return pin;
  }
  throw new Error("Could not generate a unique PIN");
}
