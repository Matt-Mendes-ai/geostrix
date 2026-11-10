// TASKS.csv #1985 — a point survey gridded with equivalent sources (Harmonica, in the Python engine) on ONE level: readings taken at
// different heights (a draped ground or drone survey, two surveys flown at different heights) come out on a level surface, and a
// higher elevation continues the whole survey upward. The IDW gridder above treats every reading as if it were at the same height.
import React, { useMemo, useRef, useState } from "react";
import { runPfieldsJob } from "../lib/desktop.js";
import { rasterFromGrid } from "../lib/raster.js";
import { suggestSampleGrid } from "../lib/sampleGrid.js";
import { b64ToF32 } from "../lib/inversion.js";
import { surveyKey } from "../lib/geophysSurveys.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45, marginTop: 4 };

export default function EqsGridBox({ survey, rows, units = "", addRaster, defaultElevation = 0, numInput, pBtn }) {
  const pts = useMemo(() => rows.filter((r) => surveyKey(r) === survey && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value)), [rows, survey]);
  const withZ = pts.filter((r) => Number.isFinite(r.z)).length;
  const sug = useMemo(() => suggestSampleGrid(pts.slice(0, 20000)), [pts]);
  const zMax = useMemo(() => pts.reduce((m, r) => (Number.isFinite(r.z) && r.z > m ? r.z : m), -Infinity), [pts]);
  const [cell, setCell] = useState("");
  const [elev, setElev] = useState("");
  const [flatZ, setFlatZ] = useState("");
  const [blank, setBlank] = useState("");
  const [depth, setDepth] = useState("");
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const abort = useRef(null);
  const cellM = Number(cell) > 0 ? Number(cell) : sug?.cellM ?? 25;
  const noZ = withZ < pts.length;
  const elevM = elev !== "" ? Number(elev) : Number.isFinite(zMax) && !noZ ? Math.ceil(zMax) : NaN;
  const run = async () => {
    if (pts.length < 10) { setMsg({ info: false, text: tr("Fewer than 10 readings to grid.") }); return; }
    const z0 = Number(flatZ);
    if (noZ && !(flatZ !== "" && Number.isFinite(z0))) { setMsg({ info: false, text: tr("{n} of the readings have no elevation: enter the height they were all taken at.", { n: (pts.length - withZ).toLocaleString() }) }); return; }
    if (!Number.isFinite(elevM)) { setMsg({ info: false, text: tr("Enter the elevation to grid at.") }); return; }
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const p of pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
    const nodes = (Math.floor((xmax - xmin) / cellM) + 1) * (Math.floor((ymax - ymin) / cellM) + 1);
    if (nodes > 4_000_000) { setMsg({ info: false, text: tr("At {cell} m the grid would have {n} nodes, over 4,000,000: use a larger cell.", { cell: cellM, n: nodes.toLocaleString() }) }); return; }
    const blankM = Number(blank) > 0 ? Number(blank) : sug?.blankM ?? 3 * cellM;
    const depthM = Number(depth) > 0 ? Number(depth) : +(1.2 * cellM).toFixed(1);
    const request = { op: "eqs", x: pts.map((p) => p.x), y: pts.map((p) => p.y), z: pts.map((p) => (noZ ? z0 : p.z)), value: pts.map((p) => p.value), cell: cellM, elevation: elevM, blank: blankM, depth: depthM, region: [xmin, xmax, ymin, ymax] };
    abort.current = new AbortController();
    setBusy(tr("Starting the Python engine…")); setMsg(null);
    const t0 = Date.now();
    const r = await runPfieldsJob(request, { signal: abort.current.signal, onProgress: (p) => setBusy(p.message || tr("Working…")) });
    setBusy(null);
    if (!r.ok) { setMsg({ info: !!r.cancelled, text: r.error }); return; }
    const d = r.data;
    try {
      const name = `${survey} — equivalent sources at ${elevM} m (${cellM} m cells)`;
      // TASKS.csv #2392 (review #2325, WA uranium) — drawn at the elevation the field was computed at (the survey's own height), not the
      // collars' median RL (331 m under a grid at 340 m; ~200 m off on an underground project), as the IDW route since #2239
      const drawAt = Number.isFinite(elevM) ? elevM : defaultElevation;
      const raster = rasterFromGrid({ name, values: b64ToF32(d.values), nx: d.nx, ny: d.ny, x0: d.x0, yTop: d.yTop, dx: d.dx, dy: d.dy, elevation: drawAt,
        extra: { levelM: Number.isFinite(elevM) ? elevM : null /* #2553: the level Euler hangs its depths from */, filter: { kind: "equivalent-sources", label: "Equivalent sources (Harmonica)", params: { elevationM: elevM, cellM, blankM: Math.round(blankM), sourceDepthM: d.depth, readings: d.readings, gradientBoosted: d.gradient_boosted, rmsMisfit: d.rms_misfit, readingsElevation: noZ ? `all at ${z0} m (entered)` : "their own" }, sourceRaster: survey, method: "harmonica.EquivalentSources (EquivalentSourcesGB above 5,000 readings), block size = cell, sources 1.2 x the cell below the readings unless entered, default damping, predicted at one elevation; nodes beyond the blanking distance of every reading left empty (python-sidecar/app/geophys/pfields.py)", at: new Date().toISOString() } } });
      addRaster({ ...raster, provenance: { tool: "Equivalent sources gridding", survey, readings: d.readings, cellM, elevationM: elevM, sourceDepthM: d.depth, blankingM: Math.round(blankM), drawnAtM: drawAt } }); // #2392
      const pct = d.data_std > 0 ? (100 * d.rms_misfit) / d.data_std : 0;
      setMsg({ info: true, text: tr("Added \"{name}\" in {s} s: {n} readings, {nx} × {ny} nodes at {elev} m, sources {depth} m below the readings. They reproduce the readings' {cell} m block means to {rms} {units} RMS ({pct} % of their spread){v}. Inside a block the readings themselves vary by {within} {units} RMS, which a {cell} m grid cannot show.", { name, s: ((Date.now() - t0) / 1000).toFixed(1), n: d.readings.toLocaleString(), nx: d.nx, ny: d.ny, elev: elevM, depth: d.depth, cell: cellM, rms: d.rms_misfit.toPrecision(3), units, pct: pct.toFixed(1), within: d.within_block_rms.toPrecision(3), v: d.gradient_boosted ? tr("; solved in overlapping windows (gradient-boosted), as for any survey over 5,000 readings") : "" }) + tr(" Drawn flat at {z} m, the elevation the field was computed at.", { z: Math.round(drawAt).toLocaleString() }) });
    } catch (err) { setMsg({ info: false, text: err.message }); }
  };
  return (
    <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", fontSize: "var(--font-size-sm)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 6px", alignItems: "center" }}>
        <span>{tr("Cell (m)")}</span><input type="number" min="0" value={cell} placeholder={String(cellM)} aria-label={tr("Equivalent-source cell size")} onChange={(e) => setCell(e.target.value)} style={numInput} />
        <span>{tr("Grid at elevation (m)")}</span><input type="number" value={elev} placeholder={Number.isFinite(elevM) ? String(elevM) : ""} aria-label={tr("Elevation to grid at")} onChange={(e) => setElev(e.target.value)} style={numInput} />
        {noZ && <><span>{tr("Readings taken at (m)")}</span><input type="number" value={flatZ} aria-label={tr("Elevation of the readings")} onChange={(e) => setFlatZ(e.target.value)} style={numInput} /></>}
        <span>{tr("Source depth (m)")}</span><input type="number" min="0" value={depth} placeholder={String(+(1.2 * cellM).toFixed(1))} aria-label={tr("Equivalent-source depth below the readings")} title={tr("How far below the readings the sources sit: shallower fits short anomalies (a ground survey), deeper smooths (airborne data). Blank: 1.2 × the cell. If the fit below is loose, try shallower.")} onChange={(e) => setDepth(e.target.value)} style={numInput} />
        <span>{tr("Blank beyond (m)")}</span><input type="number" min="0" value={blank} placeholder={String(sug?.blankM ?? 3 * cellM)} aria-label={tr("Equivalent-source blanking distance")} onChange={(e) => setBlank(e.target.value)} style={numInput} />
      </div>
      <div style={note}>{noZ ? tr("{n} of the readings have no elevation, so all are taken at one height and the grid is a continuation from it.", { n: (pts.length - withZ).toLocaleString() }) : tr("Blank elevation: the highest reading ({z} m), so the grid is a level surface just above the survey. A higher elevation continues it upward (smoother, deeper sources stand out).", { z: Number.isFinite(zMax) ? Math.ceil(zMax) : "?" })}</div>
      {busy ? (
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}><span style={{ flex: 1 }}>{busy}</span><button type="button" onClick={() => abort.current?.abort()} style={{ ...pBtn, width: "auto", marginBottom: 0 }}>{tr("Cancel")}</button></div>
      ) : (
        <button type="button" onClick={run} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Grid with equivalent sources")}</button>
      )}
      {msg && <div role="status" style={{ ...note, color: msg.info ? "var(--color-text-secondary)" : "var(--color-danger-text)" }}>{msg.text}</div>}
    </div>
  );
}
