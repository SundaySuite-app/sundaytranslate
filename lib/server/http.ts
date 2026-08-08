import "server-only";

// Tiny HTTP helpers shared by every Route Handler (the suite convention from
// SundayStage/SundayQuiz). JSON envelopes, body parsing, a best-effort
// per-process rate limiter, and client IP extraction.

export function ok(data: unknown, init?: ResponseInit): Response {
  // `ok: true` last so a payload key can never overwrite the envelope flag.
  return Response.json({ ...(data as object), ok: true }, init);
}

export function fail(status: number, error: string, extra?: object): Response {
  return Response.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

/** Parse a JSON body, bounded. Every legitimate body in this app is tiny (a
 * caption line, channel coords, an enroll request), so an oversized payload is
 * abuse — reject it before JSON.parse balloons Worker memory. Content-Length
 * can be absent (chunked), so the decoded text length is checked too. */
export async function readJson<T>(req: Request, maxBytes = 64_000): Promise<T | null> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text) as T;
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
  // Opportunistic sweep so the per-isolate map can't grow without bound.
  if (buckets.size > 1000) {
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}
