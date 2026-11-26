import "server-only";

// Simple fixed-window limiter per key (IP + route). Per server instance - good
// enough to stop button-mashing and scripted spam; game integrity itself is
// guaranteed by the versioned state (compare-and-swap) in the database.
const g = globalThis as unknown as { __slRate?: Map<string, { n: number; reset: number }> };
const buckets = (g.__slRate ??= new Map());

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 20000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return true;
  }
  b.n++;
  return b.n <= limit;
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();
}
