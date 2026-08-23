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
