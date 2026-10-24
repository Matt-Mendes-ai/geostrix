// TASKS.csv #851 — the evidence overlay pane of Targeting mode: evidence layers (value rasters, distance to map-layer
// features, surface geochemistry) on one grid, fuzzy memberships and an operator, optional known occurrences for
// weights of evidence and a prediction-area plot; the score goes on the map as a raster drape (with its values, so
// the Raster module exports it as GeoTIFF, #854). Maths and the caveats in lib/evidence.js.
import React, { useEffect, useMemo, useState } from "react";
import { Download, Layers } from "./icons.js";
import { TaskPaneHeader } from "./Ribbon.jsx";
import { useStore } from "../lib/store.jsx";
import { evidenceGrid, rasterEvidence, distanceEvidence, pointEvidence, sampleValues, membership, fuzzyCombine, FUZZY_OPERATORS, trainingCells, bestCutoff, posterior, predictionArea, scoreImage, quantile } from "../lib/evidence.js";
import { PATHFINDER_PRESETS } from "../lib/anomalyMap.js";
import { valueIn } from "../lib/geochem.js";
import { f32ToB64 } from "../lib/inversion.js";
import { gridToGeoTIFF, saveGeoTIFF } from "../lib/gridExport.js";
import { fontSizes } from "../lib/theme.js";
import { t as tr } from "../lib/i18n.js";

const fmt = (v, d = 2) => (v == null || !Number.isFinite(v) ? "—" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 0.1 || v === 0 ? v.toFixed(d) : v.toPrecision(2)); // a small cutoff keeps its digits, not "-0.00"
const numText = (v) => (Number.isFinite(v) ? String(+v.toPrecision(3)) : ""); // what a number input can hold
let nextId = 1;

export default function EvidenceOverlayPane({ onClose }) {
  const { rasters = [], mapLayers = [], surfaceSamples = [], surfaceElements = [], terrain, collars = [], assays = [], assayElements = [], project, addRaster } = useStore();
  const units = useMemo(() => Object.fromEntries(surfaceElements.map((e) => [e.symbol, e.unit])), [surfaceElements]);
  const assayUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const [layers, setLayers] = useState([]); // [{ id, kind, label, ref, shape, low, high, values }]
  const [operator, setOperator] = useState("gamma");
  const [gamma, setGamma] = useState(0.9);
  const [training, setTraining] = useState({ source: "none", layerId: "", symbol: assayElements[0]?.symbol || surfaceElements[0]?.symbol || "", min: "" });
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState(null);
  const valueRasters = useMemo(() => rasters.filter((r) => r.grid), [rasters]);
  const pointLayers = useMemo(() => mapLayers.filter((l) => l.geomType === "point" && l.features?.length), [mapLayers]);

  // the grid: the terrain, else the union of the sources' extents
  const grid = useMemo(() => {
    if (terrain) return evidenceGrid({ terrain });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (a, b, c, d) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
    valueRasters.forEach((r) => { const g = r.grid; grow(g.x0 - g.dx / 2, g.yTop - g.ny * g.dy + g.dy / 2, g.x0 + g.nx * g.dx - g.dx / 2, g.yTop + g.dy / 2); });
    mapLayers.forEach((l) => { if (l.bbox) grow(...l.bbox); });
    surfaceSamples.forEach((s) => { if (Number.isFinite(s.x) && Number.isFinite(s.y)) grow(s.x - 200, s.y - 200, s.x + 200, s.y + 200); });
    return x1 > x0 && y1 > y0 ? evidenceGrid({ extent: [x0, y0, x1, y1] }) : null;
  }, [terrain, valueRasters, mapLayers, surfaceSamples]);

  // evidence sources the project offers
  const sources = useMemo(() => {
    const out = [];
    valueRasters.forEach((r) => out.push({ key: `raster:${r.id}`, label: tr("Raster: {name}", { name: r.name }), kind: "raster", ref: r.id }));
    mapLayers.forEach((l) => out.push({ key: `dist:${l.id}`, label: tr("Distance to: {name}", { name: l.name }), kind: "distance", ref: l.id }));
    surfaceElements.forEach((e) => out.push({ key: `el:${e.symbol}`, label: tr("Samples: {sym} (robust z)", { sym: e.symbol }), kind: "element", ref: e.symbol }));
    if (surfaceElements.length) PATHFINDER_PRESETS.forEach((p) => out.push({ key: `ix:${p.id}`, label: tr("Samples: {name} index", { name: tr(p.label) }), kind: "index", ref: p.id }));
    return out;
  }, [valueRasters, mapLayers, surfaceElements]);

  const computeValues = (src, opts = {}) => {
    if (!grid) return null;
    if (src.kind === "raster") { const r = valueRasters.find((x) => x.id === src.ref); return r ? rasterEvidence(grid, r.grid) : null; }
    if (src.kind === "distance") {
      const l = mapLayers.find((x) => String(x.id) === String(src.ref)); if (!l) return null;
      const feats = opts.field ? l.features.filter((f) => String(f.attributes?.[opts.field] ?? "") === String(opts.value)) : l.features;
      return distanceEvidence(grid, feats.flatMap((f) => f.parts));
    }
    const pts = sampleValues(surfaceSamples, src.kind === "element" ? { kind: "element", symbol: src.ref } : { kind: "index", preset: src.ref }, units);
    return pointEvidence(grid, pts, { maxDistance: opts.reach || defaultReach });
  };
  // samples reach about one and a half spacings: a regional stream program gets kilometres, a soil grid tens of metres
  const defaultReach = useMemo(() => {
    const pts = surfaceSamples.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y));
    if (pts.length < 2) return 500;
    const xs = pts.map((s) => s.x), ys = pts.map((s) => s.y), area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    return Math.min(5000, Math.max(50, Math.round(1.5 * Math.sqrt(area / pts.length) / 10) * 10));
  }, [surfaceSamples]);
  const addLayer = (key) => {
    const src = sources.find((s) => s.key === key); if (!src) return;
    const values = computeValues(src, {});
    if (!values) { setMsg(tr("No grid yet: load terrain, a raster, a map layer or samples first.")); return; }
    const finite = values.filter(Number.isFinite);
    if (!finite.length) { setMsg(tr("\"{name}\" has no values over the grid.", { name: src.label })); return; }
    const dec = src.kind === "distance", low = dec ? 0 : quantile(finite, 0.1), high = dec ? quantile(finite, 0.5) : quantile(finite, 0.9);
    setLayers((L) => [...L, { id: nextId++, ...src, shape: dec ? "decreasing" : "increasing", low, high, lowText: numText(low), highText: numText(high), field: "", value: "", reach: defaultReach, values }]);
    setResult(null); setMsg(null);
  };
  // the grid changed under the layers (terrain loaded, a source removed): re-sample every evidence on the new grid
  const n = grid ? grid.nx * grid.ny : 0;
  useEffect(() => {
    setLayers((L) => (L.some((l) => l.values.length !== n) ? L.map((l) => { const v = computeValues(l, l); return v ? { ...l, values: v } : l; }) : L));
    setResult((r) => (r && r.n !== n ? null : r));
  }, [n]); // the cell count is the signal; computeValues is rebuilt each render
  const updateLayer = (id, patch, recompute = false) => setLayers((L) => L.map((l) => {
    if (l.id !== id) return l;
    const next = { ...l, ...patch };
    if (recompute) { const v = computeValues(next, { field: next.field, value: next.value, reach: next.reach }); if (v) next.values = v; }
    return next;
  }));

  // training points
  const trainingPoints = useMemo(() => {
    const t = training, min = t.min === "" ? NaN : Number(t.min);
    if (t.source === "layer") { const l = pointLayers.find((x) => String(x.id) === String(t.layerId)); return l ? l.features.map((f) => ({ x: f.parts[0][0][0], y: f.parts[0][0][1] })) : []; }
    if (t.source === "collars" && t.symbol && Number.isFinite(min)) {
      const maxBy = new Map();
      assays.forEach((a) => { const v = valueIn(a, t.symbol, assayUnits[t.symbol] || "ppm", assayUnits); if (v != null && (!maxBy.has(a.hole_id) || v > maxBy.get(a.hole_id))) maxBy.set(a.hole_id, v); });
      return collars.filter((c) => (maxBy.get(c.hole_id) ?? -Infinity) >= min).map((c) => ({ x: c.x, y: c.y }));
    }
    if (t.source === "samples" && t.symbol && Number.isFinite(min)) return surfaceSamples.filter((s) => { const v = valueIn(s, t.symbol, units[t.symbol] || "ppm", units); return v != null && v >= min; }).map((s) => ({ x: s.x, y: s.y }));
    return [];
  }, [training, pointLayers, assays, collars, surfaceSamples, assayUnits, units]);
  const circular = training.source === "samples" && layers.some((l) => (l.kind === "element" && l.ref === training.symbol) || l.kind === "index");

  const compute = () => {
    if (!grid || !layers.length) return;
    if (layers.some((l) => !Number.isFinite(l.low) || !Number.isFinite(l.high) || l.values.length !== n)) { setMsg(tr("Set both membership points (0 = and 1 =) on every evidence.")); return; }
    const members = layers.map((l) => membership(l.values, l));
    const fuzzy = fuzzyCombine(members, operator, gamma);
    const valid = new Uint8Array(n);
    for (let k = 0; k < n; k++) valid[k] = Number.isFinite(fuzzy[k]) ? 1 : 0;
    const nValid = valid.reduce((a, v) => a + v, 0);
    const out = { fuzzy, nValid, n, wofe: null, pa: null, paPost: null };
    const D = trainingCells(grid, trainingPoints, valid);
    if (D.size >= 3) {
      const rowsW = [], chosen = [];
      let N = 0, ND = 0;
      layers.forEach((l) => { const bc = bestCutoff(l.values, D, valid, { direction: l.shape }); N = bc.N; ND = bc.ND; if (bc.best) { rowsW.push({ label: l.label, ...bc.best }); chosen.push({ values: l.values, cutoff: bc.best.cutoff, direction: l.shape, wPlus: bc.best.wPlus, wMinus: bc.best.wMinus }); } else rowsW.push({ label: l.label, none: true }); });
      if (chosen.length) { const post = posterior(chosen, valid, N, ND); out.wofe = { rows: rowsW, N, ND, post, nD: D.size }; out.paPost = predictionArea(post.prob, D, valid); }
      out.pa = predictionArea(fuzzy, D, valid);
    } else if (trainingPoints.length) out.fewPoints = D.size;
    setResult(out); setMsg(null);
  };
  const toMap = (which) => {
    const score = which === "posterior" ? result.wofe.post.prob : result.fuzzy;
    const img = scoreImage(score, grid.nx, grid.ny), c = document.createElement("canvas");
    c.width = img.width; c.height = img.height; c.getContext("2d").putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    const name = which === "posterior" ? tr("Weights-of-evidence posterior ({n} occurrences)", { n: result.wofe.nD }) : tr("Fuzzy overlay ({op}) of {n} evidence layers", { op: operator === "gamma" ? `gamma ${gamma}` : operator, n: layers.length });
    const valid = score.reduce((a, v) => a + (Number.isFinite(v) ? 1 : 0), 0);
    addRaster({ name, bbox: [grid.x0 - grid.dx / 2, grid.yTop + grid.dy / 2 - grid.ny * grid.dy, grid.x0 - grid.dx / 2 + grid.nx * grid.dx, grid.yTop + grid.dy / 2], dataUrl: c.toDataURL("image/png"), drapeMode: terrain ? "terrain" : "flat", opacity: 0.75,
      grid: { nx: grid.nx, ny: grid.ny, x0: grid.x0, yTop: grid.yTop, dx: grid.dx, dy: grid.dy, values: f32ToB64(score), valid, averagedBy: 1, sourceSize: [grid.nx, grid.ny] } });
    setMsg(tr("Added \"{name}\" to the map (its values export as GeoTIFF from the Raster module).", { name }));
  };
  const toTif = (which) => { const score = which === "posterior" ? result.wofe.post.prob : result.fuzzy; saveGeoTIFF(`${which === "posterior" ? "wofe_posterior" : "fuzzy_overlay"}.tif`, gridToGeoTIFF({ ...grid, bands: [{ values: score }], epsg: project?.epsg })); };

  return (
    <>
      <TaskPaneHeader title={tr("Evidence overlay")} icon={Layers} tone="model" onClose={onClose} />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: "var(--font-size-sm)" }}>
        <div style={note}>{grid ? tr("Grid: {nx} × {ny} cells of {dx} × {dy} m{src}.", { nx: grid.nx, ny: grid.ny, dx: Math.round(grid.dx), dy: Math.round(grid.dy), src: grid.from === "terrain" ? tr(" (the terrain)") : tr(" (the data's extent)") }) : tr("No grid yet: load terrain, a raster, a map layer or samples first.")}</div>
        <select value="" onChange={(e) => addLayer(e.target.value)} style={sel} aria-label={tr("Add evidence")} disabled={!grid}>
          <option value="">{tr("+ add evidence…")}</option>
          {sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        {layers.map((l) => (
          <div key={l.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-text)" }} title={l.label}>{l.label}</span><button type="button" style={linkBtn} onClick={() => { setLayers((L) => L.filter((x) => x.id !== l.id)); setResult(null); }} aria-label={tr("Remove this evidence")}>×</button></div>
            {l.kind === "distance" && (() => { const ml = mapLayers.find((x) => String(x.id) === String(l.ref)); const vals = l.field ? [...new Set((ml?.features || []).map((f) => String(f.attributes?.[l.field] ?? "")))].slice(0, 60) : []; return (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <select value={l.field} onChange={(e) => updateLayer(l.id, { field: e.target.value, value: "" }, false)} style={sel} aria-label={tr("Only features where")}><option value="">{tr("every feature")}</option>{(ml?.fields || []).map((f) => <option key={f} value={f}>{f}</option>)}</select>
                {l.field && <select value={l.value} onChange={(e) => updateLayer(l.id, { value: e.target.value }, true)} style={sel} aria-label={tr("equals")}><option value="">{tr("— value —")}</option>{vals.map((v) => <option key={v} value={v}>{v || "(blank)"}</option>)}</select>}
              </div>); })()}
            {(l.kind === "element" || l.kind === "index") && <label style={row}>{tr("Reach (m)")}<input type="number" min="10" step="50" value={l.reach} onChange={(e) => updateLayer(l.id, { reach: Math.max(10, Number(e.target.value) || defaultReach) }, true)} style={{ ...sel, width: 70 }} /></label>}
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <select value={l.shape} onChange={(e) => updateLayer(l.id, { shape: e.target.value })} style={sel} aria-label={tr("Membership")}><option value="increasing">{tr("favourable when high")}</option><option value="decreasing">{tr("favourable when low")}</option></select>
              <label style={row}>0 ={" "}<input type="number" step="any" value={l.lowText} onChange={(e) => updateLayer(l.id, { lowText: e.target.value, low: e.target.value === "" ? NaN : Number(e.target.value) })} style={{ ...sel, width: 76 }} aria-label={tr("Membership 0 at")} /></label>
              <label style={row}>1 ={" "}<input type="number" step="any" value={l.highText} onChange={(e) => updateLayer(l.id, { highText: e.target.value, high: e.target.value === "" ? NaN : Number(e.target.value) })} style={{ ...sel, width: 76 }} aria-label={tr("Membership 1 at")} /></label>
            </div>
          </div>
        ))}
        {layers.length > 0 && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <label style={row}>{tr("Combine")}<select value={operator} onChange={(e) => setOperator(e.target.value)} style={sel}>{FUZZY_OPERATORS.map((o) => <option key={o} value={o}>{tr({ and: "fuzzy AND (min)", or: "fuzzy OR (max)", product: "algebraic product", sum: "algebraic sum", gamma: "gamma" }[o])}</option>)}</select></label>
            {operator === "gamma" && <label style={row}>γ<input type="number" min="0" max="1" step="0.05" value={gamma} onChange={(e) => setGamma(Math.max(0, Math.min(1, Number(e.target.value))))} style={{ ...sel, width: 60 }} /></label>}
          </div>
        )}
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 6, padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ color: "var(--color-text-secondary)" }}>{tr("Known occurrences (optional, for weights of evidence)")}</div>
          <select value={training.source} onChange={(e) => setTraining((t) => ({ ...t, source: e.target.value }))} style={sel} aria-label={tr("Known occurrences")}>
            <option value="none">{tr("none")}</option>
            {pointLayers.length > 0 && <option value="layer">{tr("a point map layer")}</option>}
            {collars.length > 0 && assayElements.length > 0 && <option value="collars">{tr("drillholes with a grade")}</option>}
            {surfaceSamples.length > 0 && <option value="samples">{tr("surface samples above a value")}</option>}
          </select>
          {training.source === "layer" && <select value={training.layerId} onChange={(e) => setTraining((t) => ({ ...t, layerId: e.target.value }))} style={sel}><option value="">{tr("— choose —")}</option>{pointLayers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>}
          {(training.source === "collars" || training.source === "samples") && (
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
              <select value={training.symbol} onChange={(e) => setTraining((t) => ({ ...t, symbol: e.target.value }))} style={sel}>{(training.source === "collars" ? assayElements : surfaceElements).map((e) => <option key={e.symbol} value={e.symbol}>{e.symbol} ({e.unit})</option>)}</select>
              ≥ <input type="number" step="any" value={training.min} onChange={(e) => setTraining((t) => ({ ...t, min: e.target.value }))} style={{ ...sel, width: 80 }} aria-label={tr("At least")} />
            </div>
          )}
          {training.source !== "none" && <div style={note}>{tr("{n} occurrence points.", { n: trainingPoints.length })}{circular ? " " + tr("Circular: the same samples are evidence and occurrences, so the weights will flatter the evidence.") : ""}</div>}
        </div>
        <button type="button" style={pBtn} onClick={compute} disabled={!grid || !layers.length}>{tr("Compute")}</button>
        {msg && <div style={note}>{msg}</div>}
        {result && (
          <>
            <div style={note}>{tr("Fuzzy score on {v} of {n} cells (the rest lack an evidence).", { v: result.nValid.toLocaleString(), n: result.n.toLocaleString() })}{result.fewPoints != null ? " " + tr("Only {k} occurrence cells: weights of evidence need at least 3.", { k: result.fewPoints }) : ""}</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              <button type="button" style={pBtn} onClick={() => toMap("fuzzy")}>{tr("Fuzzy score → map")}</button>
              <button type="button" style={{ ...pBtn, display: "flex", alignItems: "center", gap: 4 }} onClick={() => toTif("fuzzy")}><Download size={12} />GeoTIFF</button>
            </div>
            {result.wofe && (
              <>
                <div style={{ color: "var(--color-text-secondary)", marginTop: 4 }}>{tr("Weights of evidence: {d} occurrence cells in {n} cells", { d: result.wofe.ND, n: result.wofe.N.toLocaleString() })}</div>
                {result.wofe.rows.map((r, i) => ( // wrapped lines, not a table: the sidebar is narrow
                  <div key={i} style={{ fontSize: "var(--font-size-xs)", lineHeight: 1.4 }}>
                    <div style={{ color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>{r.label}</div>
                    <div style={{ color: "var(--color-text-secondary)", fontWeight: !r.none && Math.abs(r.studC) >= 2 ? 600 : 400 }}>{r.none ? tr("no usable cutoff") : tr("cutoff {c} · W+ {wp} ± {sp} · W− {wm} ± {sm} · C/s {s}", { c: fmt(r.cutoff), wp: fmt(r.wPlus), sp: fmt(r.sPlus), wm: fmt(r.wMinus), sm: fmt(r.sMinus), s: fmt(r.studC, 1) })}</div>
                  </div>
                ))}
                <div style={{ ...note, color: result.wofe.post.ratio < 0.85 ? "var(--color-warn-text)" : undefined }}>{tr("Conditional independence check: the posterior predicts {e} occurrences for {d} known (ratio {r}).", { e: result.wofe.post.expected.toFixed(1), d: result.wofe.ND, r: result.wofe.post.ratio.toFixed(2) })}{result.wofe.post.ratio < 0.85 ? " " + tr("Under 0.85: the layers double-count each other; the posterior is too high.") : ""}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button type="button" style={pBtn} onClick={() => toMap("posterior")}>{tr("Posterior → map")}</button>
                  <button type="button" style={{ ...pBtn, display: "flex", alignItems: "center", gap: 4 }} onClick={() => toTif("posterior")}><Download size={12} />GeoTIFF</button>
                </div>
              </>
            )}
            {(result.pa || result.paPost) && <PAPlot fuzzy={result.pa} post={result.paPost} />}
            <div style={note}>{tr("A fuzzy overlay only says where the chosen evidence agrees under your memberships. Weights are statistics of a few points over many cells: with few points they are unstable (± shown), the layers are assumed independent given the occurrences, and when the occurrences are the drilled targets the result is circular. Treat the score as a ranking of where to look, not a probability of a deposit.")}</div>
          </>
        )}
      </div>
    </>
  );
}

// prediction rate and occupied area against the score threshold rank; the P-A point where they cross
function PAPlot({ fuzzy, post }) {
  const w = 280, h = 150, pl = 28, pr = 8, pt = 8, pb = 20;
  const X = (i, n) => pl + (i / (n - 1)) * (w - pl - pr), Y = (v) => h - pb - v * (h - pb - pt);
  const line = (c, key, colour, dash) => c && <polyline points={c.curve.map((p, i) => `${X(i, c.curve.length)},${Y(p[key])}`).join(" ")} style={{ fill: "none", stroke: colour, strokeWidth: 1.5, strokeDasharray: dash }} />;
  const pt1 = fuzzy?.point, pt2 = post?.point;
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={tr("Prediction-area plot")} style={{ display: "block" }}>
        <line x1={pl} x2={w - pr} y1={h - pb} y2={h - pb} style={{ stroke: "var(--color-border)" }} /><line x1={pl} x2={pl} y1={pt} y2={h - pb} style={{ stroke: "var(--color-border)" }} />
        {[0, 0.5, 1].map((v) => <text key={v} x={pl - 3} y={Y(v) + 3} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{v * 100}%</text>)}
        {line(fuzzy, "rate", "#D55E00")}{line(fuzzy, "area", "#D55E00", "3 3")}{line(post, "rate", "#0072B2")}{line(post, "area", "#0072B2", "3 3")}
        <text x={w - pr} y={h - 5} textAnchor="end" fontSize={fontSizes.xs} style={{ fill: "var(--color-text-muted)" }}>{tr("score threshold, low → high")}</text>
      </svg>
      <div style={note}>
        {tr("Solid: share of occurrences predicted; dashed: share of the area. Where they cross:")}{" "}
        {pt1 && <span style={{ color: "#D55E00" }}>{tr("fuzzy {r}% in {a}% of the area (Nd {nd})", { r: (100 * pt1.rate).toFixed(0), a: (100 * pt1.area).toFixed(0), nd: pt1.nd.toFixed(1) })}</span>}{pt1 && pt2 ? " · " : ""}
        {pt2 && <span style={{ color: "#0072B2" }}>{tr("posterior {r}% in {a}% of the area (Nd {nd})", { r: (100 * pt2.rate).toFixed(0), a: (100 * pt2.area).toFixed(0), nd: pt2.nd.toFixed(1) })}</span>}
        {" "}{tr("(Yousefi & Carranza 2015; Nd = 1 is no better than chance)")}
      </div>
    </div>
  );
}

const sel = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)", fontFamily: "inherit", maxWidth: "100%" };
const row = { display: "flex", alignItems: "center", gap: 4, color: "var(--color-text-secondary)" };
const note = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 };
const linkBtn = { background: "none", border: "none", padding: "0 2px", color: "var(--color-text-secondary)", cursor: "pointer", fontSize: "var(--font-size-base)", fontFamily: "inherit" };
const pBtn = { padding: "5px 9px", borderRadius: 5, fontSize: "var(--font-size-sm)", cursor: "pointer", fontFamily: "inherit", border: "1px solid var(--color-border)", background: "var(--color-bg-subtle)", color: "var(--color-text)" };
