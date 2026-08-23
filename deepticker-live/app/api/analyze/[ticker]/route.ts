import { NextResponse } from "next/server";
import { resolveTicker, getSecFinancials, getLatestAnnualFiling, analyzeFilingText } from "@/lib/sec";
import { getYahooMarket, getPeers, getHistoricalPrices } from "@/lib/yahoo";
import { buildAnalysis } from "@/lib/scoring";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { logger, requestId } from "@/lib/logger";
import { errorMessage } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const rid = requestId();
  const started = Date.now();
  const { ticker: raw } = await params;
  const ticker = (raw || "").trim().toUpperCase();

  if (!/^[A-Z0-9.\-]{1,12}$/.test(ticker)) {
    return NextResponse.json({ error: "טיקר לא תקין" }, { status: 400 });
  }

  const ip = clientIpFrom(req);
  const rate = await checkRateLimit(ip);
  if (!rate.allowed) {
    logger.warn("rate limit exceeded", { rid, ip, ticker });
    return NextResponse.json(
      { error: "יותר מדי בקשות. נסה שוב בעוד רגע." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rate.resetAt - Date.now()) / 1000)))
        }
      }
    );
  }

  logger.info("analyze request start", { rid, ticker, ip });

  try {
    const resolved = await resolveTicker(ticker);

    const [sec, filing, market] = await Promise.all([
      getSecFinancials(resolved.cik),
      getLatestAnnualFiling(resolved.cik),
      getYahooMarket(ticker)
    ]);

    const [customer, peers, history] = await Promise.all([
      filing ? analyzeFilingText(filing.url).catch(() => ({ found: false as const })) : Promise.resolve({ found: false as const }),
      getPeers(ticker, market.sector),
      getHistoricalPrices(ticker)
    ]);

    // Historical P/E: use annual diluted EPS implied from SEC net income / diluted shares.
    const epsByYear = new Map<number, number>();
    for (const a of sec.annual) {
      if (a.netIncome !== undefined && a.dilutedShares && a.dilutedShares > 0) {
        epsByYear.set(a.year, a.netIncome / a.dilutedShares);
      }
    }
    const lastMonthByYear = new Map<number, number>();
    for (const p of history) {
      const y = new Date(p.date).getUTCFullYear();
      lastMonthByYear.set(y, p.close);
    }
    const valuationHistory = Array.from(epsByYear.entries()).map(([year, eps]) => {
      const close = lastMonthByYear.get(year);
      const pe = close !== undefined && eps > 0 ? close / eps : undefined;
      return { year, pe };
    }).filter(x => x.pe !== undefined);

    // EV/EBIT: derive current EV from Yahoo and latest EBIT from SEC.
    const latest = sec.annual.at(-1);
    let currentEVToEBIT: number | undefined;
    if (market.enterpriseValue && latest?.operatingIncome && latest.operatingIncome !== 0) {
      currentEVToEBIT = market.enterpriseValue / latest.operatingIncome;
    }

    const analysis = buildAnalysis({
      ticker,
      companyName: market.name || sec.entityName || resolved.name,
      sector: market.sector,
      industry: market.industry,
      price: market.price,
      currency: market.currency,
      marketCap: market.marketCap,
      currentPE: market.pe,
      currentEVToEBIT,
      earningsGrowth: market.earningsGrowth,
      annual: sec.annual,
      customerConcentration: customer,
      peers,
      valuationHistory,
      latestFilingUrl: filing?.url
    });

    logger.info("analyze request done", { rid, ticker, ms: Date.now() - started });
    return NextResponse.json(analysis, {
      headers: { "X-Request-Id": rid }
    });
  } catch (e: unknown) {
    const message = errorMessage(e);
    if (message === "TICKER_NOT_FOUND") {
      logger.info("analyze request: ticker not found", { rid, ticker });
      return NextResponse.json({ error: "הטיקר לא נמצא במאגר החברות של SEC." }, { status: 404 });
    }
    logger.error("analyze request failed", { rid, ticker, ms: Date.now() - started, error: message });
    return NextResponse.json({
      error: "אירעה שגיאה בקבלת הנתונים. נסה שוב בעוד רגע.",
      detail: process.env.NODE_ENV === "development" ? message : undefined
    }, { status: 500, headers: { "X-Request-Id": rid } });
  }
}
