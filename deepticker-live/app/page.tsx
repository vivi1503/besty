"use client";

import { useEffect, useState } from "react";
import type { AnalysisResponse } from "@/lib/types";
import { Pillar } from "@/components/Pillar";
import { errorMessage } from "@/lib/http";

function money(n?: number, currency="USD") {
  if (n === undefined) return "לא זמין";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(n);
  } catch {
    return n.toLocaleString("en-US");
  }
}

function bigMoney(n?: number) {
  if (n === undefined) return "לא זמין";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n/1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n/1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n/1e6).toFixed(2)}M`;
  return n.toLocaleString("en-US");
}

export default function Home() {
  const [ticker, setTicker] = useState("AAPL");
  const [data, setData] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);

  // Countdown for a 429 response's Retry-After, so the button re-enables
  // itself the moment another request is actually likely to succeed.
  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = setInterval(() => setRetryAfter(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [retryAfter]);

  async function analyze(e?: React.FormEvent) {
    e?.preventDefault();
    const t = ticker.trim().toUpperCase();
    if (!t || retryAfter > 0) return;
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await fetch(`/api/analyze/${encodeURIComponent(t)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 429) {
          const seconds = Number(res.headers.get("Retry-After"));
          if (Number.isFinite(seconds) && seconds > 0) setRetryAfter(seconds);
        }
        throw new Error(body.error || "שגיאה");
      }
      setData(body);
    } catch (err: unknown) {
      setError(errorMessage(err) || "אירעה שגיאה");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container">
      <header className="header">
        <div className="brand">
          <div>
            <div className="logo">Deep<span>Ticker</span></div>
            <div className="subtitle">
              ניתוח קשיח של חברות לפי איכות הכנסות, מזומן, חוב, תמחור ודגלים חשבונאיים — כולל חברות זרות (לדוגמה טיקרים ישראליים מהבורסה בתל אביב, כגון TEVA.TA).
            </div>
          </div>
          <button className="printBtn" onClick={() => window.print()}>הורד / הדפס דוח</button>
        </div>

        <form className="searchRow" onSubmit={analyze}>
          <input
            className="searchInput"
            value={ticker}
            onChange={e=>setTicker(e.target.value)}
            placeholder="הזן כל טיקר, לדוגמה AAPL / MSFT / TEVA.TA / ESLT.TA"
            aria-label="טיקר לניתוח"
            dir="ltr"
          />
          <button className="primaryBtn" disabled={loading || retryAfter > 0}>
            {loading ? "מנתח..." : retryAfter > 0 ? `נסה שוב בעוד ${retryAfter}s` : "נתח חברה"}
          </button>
        </form>

        <div className="small">
          דוחות כספיים: SEC EDGAR (חברות המדווחות לרשות ניירות ערך האמריקאית בלבד) · נתוני שוק: Yahoo Finance (מקור בלתי רשמי, מכסה גם בורסות זרות) · חסר מידע מוצג כ״לא זמין״.
        </div>
      </header>

      <div role="status" aria-live="polite">
        {error && <div className="errorBox">{error}</div>}
        {loading && <span className="srOnly">טוען ניתוח...</span>}
      </div>
      {loading && <>
        <div className="skeleton"/>
        <div className="skeleton"/>
        <div className="skeleton"/>
      </>}

      {data && !loading && (
        <>
          <section className="card">
            <div className="companyHead">
              <div>
                <div className="ticker">{data.ticker}</div>
                <div className="companyName">{data.companyName}</div>
                <div className="muted" style={{marginTop:6}}>
                  {[data.sector, data.industry].filter(Boolean).join(" · ") || "סקטור לא זמין"}
                </div>
                <div className="small" style={{marginTop:10}}>
                  עודכן: {new Date(data.updatedAt).toLocaleString("he-IL")}
                  {data.latestFilingUrl && <> · <a href={data.latestFilingUrl} target="_blank" rel="noreferrer">פתח דוח SEC אחרון</a></>}
                </div>
              </div>

              <div className="scoreWrap">
                <div>
                  <div style={{fontWeight:900,fontSize:18}}>{data.verdict}</div>
                  <div className="small" style={{marginTop:5}}>רמת ביטחון: {data.confidence}%</div>
                </div>
                <div className="scoreCircle">
                  {data.overallScore == null ? "—" : Math.round(data.overallScore)}
                </div>
              </div>
            </div>

            <div className="sep"/>
            <div className="grid3">
              <div className="kpi"><div className="kpiLabel">מחיר</div><div className="kpiValue">{money(data.price, data.currency)}</div></div>
              <div className="kpi"><div className="kpiLabel">שווי שוק</div><div className="kpiValue">{bigMoney(data.marketCap)}</div></div>
              <div className="kpi"><div className="kpiLabel">P/E נוכחי</div><div className="kpiValue">{data.currentPE?.toFixed(1) ?? "לא זמין"}</div></div>
            </div>

            <div className={`verdictBanner verdict-${data.finalVerdict.decision}`}>
              <div className="verdictLabel">מסקנה סופית: {data.finalVerdict.label}</div>
              <div className="verdictReasoning">{data.finalVerdict.reasoning}</div>
            </div>

            {!data.secFilingsAvailable && (
              <div className="secNote">
                לא אותרו דיווחי SEC עבור טיקר זה — כנראה חברה שאינה כפופה לרשות ניירות ערך האמריקאית
                (למשל חברה הנסחרת רק בבורסה בתל אביב). הניתוח למטה מבוסס אך ורק על נתוני השוק הזמינים
                מ-Yahoo Finance; שאר הכללים מסומנים כ״אין מספיק מידע״ ולא כ-PASS, כפי שנקבע מראש.
              </div>
            )}
          </section>

          <section className="grid2" style={{marginTop:16}}>
            <div className="card">
              <h2 className="sectionTitle">דגלים אדומים</h2>
              <div className="flags">
                {data.redFlags.length === 0 ? <div className="muted">לא זוהו דגלים אדומים קריטיים בכללים שניתנים לבדיקה.</div> :
                  data.redFlags.map(r => <div className="flagItem" key={r.id}><b>{r.title}</b><div className="small" style={{marginTop:5}}>{r.explanation}</div></div>)}
              </div>
            </div>
            <div className="card">
              <h2 className="sectionTitle">נקודות חוזקה</h2>
              <div className="flags">
                {data.positives.length === 0 ? <div className="muted">אין מספיק כללי PASS להצגה.</div> :
                  data.positives.map(r => <div className="kpi" key={r.id}><b>{r.title}</b><div className="small" style={{marginTop:5}}>{r.explanation}</div></div>)}
              </div>
            </div>
          </section>

          <section className="card pillar">
            <h2 className="sectionTitle">נתונים שנתיים מה-SEC</h2>
            <div className="sectionMeta">שנים אחרונות כפי שהמערכת הצליחה למפות מטגי XBRL שנתיים.</div>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">שנה</th><th scope="col">הכנסות</th><th scope="col">רווח נקי</th><th scope="col">FCF</th><th scope="col">חייבים</th><th scope="col">חוב</th><th scope="col">SBC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.annual.map(a => (
                    <tr key={a.year}>
                      <td>{a.year}</td>
                      <td>{bigMoney(a.revenue)}</td>
                      <td>{bigMoney(a.netIncome)}</td>
                      <td>{bigMoney(a.fcf)}</td>
                      <td>{bigMoney(a.receivables)}</td>
                      <td>{bigMoney(a.totalDebt)}</td>
                      <td>{bigMoney(a.sbc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {data.pillars.map(p => <Pillar pillar={p} key={p.key}/>)}

          <section className="card pillar">
            <h2 className="sectionTitle">Peers</h2>
            <div className="sectionMeta">קבוצת השוואה לפי סקטור, כאשר הנתונים זמינים.</div>
            <div className="tableWrap">
              <table>
                <thead><tr><th scope="col">טיקר</th><th scope="col">חברה</th><th scope="col">P/E</th><th scope="col">EV/EBIT</th></tr></thead>
                <tbody>
                {data.peers.map(p => (
                  <tr key={p.ticker}>
                    <td dir="ltr">{p.ticker}</td>
                    <td>{p.name || "לא זמין"}</td>
                    <td>{p.pe?.toFixed(1) ?? "לא זמין"}</td>
                    <td>{p.evToEbit?.toFixed(1) ?? "לא זמין"}</td>
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="footer">
            <b>מקורות:</b> SEC EDGAR לדיווחים רשמיים; Yahoo Finance באמצעות yahoo-finance2 לנתוני שוק (מקור בלתי רשמי שעשוי להיות מעוכב או לא זמין).
            החישובים מבוצעים אוטומטית על בסיס הנתונים הזמינים. אין לראות במידע ייעוץ השקעות, המלצה או תחליף לבדיקה עצמאית של הדוחות המקוריים.
          </footer>
        </>
      )}
    </main>
  );
}
