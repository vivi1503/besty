import { env } from "./env";
import { logger } from "./logger";

type CacheItem<T> = { value: T; expires: number };
const memory = new Map<string, CacheItem<unknown>>();

const useRedis = Boolean(env.upstashUrl && env.upstashToken);

/**
 * Thin client for Upstash's Redis REST API (no SDK dependency required).
 * Only used when UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are set.
 * This gives production deployments with multiple serverless instances a
 * shared cache instead of one that resets per cold start / per instance.
 */
async function redisCommand<T = unknown>(...command: (string | number)[]): Promise<T | undefined> {
  if (!useRedis) return undefined;
  try {
    const res = await fetch(`${env.upstashUrl}/${command.map(c => encodeURIComponent(String(c))).join("/")}`, {
      headers: { Authorization: `Bearer ${env.upstashToken}` },
      cache: "no-store"
    });
    if (!res.ok) return undefined;
    const body = await res.json();
    return body?.result as T;
  } catch (err) {
    logger.warn("redis command failed, falling back to memory cache", { error: String(err) });
    return undefined;
  }
}

async function redisGet<T>(key: string): Promise<T | undefined> {
  const raw = await redisCommand<string>("get", key);
  if (raw === undefined || raw === null) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function redisSetEx(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await redisCommand("set", key, JSON.stringify(value), "EX", Math.max(1, Math.round(ttlSeconds)));
}

/**
 * Cache a loader's result for ttlMs. Reads memory first (fastest, and works
 * even without Redis configured); falls back to Redis when available for
 * cross-instance sharing; always writes through to both layers.
 */
export async function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const hit = memory.get(key) as CacheItem<T> | undefined;
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;

  if (useRedis) {
    const remote = await redisGet<T>(key);
    if (remote !== undefined) {
      memory.set(key, { value: remote, expires: now + ttlMs });
      return remote;
    }
  }

  const value = await loader();
  memory.set(key, { value, expires: now + ttlMs });
  if (useRedis) {
    // Fire-and-forget: a failed cache write should never fail the request.
    void redisSetEx(key, value, ttlMs / 1000);
  }
  return value;
}
