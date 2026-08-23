import type { AnnualPoint, AnalysisResponse, FinalVerdict, PeerMetric, RuleResult, Status } from "./types";

/** Minimum overall score (out of 100) to consider the company a "yes" against the defined criteria. */
const YES_SCORE_THRESHOLD = 70;
/** Below this confidence (% of rules that could actually be evaluated), the data is too thin to decide either way. */
const MIN_CONFIDENCE_FOR_DECISION = 40;

const growth = (a?: number, b?: number) =>
  a !== undefined && b !== undefined && b !== 0 ? (a / b - 1) * 100 : undefined;

function statusScore(status: Status) {
  if (status === "pass") return 100;
  if (status === "warning") return 55;
  if (status === "fail") return 0;
  return null;
}
function rule(
  id: string, title: string, status: Status, explanation: string,
  observed?: string, threshold?: string, critical?: boolean
): RuleResult {
  return { id, title, status, score: statusScore(status), explanation, observed, threshold, critical };
}
function fmtPct(n?: number) { return n === undefined ? "לא זמין" : `${n.toFixed(1)}%`; }
function fmtX(n?: number) { return n === undefined ? "לא זמין" : `${n.toFixed(2)}x`; }

export function buildAnalysis(input: {
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
  annual: AnnualPoint[];
  customerConcentration?: { found: boolean; percentage?: number; excerpt?: string };
  recurringRevenue?: number;
  peers: PeerMetric[];
  valuationHistory: { year: number; pe?: number }[];
  latestFilingUrl?: string;
  secFilingsAvailable?: boolean;
}): AnalysisResponse {
  const annual = [...input.annual].sort((a,b) => a.year-b.year);
  const latest = annual.at(-1);
  const prev = annual.at(-2);
  const oldest3 = annual.length >= 3 ? annual.at(-3) : undefined;

  const revenueRules: RuleResult[] = [];
  let revenueCagr: number | undefined;
  if (latest?.revenue && oldest3?.revenue && latest.year > oldest3.year) {
    revenueCagr = (Math.pow(latest.revenue / oldest3.revenue, 1/(latest.year-oldest3.year)) - 1) * 100;
    revenueRules.push(rule(
      "rev-growth", "צמיחת הכנסות רב-שנתית",
      revenueCagr > 10 ? "pass" : revenueCagr > 5 ? "warning" : "fail",
      revenueCagr > 10 ? "קצב הצמיחה הרב-שנתי מעל סף היעד." :
      "קצב הצמיחה הרב-שנתי נמוך מסף העדיפות של 10%.",
      fmtPct(revenueCagr), ">10%"
    ));
  } else {
    revenueRules.push(rule("rev-growth","צמיחת הכנסות רב-שנתית","insufficient",
      "אין מספיק שנות הכנסה שנתיות ברות השוואה.","לא זמין",">10%"));
  }

  const arGrowth = growth(latest?.receivables, prev?.receivables);
  const revGrowth = growth(latest?.revenue, prev?.revenue);
  if (arGrowth !== undefined && revGrowth !== undefined) {
    const diff = arGrowth - revGrowth;
    revenueRules.push(rule(
      "ar-vs-sales","חייבים מול מכירות",
      diff > 15 && arGrowth > revGrowth * 1.5 ? "fail" : diff > 7 ? "warning" : "pass",
      diff > 15 ? "החייבים גדלים משמעותית מהר יותר מהמכירות — סימן המחייב בדיקה." :
      "קצב גידול החייבים אינו חורג בצורה משמעותית מקצב המכירות.",
      `חייבים ${fmtPct(arGrowth)} | מכירות ${fmtPct(revGrowth)}`,
      "חייבים לא לצמוח משמעותית מהר יותר",
      diff > 15
    ));
  } else {
    revenueRules.push(rule("ar-vs-sales","חייבים מול מכירות","insufficient",
      "אין מספיק נתוני חייבים/מכירות להשוואה.","לא זמין"));
  }

  if (input.customerConcentration?.found && input.customerConcentration.percentage !== undefined) {
    const cp = input.customerConcentration.percentage;
    revenueRules.push(rule(
      "customer","ריכוזיות לקוח",
      cp > 30 ? "fail" : cp > 20 ? "warning" : "pass",
      cp > 30 ? "לקוח בודד חוצה את רף 30% מהמכירות." : "לא זוהתה חריגה מעל 30% בגילוי שנמצא.",
      fmtPct(cp), "דגל אדום מעל 30%", cp > 30
    ));
  } else {
    revenueRules.push(rule("customer","ריכוזיות לקוח","insufficient",
      "לא נמצא גילוי מפורש שניתן להמיר לאחוז לקוח בודד. אין להסיק PASS מהיעדר גילוי.",
      "לא נמצא גילוי מפורש","דגל אדום מעל 30%"));
  }

  if (input.recurringRevenue !== undefined) {
    revenueRules.push(rule("recurring","הכנסות חוזרות","pass",
      "קיים נתון מפורש להכנסות חוזרות.",fmtPct(input.recurringRevenue)));
  } else {
    revenueRules.push(rule("recurring","הכנסות חוזרות","insufficient",
      "אין מקור אמין לאחוז הכנסות חוזרות; הנתון אינו מנוחש.","לא זמין"));
  }

  const cashRules: RuleResult[] = [];
  const usable = annual.filter(x => x.fcf !== undefined && x.netIncome !== undefined);
  const aggFcf = usable.reduce((s,x)=>s+(x.fcf||0),0);
  const aggNi = usable.reduce((s,x)=>s+(x.netIncome||0),0);
  const fcfNi = usable.length >= 2 && aggNi > 0 ? aggFcf / aggNi * 100 : undefined;
  cashRules.push(
    fcfNi === undefined
      ? rule("fcf-ni","איכות הרווח FCF / Net Income","insufficient","אין מספיק נתוני FCF ורווח נקי רב-שנתיים.","לא זמין",">=80%")
      : rule("fcf-ni","איכות הרווח FCF / Net Income",
          fcfNi >= 80 ? "pass" : fcfNi >= 60 ? "warning" : "fail",
          fcfNi >= 80 ? "המרת הרווח למזומן עומדת ביעד." : "המרת הרווח למזומן נמוכה מסף 80%.",
          fmtPct(fcfNi),">=80%", fcfNi < 60)
  );

  const taxRate = 0.21;
  const roics = annual.map((x,i) => {
    if (x.operatingIncome === undefined || x.totalDebt === undefined || x.cash === undefined) return undefined;
    const prevY = annual[i-1];
    if (!prevY || prevY.totalDebt === undefined || prevY.cash === undefined) return undefined;
    const investedNow = Math.max(1, x.totalDebt - x.cash);
    const investedPrev = Math.max(1, prevY.totalDebt - prevY.cash);
    const avgInvested = (investedNow + investedPrev) / 2;
    return (x.operatingIncome * (1-taxRate)) / avgInvested * 100;
  }).filter((x): x is number => x !== undefined && Number.isFinite(x));

  const roic = roics.length ? roics.reduce((a,b)=>a+b,0)/roics.length : undefined;
  cashRules.push(
    roic === undefined
      ? rule("roic","ROIC","insufficient","חסרים רכיבי הון מושקע עקביים; לא מחושב ROIC מלא.","לא זמין",">=10%")
      : rule("roic","ROIC",
          roic >= 10 ? "pass" : roic >= 7 ? "warning" : "fail",
          roic >= 10 ? "התשואה על ההון המושקע עומדת ביעד." : "ROIC נמוך מ-10% לאורך הנתונים הזמינים.",
          fmtPct(roic),">=10%",roic<10)
  );

  const debtRules: RuleResult[] = [];
  const netDebt = latest?.totalDebt !== undefined && latest.cash !== undefined
    ? latest.totalDebt - latest.cash : undefined;
  const ndEbitda = netDebt !== undefined && latest?.ebitda && latest.ebitda !== 0
    ? netDebt / latest.ebitda : undefined;
  debtRules.push(
    ndEbitda === undefined
      ? rule("leverage","Net Debt / EBITDA","insufficient","חסר EBITDA או חוב/מזומן.","לא זמין","<=2.5x")
      : rule("leverage","Net Debt / EBITDA",
          ndEbitda <= 2.5 ? "pass" : ndEbitda <= 3.5 ? "warning" : "fail",
          ndEbitda <= 2.5 ? "המינוף בתוך סף היעד." : "המינוף מעל סף 2.5x.",
          fmtX(ndEbitda),"<=2.5x",ndEbitda>2.5)
  );
  const interestCoverage = latest?.operatingIncome !== undefined &&
    latest.interestExpense !== undefined && latest.interestExpense !== 0
      ? latest.operatingIncome / Math.abs(latest.interestExpense) : undefined;
  debtRules.push(
    interestCoverage === undefined
      ? rule("interest","EBIT / Interest","insufficient","חסרים EBIT או הוצאות ריבית.","לא זמין",">=5x")
      : rule("interest","EBIT / Interest",
          interestCoverage >= 5 ? "pass" : interestCoverage >= 3 ? "warning" : "fail",
          interestCoverage >= 5 ? "כיסוי הריבית חזק." : "כיסוי הריבית נמוך מהסף.",
          fmtX(interestCoverage),">=5x",interestCoverage<5)
  );
  const stressCoverage = interestCoverage !== undefined ? interestCoverage * 0.7 : undefined;
  debtRules.push(
    stressCoverage === undefined
      ? rule("stress","מבחן לחץ EBIT -30%","insufficient","לא ניתן לחשב מבחן לחץ ללא יחס כיסוי בסיסי.","לא זמין",">=5x מועדף")
      : rule("stress","מבחן לחץ EBIT -30%",
          stressCoverage >= 5 ? "pass" : stressCoverage >= 3 ? "warning" : "fail",
          stressCoverage >= 5 ? "גם לאחר ירידה של 30% ב-EBIT, כיסוי הריבית נשאר חזק." :
          "תרחיש ירידה של 30% ב-EBIT מחליש משמעותית את כיסוי הריבית. קובננטים לא נחשבים כמופרים ללא גילוי מפורש.",
          fmtX(stressCoverage),">=5x מועדף",stressCoverage<3
      )
  );

  const valRules: RuleResult[] = [];
  if (input.currentPE !== undefined && input.earningsGrowth !== undefined) {
    const high = input.currentPE >= 30;
    const status: Status = high && input.earningsGrowth <= 5 ? "fail" :
      high && input.earningsGrowth > 20 ? "pass" :
      input.currentPE > 40 ? "warning" : "pass";
    valRules.push(rule("pe-growth","P/E מול צמיחת רווח",
      status,
      high && input.earningsGrowth > 20 ? "מכפיל גבוה נתמך בקצב צמיחת רווחים חזק." :
      high && input.earningsGrowth <= 5 ? "מכפיל גבוה יחד עם צמיחה חלשה — תמחור יתר מסוכן." :
      "המכפיל נבחן בהקשר לקצב הצמיחה ולא באופן מבודד.",
      `P/E ${input.currentPE.toFixed(1)} | צמיחת רווח ${fmtPct(input.earningsGrowth)}`,
      "P/E גבוה דורש צמיחה תומכת",
      status==="fail"
    ));
  } else {
    valRules.push(rule("pe-growth","P/E מול צמיחת רווח","insufficient",
      "חסר P/E או נתון צמיחת רווח אמין.","לא זמין"));
  }

  const peerPE = input.peers.map(p=>p.pe).filter((x):x is number => x!==undefined);
  if (input.currentPE !== undefined && peerPE.length >= 3) {
    const avg = peerPE.reduce((a,b)=>a+b,0)/peerPE.length;
    const premium = (input.currentPE / avg - 1)*100;
    valRules.push(rule("peers","השוואת Peers",
      premium > 35 ? "warning" : "pass",
      premium > 35 ? "החברה נסחרת בפרמיה גבוהה לעומת קבוצת ההשוואה." : "המכפיל אינו חורג בצורה קיצונית מממוצע ה-Peers.",
      `פרמיה ${fmtPct(premium)}`,"לפחות 3 Peers"));
  } else {
    valRules.push(rule("peers","השוואת Peers","insufficient",
      "אין לפחות 3 מכפילי P/E זמינים להשוואה.","לא זמין","לפחות 3 Peers"));
  }

  const histPE = input.valuationHistory.map(x=>x.pe).filter((x):x is number=>x!==undefined);
  if (input.currentPE !== undefined && histPE.length >= 3) {
    const min = Math.min(...histPE), max = Math.max(...histPE);
    valRules.push(rule("history","טווח תמחור היסטורי 5Y",
      input.currentPE > max*1.15 ? "warning" : "pass",
      `הטווח המחושב מהיסטוריית מחיר/EPS הזמינה הוא ${min.toFixed(1)}–${max.toFixed(1)}.`,
      input.currentPE.toFixed(1),`${min.toFixed(1)}–${max.toFixed(1)}`));
  } else {
    valRules.push(rule("history","טווח תמחור היסטורי 5Y","insufficient",
      "אין מספיק נקודות P/E היסטוריות מחושבות מנתוני אמת.","לא זמין"));
  }

  const acctRules: RuleResult[] = [];
  if (arGrowth !== undefined && revGrowth !== undefined) {
    acctRules.push(rule("acct-ar","חריגת חייבים",
      arGrowth > revGrowth + 15 && arGrowth > revGrowth*1.5 ? "fail" :
      arGrowth > revGrowth + 7 ? "warning" : "pass",
      arGrowth > revGrowth + 15 ? "החייבים מתרחבים מהר מהמכירות באופן חריג." : "אין חריגה משמעותית בקצב גידול החייבים.",
      `חייבים ${fmtPct(arGrowth)} / מכירות ${fmtPct(revGrowth)}`,
      "פער משמעותי הוא דגל"));
  } else {
    acctRules.push(rule("acct-ar","חריגת חייבים","insufficient","אין מספיק נתונים.","לא זמין"));
  }

  const sbcGrowth = growth(latest?.sbc, prev?.sbc);
  if (sbcGrowth !== undefined && revGrowth !== undefined) {
    acctRules.push(rule("sbc","SBC מול הכנסות",
      sbcGrowth > revGrowth + 10 ? "warning" : "pass",
      sbcGrowth > revGrowth + 10 ? "תגמול מבוסס מניות גדל מהר משמעותית מההכנסות." : "SBC אינו גדל באופן חריג מול ההכנסות.",
      `SBC ${fmtPct(sbcGrowth)} / הכנסות ${fmtPct(revGrowth)}`));
  } else {
    acctRules.push(rule("sbc","SBC מול הכנסות","insufficient","חסר SBC שנתי בר השוואה.","לא זמין"));
  }

  const diluted = annual.map(x=>x.dilutedShares).filter((x):x is number => x!==undefined);
  if (diluted.length >= 3) {
    const consistentlyUp = diluted.slice(1).every((x,i)=>x>diluted[i]*1.005);
    const totalDilution = (diluted.at(-1)! / diluted[0] - 1)*100;
    acctRules.push(rule("dilution","דילול מניות",
      consistentlyUp && totalDilution > 5 ? "warning" : "pass",
      consistentlyUp ? "מספר המניות המדולל עולה בעקביות." : "לא זוהתה עלייה עקבית משמעותית במספר המניות המדולל.",
      fmtPct(totalDilution)));
  } else {
    acctRules.push(rule("dilution","דילול מניות","insufficient","אין 3 שנות diluted shares זמינות.","לא זמין"));
  }

  acctRules.push(rule("one-time","הוצאות חד-פעמיות חוזרות","insufficient",
    "גרסה זו אינה מסמנת הוצאה חד-פעמית ללא ראיות חוזרות וברות השוואה מתוך הדוחות. נדרש parser סמנטי מתקדם יותר כדי לקבוע זאת בביטחון.",
    "לא נקבע"));

  const defs = [
    {key:"revenue", title:"1. איכות וריכוזיות הכנסות", weight:25, rules:revenueRules},
    {key:"cash", title:"2. המרת רווח למזומן ויעילות הון", weight:25, rules:cashRules},
    {key:"debt", title:"3. עמידות חוב ומבחני קיצון", weight:20, rules:debtRules},
    {key:"valuation", title:"4. תמחור מותאם צמיחה", weight:15, rules:valRules},
    {key:"accounting", title:"5. איתור מלכודות חשבונאיות", weight:15, rules:acctRules}
  ];

  const pillars = defs.map(p => {
    const vals = p.rules.map(r=>r.score).filter((x):x is number=>x!==null);
    return {...p, score: vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null};
  });

  const usablePillars = pillars.filter(p=>p.score!==null);
  const totalWeight = usablePillars.reduce((s,p)=>s+p.weight,0);
  const overallScore = totalWeight
    ? usablePillars.reduce((s,p)=>s+(p.score! * p.weight),0)/totalWeight
    : null;

  const allRules = pillars.flatMap(p=>p.rules);
  const evaluable = allRules.filter(r=>r.status!=="insufficient").length;
  const confidence = Math.round(evaluable / allRules.length * 100);
  const redFlags = allRules.filter(r=>r.status==="fail" || (r.status==="warning" && r.critical));
  const positives = allRules.filter(r=>r.status==="pass").slice(0,6);

  const verdict = overallScore === null ? "אין מספיק מידע" :
    overallScore >= 80 ? "איכות גבוהה" :
    overallScore >= 60 ? "דורש זהירות" : "סיכון גבוה";

  const criticalRedFlags = redFlags.filter(r => r.critical);
  let finalVerdict: FinalVerdict;
  if (overallScore === null || confidence < MIN_CONFIDENCE_FOR_DECISION) {
    finalVerdict = {
      decision: "insufficient",
      label: "אין מספיק מידע להכרעה",
      reasoning: overallScore === null
        ? "לא ניתן היה לחשב ציון כולל — חסרים נתונים שנתיים ברי-בדיקה מ-SEC ומ-Yahoo Finance עבור טיקר זה."
        : `רמת הביטחון בנתונים (${confidence}%) נמוכה מסף ${MIN_CONFIDENCE_FOR_DECISION}% הנדרש כדי לקבוע מסקנה חד-משמעית לפי הקריטריונים שהוגדרו.`
    };
  } else if (overallScore >= YES_SCORE_THRESHOLD && criticalRedFlags.length === 0) {
    finalVerdict = {
      decision: "yes",
      label: "כן — עומדת בקריטריונים שהוגדרו",
      reasoning: `הציון הכולל (${Math.round(overallScore)}/100) מעל סף ${YES_SCORE_THRESHOLD}, ולא זוהו דגלים אדומים קריטיים מבין ${evaluable} הכללים שניתן היה לבדוק בפועל (רמת ביטחון ${confidence}%).`
    };
  } else {
    const reasons: string[] = [];
    if (overallScore < YES_SCORE_THRESHOLD) {
      reasons.push(`הציון הכולל (${Math.round(overallScore)}/100) נמוך מסף ${YES_SCORE_THRESHOLD} שהוגדר`);
    }
    if (criticalRedFlags.length > 0) {
      reasons.push(`זוהו ${criticalRedFlags.length} דגל/י אדום קריטי: ${criticalRedFlags.map(r => r.title).join(", ")}`);
    }
    finalVerdict = {
      decision: "no",
      label: "לא — אינה עומדת בקריטריונים שהוגדרו",
      reasoning: `${reasons.join("; ")} (רמת ביטחון ${confidence}%).`
    };
  }

  return {
    ticker: input.ticker,
    companyName: input.companyName,
    sector: input.sector,
    industry: input.industry,
    price: input.price,
    currency: input.currency,
    marketCap: input.marketCap,
    currentPE: input.currentPE,
    currentEVToEBIT: input.currentEVToEBIT,
    earningsGrowth: input.earningsGrowth,
    latestFilingUrl: input.latestFilingUrl,
    updatedAt: new Date().toISOString(),
    annual,
    customerConcentration: input.customerConcentration,
    recurringRevenue: input.recurringRevenue,
    peers: input.peers,
    valuationHistory: input.valuationHistory,
    pillars,
    overallScore,
    confidence,
    redFlags,
    positives,
    verdict,
    finalVerdict,
    secFilingsAvailable: input.secFilingsAvailable ?? annual.length > 0,
    sources: ["SEC EDGAR", "Yahoo Finance (unofficial)", "Calculated"]
  };
}
