import { describe, expect, it } from "vitest";
import { isValidTicker, normalizeTicker } from "./ticker";

describe("isValidTicker", () => {
  it("accepts plain US tickers", () => {
    expect(isValidTicker("AAPL")).toBe(true);
    expect(isValidTicker("MSFT")).toBe(true);
  });

  it("accepts share-class and exchange-suffixed tickers", () => {
    expect(isValidTicker("BRK-B")).toBe(true);
    expect(isValidTicker("BRK.B")).toBe(true);
  });

  it("accepts Tel Aviv Stock Exchange tickers", () => {
    expect(isValidTicker("TEVA.TA")).toBe(true);
    expect(isValidTicker("POLI.TA")).toBe(true);
    expect(isValidTicker("ESLT.TA")).toBe(true);
  });

  it("rejects empty, oversized, or unsafe input", () => {
    expect(isValidTicker("")).toBe(false);
    expect(isValidTicker("A".repeat(20))).toBe(false);
    expect(isValidTicker("<script>")).toBe(false);
    expect(isValidTicker("AAPL; DROP TABLE")).toBe(false);
  });
});

describe("normalizeTicker", () => {
  it("trims and uppercases", () => {
    expect(normalizeTicker("  teva.ta  ")).toBe("TEVA.TA");
  });
});
