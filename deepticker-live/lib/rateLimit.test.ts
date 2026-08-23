import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rateLimit";

describe("checkRateLimit (in-memory fallback)", () => {
  it("allows requests under the limit and blocks once exceeded", async () => {
    const key = `test:${Math.random()}`;
    const opts = { windowMs: 60_000, max: 3 };

    const r1 = await checkRateLimit(key, opts);
    const r2 = await checkRateLimit(key, opts);
    const r3 = await checkRateLimit(key, opts);
    const r4 = await checkRateLimit(key, opts);

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
    expect(r4.allowed).toBe(false);
  });

  it("tracks separate keys independently", async () => {
    const opts = { windowMs: 60_000, max: 1 };
    const a = await checkRateLimit(`a:${Math.random()}`, opts);
    const b = await checkRateLimit(`b:${Math.random()}`, opts);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});
