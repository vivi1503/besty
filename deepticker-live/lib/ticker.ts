/**
 * Ticker symbol validation. Accepts any exchange Yahoo Finance recognizes —
 * plain US tickers (AAPL), tickers with share-class suffixes (BRK-B), and
 * foreign-exchange suffixed tickers such as Tel Aviv Stock Exchange symbols
 * (TEVA.TA, POLI.TA, ESLT.TA). SEC EDGAR only covers US-reporting issuers, so
 * a ticker passing this check does not guarantee SEC data will be found —
 * the analysis degrades gracefully to market-data-only in that case.
 */
const TICKER_PATTERN = /^[A-Z0-9.\-]{1,15}$/;

export function isValidTicker(raw: string): boolean {
  return TICKER_PATTERN.test(raw);
}

export function normalizeTicker(raw: string): string {
  return (raw || "").trim().toUpperCase();
}
