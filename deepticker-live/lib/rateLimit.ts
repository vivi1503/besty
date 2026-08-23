import { env } from "./env";
import { logger } from "./logger";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const useRedis = Boolean(env.upstashUrl && env.upstashToken);

async function redisIncrWithExpiry(key: string, windowSeconds: number): Promise<number | undefined> {
  try {
    // INCR then set a TTL only on the first hit in the window (NX keeps the
    // original window instead of resetting it on every request).
    const res = await fetch(`${env.upstashUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.upstashToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, windowSeconds, "NX"]
      ]),
      cache: "no-store"
    });
    if (!res.ok) return undefined;
    const body = await res.json();
    return body?.[0]?.result as number | undefined;
  } catch (err) {
    logger.warn("redis rate limit check failed, falling back to memory", { error: String(err) });
    return undefined;
  }
}

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: number };

/**
 * Fixed-window rate limiter keyed by an arbitrary identifier (typically
 * client IP). Uses Upstash Redis when configured so limits hold across all
 * serverless instances; otherwise falls back to in-memory per-instance
 * limiting, which still protects a single instance from being hammered but
 * won't coordinate across a fleet — documented in README for production use.
 */
export async function checkRateLimit(
  key: string,
  { windowMs = env.rateLimit.windowMs, max = env.rateLimit.max } = {}
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

  if (useRedis) {
    const count = await redisIncrWithExpiry(`ratelimit:${key}`, windowSeconds);
    if (count !== undefined) {
      return {
        allowed: count <= max,
        remaining: Math.max(0, max - count),
        resetAt: Date.now() + windowMs
      };
    }
    // fall through to memory limiter if Redis call failed
  }

  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= max,
    remaining: Math.max(0, max - bucket.count),
    resetAt: bucket.resetAt
  };
}

/** Best-effort client identifier from standard proxy headers. */
export function clientIpFrom(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
