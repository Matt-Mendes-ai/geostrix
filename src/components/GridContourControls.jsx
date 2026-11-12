// TASKS.csv #1622 — contours of a geochemistry grid on its raster card: levels typed or the grid's upper percentiles, added as one
// boundary (the terrain-contour shape, #1466) that sits on the ground: draped on the terrain, else flat at the raster's level.
import React, { useMemo, useState } from "react";
import { rasterUnitOf } from "../lib/rasterMethod.js"; // TASKS.csv #1858
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { b64ToF32 } from "../lib/inversion.js";
import { gridContours, suggestedContourLevels } from "../lib/sampleGrid.js";
import { parseBreaks } from "../lib/mapGraduated.js";
import { averagedInfo, missedLevelsText } from "../lib/gridMeans.js"; // TASKS.csv #2831

export default function GridContourControls({ raster, inputStyle }) {
  const { addBoundary, terrain } = useStore();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(null);
  // TASKS.csv #2398 (review #2325, WA uranium) — offered on every raster that keeps its grid, not only geochemistry grids. A geophysics grid
  // can be millions of cells: it is decoded (and sorted for the suggested levels) only once the contours are asked for, not on every card
  const [open, setOpen] = useState(!!raster.geochem);
  const values = useMemo(() => (open && raster.grid?.values ? b64ToF32(raster.grid.values) : null), [open, raster.grid]);
  const suggested = useMemo(() => (values ? suggestedContourLevels(values) : []), [values]);
  if (!raster.grid?.values) return null;
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ marginTop: 7, padding: "3px 8px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text-secondary)", cursor: "pointer" }}>{tr("Contours…")}</button>;
  if (!values) return null;
  const unit = rasterUnitOf(raster); // #1858 — the unit typed on the raster first
  const add = () => {
    const levels = text.trim() ? parseBreaks(text) : suggested;
    if (!levels.length) { setMsg(tr("Type one or more levels, e.g. 0.01, 0.05, 0.1.")); return; }
    const res = gridContours(raster.grid, values, levels);
    const avg = averagedInfo(raster.grid, values), missed = missedLevelsText(levels, res.map((l) => l.level), avg, values); // #2831 — a level the block means never reach, said
    if (!res.length) { setMsg(tr("None of those levels crosses the grid.") + (missed ? " " + missed : "")); return; }
    const lines = [], closed = [], lineLevels = [];
    res.forEach(({ level, polylines }) => polylines.forEach((pl) => {
      lines.push(pl);
      const a = pl[0], b = pl[pl.length - 1];
      closed.push(pl.length > 3 && Math.hypot(a.x - b.x, a.y - b.y) < 1e-6);
      lineLevels.push(level);
    }));
    addBoundary({ name: tr("{name} contours ({levels} {unit})", { name: raster.name, levels: res.map((l) => l.level).join(", "), unit }), polylines: lines, closedFlags: closed, contourLevels: lineLevels, sourceRaster: raster.id, color: "#d62f2f", /* #1622: the plan view's figure lists them under their grid */ drapeMode: terrain ? "terrain" : "flat", elevation: raster.elevation });
    setMsg(tr("Added {n} contour line(s) at {levels} {unit} to Maps > Boundaries{d}.", { n: lines.length, levels: res.map((l) => l.level).join(", "), unit, d: terrain ? tr(", draped on the terrain") : "" }) + (text.trim() && missed ? " " + missed : "")); // missed: #2831 (typed levels only)
  };
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "var(--color-text-faint)", width: 46, flexShrink: 0 }}>{tr("Contours")}</span>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={suggested.join(", ")} aria-label={tr("Contour levels")} title={tr("Levels in {unit}, lowest first; blank: the grid's 75th, 90th, 95th and 98th percentiles", { unit: unit || tr("the grid's unit") })} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
        <button onClick={add} style={{ padding: "3px 8px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0 }}>{tr("Add")}</button>
      </div>
      {msg && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{msg}</div>}
    </div>
  );
}
