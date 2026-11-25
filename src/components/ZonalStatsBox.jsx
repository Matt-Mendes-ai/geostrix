// TASKS.csv #2002 — 'Statistics inside a boundary' on a value raster's card: pick a closed boundary or claim, read the count, mean, range and
// percentiles of the grid's cells inside it (lib/zonalStats.js), and copy them as text for a report.
import React, { useMemo, useState } from "react";
import { t as tr } from "../lib/i18n.js";
import { zonalStats } from "../lib/zonalStats.js";
import { isAreaBoundary, closedPartsOf } from "../lib/areaBoundary.js";
import { rasterUnitOf } from "../lib/rasterMethod.js";

const fmt = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Number(v.toPrecision(4)).toLocaleString()) : "–");

export default function ZonalStatsBox({ raster, boundaries, onClip = null }) { // onClip(boundary): makes the clipped raster (TASKS.csv #3470)
  const areas = useMemo(() => (boundaries || []).filter(isAreaBoundary), [boundaries]);
  const [id, setId] = useState("");
  const b = areas.find((x) => x.id === id);
  const s = useMemo(() => (b && raster.grid ? zonalStats(raster.grid, closedPartsOf(b).polylines /* TASKS.csv #3827 — an open line is not ground */) : null), [b, raster.grid]);
  if (!raster.grid || !areas.length) return null;
  const unit = rasterUnitOf(raster) || "";
  const rows = s ? [[tr("Cells with a value"), `${s.count.toLocaleString()} of ${s.cells.toLocaleString()}`], [tr("Area of those cells"), `${s.areaHa.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`], [tr("Mean"), fmt(s.mean)], [tr("Minimum"), fmt(s.min)], [tr("10th percentile"), fmt(s.p10)], [tr("Median"), fmt(s.p50)], [tr("90th percentile"), fmt(s.p90)], [tr("Maximum"), fmt(s.max)]] : [];
  const text = s ? `${raster.name} inside ${b.name}${unit ? ` (${unit})` : ""}\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}` : "";
  return (
    <details style={{ marginTop: 6, fontSize: "var(--font-size-xs)" }}>
      <summary style={{ cursor: "pointer", color: "var(--color-text-secondary)" }}>{tr("Statistics inside a boundary")}</summary>
      <select value={id} onChange={(e) => setId(e.target.value)} aria-label={tr("Boundary to read the grid inside")} style={{ width: "100%", marginTop: 4, fontSize: "var(--font-size-sm)" }}>
        <option value="">{tr("Choose a boundary or claim…")}</option>
        {areas.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {b && onClip && <button data-btn-own="" type="button" onClick={() => onClip(b)} title={tr("A new raster of this grid's cells inside the boundary (the original stays), cropped to its extent")} style={{ marginTop: 4, display: "block", fontSize: "var(--font-size-xs)", background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}>{tr("Clip to this boundary (new raster)")}</button>}
      {b && !s && <div style={{ marginTop: 4, color: "var(--color-text-muted)" }}>{tr("No cell of this grid lies inside it.")}</div>}
      {s && (
        <div style={{ marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
          {rows.map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: "var(--color-text-muted)" }}>{k}</span><span>{v}</span></div>)}
          {unit && <div style={{ color: "var(--color-text-muted)" }}>{tr("Values in {unit}; cells are read at their centres.", { unit })}</div>}
          <button data-btn-own="" type="button" onClick={() => navigator.clipboard?.writeText(text).catch(() => {})} style={{ marginTop: 4, fontSize: "var(--font-size-xs)", background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0 }}>{tr("Copy as text")}</button>
        </div>
      )}
    </details>
  );
}
