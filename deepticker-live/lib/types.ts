export type Status = "pass" | "warning" | "fail" | "insufficient";

export type RuleResult = {
  id: string;
  title: string;
  status: Status;
  score: number | null;
  explanation: string;
  observed?: string;
  threshold?: string;
  critical?: boolean;
};

export type AnnualPoint = {
  year: number;
  revenue?: number;
  netIncome?: number;
  operatingIncome?: number;
  interestExpense?: number;
  cash?: number;
  totalDebt?: number;
  receivables?: number;
  operatingCashFlow?: number;
  capex?: number;
  fcf?: number;
  dilutedShares?: number;
  sbc?: number;
  depreciation?: number;
  ebitda?: number;
};

export type PeerMetric = {
  ticker: string;
  name?: string;
  pe?: number;
  evToEbit?: number;
};

export type AnalysisResponse = {
  ticker: string;
  companyName: string;
  sector?: string;
  industry?: string;
  price?: number;
  currency?: string;
  marketCap?: number;
  currentPE?: number;
  currentEVToEBIT?: number;
  earningsGrowth?: number;
  latestFilingUrl?: string;
  updatedAt: string;
  annual: AnnualPoint[];
  customerConcentration?: {
    percentage?: number;
    excerpt?: string;
    found: boolean;
  };
  recurringRevenue?: number;
  peers: PeerMetric[];
  valuationHistory: { year: number; pe?: number }[];
  pillars: {
    key: string;
    title: string;
    weight: number;
    score: number | null;
    rules: RuleResult[];
  }[];
  overallScore: number | null;
  confidence: number;
  redFlags: RuleResult[];
  positives: RuleResult[];
  verdict: string;
  sources: string[];
};
