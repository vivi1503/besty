import YahooFinance from "yahoo-finance2";
import { cached } from "./cache";
import { env } from "./env";
import { withTimeout } from "./http";
import { logger } from "./logger";
import type { PeerMetric } from "./types";

const yf = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  validation: { logErrors: false },
  queue: { concurrency: 4 }
});

function yahoo<T>(label: string, promise: Promise<T>): Promise<T> {
  return withTimeout(`yahoo:${label}`, env.yahooTimeoutMs, promise);
}

export async function getYahooMarket(ticker: string) {
  return cached(`yf:market:${ticker}`, 3 * 60 * 1000, async () => {
    try {
      const [quote, summary] = await Promise.all([
        yahoo("quote", yf.quote(ticker)),
        yahoo("quoteSummary", yf.quoteSummary(ticker, {
          modules: [
            "assetProfile",
            "summaryDetail",
            "defaultKeyStatistics",
            "financialData",
            "price"
          ]
        }))
      ]);

      const sd = (summary.summaryDetail || {}) as Record<string, unknown>;
      const ks = (summary.defaultKeyStatistics || {}) as Record<string, unknown>;
      const fd = (summary.financialData || {}) as Record<string, unknown>;
      const ap = (summary.assetProfile || {}) as Record<string, unknown>;
      const price = (summary.price || {}) as Record<string, unknown>;

      const enterpriseValue = num(ks.enterpriseValue);
      const ebitda = num(fd.ebitda);
      const currentEVToEBITDA = enterpriseValue && ebitda ? enterpriseValue / ebitda : undefined;

      return {
        name: quote.longName || quote.shortName || str(price.longName) || ticker,
        price: num(quote.regularMarketPrice),
        currency: quote.currency,
        marketCap: num(quote.marketCap) || num(price.marketCap),
        pe: num(quote.trailingPE) || num(sd.trailingPE),
        forwardPE: num(quote.forwardPE) || num(sd.forwardPE),
        sector: str(ap.sector),
        industry: str(ap.industry),
        earningsGrowth: ratioToPct(fd.earningsGrowth),
        enterpriseValue,
        ebitda,
        evToEbitda: currentEVToEBITDA
      };
    } catch (err) {
      logger.warn("yahoo market data unavailable, falling back to ticker as name", {
        ticker,
        error: String(err)
      });
      return {
        name: ticker
      };
    }
  });
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in v) {
    const raw = (v as { raw?: unknown }).raw;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  }
  return undefined;
}
function ratioToPct(v: unknown) {
  const n = num(v);
  return n === undefined ? undefined : n * 100;
}
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

const PEER_MAP: Record<string, string[]> = {
  "Technology": ["MSFT", "AAPL", "ORCL", "ADBE", "CRM", "NVDA", "AVGO"],
  "Healthcare": ["JNJ", "MRK", "ABBV", "LLY", "PFE", "TMO"],
  "Financial Services": ["JPM", "BAC", "GS", "MS", "C", "WFC"],
  "Consumer Cyclical": ["AMZN", "HD", "LOW", "MCD", "NKE", "SBUX"],
  "Communication Services": ["GOOGL", "META", "NFLX", "DIS", "TMUS"],
  "Industrials": ["CAT", "GE", "HON", "UPS", "DE", "RTX"],
  "Energy": ["XOM", "CVX", "COP", "SLB", "EOG"],
  "Consumer Defensive": ["WMT", "COST", "PG", "KO", "PEP"],
  "Real Estate": ["PLD", "AMT", "EQIX", "SPG", "O"],
  "Utilities": ["NEE", "DUK", "SO", "AEP", "D"]
};

export async function getPeers(ticker: string, sector?: string): Promise<PeerMetric[]> {
  const candidates = (PEER_MAP[sector || ""] || [
    "MSFT", "AAPL", "GOOGL", "AMZN", "META", "NVDA"
  ]).filter(x => x !== ticker.toUpperCase()).slice(0, 5);

  const rows = await Promise.all(candidates.map(async p => {
    const m = await getYahooMarket(p);
    return {
      ticker: p,
      name: m.name,
      pe: m.pe,
      evToEbit: undefined
    };
  }));
  return rows.slice(0, 4);
}

export async function getHistoricalPrices(ticker: string) {
  return cached(`yf:history:${ticker}`, 60 * 60 * 1000, async () => {
    try {
      const period1 = new Date();
      period1.setFullYear(period1.getFullYear() - 5);
      // chart() is the supported replacement for the deprecated historical().
      const result = await yahoo("chart", yf.chart(ticker, {
        period1,
        interval: "1mo"
      }));
      const rows = result.quotes || [];
      return rows
        .map(r => ({
          date: r.date instanceof Date ? r.date.toISOString() : String(r.date),
          close: Number(r.close)
        }))
        .filter(r => Number.isFinite(r.close));
    } catch (err) {
      logger.warn("yahoo historical prices unavailable", { ticker, error: String(err) });
      return [];
    }
  });
}
