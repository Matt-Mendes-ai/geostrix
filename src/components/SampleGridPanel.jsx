// TASKS.csv #1622 — Geochem > Surface samples > Grid to raster: one element of one medium as an IDW raster (lib/sampleGrid.js),
// log10 by default for ppm / ppb, blanked away from the samples, coloured with the log stretch so the legend reads in the unit.
import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { gridSamples, logByDefault, samplePoints, suggestSampleGrid } from "../lib/sampleGrid.js";
import { rasterColourFields } from "../lib/rasterColour.js";
import { f32ToB64 } from "../lib/inversion.js";
import { defaultDrapeElevation } from "../lib/drapeElevation.js";

export default function SampleGridPanel({ setNotices }) {
  const { surfaceSamples, surfaceElements, addRaster, collars, voxelModels } = useStore();
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [medium, setMedium] = useState("");
  const [logChoice, setLogChoice] = useState(null); // null: the unit's default
  const [cell, setCell] = useState("");
  const [blank, setBlank] = useState("");
  const [power, setPower] = useState(2);
  const el = surfaceElements.find((e) => e.symbol === symbol) || surfaceElements[0];
  const media = useMemo(() => [...new Set(surfaceSamples.map((s) => s.medium).filter(Boolean))].sort(), [surfaceSamples]);
  const log = logChoice ?? logByDefault(el?.unit);
  const suggestion = useMemo(() => (open && el ? suggestSampleGrid(samplePoints(surfaceSamples, el.symbol, { medium, log: false }).points) : null), [open, el, surfaceSamples, medium]);
  if (!surfaceSamples.length || !surfaceElements.length) return null;
  const inp = { width: "100%", boxSizing: "border-box", fontSize: "var(--font-size-sm)", padding: "3px 5px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text)" };
  const lbl = { display: "flex", flexDirection: "column", gap: 2, flex: 1, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
  const run = () => {
    const res = gridSamples(surfaceSamples, el.symbol, { medium, log, cellM: cell === "" ? suggestion?.cellM : Number(cell), power, blankM: blank === "" ? suggestion?.blankM : Number(blank) });
    if (res.error === "few") { setNotices((p) => [...p, tr("Too few {el} values to grid ({n}): at least 3 samples with a value are needed.", { el: el.symbol, n: res.n })]); return; }
    if (res.error === "cells") { setNotices((p) => [...p, tr("That cell size would produce a {gridW}×{gridH} grid — too large. Use a bigger cell size.", { gridW: res.nx, gridH: res.ny })]); return; }
    const { grid, bbox } = res;
    const style = { palette: "viridis", stretch: log ? "log" : "p2-98", invert: false };
    const colour = rasterColourFields(grid.values, grid.nx, grid.ny, style);
    const name = `${el.symbol} (${el.unit})${medium ? ` ${medium}` : ""} IDW${log ? " log10" : ""} ${res.cellM} m`;
    const drape = defaultDrapeElevation({ collars, voxelModels, surfaceSamples, bbox });
    addRaster({
      name, bbox, ...colour, elevation: drape.z,
      grid: { nx: grid.nx, ny: grid.ny, x0: grid.x0, yTop: grid.yTop, dx: grid.dx, dy: grid.dy, values: f32ToB64(grid.values), valid: res.valid },
      geochem: { symbol: el.symbol, unit: el.unit, log, medium: medium || null, samples: res.points, cellM: res.cellM, power, blankM: res.blankM },
      provenance: { tool: "Surface sample gridding (IDW)", element: el.symbol, unit: el.unit, medium: medium || "all", log10: log, samples: res.points, cellM: res.cellM, power, blankingM: res.blankM },
    });
    setNotices((p) => [...p, tr("Gridded {el} ({unit}) from {n} sample(s){m} at {cell} m cells, power {pw}{lg}{bl}: {valid} of {cells} cells have a value. It is in Maps > GeoTIFF / GXF and the 3D View.", {
      el: el.symbol, unit: el.unit, n: res.points.toLocaleString(), m: medium ? tr(" ({medium})", { medium }) : "", cell: res.cellM, pw: power,
      lg: log ? tr(", on log10 values (shown back in {unit})", { unit: el.unit }) + (res.nonPositive ? tr("; {n} zero or negative value(s) left out", { n: res.nonPositive }) : "") : "",
      bl: res.blankM ? tr(", blank beyond {d} m of a sample", { d: res.blankM }) : "", valid: res.valid.toLocaleString(), cells: (grid.nx * grid.ny).toLocaleString() })]);
    setOpen(false);
  };
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ width: "100%", padding: "5px 8px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", color: "var(--color-text-secondary)", cursor: "pointer" }}>{tr("Grid an element to a raster…")}</button>
      {open && el && (
        <div style={{ marginTop: 6, padding: 8, border: "1px solid var(--color-border)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <label style={lbl}>{tr("Element")}<select value={el.symbol} onChange={(e) => { setSymbol(e.target.value); setLogChoice(null); }} style={inp}>{surfaceElements.map((e) => <option key={e.symbol} value={e.symbol}>{`${e.symbol} (${e.unit})`}</option>)}</select></label>
            <label style={lbl}>{tr("Medium")}<select value={medium} onChange={(e) => setMedium(e.target.value)} style={inp}><option value="">{tr("All")}</option>{media.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }}><input type="checkbox" checked={log} onChange={(e) => setLogChoice(e.target.checked)} />{tr("Interpolate log10 of the values (trace elements are lognormal)")}</label>
          <div style={{ display: "flex", gap: 6 }}>
            <label style={lbl}>{tr("Cell (m)")}<input type="number" min="1" value={cell} placeholder={suggestion ? String(suggestion.cellM) : ""} onChange={(e) => setCell(e.target.value)} style={inp} /></label>
            <label style={lbl}>{tr("Power")}<input type="number" min="1" max="4" step="0.5" value={power} onChange={(e) => setPower(Math.max(1, Math.min(4, Number(e.target.value) || 2)))} style={inp} /></label>
            <label style={lbl}>{tr("Blank beyond (m)")}<input type="number" min="0" value={blank} placeholder={suggestion ? String(suggestion.blankM) : ""} onChange={(e) => setBlank(e.target.value)} style={inp} /></label>
          </div>
          {suggestion && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>{tr("Blank fields use the sample spacing: about {s} m between samples, so {c} m cells and no value beyond {b} m of a sample.", { s: Math.round(suggestion.spacingM), c: suggestion.cellM, b: suggestion.blankM })}</div>}
          <button onClick={run} style={{ padding: "6px 8px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-selected-border)", borderRadius: 5, background: "var(--color-selected-bg)", color: "var(--color-primary)", cursor: "pointer" }}>{tr("Grid to raster")}</button>
        </div>
      )}
    </div>
  );
}
