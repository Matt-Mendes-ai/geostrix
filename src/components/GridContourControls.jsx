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
import { fieldContourLevels, levelsEvery, everyInterval, p2p98 } from "../lib/gridContourLevels.js"; // TASKS.csv #2836 / #2844

export default function GridContourControls({ raster, inputStyle }) {
  const { addBoundary, terrain } = useStore();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState(null);
  // TASKS.csv #2398 (review #2325, WA uranium) — offered on every raster that keeps its grid, not only geochemistry grids. A geophysics grid
  // can be millions of cells: it is decoded (and sorted for the suggested levels) only once the contours are asked for, not on every card
  const [open, setOpen] = useState(!!raster.geochem);
  const values = useMemo(() => (open && raster.grid?.values ? b64ToF32(raster.grid.values) : null), [open, raster.grid]);
  // TASKS.csv #2836 / #2844 — a geochemistry grid: the upper tail of its positive values (#1622); any other grid: a round interval across its 2–98 %
  const field = useMemo(() => (values && !raster.geochem ? fieldContourLevels(values) : null), [values, raster.geochem]);
  const suggested = useMemo(() => (values ? (field ? field.levels : suggestedContourLevels(values)) : []), [values, field]);
  if (!raster.grid?.values) return null;
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ marginTop: 7, padding: "3px 8px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text-secondary)", cursor: "pointer" }}>{tr("Contours…")}</button>;
  if (!values) return null;
  const unit = rasterUnitOf(raster); // #1858 — the unit typed on the raster first
  const add = () => {
    const every = everyInterval(text), r98 = every ? p2p98(values) : null; // #2844 — 'every 5'
    const levels = every ? (r98 ? levelsEvery(every, r98[0], r98[1]) : []) : text.trim() ? parseBreaks(text) : suggested;
    if (every && !levels.length) { setMsg(tr("Every {d} gives too many levels (or none) across this grid's 2–98 % range: try a larger interval.", { d: every })); return; }
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
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder={field ? tr("every {d}", { d: field.interval }) : suggested.join(", ")} aria-label={tr("Contour levels")} title={field /* #2836 / #2844 */
          ? tr("Levels in {unit}, lowest first, or 'every 5'; blank: every {d}{du} across the grid's 2–98 % range ({lo} to {hi}){z}", { unit: unit || tr("the grid's unit"), d: field.interval, du: unit ? " " + unit : "", lo: +field.range[0].toPrecision(3), hi: +field.range[1].toPrecision(3), z: field.range[0] < 0 && field.range[1] > 0 ? tr(", with the zero line") : "" })
          : tr("Levels in {unit}, lowest first; blank: the 75th, 90th, 95th and 98th percentiles of the grid's positive values", { unit: unit || tr("the grid's unit") })} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
        <button onClick={add} style={{ padding: "3px 8px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text-secondary)", cursor: "pointer", flexShrink: 0 }}>{tr("Add")}</button>
      </div>
      {msg && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 4, lineHeight: 1.4 }}>{msg}</div>}
    </div>
  );
}
