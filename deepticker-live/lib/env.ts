/**
 * Centralized, validated access to environment configuration.
 *
 * Every value has a safe production default, but anything that affects
 * outbound requests (like the SEC User-Agent) should be set explicitly in
 * production — see .env.example.
 */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",

  /**
   * SEC EDGAR requires a descriptive User-Agent that includes a real contact
   * (https://www.sec.gov/os/webmaster-faq#developers). Requests made with the
   * generic default may be throttled or blocked by SEC in production.
   */
  secUserAgent: process.env.SEC_USER_AGENT || "DeepTicker financial analyzer contact@example.com",

  /** Optional Upstash Redis REST credentials for shared cache + rate limiting. */
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN,

  rateLimit: {
    windowMs: int("RATE_LIMIT_WINDOW_MS", 60_000),
    max: int("RATE_LIMIT_MAX", 20)
  },

  yahooTimeoutMs: int("YAHOO_TIMEOUT_MS", 10_000),

  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug")
};

export function warnOnMissingProductionConfig() {
  if (!env.isProduction) return;
  const warnings: string[] = [];
  if (!process.env.SEC_USER_AGENT) {
    warnings.push(
      "SEC_USER_AGENT is not set — SEC EDGAR requires a real contact email in the User-Agent header for production traffic."
    );
  }
  if (!env.upstashUrl || !env.upstashToken) {
    warnings.push(
      "UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not set — cache and rate limiting fall back to per-instance memory, which does not coordinate across multiple serverless instances."
    );
  }
  for (const w of warnings) {
    console.warn(`[deepticker:config] ${w}`);
  }
}
