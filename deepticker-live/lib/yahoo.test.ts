import { describe, expect, it } from "vitest";
import { num, ratioToPct, str } from "./yahoo";

describe("num", () => {
  it("passes through a finite plain number", () => {
    expect(num(42)).toBe(42);
    expect(num(0)).toBe(0);
  });

  it("unwraps the yahoo-finance2 { raw, fmt } shape", () => {
    expect(num({ raw: 3.14, fmt: "3.14" })).toBe(3.14);
  });

  it("returns undefined for missing, non-finite, or malformed values", () => {
    expect(num(undefined)).toBeUndefined();
    expect(num(null)).toBeUndefined();
    expect(num(NaN)).toBeUndefined();
    expect(num(Infinity)).toBeUndefined();
    expect(num({ fmt: "n/a" })).toBeUndefined();
    expect(num("42")).toBeUndefined();
  });
});

describe("ratioToPct", () => {
  it("converts a decimal ratio to a percentage", () => {
    expect(ratioToPct(0.245)).toBeCloseTo(24.5);
    expect(ratioToPct({ raw: 0.1 })).toBeCloseTo(10);
  });

  it("stays undefined when the underlying value is unavailable", () => {
    expect(ratioToPct(undefined)).toBeUndefined();
  });
});

describe("str", () => {
  it("passes through strings and rejects everything else", () => {
    expect(str("Technology")).toBe("Technology");
    expect(str(42)).toBeUndefined();
    expect(str(undefined)).toBeUndefined();
    expect(str({ raw: "x" })).toBeUndefined();
  });
});
