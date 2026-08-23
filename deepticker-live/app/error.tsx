"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled client error", error);
  }, [error]);

  return (
    <main className="container">
      <div className="card errorBox" style={{ marginTop: 40 }}>
        <h2 className="sectionTitle">אירעה שגיאה בלתי צפויה</h2>
        <p className="ruleDesc">
          המערכת נתקלה בתקלה בעת טעינת הנתונים. אפשר לנסות שוב.
        </p>
        <button className="primaryBtn" style={{ marginTop: 14 }} onClick={() => reset()}>
          נסה שוב
        </button>
      </div>
    </main>
  );
}
