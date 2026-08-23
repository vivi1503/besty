/**
 * Runs once when the server starts (Next.js instrumentation hook).
 * Used to surface configuration problems in production logs immediately,
 * instead of failing silently on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warnOnMissingProductionConfig } = await import("./lib/env");
    warnOnMissingProductionConfig();
  }
}
