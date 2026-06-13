import "server-only";

// Tiny HTTP helpers shared by every Route Handler (the suite convention from
// SundayStage/SundayQuiz). JSON envelopes, body parsing, a best-effort
// per-process rate limiter, and client IP extraction.

export function ok(data: unknown, init?: ResponseInit): Response {
  return Response.json({ ok: true, ...(data as object) }, init);
}

export function fail(status: number, error: string, extra?: object): Response {
  return Response.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

// Best-effort fixed-window limiter. Per Worker isolate, not global — enough to
// blunt accidental floods; not a security boundary.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
