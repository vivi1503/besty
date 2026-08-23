import type { AnalysisResponse } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";

export function Pillar({ pillar }: { pillar: AnalysisResponse["pillars"][number] }) {
  return (
    <section className="card pillar">
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
        <div>
          <h2 className="sectionTitle">{pillar.title}</h2>
          <div className="sectionMeta">משקל במודל: {pillar.weight}% · ציון תחום: {pillar.score == null ? "לא זמין" : pillar.score.toFixed(0)}</div>
        </div>
        <span className="badge insufficient">SEC / Calculated</span>
      </div>

      <div>
        {pillar.rules.map(r => (
          <div className="rule" key={r.id}>
            <div className="ruleHead">
              <div className="ruleTitle">{r.title}</div>
              <StatusBadge status={r.status} />
            </div>
            <div className="ruleDesc">{r.explanation}</div>
            {(r.observed || r.threshold) && (
              <div className="small" style={{marginTop:8}}>
                {r.observed && <>נצפה: <b>{r.observed}</b></>}
                {r.observed && r.threshold && " · "}
                {r.threshold && <>סף: <b>{r.threshold}</b></>}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
