import { describe, expect, it, vi } from "vitest";
import { cached } from "./cache";

describe("cached", () => {
  it("only invokes the loader once per key within the TTL", async () => {
    const loader = vi.fn().mockResolvedValue("value");
    const key = `test:${Math.random()}`;

    const first = await cached(key, 60_000, loader);
    const second = await cached(key, 60_000, loader);

    expect(first).toBe("value");
    expect(second).toBe("value");
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("re-invokes the loader after the TTL expires", async () => {
    const loader = vi.fn().mockResolvedValue("value");
    const key = `test:${Math.random()}`;

    await cached(key, 1, loader);
    await new Promise(r => setTimeout(r, 10));
    await cached(key, 1, loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });
});
