// TASKS.csv #3673 phase 2 — the Grade shell pane's "Update an imported domain with new drilling": pick an imported solid and the first year of
// the new drilling; the pane's element, cut-off and probability are used. The run is ./domainUpdateRun.js (loaded on use).
import React, { useMemo, useState } from "react";
import { t as tr } from "../../lib/i18n.js";
import { holeYear } from "../../lib/viewer/domainUpdate.js";

export default function DomainUpdateSection({ ctx, symbol, cutoff, iso, isAssay, style, fieldStyle, selectStyle, buttonStyle }) {
  const imported = (ctx.implicitSurfaces || []).filter((s) => s.type === "imported");
  const years = useMemo(() => { const ys = new Set(); for (const c of ctx.collars || []) { const y = holeYear(c); if (y != null) ys.add(y); } return [...ys].sort((a, b) => a - b); }, [ctx.collars]);
  const [surfaceId, setSurfaceId] = useState("");
  const [firstYear, setFirstYear] = useState("");
  const [busy, setBusy] = useState(false);
  if (!imported.length) return null;
  const sid = imported.some((s) => s.id === surfaceId) ? surfaceId : imported[0].id;
  const fy = Number(firstYear) || (years.length ? years[years.length - 1] : "");
  const nNew = Number.isFinite(fy) ? (ctx.collars || []).filter((c) => { const y = holeYear(c); return y != null && y >= fy; }).length : 0;
  const can = isAssay && !busy && Number.isFinite(cutoff) && Number.isFinite(fy) && nNew > 0;
  const run = async () => {
    setBusy(true);
    try { const { runDomainUpdate } = await import("./domainUpdateRun.js"); await runDomainUpdate(ctx, { surfaceId: sid, firstYear: fy, symbol, cutoff, iso }); }
    finally { setBusy(false); }
  };
  return (
    <div style={style}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr("Update an imported domain with new drilling")}</div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 6 }}>{tr("The domain stays where the holes drilled since agree with it and changes only near those that do not; the result says which holes agree, the grade just outside it and below the cut-off inside it, and the volume added and removed. The element, cut-off and probability are this pane's.")}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
        <label style={{ ...fieldStyle, flex: 2 }}>{tr("Domain")}
          <select value={sid} onChange={(e) => setSurfaceId(e.target.value)} style={{ ...selectStyle, width: "100%" }} aria-label={tr("Imported domain to update")}>
            {imported.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={{ ...fieldStyle, flex: 1 }} title={tr("The holes drilled in this year or later are the new data (the year from a collar year field, else from ids like DH-25-012).")}>{tr("Holes from")}
          <input type="number" min="1900" max="2200" step="1" value={fy} onChange={(e) => setFirstYear(e.target.value)} style={{ ...selectStyle, width: "100%" }} aria-label={tr("First year of the new drilling")} />
        </label>
      </div>
      <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{years.length ? tr("{n} hole(s) drilled from {year} on.", { n: nNew, year: fy }) : tr("No hole has a drilling year (a collar year field, or ids like DH-25-012).")}</div>
      <button type="button" onClick={run} disabled={!can} style={{ ...buttonStyle, opacity: can ? 1 : 0.5, cursor: can ? "pointer" : "default" }}>{busy ? tr("Running…") : tr("Update the domain")}</button>
    </div>
  );
}
