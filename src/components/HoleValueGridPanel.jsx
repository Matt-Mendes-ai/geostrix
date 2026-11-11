// TASKS.csv #2658 — Maps plan > Collars > Grid a per-hole value: one value per hole (highest, length-weighted mean, or depth of the first
// interval at or over a threshold, of an assay element or a numeric log; lib/holeValueGrid.js) gridded at the collars with the
// surface-sample gridding (lib/sampleGrid.js, #1622), so the raster is contoured and shown in the plan's figure like a soil grid.
import React, { useMemo, useState } from "react";
import { useStore } from "../lib/store.jsx";
import { t as tr } from "../lib/i18n.js";
import { gridSamples, logByDefault, samplePoints, suggestSampleGrid, MINCURV_MAX_CELLS } from "../lib/sampleGrid.js";
import { holeValueSources, holeValueRows, perHoleValue, holeSamples, holeValueMeta } from "../lib/holeValueGrid.js";
import { rasterColourFields } from "../lib/rasterColour.js";
import { f32ToB64 } from "../lib/inversion.js";
import { defaultDrapeElevation } from "../lib/drapeElevation.js";

const KEY = "value";

export default function HoleValueGridPanel() {
  const { collars = [], assays = [], assayElements = [], layers = {}, customLayers = [], addRaster, voxelModels, surfaceSamples } = useStore();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState("");
  const [stat, setStat] = useState("max");
  const [threshold, setThreshold] = useState("");
  const [logChoice, setLogChoice] = useState(null); // null: the unit's default
  const [method, setMethod] = useState("idw");
  const [cell, setCell] = useState("");
  const [blank, setBlank] = useState("");
  const [msg, setMsg] = useState(null);
  const sources = useMemo(() => (open ? holeValueSources({ assayElements, layers, customLayers }) : []), [open, assayElements, layers, customLayers]);
  const source = sources.find((s) => s.id === sourceId) || sources[0] || null;
  const values = useMemo(() => (source ? perHoleValue(holeValueRows(source, { assays, layers, customLayers }), source.symbol, stat, { threshold }) : new Map()), [source, stat, threshold, assays, layers, customLayers]);
  const samples = useMemo(() => holeSamples(collars, values, KEY), [collars, values]);
  const log = stat === "firstOver" ? false : logChoice ?? logByDefault(source?.unit);
  const suggestion = useMemo(() => (samples.length >= 3 ? suggestSampleGrid(samplePoints(samples, KEY).points) : null), [samples]);
  if (!collars.length) return null;
  const inp = { width: "100%", boxSizing: "border-box", fontSize: "var(--font-size-sm)", padding: "2px 4px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text)" };
  const lbl = { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
  const run = () => {
    setMsg(null);
    if (stat === "firstOver" && !Number.isFinite(Number(threshold === "" ? NaN : threshold))) { setMsg({ err: true, text: tr("Type the threshold the depth is measured to.") }); return; }
    const res = gridSamples(samples, KEY, { log, cellM: cell === "" ? suggestion?.cellM : Number(cell), blankM: blank === "" ? suggestion?.blankM : Number(blank), method });
    if (res.error === "few") { setMsg({ err: true, text: tr("Too few holes with a value to grid ({n}): at least 3 are needed.", { n: res.n }) }); return; }
    if (res.error === "mincurvCells") { setMsg({ err: true, text: tr("Minimum curvature takes grids up to {max} cells, and this one is {gridW}×{gridH}. Use a bigger cell size, or IDW.", { max: MINCURV_MAX_CELLS.toLocaleString(), gridW: res.nx, gridH: res.ny }) }); return; }
    if (res.error === "natneighWork") { setMsg({ err: true, text: tr("Natural neighbour at this cell size is far finer than the sample spacing ({gridW}×{gridH} cells): use a bigger cell size.", { gridW: res.nx, gridH: res.ny }) }); return; }
    if (res.error === "cells") { setMsg({ err: true, text: tr("That cell size would produce a {gridW}×{gridH} grid — too large. Use a bigger cell size.", { gridW: res.nx, gridH: res.ny }) }); return; }
    const { grid, bbox } = res;
    const { unit, what } = holeValueMeta(source, stat, threshold);
    const colour = rasterColourFields(grid.values, grid.nx, grid.ny, { palette: "viridis", stretch: log ? "log" : "p2-98", invert: false });
    const how = method === "mincurv" ? "min. curvature T0.25" : method === "natneigh" ? "nat. neighbour" : "IDW";
    const drape = defaultDrapeElevation({ collars, voxelModels, surfaceSamples, bbox });
    addRaster({
      name: `${what} per hole${unit ? ` (${unit})` : ""} ${how}${log ? " log10" : ""} ${res.cellM} m`, bbox, ...colour, elevation: drape.z,
      grid: { nx: grid.nx, ny: grid.ny, x0: grid.x0, yTop: grid.yTop, dx: grid.dx, dy: grid.dy, values: f32ToB64(grid.values), valid: res.valid },
      // source "holes": the figure draws the collars with their values, not surface samples (MapsPlanView)
      geochem: { symbol: source.symbol, unit, log, medium: null, samples: res.points, cellM: res.cellM, method, ...(method === "mincurv" ? { tension: 0.25 } : method === "natneigh" ? {} : { power: 2 }), blankM: res.blankM, source: "holes", sourceId: source.id, stat, ...(stat === "firstOver" ? { threshold: Number(threshold) } : {}) },
      provenance: { tool: `Per-hole value gridding (${what}, at the collars; ${method === "mincurv" ? "minimum curvature with tension" : method === "natneigh" ? "natural neighbour, discrete Sibson" : "inverse distance weighting"})` },
    });
    setMsg({ err: false, text: tr("Gridded a value per hole from {n} hole(s) at the collars, {cell} m cells: {valid} of {cells} cells have a value. It is in Maps > GeoTIFF / GXF and the 3D View, where it can be contoured.", { n: res.points.toLocaleString(), cell: res.cellM, valid: res.valid.toLocaleString(), cells: (grid.nx * grid.ny).toLocaleString() })
      + (log && res.nonPositive ? " " + tr("{n} zero or negative value(s) left out of the log10 grid.", { n: res.nonPositive }) : "")
      + (collars.length > res.points ? " " + tr("{n} hole(s) have no value and are not in it (not a zero).", { n: (collars.length - res.points).toLocaleString() }) : "") });
  };
  return (
    <div>
      <button onClick={() => { setOpen((o) => !o); setMsg(null); }} aria-expanded={open} style={{ width: "100%", padding: "2px 6px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text-secondary)", cursor: "pointer" }}>{tr("Grid a per-hole value…")}</button>
      {open && !sources.length && <div style={{ fontSize: "var(--font-size-xs)", marginTop: 4 }}>{tr("No assays or numeric downhole logs to take a value per hole from.")}</div>}
      {open && source && (
        <div style={{ marginTop: 5, display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={lbl}>{tr("Value")}<select value={source.id} onChange={(e) => { setSourceId(e.target.value); setLogChoice(null); }} aria-label={tr("Per-hole value source")} style={inp}>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.unit ? `${s.symbol} (${s.unit})` : s.symbol}</option>)}
          </select></label>
          <label style={lbl}>{tr("Per hole")}<select value={stat} onChange={(e) => setStat(e.target.value)} aria-label={tr("Per-hole statistic")} style={inp}>
            <option value="max">{tr("The highest value in the hole")}</option>
            <option value="mean">{tr("The length-weighted mean of the hole")}</option>
            <option value="firstOver">{tr("The depth of the first interval at or over a threshold")}</option>
          </select></label>
          {stat === "firstOver" && <label style={lbl}>{tr("Threshold ({unit})", { unit: source.unit || tr("as logged") })}<input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-label={tr("Threshold")} style={inp} /></label>}
          {stat !== "firstOver" && <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-xs)", cursor: "pointer" }}><input type="checkbox" checked={log} onChange={(e) => setLogChoice(e.target.checked)} />{tr("Interpolate log10 of the values")}</label>}
          <div style={{ display: "flex", gap: 5 }}>
            <label style={lbl}>{tr("Method")}<select value={method} onChange={(e) => setMethod(e.target.value)} aria-label={tr("Gridding method")} style={inp}>
              <option value="idw">{tr("IDW")}</option><option value="mincurv">{tr("Minimum curvature")}</option><option value="natneigh">{tr("Natural neighbour")}</option>
            </select></label>
            <label style={lbl}>{tr("Cell (m)")}<input type="number" min="1" value={cell} placeholder={suggestion ? String(suggestion.cellM) : ""} onChange={(e) => setCell(e.target.value)} style={inp} /></label>
            <label style={lbl}>{tr("Blank beyond (m)")}<input type="number" min="0" value={blank} placeholder={suggestion ? String(suggestion.blankM) : ""} onChange={(e) => setBlank(e.target.value)} style={inp} /></label>
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("{n} of {total} holes have a value. Each is placed at its collar, not at the intercept.", { n: samples.length.toLocaleString(), total: collars.length.toLocaleString() })}</div>
          <button onClick={run} disabled={samples.length < 3} style={{ padding: "3px 8px", fontSize: "var(--font-size-sm)", border: "1px solid var(--color-selected-border)", borderRadius: 4, background: "var(--color-selected-bg)", color: "var(--color-primary)", cursor: samples.length < 3 ? "default" : "pointer" }}>{tr("Grid to raster")}</button>
        </div>
      )}
      {msg && <div role="status" style={{ marginTop: 4, fontSize: "var(--font-size-xs)", color: msg.err ? "var(--color-danger-text)" : "var(--color-text-secondary)" }}>{msg.text}</div>}
    </div>
  );
}
