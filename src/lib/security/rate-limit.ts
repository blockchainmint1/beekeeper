/**
 * Coarse in-memory per-IP rate limiter for the metered RPC proxies.
 *
 * Deliberately simple and FAIL-OPEN: a serverless instance may be recycled at
 * any time, so this is abuse dampening (stop one script from draining a paid
 * RPC quota), not a security boundary. Limits are generous because mobile
 * carriers NAT many real users behind a single IP — a wallet must never refuse
 * to show a balance because a stranger shares a tower.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_IPS = 5_000;

export function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/**
 * Returns null when the caller may proceed, or a 429 Response when it may not.
 * `cost` lets a JSON-RPC batch of N calls count as N requests.
 */
export function rateLimit(
  request: Request,
  { key, limit, windowMs, cost = 1 }: { key: string; limit: number; windowMs: number; cost?: number },
): Response | null {
  try {
    const ip = clientIp(request);
    if (ip === "unknown") return null; // fail open rather than punish everyone
    const id = `${key}:${ip}`;
    const now = Date.now();

    // Cheap eviction so a hostile spread of IPs can't grow the map forever.
    if (buckets.size > MAX_TRACKED_IPS) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
      if (buckets.size > MAX_TRACKED_IPS) buckets.clear();
    }

    const bucket = buckets.get(id);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(id, { count: cost, resetAt: now + windowMs });
      return null;
    }

    bucket.count += cost;
    if (bucket.count <= limit) return null;

    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: { "retry-after": String(retryAfter), "content-type": "text/plain" },
    });
  } catch {
    return null;
  }
}
