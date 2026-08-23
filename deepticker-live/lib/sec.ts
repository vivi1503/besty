import { cached } from "./cache";
import { env } from "./env";
import type { AnnualPoint } from "./types";

const UA = env.secUserAgent;

async function secFetch<T>(url: string, ttlMs: number): Promise<T> {
  return cached(url, ttlMs, async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Encoding": "gzip, deflate",
          Accept: "application/json,text/html"
        },
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`SEC ${res.status}`);
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("json")) return (await res.json()) as T;
      return (await res.text()) as T;
    } finally {
      clearTimeout(timer);
    }
  });
}

type TickerMapRow = { cik_str: number; ticker: string; title: string };
export async function resolveTicker(ticker: string) {
  const map = await secFetch<Record<string, TickerMapRow>>(
    "https://www.sec.gov/files/company_tickers.json",
    24 * 60 * 60 * 1000
  );
  const wanted = ticker.toUpperCase();
  for (const row of Object.values(map)) {
    if (row.ticker.toUpperCase() === wanted) {
      return {
        cik: String(row.cik_str).padStart(10, "0"),
        name: row.title
      };
    }
  }
  throw new Error("TICKER_NOT_FOUND");
}

type FactUnit = {
  start?: string;
  end: string;
  val: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
};

type CompanyFacts = {
  entityName: string;
  facts: Record<string, Record<string, {
    label?: string;
    description?: string;
    units: Record<string, FactUnit[]>;
  }>>;
};

const TAGS = {
  revenue: [
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
    "Revenues"
  ],
  netIncome: [
    "NetIncomeLoss",
    "ProfitLoss"
  ],
  operatingIncome: [
    "OperatingIncomeLoss"
  ],
  interestExpense: [
    "InterestExpenseNonOperating",
    "InterestAndDebtExpense",
    "InterestExpense"
  ],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"
  ],
  receivables: [
    "AccountsReceivableNetCurrent",
    "AccountsNotesAndLoansReceivableNetCurrent",
    "AccountsReceivableNet"
  ],
  operatingCashFlow: [
    "NetCashProvidedByUsedInOperatingActivities"
  ],
  capex: [
    "PaymentsToAcquirePropertyPlantAndEquipment",
    "PaymentsForAdditionsToPropertyPlantAndEquipment"
  ],
  dilutedShares: [
    "WeightedAverageNumberOfDilutedSharesOutstanding"
  ],
  sbc: [
    "ShareBasedCompensation",
    "AllocatedShareBasedCompensationExpense"
  ],
  depreciation: [
    "DepreciationDepletionAndAmortization",
    "DepreciationDepletionAndAmortizationPropertyPlantAndEquipment"
  ],
  longDebt: [
    "LongTermDebtNoncurrent",
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
    "LongTermDebt"
  ],
  currentDebt: [
    "ShortTermBorrowings",
    "LongTermDebtCurrent",
    "ShortTermDebtCurrent"
  ],
  equity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"
  ]
} as const;

function unitsOf(facts: CompanyFacts, tag: string): FactUnit[] {
  for (const taxonomy of ["us-gaap", "ifrs-full"]) {
    const node = facts.facts?.[taxonomy]?.[tag];
    if (!node) continue;
    const preferred = node.units.USD || node.units.shares || node.units["USD/shares"] || Object.values(node.units)[0];
    if (preferred) return preferred;
  }
  return [];
}

function pickAnnualDuration(facts: CompanyFacts, tags: readonly string[]): Map<number, FactUnit> {
  const out = new Map<number, FactUnit>();
  for (const tag of tags) {
    for (const u of unitsOf(facts, tag)) {
      if (!["10-K", "20-F", "40-F"].includes(u.form || "")) continue;
      const fy = u.fy;
      if (!fy || !u.start || !u.end) continue;
      const days = (new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000;
      if (days < 300 || days > 430) continue;
      const existing = out.get(fy);
      if (!existing || (u.filed || "") > (existing.filed || "")) out.set(fy, u);
    }
    if (out.size >= 3) break;
  }
  return out;
}

function pickAnnualInstant(facts: CompanyFacts, tags: readonly string[]): Map<number, FactUnit> {
  const out = new Map<number, FactUnit>();
  for (const tag of tags) {
    for (const u of unitsOf(facts, tag)) {
      if (!["10-K", "20-F", "40-F"].includes(u.form || "")) continue;
      const fy = u.fy;
      if (!fy) continue;
      const existing = out.get(fy);
      if (!existing || (u.filed || "") > (existing.filed || "")) out.set(fy, u);
    }
    if (out.size >= 3) break;
  }
  return out;
}

function val(map: Map<number, FactUnit>, y: number) {
  const v = map.get(y)?.val;
  return Number.isFinite(v) ? Number(v) : undefined;
}

export async function getSecFinancials(cik: string) {
  const facts = await secFetch<CompanyFacts>(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    12 * 60 * 60 * 1000
  );

  const revenue = pickAnnualDuration(facts, TAGS.revenue);
  const netIncome = pickAnnualDuration(facts, TAGS.netIncome);
  const operatingIncome = pickAnnualDuration(facts, TAGS.operatingIncome);
  const interestExpense = pickAnnualDuration(facts, TAGS.interestExpense);
  const operatingCashFlow = pickAnnualDuration(facts, TAGS.operatingCashFlow);
  const capex = pickAnnualDuration(facts, TAGS.capex);
  const dilutedShares = pickAnnualDuration(facts, TAGS.dilutedShares);
  const sbc = pickAnnualDuration(facts, TAGS.sbc);
  const depreciation = pickAnnualDuration(facts, TAGS.depreciation);

  const cash = pickAnnualInstant(facts, TAGS.cash);
  const receivables = pickAnnualInstant(facts, TAGS.receivables);
  const longDebt = pickAnnualInstant(facts, TAGS.longDebt);
  const currentDebt = pickAnnualInstant(facts, TAGS.currentDebt);

  const years = Array.from(new Set([
    ...revenue.keys(),
    ...netIncome.keys(),
    ...operatingCashFlow.keys()
  ])).sort((a,b) => b-a).slice(0, 5).sort((a,b) => a-b);

  const annual: AnnualPoint[] = years.map(year => {
    const ld = val(longDebt, year) || 0;
    const cd = val(currentDebt, year) || 0;
    const ocf = val(operatingCashFlow, year);
    const cx = val(capex, year);
    const op = val(operatingIncome, year);
    const dep = val(depreciation, year);
    return {
      year,
      revenue: val(revenue, year),
      netIncome: val(netIncome, year),
      operatingIncome: op,
      interestExpense: val(interestExpense, year),
      cash: val(cash, year),
      totalDebt: (ld || cd) ? ld + cd : undefined,
      receivables: val(receivables, year),
      operatingCashFlow: ocf,
      capex: cx,
      fcf: ocf !== undefined && cx !== undefined ? ocf - Math.abs(cx) : undefined,
      dilutedShares: val(dilutedShares, year),
      sbc: val(sbc, year),
      depreciation: dep,
      ebitda: op !== undefined && dep !== undefined ? op + dep : undefined
    };
  });

  return { entityName: facts.entityName, annual };
}

type Submissions = {
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime: string[];
      act: string[];
      form: string[];
      fileNumber: string[];
      filmNumber: string[];
      items: string[];
      size: number[];
      isXBRL: number[];
      isInlineXBRL: number[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    }
  }
};

export async function getLatestAnnualFiling(cik: string) {
  const sub = await secFetch<Submissions>(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
    12 * 60 * 60 * 1000
  );
  const r = sub.filings.recent;
  const idx = r.form.findIndex(f => ["10-K", "20-F", "40-F"].includes(f));
  if (idx < 0) return null;
  const acc = r.accessionNumber[idx];
  const accessionNoDashes = acc.replace(/-/g, "");
  const cikNoZeros = String(Number(cik));
  const doc = r.primaryDocument[idx];
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNoZeros}/${accessionNoDashes}/${doc}`;
  return { url, form: r.form[idx], filingDate: r.filingDate[idx], acc };
}

function stripHtml(input: string) {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function analyzeFilingText(url: string) {
  const html = await secFetch<string>(url, 7 * 24 * 60 * 60 * 1000);
  const text = stripHtml(html);
  const customerPatterns = [
    /(?:customer|customers)[^.]{0,180}?(?:represented|accounted for|comprised)[^.]{0,80}?(\d{1,3}(?:\.\d+)?)\s*%/ig,
    /(\d{1,3}(?:\.\d+)?)\s*%[^.]{0,120}?(?:of\s+(?:our\s+)?(?:net\s+)?(?:sales|revenue|revenues))[^.]{0,160}?(?:customer)/ig
  ];

  for (const rx of customerPatterns) {
    const m = rx.exec(text);
    if (m) {
      const pct = Number(m[1]);
      const start = Math.max(0, m.index - 130);
      const excerpt = text.slice(start, Math.min(text.length, m.index + 300));
      if (pct >= 0 && pct <= 100) return { found: true, percentage: pct, excerpt };
    }
  }
  return { found: false as const };
}
