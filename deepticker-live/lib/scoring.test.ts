import { describe, expect, it } from "vitest";
import { buildAnalysis } from "./scoring";

describe("buildAnalysis", () => {
  it("never fabricates a verdict when required inputs are missing", () => {
    const result = buildAnalysis({
      ticker: "TEST",
      companyName: "Test Co",
      annual: [],
      peers: [],
      valuationHistory: []
    });

    expect(result.overallScore).toBeNull();
    expect(result.verdict).toBe("אין מספיק מידע");
    expect(result.finalVerdict.decision).toBe("insufficient");
    expect(result.secFilingsAvailable).toBe(false);
    // Every rule should be explicit about missing data rather than guessing a status.
    for (const pillar of result.pillars) {
      for (const rule of pillar.rules) {
        expect(["insufficient", "pass", "warning", "fail"]).toContain(rule.status);
      }
    }
  });

  it("marks a rule 'insufficient' rather than defaulting to pass when data is absent", () => {
    const result = buildAnalysis({
      ticker: "TEST",
      companyName: "Test Co",
      annual: [{ year: 2023 }],
      peers: [],
      valuationHistory: []
    });
    const revGrowth = result.pillars.find(p => p.key === "revenue")!
      .rules.find(r => r.id === "rev-growth")!;
    expect(revGrowth.status).toBe("insufficient");
    expect(revGrowth.score).toBeNull();
  });

  it("computes an overall score only from pillars that could be evaluated", () => {
    const result = buildAnalysis({
      ticker: "TEST",
      companyName: "Test Co",
      currentPE: 25,
      earningsGrowth: 30,
      annual: [
        { year: 2021, revenue: 100, netIncome: 10, operatingCashFlow: 12, capex: 2 },
        { year: 2022, revenue: 120, netIncome: 12, operatingCashFlow: 14, capex: 2 },
        { year: 2023, revenue: 150, netIncome: 16, operatingCashFlow: 18, capex: 3 }
      ],
      peers: [],
      valuationHistory: []
    });
    expect(result.overallScore).not.toBeNull();
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

describe("finalVerdict", () => {
  const strongYears = [
    { year: 2019, revenue: 100, netIncome: 10, operatingIncome: 13, interestExpense: 3, cash: 40, totalDebt: 60, receivables: 12, operatingCashFlow: 13, capex: 2, dilutedShares: 100, sbc: 2, depreciation: 8 },
    { year: 2020, revenue: 115, netIncome: 11.5, operatingIncome: 15, interestExpense: 3, cash: 45, totalDebt: 58, receivables: 13.5, operatingCashFlow: 15, capex: 2.3, dilutedShares: 101, sbc: 2.3, depreciation: 8 },
    { year: 2021, revenue: 132, netIncome: 13.2, operatingIncome: 17, interestExpense: 3, cash: 50, totalDebt: 56, receivables: 15.5, operatingCashFlow: 17, capex: 2.6, dilutedShares: 102, sbc: 2.6, depreciation: 8 },
    { year: 2022, revenue: 152, netIncome: 15.2, operatingIncome: 20, interestExpense: 3, cash: 55, totalDebt: 54, receivables: 17.8, operatingCashFlow: 20, capex: 3, dilutedShares: 103, sbc: 3, depreciation: 8 },
    { year: 2023, revenue: 175, netIncome: 17.5, operatingIncome: 23, interestExpense: 3, cash: 60, totalDebt: 52, receivables: 20.5, operatingCashFlow: 23, capex: 3.4, dilutedShares: 104, sbc: 3.4, depreciation: 8 }
  ];

  it("returns 'yes' for a company that clears every defined threshold with no critical red flags", () => {
    const result = buildAnalysis({
      ticker: "STRONG",
      companyName: "Strong Co",
      currentPE: 22,
      earningsGrowth: 18,
      annual: strongYears,
      peers: [
        { ticker: "P1", pe: 21 },
        { ticker: "P2", pe: 23 },
        { ticker: "P3", pe: 22 }
      ],
      valuationHistory: [
        { year: 2021, pe: 18 },
        { year: 2022, pe: 20 },
        { year: 2023, pe: 21 }
      ],
      secFilingsAvailable: true
    });

    expect(result.overallScore).not.toBeNull();
    expect(result.overallScore!).toBeGreaterThanOrEqual(70);
    expect(result.finalVerdict.decision).toBe("yes");
    expect(result.finalVerdict.reasoning).toContain(String(Math.round(result.overallScore!)));
  });

  it("returns 'no' when the overall score falls short of the defined threshold", () => {
    const weakYears = strongYears.map(y => ({
      ...y,
      revenue: y.revenue * 0.4,
      netIncome: 0, // no earnings quality / cash conversion signal
      operatingCashFlow: undefined,
      capex: undefined,
      totalDebt: y.totalDebt * 3,
      cash: y.cash * 0.2
    }));

    const result = buildAnalysis({
      ticker: "WEAK",
      companyName: "Weak Co",
      currentPE: 55,
      earningsGrowth: 2,
      annual: weakYears,
      peers: [],
      valuationHistory: [],
      secFilingsAvailable: true
    });

    expect(result.finalVerdict.decision).toBe("no");
    expect(result.finalVerdict.reasoning.length).toBeGreaterThan(0);
  });
});
