import { afterEach, describe, expect, it, vi } from "vitest";
import { extractCustomerConcentration, getSecFinancials, resolveTicker, stripHtml } from "./sec";

describe("stripHtml", () => {
  it("removes tags, scripts, styles, and collapses whitespace", () => {
    const html = `<html><head><style>.x{color:red}</style></head>
      <body><script>track();</script><p>Hello&nbsp;world &amp; friends</p></body></html>`;
    expect(stripHtml(html)).toBe("Hello world & friends");
  });
});

describe("extractCustomerConcentration", () => {
  it("matches 'customer(s) ... represented/accounted for ... N%'", () => {
    const text = "During fiscal 2023, one customer represented approximately 34% of total net sales.";
    const result = extractCustomerConcentration(text);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.percentage).toBe(34);
      expect(result.excerpt).toContain("customer");
    }
  });

  it("matches 'N% of ... sales/revenue ... customer' phrasing", () => {
    const text = "Approximately 22% of our net revenue was derived from a single customer in the period.";
    const result = extractCustomerConcentration(text);
    expect(result.found).toBe(true);
    if (result.found) expect(result.percentage).toBe(22);
  });

  it("returns not-found rather than guessing when there is no explicit disclosure", () => {
    const text = "The company sells software subscriptions to a broad base of enterprise customers.";
    expect(extractCustomerConcentration(text)).toEqual({ found: false });
  });

  it("is stateless across repeated calls (no lingering regex lastIndex)", () => {
    const text = "One customer represented 40% of net sales in the period.";
    const first = extractCustomerConcentration(text);
    const second = extractCustomerConcentration(text);
    expect(first).toEqual(second);
    expect(second.found).toBe(true);
  });
});

describe("resolveTicker / getSecFinancials (mocked SEC responses)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves a known ticker and throws TICKER_NOT_FOUND for an unknown one", async () => {
    const tickerMap = {
      "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
      "1": { cik_str: 789019, ticker: "MSFT", title: "Microsoft Corp." }
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => tickerMap,
      text: async () => JSON.stringify(tickerMap)
    }));

    const resolved = await resolveTicker("aapl");
    expect(resolved.cik).toBe("0000320193");
    expect(resolved.name).toBe("Apple Inc.");

    await expect(resolveTicker("NOPE_NOT_A_REAL_TICKER")).rejects.toThrow("TICKER_NOT_FOUND");
  });

  it("maps annual XBRL facts to AnnualPoint[], preferring 10-K duration facts within a ~1yr window", async () => {
    const facts = {
      entityName: "Test Corp",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                // Wrong form — must be excluded.
                { start: "2021-01-01", end: "2021-12-31", val: 999, fy: 2021, form: "10-Q", filed: "2021-11-01" },
                // Too short a period — must be excluded.
                { start: "2022-10-01", end: "2022-12-31", val: 888, fy: 2022, form: "10-K", filed: "2023-01-15" },
                // Valid annual 10-K facts.
                { start: "2021-01-01", end: "2021-12-31", val: 100, fy: 2021, form: "10-K", filed: "2022-02-01" },
                { start: "2022-01-01", end: "2022-12-31", val: 120, fy: 2022, form: "10-K", filed: "2023-02-01" }
              ]
            }
          },
          NetIncomeLoss: {
            units: { USD: [
              { start: "2021-01-01", end: "2021-12-31", val: 10, fy: 2021, form: "10-K", filed: "2022-02-01" },
              { start: "2022-01-01", end: "2022-12-31", val: 12, fy: 2022, form: "10-K", filed: "2023-02-01" }
            ] }
          },
          NetCashProvidedByUsedInOperatingActivities: {
            units: { USD: [
              { start: "2021-01-01", end: "2021-12-31", val: 15, fy: 2021, form: "10-K", filed: "2022-02-01" },
              { start: "2022-01-01", end: "2022-12-31", val: 18, fy: 2022, form: "10-K", filed: "2023-02-01" }
            ] }
          }
        }
      }
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => facts,
      text: async () => JSON.stringify(facts)
    }));

    const result = await getSecFinancials("0000999999");
    expect(result.entityName).toBe("Test Corp");
    expect(result.annual.map(a => a.year)).toEqual([2021, 2022]);
    expect(result.annual.find(a => a.year === 2021)?.revenue).toBe(100);
    expect(result.annual.find(a => a.year === 2022)?.revenue).toBe(120);
    expect(result.annual.find(a => a.year === 2021)?.netIncome).toBe(10);
  });
});
