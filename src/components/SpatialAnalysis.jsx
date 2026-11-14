import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Info } from "./icons.js";
import { toExportCsv, crsCell } from "../lib/tabular.js"; // TASKS.csv #444; crsCell: #1053
import { voronoiRows } from "../lib/tableExports.js"; // TASKS.csv #1083
import { useStore } from "../lib/store.jsx"; // TASKS.csv #1053 — the project CRS for the CSV
import { saveFile } from "../lib/desktop.js";
import { surveyKey } from "../lib/geophysSurveys.js"; // TASKS.csv #1588 — one survey at a time, its units
import { ASK_FROM, mapTransform } from "../lib/voronoiDecluster.js"; // TASKS.csv #3310
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { isMetricProjectedEpsg } from "../lib/reproject.js"; // TASKS.csv #2247

// TASKS.csv #51 — Voronoi tessellation + polygonal declustering panel. Opened from GeophysicsModule
// over whatever geophys_pts point cloud is currently loaded (needs x/y/value, which is exactly that
// layer's shape already — see normGeophysRow there). Kept as its own modal component (same pattern as
// IsoconTool/CorrelationMatrix) rather than inlined in GeophysicsModule, which was already a long file
// before this.
// TASKS.csv #3310 (review #3195, Galore Creek) — on an IP cloud of 245,066 points the click froze the window 16.6 s (heap 1.5 GB) and the
// Survey change to the resistivity cloud 43 s (2.4 GB), with no word and no way to stop it. The cloud's shape, the tessellation, the
// statistics and the map are computed in lib/voronoi.worker.js (lib/voronoiDecluster.js: one pass over flat arrays, the map drawn on a
// canvas, not one SVG polygon and circle per point); a survey above ASK_FROM points, or one cloudShape calls 3D, shows its count and a
// Run button first, a 3D cloud with an elevation range to tessellate one level; a run shows its progress and can be cancelled.
const SVG_W = 560, SVG_H = 460, PAD = 16;

// TASKS.csv #1588 (review #1497, Lawyers) — surveys: [{ key, count, units, method }] of the loaded point surveys. Two mag surveys
// and a VLF survey used to become one tessellation with a 'declustered mean 55,226.635' and no unit: the panel takes ONE
// survey (a Survey select when there are several, as Grid to raster does), says its units, and colours on a 2-98 % stretch.
export default function SpatialAnalysis({ points, surveys = [], onClose }) {
  const { project } = useStore();
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const [hoverIdx, setHoverIdx] = useState(null);
  const [survey, setSurvey] = useState("");
  const key = surveys.some((s) => s.key === survey) ? survey : surveys[0]?.key || null;
  const meta = surveys.find((s) => s.key === key) || null;
  const units = meta?.units || "";
  const own = useMemo(() => (key != null && surveys.length ? points.filter((p) => surveyKey(p) === key) : points), [points, surveys, key]);

  const valid = useMemo(
    () => own.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.value)),
    [own]
  );

  // #3310 — the worker: one per open dialog (Cancel ends it; the next run starts another); messages routed by type
  const workerRef = useRef(null), handlers = useRef({}), seqRef = useRef(0);
  const worker = () => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL("../lib/voronoi.worker.js", import.meta.url), { type: "module" });
      workerRef.current.onmessage = (e) => handlers.current[e.data?.type]?.(e.data);
      workerRef.current.onerror = (e) => { e?.preventDefault?.(); handlers.current.failed?.({ error: tr("The background task could not start.") }); };
    }
    return workerRef.current;
  };
  useEffect(() => () => workerRef.current?.terminate(), []);

  // the cloud's shape (#1783), read in the worker: a 3D cloud is asked about before it is tessellated
  const [shapeOf, setShapeOf] = useState(null); // { of: valid, shape }
  const shape = shapeOf?.of === valid ? shapeOf.shape : null, shapeReady = shapeOf?.of === valid || valid.length < 20;
  useEffect(() => {
    if (valid.length < 20) return undefined;
    const id = ++seqRef.current;
    handlers.current.shape = (d) => { if (d.id === id) setShapeOf({ of: valid, shape: d.shape }); };
    const xs = Float64Array.from(valid, (p) => p.x), ys = Float64Array.from(valid, (p) => p.y), zs = Float64Array.from(valid, (p) => (Number.isFinite(p.z) ? p.z : NaN));
    worker().postMessage({ type: "prepare", id, xs, ys, zs }, [xs.buffer, ys.buffer, zs.buffer]);
    return undefined;
  }, [valid]);

  // a 3D cloud: an elevation range, to tessellate one level (the gridder's slice, #1783)
  const [zFrom, setZFrom] = useState(""), [zTo, setZTo] = useState("");
  const lo = shape?.is3D && zFrom !== "" && Number.isFinite(Number(zFrom)) ? Number(zFrom) : -Infinity;
  const hi = shape?.is3D && zTo !== "" && Number.isFinite(Number(zTo)) ? Number(zTo) : Infinity;
  const sliced = useMemo(() => (lo === -Infinity && hi === Infinity ? valid : valid.filter((p) => Number.isFinite(p.z) && p.z >= lo && p.z <= hi)), [valid, lo, hi]);
  const askFirst = sliced.length > ASK_FROM || !!shape?.is3D;

  const [result, setResult] = useState(null); // { of: sliced, stats, bounds, stretch, areas, bitmap }
  const [progress, setProgress] = useState(null); // { of, done, total, phase }
  const [error, setError] = useState(null);
  const shown = result?.of === sliced ? result : null, running = progress?.of === sliced;
  const run = () => {
    const list = sliced, id = ++seqRef.current;
    setError(null); setHeld(false); setHoverIdx(null); setProgress({ of: list, done: 0, total: list.length, phase: "triangulate" });
    handlers.current.progress = (d) => { if (d.id === id) setProgress({ of: list, done: d.done, total: d.total, phase: d.phase }); };
    handlers.current.done = (d) => { if (d.id !== id) return; setResult({ of: list, stats: d.stats, bounds: d.bounds, stretch: d.stretch, areas: d.areas, bitmap: d.bitmap }); setProgress(null); };
    handlers.current.failed = (d) => { if (d.id != null && d.id !== id) return; setError(d.error); setProgress(null); };
    const xs = Float64Array.from(list, (p) => p.x), ys = Float64Array.from(list, (p) => p.y), vs = Float64Array.from(list, (p) => p.value);
    const scale = Math.min(2, window.devicePixelRatio || 1);
    worker().postMessage({ type: "run", id, xs, ys, vs, map: { w: SVG_W, h: SVG_H, pad: PAD, scale } }, [xs.buffer, ys.buffer, vs.buffer]);
  };
  const [held, setHeld] = useState(false); // cancelled: nothing runs again until Run
  const cancel = () => { workerRef.current?.terminate(); workerRef.current = null; setProgress(null); setHeld(true); };
  // a small surface survey runs on open, as before
  useEffect(() => { if (shapeReady && !askFirst && sliced.length >= 3 && !shown && !running && !error && !held) run(); }, [shapeReady, askFirst, sliced]);

  const stats = shown?.stats || null;
  const fmt = (v) => (v == null ? "" : `${v.toLocaleString(undefined, { maximumFractionDigits: 3 })}${units ? ` ${units}` : ""}`); // #1588 — the survey's units on every number

  // the map: the worker's picture; the hover asks the worker which cell is under the pointer
  const canvasRef = useRef(null);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !shown?.bitmap) return;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(shown.bitmap, 0, 0, c.width, c.height);
  }, [shown]);
  const tf = shown ? mapTransform(shown.bounds, SVG_W, SVG_H, PAD) : null;
  const pending = useRef(false);
  const onMove = (e) => {
    if (!tf || !workerRef.current || pending.current) return;
    const r = e.currentTarget.getBoundingClientRect(), [x, y] = tf.toWorld(e.clientX - r.left, e.clientY - r.top), seq = ++seqRef.current;
    pending.current = true;
    handlers.current.found = (d) => { pending.current = false; if (d.seq === seq) setHoverIdx(d.index >= 0 && shown.areas[d.index] > 0 ? d.index : null); };
    workerRef.current.postMessage({ type: "find", seq, x, y });
  };
  const hp = shown && hoverIdx != null ? shown.of[hoverIdx] : null;

  const exportCSV = () => {
    if (!shown) return;
    const cells = [];
    shown.of.forEach((p, i) => { const a = shown.areas[i]; if (a > 0 && Number.isFinite(p.value)) cells.push({ point: p, area: a, weight: a / shown.stats.totalArea }); }); // #3310 — the cells with a value and an area, as before
    const rows = voronoiRows(cells, { crs: crsCell(project) /* #1053 — the CRS of x / y, as a column (#1064) */ }); // #1083 — rows in lib, tested
    // TASKS.csv #444 — through the normal Save dialog (was a blob download that bypassed it).
    saveFile({ suggestedName: "voronoi_decluster.csv", filters: [{ name: "CSV", extensions: ["csv"] }], content: toExportCsv(rows) });
  };

  const phaseText = (p) => (p.phase === "triangulate" ? tr("Triangulating {n} points…", { n: p.total.toLocaleString() }) : p.phase === "draw" ? tr("Drawing the map…") : tr("Measuring the cells: {done} of {total}", { done: p.done.toLocaleString(), total: p.total.toLocaleString() }));
  const inp = { width: 90, padding: "3px 6px", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, color: "var(--color-text)", fontSize: "var(--font-size-sm)" };

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div style={{ color: "var(--color-text)", fontSize: "var(--font-size-lg)", fontWeight: 600 }}>{tr("Spatial analysis — Voronoi / declustering")}</div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        {surveys.length > 1 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "10px 14px 0", fontSize: "var(--font-size-sm)" }}>
            <span style={{ color: "var(--color-text-faint)", flexShrink: 0 }}>{tr("Survey")}</span>
            <select value={key || ""} onChange={(e) => { setSurvey(e.target.value); setHoverIdx(null); setZFrom(""); setZTo(""); }} aria-label={tr("Survey to analyse")} style={{ flex: "0 1 420px", minWidth: 0 }}>
              {surveys.map((s) => <option key={s.key} value={s.key}>{s.key} ({s.count.toLocaleString()}{s.units ? `, ${s.units}` : ""})</option>)}
            </select>
            <span style={{ color: "var(--color-text-faint)" }}>{tr("Surveys are never mixed: each has its own units and spacing.")}</span>
          </div>
        )}
        {valid.length < 3 ? (
          <div style={{ padding: 20, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("Need at least 3 points with valid x, y, and value to build a tessellation — currently {valid}.", { valid: valid.length })}</div>
        ) : !shown ? (
          <div style={{ padding: 20, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", lineHeight: 1.5, display: "flex", flexDirection: "column", gap: 10, maxWidth: 640 }}>
            {!shapeReady && <div>{tr("Reading the survey ({n} points)…", { n: valid.length.toLocaleString() })}</div>}
            {shapeReady && shape?.is3D && <div style={{ color: "var(--color-warn-text)" }}>{tr("A 3D point cloud ({lo} to {hi} m elevation): a plan tessellation treats every point as if it lay on one surface. Give an elevation range to tessellate one level, or run it over the whole cloud.", { lo: Math.round(shape.zMin).toLocaleString(), hi: Math.round(shape.zMax).toLocaleString() })}</div>}
            {shapeReady && shape?.is3D && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: "var(--font-size-sm)" }}>
                <label style={{ display: "flex", gap: 5, alignItems: "center" }}>{tr("Elevation from (m)")}<input type="number" value={zFrom} onChange={(e) => setZFrom(e.target.value)} disabled={running} style={inp} /></label>
                <label style={{ display: "flex", gap: 5, alignItems: "center" }}>{tr("to (m)")}<input type="number" value={zTo} onChange={(e) => setZTo(e.target.value)} disabled={running} style={inp} /></label>
                <span>{tr("{n} of {all} points in the range", { n: sliced.length.toLocaleString(), all: valid.length.toLocaleString() })}</span>
              </div>
            )}
            {shapeReady && askFirst && !running && <div>{tr("{n} points to tessellate: it runs in the background and can take a while on a large survey.", { n: sliced.length.toLocaleString() })}</div>}
            {shapeReady && !running && (askFirst || error || held) && (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={run} disabled={sliced.length < 3} style={{ ...btn, width: "auto", padding: "6px 16px" }}>{tr("Run")}</button>
              </div>
            )}
            {running && (
              <div role="status" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <progress value={progress.phase === "cells" ? progress.done : undefined} max={progress.total || 1} style={{ width: 220 }} />
                <span>{phaseText(progress)}</span>
                <button type="button" onClick={cancel} style={{ ...btn, width: "auto", padding: "4px 12px" }}>{tr("Cancel")}</button>
              </div>
            )}
            {error && <div style={{ color: "var(--color-danger-text, var(--color-warn-text))" }}>{tr("The tessellation failed: {error}", { error })}</div>}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 14, padding: 14, overflow: "auto" }}>
            <div>
              <div style={{ position: "relative", width: SVG_W, height: SVG_H }}>
                <canvas ref={canvasRef} width={Math.round(SVG_W * Math.min(2, window.devicePixelRatio || 1))} height={Math.round(SVG_H * Math.min(2, window.devicePixelRatio || 1))} onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}
                  aria-label={tr("Voronoi cells coloured by value")} style={{ width: SVG_W, height: SVG_H, background: "var(--color-bg)", borderRadius: 6, border: "1px solid var(--color-border)", display: "block" }} />
                {hp && (() => { const [x, y] = tf.toPx(hp.x, hp.y); return <svg width={SVG_W} height={SVG_H} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}><circle cx={x} cy={y} r={3.5} fill="#ffffff" stroke="#1a2028" strokeWidth={1} /></svg>; })()}
              </div>
              {hp && (
                <div style={{ marginTop: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-caption)" }}>
                  {tr("{v}value {value}, cell area {area} units², decluster weight {v2}%", { v: hp.label ? `${hp.label} — ` : "", value: fmt(hp.value) /* #1588 */ || hp.value.toLocaleString(), area: shown.areas[hoverIdx].toFixed(1), v2: (() => { const w = (shown.areas[hoverIdx] / stats.totalArea) * 100; return w >= 0.01 ? w.toFixed(2) : w.toPrecision(2); })() /* #3310 — this cell's own weight; 0.0012 %, not 0.00 %, among 270,000 */ })}</div>
              )}
            </div>

            <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6, display: "flex", gap: 6 }}>
                <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{tr("Each point's Voronoi cell area is used as a declustering weight (Isaaks & Srivastava polygonal method) — clustered points get small cells/low weight, isolated points get large cells/high weight, correcting a naive mean's bias toward over-sampled areas.")}</span>
              </div>

              {shape?.is3D && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.4 }}>{tr("A 3D point cloud ({lo} to {hi} m elevation): these cells and means are over its plan projection, as if every point lay on one surface. Points at the same plan position count once.", { lo: Math.round(shape.zMin).toLocaleString(), hi: Math.round(shape.zMax).toLocaleString() })}</div>}{/* #1783 */}
              {shown.of !== valid && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Elevation {lo} to {hi} m only.", { lo: lo === -Infinity ? "…" : lo.toLocaleString(), hi: hi === Infinity ? "…" : hi.toLocaleString() })}</div>}{/* #3310 */}
              <StatRow label={tr("Points")} value={stats.n} />
              {stats.n < shown.of.length && <StatRow label={tr("Left out (same plan position)")} value={shown.of.length - stats.n} />}{/* #1783 — said, not silent */}
              <StatRow label={tr("Naive mean")} value={fmt(stats.naiveMean)} />
              <StatRow label={tr("Declustered mean")} value={fmt(stats.declusteredMean)} highlight />
              {stats.declusteredStd !== null && <StatRow label={tr("Declustered std dev")} value={fmt(stats.declusteredStd)} />}
              <StatRow label={tr("Total tessellated area")} value={stats.totalArea.toLocaleString(undefined, { maximumFractionDigits: 0 }) + (isMetricProjectedEpsg(project?.epsg) ? " m²" : "") /* #2247 — the unit */} />

              <button onClick={exportCSV} style={btn}>
                <Download size={14} />{" "}{tr("Export cells (CSV)")}</button>
              {shape?.is3D && <button type="button" onClick={() => setResult(null)} style={btn}>{tr("Change the elevation range")}</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, value, highlight }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 8px", background: highlight ? "var(--color-selected-bg)" : "var(--color-bg-subtle)", border: `1px solid ${highlight ? "var(--color-selected-border)" : "var(--color-border)"}`, borderRadius: 5, fontSize: "var(--font-size-base)" }}>
      <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
      <span style={{ color: highlight ? "var(--color-accent)" : "var(--color-text)", fontWeight: highlight ? 600 : 400 }}>{value ?? "—"}</span>
    </div>
  );
}

const panel = { width: "min(880px, 94vw)", maxHeight: "88vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--color-border)" };
const btn = { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", padding: "8px 10px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, color: "var(--color-text)", fontSize: "var(--font-size-base)", cursor: "pointer" };
