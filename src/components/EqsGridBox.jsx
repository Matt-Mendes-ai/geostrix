// TASKS.csv #1985 — a point survey gridded with equivalent sources (Harmonica, in the Python engine) on ONE level: readings taken at
// different heights (a draped ground or drone survey, two surveys flown at different heights) come out on a level surface, and a
// higher elevation continues the whole survey upward. The IDW gridder above treats every reading as if it were at the same height.
import React, { useMemo, useRef, useState } from "react";
import { runPfieldsJob } from "../lib/desktop.js";
import { rasterFromGrid } from "../lib/raster.js";
import { suggestSampleGrid } from "../lib/sampleGrid.js";
import { snappedNodeRegion } from "../lib/idw.js"; // TASKS.csv #2872
import { b64ToF32 } from "../lib/inversion.js";
import { surveyKey } from "../lib/geophysSurveys.js";
import { t as tr } from "../lib/i18n.js";

const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.45, marginTop: 4 };

export default function EqsGridBox({ survey, rows, units = "", method = null /* TASKS.csv #2639 */, addRaster, defaultElevation = 0, numInput, pBtn }) {
  const pts = useMemo(() => rows.filter((r) => surveyKey(r) === survey && Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.value)), [rows, survey]);
  const withZ = pts.filter((r) => Number.isFinite(r.z)).length;
  const sug = useMemo(() => suggestSampleGrid(pts.slice(0, 20000)), [pts]);
  const zMax = useMemo(() => pts.reduce((m, r) => (Number.isFinite(r.z) && r.z > m ? r.z : m), -Infinity), [pts]);
  const zMedian = useMemo(() => { const z = pts.map((r) => r.z).filter(Number.isFinite).sort((a, b) => a - b); return z.length ? z[z.length >> 1] : NaN; }, [pts]);
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
  // TASKS.csv #2839 (GSC review B7) — blank elevation was the HIGHEST reading, so a ground survey came out continued upward (Matagami: 370 m
  // against a median station at 270 m, the grid 0.74 mGal off the stations). Blank now grids on the readings' own surface ("draped": each
  // node at the readings' height interpolated there, in the Python engine); a typed elevation is a level grid, a continuation to it. With
  // no elevations the readings' entered height is the level.
  const draped = elev === "" && !noZ;
  const elevM = elev !== "" ? Number(elev) : noZ && flatZ !== "" ? Number(flatZ) : NaN;
  // #2839 — the sources' depth followed the CELL (120 m at a 100 m cell under stations 400 m apart): it now follows the station spacing, or
  // the cell when that is larger (a synthetic 400 m survey: the grid 10 x closer to the true field at 480 m than at 120 m)
  const depthDefault = +(1.2 * Math.max(cellM, sug?.spacingM || 0)).toFixed(1);
  const run = async () => {
    if (pts.length < 10) { setMsg({ info: false, text: tr("Fewer than 10 readings to grid.") }); return; }
    const z0 = Number(flatZ);
    if (noZ && !(flatZ !== "" && Number.isFinite(z0))) { setMsg({ info: false, text: tr("{n} of the readings have no elevation: enter the height they were all taken at.", { n: (pts.length - withZ).toLocaleString() }) }); return; }
    if (!draped && !Number.isFinite(elevM)) { setMsg({ info: false, text: tr("Enter the elevation to grid at.") }); return; }
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const p of pts) { if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y; }
    [xmin, xmax, ymin, ymax] = snappedNodeRegion({ xmin, xmax, ymin, ymax }, cellM); // #2872 — nodes on multiples of the cell, the spacing as typed
    const nodes = (Math.round((xmax - xmin) / cellM) + 1) * (Math.round((ymax - ymin) / cellM) + 1);
    if (nodes > 4_000_000) { setMsg({ info: false, text: tr("At {cell} m the grid would have {n} nodes, over 4,000,000: use a larger cell.", { cell: cellM, n: nodes.toLocaleString() }) }); return; }
    const blankM = Number(blank) > 0 ? Number(blank) : sug?.blankM ?? 3 * cellM;
    const depthM = Number(depth) > 0 ? Number(depth) : depthDefault;
    const request = { op: "eqs", x: pts.map((p) => p.x), y: pts.map((p) => p.y), z: pts.map((p) => (noZ ? z0 : p.z)), value: pts.map((p) => p.value), cell: cellM, elevation: draped ? "draped" : elevM, blank: blankM, depth: depthM, region: [xmin, xmax, ymin, ymax] };
    abort.current = new AbortController();
    setBusy(tr("Starting the Python engine…")); setMsg(null);
    const t0 = Date.now();
    const r = await runPfieldsJob(request, { signal: abort.current.signal, onProgress: (p) => setBusy(p.message || tr("Working…")) });
    setBusy(null);
    if (!r.ok) { setMsg({ info: !!r.cancelled, text: r.error }); return; }
    const d = r.data;
    try {
      const name = draped ? `${survey} — equivalent sources on the readings' surface (${cellM} m cells)` : `${survey} — equivalent sources at ${elevM} m (${cellM} m cells)`;
      // TASKS.csv #2392 (review #2325, WA uranium) — drawn at the elevation the field was computed at (the survey's own height), not the
      // collars' median RL (331 m under a grid at 340 m; ~200 m off on an underground project), as the IDW route since #2239
      const drawAt = Number.isFinite(elevM) ? elevM : draped && Number.isFinite(zMedian) ? zMedian : defaultElevation; // #2839: a draped grid at the readings' median
      const raster = rasterFromGrid({ name, values: b64ToF32(d.values), nx: d.nx, ny: d.ny, x0: d.x0, yTop: d.yTop, dx: d.dx, dy: d.dy, elevation: drawAt,
        extra: { levelM: Number.isFinite(elevM) ? elevM : null /* #2553: the level Euler hangs its depths from */, surveyMethod: method || undefined, units: units || undefined /* #2639 — as the IDW grid keeps them (#2557) */, filter: { kind: "equivalent-sources", label: "Equivalent sources (Harmonica)", params: { elevationM: draped ? "the readings' surface" : elevM, cellM, blankM: Math.round(blankM), sourceDepthM: d.depth, readings: d.readings, gradientBoosted: d.gradient_boosted, rmsMisfit: d.rms_misfit, gridVsReadingsRms: d.grid_rms /* #2839 */, readingsElevation: noZ ? `all at ${z0} m (entered)` : "their own" }, sourceRaster: survey, method: "harmonica.EquivalentSources (EquivalentSourcesGB above 5,000 readings), block size = cell, sources 1.2 x the cell below the readings unless entered, default damping, predicted at one elevation; nodes beyond the blanking distance of every reading left empty (python-sidecar/app/geophys/pfields.py)", at: new Date().toISOString() } } });
      addRaster({ ...raster, provenance: { tool: "Equivalent sources gridding", survey, readings: d.readings, cellM, elevationM: elevM, sourceDepthM: d.depth, blankingM: Math.round(blankM), drawnAtM: drawAt } }); // #2392
      const pct = d.data_std > 0 ? (100 * d.rms_misfit) / d.data_std : 0;
      // #2839 — and how far the GRID is from the readings themselves (its nodes interpolated to them), which a continuation shows
      const spacedOff = [d.dx, d.dy].some((v) => Number.isFinite(v) && Math.abs(v - cellM) > 1e-6 * cellM) ? " " + tr("The nodes are {dx} × {dy} m apart, not the {cell} m asked for.", { dx: +Number(d.dx).toPrecision(7), dy: +Number(d.dy).toPrecision(7), cell: cellM }) : ""; // #2872
      const gridFit = d.grid_rms != null ? " " + tr("The grid is within {rms} {units} RMS of the readings themselves (worst {max}), its nodes interpolated to their positions.", { rms: d.grid_rms.toPrecision(3), max: d.grid_max.toPrecision(3), units }) : "";
      const where = draped ? " " + tr("Drawn flat at {z} m, the readings' median elevation; the field was computed on their surface ({lo} to {hi} m).", { z: Math.round(drawAt).toLocaleString(), lo: Math.round(d.surface?.[0]), hi: Math.round(d.surface?.[1]) }) : tr(" Drawn flat at {z} m, the elevation the field was computed at.", { z: Math.round(drawAt).toLocaleString() });
      const vars = { name, s: ((Date.now() - t0) / 1000).toFixed(1), n: d.readings.toLocaleString(), nx: d.nx, ny: d.ny, elev: elevM, depth: d.depth, cell: cellM, rms: d.rms_misfit.toPrecision(3), units, pct: pct.toFixed(1), within: d.within_block_rms.toPrecision(3), v: d.gradient_boosted ? tr("; solved in overlapping windows (gradient-boosted), as for any survey over 5,000 readings") : "" };
      setMsg({ info: true, text: (draped ? tr("Added \"{name}\" in {s} s: {n} readings, {nx} × {ny} nodes on the readings' surface, sources {depth} m below the readings. They reproduce the readings' {cell} m block means to {rms} {units} RMS ({pct} % of their spread){v}. Inside a block the readings themselves vary by {within} {units} RMS, which a {cell} m grid cannot show.", vars) : tr("Added \"{name}\" in {s} s: {n} readings, {nx} × {ny} nodes at {elev} m, sources {depth} m below the readings. They reproduce the readings' {cell} m block means to {rms} {units} RMS ({pct} % of their spread){v}. Inside a block the readings themselves vary by {within} {units} RMS, which a {cell} m grid cannot show.", vars)) + gridFit + spacedOff + where
        // TASKS.csv #2955 — where the time went; #3124 — after a run the engine stays loaded for about 3 idle minutes, and a run then says so
        + (d.timings ? " " + (d.warmEngine
          ? tr("The engine was still loaded from a run in the last few minutes: the fit took {b} s and the grid {c} s.", { b: d.timings.fit, c: d.timings.grid })
          : tr("Of the time, loading the engine took {a} s (it then stays loaded for about 3 minutes, so a run soon after skips it), the fit {b} s and the grid {c} s.", { a: d.timings.load, b: d.timings.fit, c: d.timings.grid })) : "") });
    } catch (err) { setMsg({ info: false, text: err.message }); }
  };
  return (
    <div style={{ marginTop: 6, padding: "7px 8px", border: "1px solid var(--color-border)", borderRadius: 5, background: "var(--color-bg)", fontSize: "var(--font-size-sm)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 6px", alignItems: "center" }}>
        <span>{tr("Cell (m)")}</span><input type="number" min="0" value={cell} placeholder={String(cellM)} aria-label={tr("Equivalent-source cell size")} onChange={(e) => setCell(e.target.value)} style={numInput} />
        <span>{tr("Grid at elevation (m)")}</span><input type="number" value={elev} placeholder={draped ? tr("the readings' surface") : Number.isFinite(elevM) ? String(elevM) : ""} aria-label={tr("Elevation to grid at")} onChange={(e) => setElev(e.target.value)} style={numInput} />
        {noZ && <><span>{tr("Readings taken at (m)")}</span><input type="number" value={flatZ} aria-label={tr("Elevation of the readings")} onChange={(e) => setFlatZ(e.target.value)} style={numInput} /></>}
        <span>{tr("Source depth (m)")}</span><input type="number" min="0" value={depth} placeholder={String(depthDefault)} aria-label={tr("Equivalent-source depth below the readings")} title={tr("How far below the readings the sources sit: shallower fits short anomalies, deeper smooths. Blank: 1.2 × the station spacing ({s} m), or the cell if that is larger; sources much shallower than the spacing between readings make a lumpy grid between them.", { s: sug?.spacingM != null ? Math.round(sug.spacingM) : "?" })} onChange={(e) => setDepth(e.target.value)} style={numInput} />
        <span>{tr("Blank beyond (m)")}</span><input type="number" min="0" value={blank} placeholder={String(sug?.blankM ?? 3 * cellM)} aria-label={tr("Equivalent-source blanking distance")} onChange={(e) => setBlank(e.target.value)} style={numInput} />
      </div>
      <div style={note}>{noZ ? tr("{n} of the readings have no elevation, so all are taken at one height and the grid is a continuation from it.", { n: (pts.length - withZ).toLocaleString() }) : tr("Blank elevation: the grid follows the readings' own surface (their heights interpolated between them), so it passes through a ground survey where it was measured. A typed elevation makes a level grid continued to that height: above the highest reading ({z} m) it is smoother and deeper sources stand out.", { z: Number.isFinite(zMax) ? Math.ceil(zMax) : "?" })}</div>
      {busy ? (
        <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}><span style={{ flex: 1 }}>{busy}</span><button type="button" onClick={() => abort.current?.abort()} style={{ ...pBtn, width: "auto", marginBottom: 0 }}>{tr("Cancel")}</button></div>
      ) : (
        <button type="button" onClick={run} style={{ ...pBtn, marginTop: 6, marginBottom: 0 }}>{tr("Grid with equivalent sources")}</button>
      )}
      {msg && <div role="status" style={{ ...note, color: msg.info ? "var(--color-text-secondary)" : "var(--color-danger-text)" }}>{msg.text}</div>}
    </div>
  );
}
