import React, { useMemo, useRef, useState } from "react";
import { buildMeshQuery, isPointInsideMesh, isMeshClosed } from "../lib/meshQuery.js"; // TASKS.csv #517
import { X, Play } from "./icons.js";
import { compositeDownhole, rawSampleIntervals, PRECIOUS_METALS, capAudit } from "../lib/geochem.js"; // rawSampleIntervals: #571
import CapAuditHint from "./CapAuditHint.jsx"; // TASKS.csv #533
import { excludeQAQC } from "../lib/qaqc.js"; // TASKS.csv #266
import { samplePointsFromIntervals, MAX_BLOCKS, ESTIMATION_METHODS, SUPPORT_COLORS, summarizeSupport } from "../lib/estimation.js";
import { BLOCK_MODEL_BUDGETS, MAX_BLOCK_MODEL_BUDGET, blockModelBudgetNote, cellToFit } from "../lib/estimationMeta.js"; // TASKS.csv #626; block-model budgets: #661
import { runEstimation } from "../lib/estimationClient.js"; // TASKS.csv #520 — off the UI thread
import { desurveyHole } from "../lib/desurvey.js";
import { gradeStops } from "../lib/inversion.js"; // TASKS.csv #702
import { LAYER_META } from "../lib/layers.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #135 — project desurvey method
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { trendBasis, trendSearchScales, describeTrend } from "../lib/trend.js"; // TASKS.csv #650

// TASKS.csv #117 — grade estimation into block models (not just display). Micromine-specialist AND
// Leapfrog-specialist audits both independently flagged this as the top 3D-Modelling gap: GeoStrix
// could import/display someone else's block model but had no in-app engine to populate one FROM the
// project's own composited assays — the actual "resource estimation" step both Micromine and Leapfrog
// Edge are built around. Depends on downhole compositing (#118, implemented alongside this) as its
// input — see lib/estimation.js's top comment for why kriging isn't offered here (needs a fitted
// variogram as a genuine prerequisite, not just a harder formula dropped into the same loop).
export default function GradeEstimationModal({ assays, assayElements, layers, collars, survey, onAddModel, onClose, volumeShells = [], trend = null }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const { desurveyMethod } = useStore(); // TASKS.csv #135 — estimation samples must sit on the same trace the 3D view draws
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);
  const [symbol, setSymbol] = useState(symbols[0] || "Au");
  const unit = elementUnits[symbol] || "ppm";

  const [useComposites, setUseComposites] = useState(true);
  const [compositeLength, setCompositeLength] = useState(2);
  // TASKS.csv #262 — minCoverage was hardcoded at 0.5 here (and in the grade-shell tool), so a
  // half-missing-core composite silently counted as a full sample in the estimate with no way to
  // tighten it. Same control CompositingModal has always exposed, same 0.5 default (unchanged
  // behaviour until the user moves it).
  const [minCoverage, setMinCoverage] = useState(0.5);
  const [domainKey, setDomainKey] = useState("");
  const domainOptions = ["litho", "alt", "vein", "breccia", "geotech"].filter((k) => (layers[k] || []).length > 0);

  // TASKS.csv #265 — a collar with no recorded length used to silently contribute 300 m of grid depth
  // (`c.z - (c.length || 300)`), which combined with minSamples:1 and a 50 m search radius meant the
  // model estimated into rock no hole ever reached. Length-less collars are now excluded from the depth
  // bound entirely: the deepest survey station for that hole is used if there is one, and if NO collar
  // in the project has either, the run is refused rather than guessing.
  const surveyMaxDepth = useMemo(() => {
    const m = new Map();
    survey.forEach((sv) => {
      const d = Number(sv.depth);
      if (!Number.isFinite(d)) return;
      if (!m.has(sv.hole_id) || d > m.get(sv.hole_id)) m.set(sv.hole_id, d);
    });
    return m;
  }, [survey]);
  const collarDepth = (c) => {
    if (Number.isFinite(Number(c.length)) && Number(c.length) > 0) return Number(c.length);
    const sd = surveyMaxDepth.get(c.hole_id);
    return Number.isFinite(sd) && sd > 0 ? sd : null;
  };
  const collarsWithoutDepth = useMemo(() => collars.filter((c) => collarDepth(c) == null).length, [collars, surveyMaxDepth]);
  const collarBounds = useMemo(() => {
    if (!collars.length) return null;
    const xs = collars.map((c) => c.x), ys = collars.map((c) => c.y);
    const zs = collars.map((c) => { const d = collarDepth(c); return d == null ? null : c.z - d; }).filter((z) => z != null);
    const zTops = collars.map((c) => c.z);
    if (!zs.length) return null; // no collar has a length or a survey — nothing defensible to bound depth with
    return { xmin: arrMin(xs), xmax: arrMax(xs), ymin: arrMin(ys), ymax: arrMax(ys), zmin: arrMin(zs), zmax: arrMax(zTops) };
  }, [collars, surveyMaxDepth]);

  // TASKS.csv #521 — the grid used to be the COLLAR box in x / y and "collar z minus hole length" in z, as if every
  // hole were vertical: on Harry 93 of 3,650 composites (2.5%, 3 inclined holes) lay outside it, up to 111 m, and
  // were never estimated around, while z was padded 45 m below the deepest sample. Now the box of the desurveyed
  // traces of the holes that carry assays (the grade-shell tool already works from the samples' own box), with the
  // collar box only as the fallback when nothing can be desurveyed.
  const traceBounds = useMemo(() => {
    const assayed = new Set(assays.map((a) => a.hole_id));
    const byHole = new Map();
    survey.forEach((s) => { if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []); byHole.get(s.hole_id).push(s); });
    let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity, holes = 0;
    for (const c of collars) {
      if (assayed.size && !assayed.has(c.hole_id)) continue;
      let tr = [];
      try { tr = desurveyHole(c, byHole.get(c.hole_id) || [], desurveyMethod) || []; } catch { tr = []; }
      if (!tr.length) continue;
      holes++;
      for (const p of tr) {
        if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y;
        if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z;
      }
    }
    return holes && Number.isFinite(xmin) ? { xmin, xmax, ymin, ymax, zmin, zmax, holes } : null;
  }, [assays, collars, survey, desurveyMethod]);
  const gridBox = traceBounds || collarBounds;

  const [padding, setPadding] = useState(25);
  const [cellSize, setCellSize] = useState(10);
  // TASKS.csv #626 — block budget, as the grade shell's (#625): a per-computer preference, 200,000 by default
  const [blockBudget, setBlockBudgetState] = useState(() => { try { return Math.min(MAX_BLOCK_MODEL_BUDGET, Number(localStorage.getItem("geostrix.estimateBlockBudget")) || MAX_BLOCKS); } catch { return MAX_BLOCKS; } });
  const setBlockBudget = (v) => { setBlockBudgetState(v); try { localStorage.setItem("geostrix.estimateBlockBudget", String(v)); } catch { /* private window */ } };
  const [method, setMethod] = useState("idw2");
  // TASKS.csv #709 — ordinary kriging's variogram: blank = fitted to the composites at run time
  const [vgModel, setVgModel] = useState("spherical");
  const [vgNugget, setVgNugget] = useState(""), [vgSill, setVgSill] = useState(""), [vgRange, setVgRange] = useState("");
  const [addedKv, setAddedKv] = useState(false);
  const [searchRadius, setSearchRadius] = useState(50);
  const [minSamples, setMinSamples] = useState(1);
  const [minHoles, setMinHoles] = useState(2);          // TASKS.csv #258
  const [maxSamples, setMaxSamples] = useState(16);
  const [maxPerHole, setMaxPerHole] = useState(0); // TASKS.csv #709 — 0 = no explicit cap
  const [capValue, setCapValue] = useState(NaN);        // TASKS.csv #259
  const [includeQAQC, setIncludeQAQC] = useState(false); // TASKS.csv #266
  const [restrictToDomain, setRestrictToDomain] = useState(false); // TASKS.csv #260
  const [classifySupport, setClassifySupport] = useState(true); // TASKS.csv #91/#92
  const [shellId, setShellId] = useState(""); // TASKS.csv #517 — restrict to a closed modelled volume ("" = none)
  const [modelName, setModelName] = useState("");
  const [result, setResult] = useState(null); // { cells, blocksEstimated, blocksSkipped, grid, samplePointCount, droppedCount } | null
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const qaqcExcludedCount = useMemo(() => assays.length - excludeQAQC(assays).length, [assays]);
  const srcAssays = useMemo(() => (includeQAQC ? assays : excludeQAQC(assays)), [assays, includeQAQC]);

  // TASKS.csv #259 — the selected element's coefficient of variation, the standard screen for "is this
  // distribution outlier-driven enough that estimating it uncapped will overstate grade?". Same
  // definition GradeStatistics uses (sample stdev / mean, as a percentage).
  const elementCV = useMemo(() => {
    const vals = srcAssays.map((a) => a.values?.[symbol]).filter((v) => Number.isFinite(v));
    if (vals.length < 3) return null;
    const mean = vals.reduce((t, v) => t + v, 0) / vals.length;
    if (!(mean > 0)) return null;
    const variance = vals.reduce((t, v) => t + (v - mean) ** 2, 0) / (vals.length - 1);
    return (Math.sqrt(variance) / mean) * 100;
  }, [srcAssays, symbol]);

  const bounds = gridBox ? { // #521 — the traces' box (collar box only as a fallback)
    xmin: gridBox.xmin - padding, xmax: gridBox.xmax + padding,
    ymin: gridBox.ymin - padding, ymax: gridBox.ymax + padding,
    zmin: gridBox.zmin - padding, zmax: gridBox.zmax + padding,
  } : null;
  const gridPreview = bounds ? {
    nx: Math.max(1, Math.round((bounds.xmax - bounds.xmin) / cellSize)),
    ny: Math.max(1, Math.round((bounds.ymax - bounds.ymin) / cellSize)),
    nz: Math.max(1, Math.round((bounds.zmax - bounds.zmin) / cellSize)),
  } : null;
  const totalBlocksPreview = gridPreview ? gridPreview.nx * gridPreview.ny * gridPreview.nz : 0;
  const overLimit = totalBlocksPreview > blockBudget; // #626
  const fitCell = overLimit && bounds ? cellToFit(bounds, blockBudget, cellSize) : null;
  const fitCellMax = overLimit && bounds && blockBudget < MAX_BLOCK_MODEL_BUDGET ? cellToFit(bounds, MAX_BLOCK_MODEL_BUDGET, cellSize) : null;

  // TASKS.csv #520 — the estimate runs in a worker: the window keeps repainting, shows progress and can be cancelled
  const [progress, setProgress] = useState(null); // 0..1 while running
  const abortRef = useRef(null);
  const cancelRun = () => abortRef.current?.abort();
  const run = () => {
    setError(""); setResult(null); setProgress(0);
    if (!collars.length) { setError("No collars loaded — nothing to estimate from."); return; }
    // TASKS.csv #676 — with fewer samples than holes, no block can ever reach the hole rule (it just reported 0 blocks)
    if (maxSamples < minHoles) { setError(`Max samples per block (${maxSamples}) is below Min distinct holes (${minHoles}), so no block could ever be estimated. Raise Max samples or lower Min holes.`); return; }
    if (!bounds) { setError("None of the loaded collars has a recorded length or any survey data, so there's no defensible depth to build a grid down to. Import hole lengths or survey records first — GeoStrix will not assume one."); return; }
    setRunning(true);
    // Synchronous but deferred so the "Running…" state actually paints before the estimation loop
    // blocks the main thread — a plain synchronous call here would show the button flip back to "Run"
    // with no visible in-between state.
    //
    // A timer, NOT requestAnimationFrame: rAF never fires while the window/tab is hidden, which strands
    // the run on "Running…" forever if the user starts it and immediately switches away. runNumericModel
    // (ViewerModule.jsx) hit exactly this during TASKS.csv #142's live verification and moved to a
    // timer for the same reason; this modal kept the rAF and had the same latent bug, confirmed live
    // during #258's verification (the run sat on "Running…" indefinitely in a hidden preview pane and
    // completed the moment the same code ran under a timer).
    setTimeout(async () => {
      try {
        const cap = Number.isFinite(capValue) && capValue > 0 ? capValue : null; // TASKS.csv #259
        let intervals, rawStats = null;
        if (useComposites) {
          intervals = compositeDownhole(srcAssays, symbol, unit, elementUnits, {
            length: compositeLength, minCoverage, // TASKS.csv #262 — was hardcoded 0.5
            capValue: cap,
            domainRows: domainKey ? layers[domainKey] : null,
          });
        } else {
          // TASKS.csv #571 — duplicates / overlaps resolved, values in `unit`, as in compositing
          const raw = rawSampleIntervals(srcAssays, symbol, unit, elementUnits, { capValue: cap });
          intervals = raw.intervals;
          rawStats = raw.stats;
        }
        let { points, dropped, clamped, beyondTrace } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        // TASKS.csv #517 — a hard boundary at a closed modelled volume: only samples inside it inform the estimate,
        // and only blocks whose centre is inside it are kept (a block outside is not estimated, not set to zero)
        let inShell = null, shellInfo = null;
        if (shellId) {
          const sh = (volumeShells || []).find((v) => v.id === shellId);
          const closed = sh ? isMeshClosed(sh.positions, sh.indices) : null;
          if (!sh || !closed?.closed) { setError(sh ? `"${sh.name}" is not a closed solid (${closed.boundaryEdges} open edges) — it has no inside to restrict to.` : "That volume is no longer in the project."); setRunning(false); return; }
          const q = buildMeshQuery(sh.positions, sh.indices);
          inShell = (p) => isPointInsideMesh(q, p);
          const before = points.length;
          points = points.filter((p) => inShell(p));
          shellInfo = { name: sh.name, samplesInside: points.length, samplesOutside: before - points.length };
        }
        if (!points.length) { setError(shellInfo ? `No ${symbol} samples fall inside "${shellInfo.name}".` : "No sample points could be placed in 3D — check that holes have collars and (ideally) survey data."); setRunning(false); return; }
        // TASKS.csv #292 — an unbounded search makes every sample a candidate for every block
        // (measured: 81 s of blocked main thread at 62,500 blocks x 5,000 points). 0 now means "cap at
        // the grid's own diagonal", which is a mathematical no-op but a real computational bound.
        const gridDiagonal = Math.sqrt(
          (bounds.xmax - bounds.xmin) ** 2 + (bounds.ymax - bounds.ymin) ** 2 + (bounds.zmax - bounds.zmin) ** 2
        );
        const ac = new AbortController(); abortRef.current = ac;
        const est = await runEstimation("block", points, {
          bounds, cellSize: { dx: cellSize, dy: cellSize, dz: cellSize }, maxBlocks: blockBudget, // #626
          method, searchRadius: searchRadius > 0 ? searchRadius : gridDiagonal, minSamples, maxSamples, maxPerHole, // maxPerHole: #709
          minHoles,                                              // TASKS.csv #258
          restrictToDomain: restrictToDomain && !!domainKey,     // TASKS.csv #260
          support: classifySupport,                              // TASKS.csv #91/#92
          ...(method === "ok" ? { variogram: { model: vgModel, ...(vgNugget !== "" && vgSill !== "" && vgRange !== "" ? { nugget: Number(vgNugget), sill: Number(vgSill), range: Number(vgRange) } : {}) } } : {}), // #709
          ...(trend ? { trend: { basis: trendBasis(trend), scales: trendSearchScales(trend) } } : {}), // TASKS.csv #650 — ellipsoidal search
        }, { onProgress: setProgress, signal: ac.signal });
        // TASKS.csv #404 — the parameters are captured AT RUN TIME (the form can be edited before
        // "Add to project"), and travel with the block model into the project file.
        const params = {
          tool: "Grade estimation", element: symbol, method, cellSizeM: cellSize, paddingM: padding,
          gridFrom: traceBounds ? `desurveyed traces of ${traceBounds.holes} assayed hole(s)` : "collar box (no hole could be desurveyed)", // #521
          searchRadiusM: searchRadius > 0 ? searchRadius : Math.round(gridDiagonal), searchRadiusWasUnlimited: !(searchRadius > 0),
          minSamples, maxSamples, minHoles, maxSamplesPerHole: maxPerHole || null,
          searchTrend: trend ? { name: trend.name, dip: trend.dip, dipAzimuth: trend.dipAzimuth, pitch: trend.pitch, ratios: trend.ratios, ellipsoidM: [1, trend.ratios.int / trend.ratios.max, trend.ratios.min / trend.ratios.max].map((f) => Math.round(f * (searchRadius > 0 ? searchRadius : gridDiagonal))) } : null, // #650
          composited: useComposites, compositeLengthM: useComposites ? compositeLength : null, minCoverage: useComposites ? minCoverage : null,
          capValue: Number.isFinite(cap) ? cap : null, capAudit: cap != null ? capAudit(srcAssays, symbol, unit, elementUnits, cap) : null, includeQAQC, // capAudit: #533
          // TASKS.csv #529 — the unit of the estimated values and of the cap (an "Au" column could be ppm or ppb); and the
          // domain fields, which #533's edit had left inside the comment above (estimates since then lacked them)
          unit, capUnit: cap != null ? unit : null, domain: domainKey || null, restrictToDomain: restrictToDomain && !!domainKey,
          desurveyMethod: desurveyMethod || "minimum curvature", samplePoints: points.length, generatedAt: new Date().toISOString(),
        };
        if (est.mlsCounts) params.mlsBlocks = est.mlsCounts; // #516 — how the linear trend was fitted
        if (est.variogram) { params.variogram = { ...est.variogram, frame: trend ? `in the trend "${trend.name}" frame: the range is along its major axis` : "isotropic" }; params.krigingBlocks = est.okCounts; } // #709
        if (est.dominatedCells) params.effectivelyOneHoleBlocks = est.dominatedCells; // #676 — 2+ holes, one with >= 95 % of the weight
        if (inShell) { // #517
          const before = est.cells.length;
          est.cells = est.cells.filter((c) => inShell(c));
          est.blocksSkipped += before - est.cells.length; est.blocksEstimated = est.cells.length;
          params.restrictedToVolume = `${shellInfo.name}: ${shellInfo.samplesInside} sample(s) inside used, ${shellInfo.samplesOutside} outside left out; ${before - est.cells.length} block(s) outside it dropped`;
        }
        setResult({ ...est, params, samplePointCount: points.length, droppedCount: dropped, clampedCount: clamped, beyondTraceCount: beyondTrace, rawStats, intervalCount: intervals.length });
        setAdded(false); setAddedSupport(false); setAddedKv(false); // a fresh run invalidates every "Added ✓" state
      } catch (e) {
        setError(e.cancelled ? "Estimation cancelled." : (e.message || "Estimation failed."));
      }
      abortRef.current = null; setProgress(null);
      setRunning(false);
    }, 40);
  };

  const [added, setAdded] = useState(false);
  const [addedSupport, setAddedSupport] = useState(false); // TASKS.csv #92
  // TASKS.csv #92 — same cells, `value` swapped for the 0–1 Data Support Index. Named explicitly so it
  // can never be mistaken for a grade model or for a statistical confidence surface once it is sitting
  // in the project's model list months later.
  const addSupportModel = () => {
    if (!result || !result.cells.length) return;
    const base = modelName.trim() || `${symbol} estimate (${method}, ${cellSize}m)`;
    onAddModel({
      name: `${base} — Data Support Index (geometric, not a confidence)`,
      source: `support-index-${method}`,
      cells: result.cells.map((c) => ({ x: c.x, y: c.y, z: c.z, dx: c.dx, dy: c.dy, dz: c.dz, value: c.supportIndex, nSamples: c.nSamples, nHoles: c.nHoles, support: c.support })),
      params: { ...result.params, value: "Data Support Index (geometric, 0-1)" }, // TASKS.csv #404
    });
    setAddedSupport(true);
  };
  // TASKS.csv #709 — the kriging variance as its own block model, named so it can't be read as an error bar on grade
  const addKvModel = () => {
    if (!result || !result.cells.length) return;
    const base = modelName.trim() || `${symbol} estimate (${method}, ${cellSize}m)`;
    const cells = result.cells.filter((c) => Number.isFinite(c.kv)).map((c) => ({ x: c.x, y: c.y, z: c.z, dx: c.dx, dy: c.dy, dz: c.dz, value: c.kv, nSamples: c.nSamples, nHoles: c.nHoles }));
    onAddModel({ name: `${base} — kriging variance (data layout, not a grade error)`, source: "kriging-variance", cells, params: { ...result.params, value: `kriging variance (${unit} squared): how well the samples' layout constrains the block under the variogram` } });
    setAddedKv(true);
  };
  const addToProject = () => {
    if (!result || !result.cells.length) return;
    const name = modelName.trim() || `${symbol} estimate (${method}, ${cellSize}m)`;
    // TASKS.csv #702 — the shared grade ramp (lib/inversion.js gradeStops), the one a geoML estimate gets too
    let gMin = Infinity, gMax = -Infinity;
    for (const c of result.cells) { if (Number.isFinite(c.value)) { if (c.value < gMin) gMin = c.value; if (c.value > gMax) gMax = c.value; } }
    const ramp = gMin <= gMax ? { min: gMin, max: gMax, colorMode: "continuous", stops: gradeStops(gMin, gMax) } : {};
    onAddModel({ name, source: `estimate-${method}`, cells: result.cells, ...ramp, params: result.params }); // params: TASKS.csv #404
    setAdded(true);
  };

  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>Grade estimation → block model</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>Nearest-neighbour, inverse-distance or moving-least-squares interpolation from composited assays. {collars.length} holes, {assays.length} raw intervals loaded.</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label="Close" size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>Element
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inp}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({elementUnits[s] || "ppm"})</option>)}
              </select>
            </label>
            <label style={fieldLabel}>Method
              {/* TASKS.csv #87 — the method list comes from estimation.js's own table so the dropdown
                  and the estimator can never disagree about what a method id means. */}
              <select value={method} onChange={(e) => setMethod(e.target.value)} style={inp} title={ESTIMATION_METHODS.find((m) => m.id === method)?.blurb || ""}>
                {ESTIMATION_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            {method === "ok" && (
              <div style={{ flex: "1 1 100%", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}
                title="The variogram ordinary kriging weights the composites with. Leave nugget, sill and range blank to fit one to these composites at run time (omnidirectional; with a trend, in the trend's frame, so the range is along its major axis). The Variogram tool shows the experimental points if you want to choose them yourself.">
                <label style={fieldLabel}>Variogram model
                  <select value={vgModel} onChange={(e) => setVgModel(e.target.value)} style={inp} aria-label="Variogram model">
                    <option value="spherical">Spherical</option><option value="exponential">Exponential</option><option value="gaussian">Gaussian</option>
                  </select>
                </label>
                {[["Nugget", vgNugget, setVgNugget], ["Sill (total)", vgSill, setVgSill], ["Range (m)", vgRange, setVgRange]].map(([l, v, set]) => (
                  <label key={l} style={{ ...fieldLabel, width: 90 }}>{l}
                    <input type="number" min="0" step="any" value={v} placeholder="fit" onChange={(e) => set(e.target.value)} style={inp} aria-label={`Variogram ${l}`} />
                  </label>
                ))}
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flex: "1 1 160px" }}>Blank = fitted to these composites when you run. Values in the estimated unit ({unit}), squared for nugget and sill.</div>
              </div>
            )}
            <label style={fieldLabel} title="No sample within this distance of a block leaves it un-estimated (no cell), rather than extrapolating grade far from any real data. 0 = no radius assumption, capped internally at the grid's own diagonal so the run can't hang.">
              Search radius (m, 0 = no limit)
              <input type="number" min="0" step="any" value={searchRadius} onChange={(e) => setSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={inp} />
              {trend && searchRadius > 0 && (
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontWeight: 400 }}>
                  Along trend "{trend.name}": an ellipsoid of {searchRadius} × {Math.round((searchRadius * trend.ratios.int) / trend.ratios.max)} × {Math.round((searchRadius * trend.ratios.min) / trend.ratios.max)} m ({describeTrend(trend)})
                </span>
              )}
            </label>
            <label style={fieldLabel} title="Counts sample POINTS, not holes — one hole composited at 2m supplies ~25 of them inside a 50m radius, so this alone can never express 'more than one hole must see this block'. Use Min distinct holes for that.">Min samples/block
              <input type="number" min="1" value={minSamples} onChange={(e) => setMinSamples(Math.max(1, Number(e.target.value) || 1))} style={inp} />
            </label>
            {/* TASKS.csv #258 */}
            <label style={fieldLabel} title="A block is only estimated if samples from at least this many DISTINCT drillholes fall inside its search radius. With 1, a single intercept becomes a full search-radius sphere of 'resource' with continuity asserted rather than demonstrated. Every resource practitioner's first sanity constraint is at least two, usually three. With 2 or more, each hole supplies at most (max samples / min holes) of a block's samples, e.g. 8 of 16 (#642).">
              Min distinct holes per block
              <input type="number" min="1" step="1" value={minHoles} onChange={(e) => setMinHoles(Math.max(1, Math.round(Number(e.target.value) || 1)))} style={inp} />
            </label>
            {/* TASKS.csv #259 */}
            <label style={fieldLabel} title="Caps every RAW assay at this grade before compositing (compositeDownhole applies it per sample, before length-weighted averaging — the correct order). Blank = no cap. Commonly set at the 97.5th–99th percentile of the element's distribution.">
              High-grade cap ({PRECIOUS_METALS.has(symbol) && unit === "ppm" ? "g/t" : unit})
              <input type="number" min="0" step="any" placeholder="none" value={Number.isFinite(capValue) ? capValue : ""} onChange={(e) => setCapValue(e.target.value === "" ? NaN : Number(e.target.value))} style={inp} />
            </label>
            <label style={fieldLabel} title="Caps how many nearest samples contribute to any one block's IDW average (ignored for nearest-neighbour).">
              Max samples/block
              <input type="number" min="1" value={maxSamples} onChange={(e) => setMaxSamples(Math.max(1, Number(e.target.value) || 1))} style={inp} />
            </label>
            <label style={fieldLabel} title="At most this many of a block's samples from any one hole, so a hole drilled straight through the block can't supply them all (0 = no cap beyond the one Min distinct holes implies).">
              Max samples/hole
              <input type="number" min="0" value={maxPerHole} onChange={(e) => setMaxPerHole(Math.max(0, Math.floor(Number(e.target.value) || 0)))} style={inp} aria-label="Max samples per hole" />
            </label>
          </div>
          {/* TASKS.csv #533 — P97.5 / P99 caps and the capping audit (samples cut, metal removed) */}
          <CapAuditHint assays={srcAssays} symbol={symbol} unit={unit} elementUnits={elementUnits} capValue={Number.isFinite(capValue) && capValue > 0 ? capValue : null} onSetCap={(v) => setCapValue(Number(v.toPrecision(4)))} unitLabel={PRECIOUS_METALS.has(symbol) && unit === "ppm" ? "g/t" : unit} />

          {/* TASKS.csv #259 — CV > 150% means a skewed, outlier-driven distribution: the classic setup
              for an uncapped bonanza assay driving IDW² over its whole search neighbourhood. */}
          {elementCV != null && elementCV > 150 && !(Number.isFinite(capValue) && capValue > 0) && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>
              This element's coefficient of variation is {elementCV.toFixed(0)}% — a skewed, outlier-driven
              distribution. Estimating it without a high-grade cap will overstate grade. Set a cap
              (commonly the 97.5th–99th percentile) before trusting this result.
            </div>
          )}
          {/* TASKS.csv #266 — same toggle Best Intercepts / Compositing / Grade Statistics already have. */}
          {qaqcExcludedCount > 0 && (
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so a standard's own repeat-insertion grade can't bias the estimate — a field duplicate logged under its parent hole's id would otherwise be double-counted.">
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />
              Include QC samples (standards/blanks/duplicates) in this estimate — {qaqcExcludedCount} detected
            </label>
          )}
          <div style={{ padding: 10, background: "#f9fafb", border: "1px solid var(--color-hover-bg)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={useComposites} onChange={(e) => setUseComposites(e.target.checked)} />
              Composite raw assays first (recommended)
            </label>
            {useComposites && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={fieldLabel}>Composite length (m)
                  <input type="number" step="any" min="0.1" value={compositeLength} onChange={(e) => setCompositeLength(Math.max(0.1, Number(e.target.value) || 2))} style={inp} />
                </label>
                {/* TASKS.csv #262 — was hardcoded at 0.5 with no way to tighten it. Same control and
                    wording CompositingModal already exposes. */}
                <label style={fieldLabel} title="Minimum fraction of a composite interval that must actually be covered by real assay data (vs. missing/lost core) for it to be used in the estimate. At the 50% default, a half-missing-core composite still counts as a full sample.">
                  Min coverage (%)
                  <input type="number" step="1" min="0" max="100" value={Math.round(minCoverage * 100)} onChange={(e) => setMinCoverage(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} style={inp} />
                </label>
                {/* TASKS.csv #260 — renamed. "Honor domain" reads as "the estimate respects my geology";
                    it never did that. All it does on its own is break composites at domain edges. */}
                <label style={fieldLabel}>Break composites at domain boundary
                  <select value={domainKey} onChange={(e) => setDomainKey(e.target.value)} style={inp}>
                    <option value="">— none —</option>
                    {domainOptions.map((k) => <option key={k} value={k}>{LAYER_META[k].label}</option>)}
                  </select>
                </label>
              </div>
            )}
            {useComposites && domainKey && (
              <>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }} title="Restricts each block's candidate samples to composites carrying the same domain as the block itself (the block adopts the domain of its nearest composite). Without this, the search is a plain sphere through all the data and grade is smeared across contacts and faults.">
                  <input type="checkbox" checked={restrictToDomain} onChange={(e) => setRestrictToDomain(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>Also restrict the interpolation search to the same domain <em>(recommended)</em></span>
                </label>
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                  {restrictToDomain
                    ? "Each block adopts the domain of its nearest composite and only ever sees composites from that same domain — a nearest-neighbour domain model, the simplest defensible way to give a point in space a domain from downhole-only logging. Blocks whose nearest composite has no logged domain are left un-estimated."
                    : "Selecting a domain above only stops a single composite from spanning two domains. It does NOT stop the interpolation search itself from drawing samples across a contact or a fault — that search is a plain sphere through all the data, so grade will be smeared across geological boundaries. Tick the box above to restrict the search too."}
                </div>
              </>
            )}
          </div>

          {/* TASKS.csv #517 — a modelled unit volume (or an imported closed solid) as a hard domain boundary */}
          {volumeShells.length > 0 && (
            <label style={fieldLabel} title="Only samples inside this closed solid inform the estimate, and only blocks whose centre is inside it are kept — e.g. Au inside the modelled DACT. Build unit volumes from an implicit model (3D Modelling, after a stack run: Add unit volumes).">
              Restrict to a modelled volume
              <select value={shellId} onChange={(e) => setShellId(e.target.value)} style={inp} aria-label="Restrict to a modelled volume">
                <option value="">— none (whole grid) —</option>
                {volumeShells.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </label>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel} title="Extends the block grid beyond the collar bounding box in every direction, so blocks near the edge of the drilling aren't starved of nearby samples.">
              Padding around collars (m)
              <input type="number" min="0" step="any" value={padding} onChange={(e) => setPadding(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel}>Cell size (m, cubic)
              <input type="number" min="0.5" step="any" value={cellSize} onChange={(e) => setCellSize(Math.max(0.5, Number(e.target.value) || 10))} style={inp} />
            </label>
          </div>

          {/* TASKS.csv #91/#92 — data support classification. */}
          <div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }} title="Classifies every block as interpolated (informing composites bracket the block on all three axes, from at least two holes), extrapolated (an estimate was produced, but all the informing data lies to one side) or unsupported (no estimate). Adds roughly 80% to the run time.">
              <input type="checkbox" checked={classifySupport} onChange={(e) => setClassifySupport(e.target.checked)} style={{ marginTop: 2 }} />
              <span>Classify data support per block (interpolated / extrapolated / unsupported)</span>
            </label>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5, marginTop: 4 }}>
              Adds a support class and a 0–1 <strong>Data Support Index</strong> to every block, and lets you add
              the index to the project as its own block model. The index is a <em>geometric</em> measure —
              distance to the nearest composite, how many distinct holes informed the block, and how well
              they surround it. It is <strong>not</strong> a confidence interval, a probability or a kriging
              variance: nothing here measures how the grade itself decorrelates with distance, so it would
              return the same number for a nuggety vein and a smooth porphyry drilled on the same pattern.
              Costs about 80% extra run time.
            </div>
          </div>

          {/* TASKS.csv #626 — the block budget (runs in a worker with progress and Cancel since #520) */}
          <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 8 }}
            title="How many blocks the grid may have. Larger budgets allow smaller blocks over a large area, at the cost of time, memory (about 0.4 GB for 1 million blocks, 0.9 GB for 2 million) and project-file size (every estimated block is saved with the project). Block models stop at 2 million so an 8 GB laptop keeps working; the grade shell goes higher. Remembered on this computer.">
            Block budget
            <select value={blockBudget} onChange={(e) => setBlockBudget(Number(e.target.value))} style={{ ...inp, width: "auto" }} aria-label="Block model block budget">
              {BLOCK_MODEL_BUDGETS.map((b) => <option key={b} value={b}>{b.toLocaleString()} blocks ({blockModelBudgetNote(b)})</option>)}
            </select>
          </label>
          {gridPreview && (
            <div style={{ fontSize: "var(--font-size-sm)", color: overLimit ? "var(--color-danger-icon-strong)" : "var(--color-text-muted)" }}>
              Grid: {gridPreview.nx} × {gridPreview.ny} × {gridPreview.nz} = {totalBlocksPreview.toLocaleString()} blocks
              {overLimit && ` — over the ${blockBudget.toLocaleString()}-block budget.`}
              {overLimit && (
                <span style={{ display: "inline-flex", gap: 6, marginLeft: 6, flexWrap: "wrap" }}>
                  <button type="button" onClick={() => setCellSize(fitCell)} style={{ ...btn(false), padding: "2px 8px" }}>Use {fitCell} m blocks</button>
                  {fitCellMax && <button type="button" onClick={() => { setBlockBudget(MAX_BLOCK_MODEL_BUDGET); setCellSize(fitCellMax); }} style={{ ...btn(false), padding: "2px 8px" }}>Largest budget + {fitCellMax} m blocks</button>}
                </span>
              )}
            </div>
          )}
          {/* TASKS.csv #292 — warn BEFORE doing the work (the same pattern #209 used for the 10M-row
              CSV case). With no radius every block gets estimated from the whole dataset, which is
              inherently expensive however well the search is indexed. */}
          {searchRadius === 0 && totalBlocksPreview > 25000 && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>
              With no search radius, every one of these {totalBlocksPreview.toLocaleString()} blocks gets
              estimated from the whole dataset — this run can take a minute or more (it runs in the background
              with a progress count, and Cancel stops it). It is also rarely what you want: a block with no sample anywhere
              near it still gets a grade. Set a real search radius (50 m is the default) unless you
              specifically want an unbounded first pass.
            </div>
          )}
          {!collars.length && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>No collars loaded — import drillhole collars first.</div>}

          {/* TASKS.csv #265 — the refusal path used to live ONLY in run()'s setError, which is
              unreachable: the same !bounds condition disables the Run button, so a user whose collars
              have no length and no survey got a greyed-out button and no explanation at all. Caught by
              live verification with length-less collars (the original pass checked this branch by code
              trace only, and the sample dataset can't trigger it — every Harry collar has a length).
              Stated inline instead, so the reason is visible without clicking anything. */}
          {collars.length > 0 && !bounds && (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>
              None of the {collars.length} loaded collar(s) has a recorded length or any survey record, so
              there's no defensible depth to build a grid down to. Import hole lengths or survey data first —
              GeoStrix won't assume one (earlier versions silently assumed 300 m).
            </div>
          )}
          {/* Also surfaced BEFORE a run, not just in the result block, so a partially-length-less
              dataset is visible while setting parameters rather than only afterwards. */}
          {bounds && collarsWithoutDepth > 0 && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.45 }}>
              {collarsWithoutDepth} of {collars.length} collar(s) have no recorded length and no survey record —
              they contribute nothing to the grid's depth extent.
            </div>
          )}

          <button onClick={run} disabled={!bounds || overLimit || running || !symbol} style={{ ...btn(true), alignSelf: "flex-start", padding: "8px 16px", display: "flex", alignItems: "center", gap: 6, opacity: (!bounds || overLimit || !symbol) ? 0.5 : 1 }}>
            <Play size={14} /> {running ? `Running… ${progress != null ? Math.round(progress * 100) + "%" : ""}` : "Run estimation"}
          </button>
          {running && <button type="button" onClick={cancelRun} style={{ ...btn(false), alignSelf: "flex-start", padding: "6px 14px" }}>Cancel</button>}

          {error && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-danger-icon-strong)" }}>{error}</div>}

          {result && (
            <div style={{ padding: 10, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-strong)", display: "flex", flexDirection: "column", gap: 6 }}>
              <div>{result.samplePointCount} sample point(s) placed ({result.intervalCount} interval(s), {result.droppedCount} dropped — no collar/survey to place them{result.beyondTraceCount ? `, ${result.beyondTraceCount} of them deeper than the hole's trace` : ""}{result.clampedCount ? `; ${result.clampedCount} negative grade(s) clamped to zero` : ""}).</div>
              {/* TASKS.csv #571 */}
              {result.rawStats && (result.rawStats.duplicatesSkipped > 0 || result.rawStats.overlappingRows > 0) && (
                <div>Raw assays: {result.rawStats.duplicatesSkipped} exact duplicate row(s) left out; {result.rawStats.overlappingRows} overlapping row(s) resolved into segments at the mean of the overlapping results.</div>
              )}
              <div>{result.blocksEstimated.toLocaleString()} block(s) estimated, {result.blocksSkipped.toLocaleString()} left un-estimated (no sample within search radius / below min-samples / below min distinct holes).</div>
              {/* TASKS.csv #258 */}
              {/* TASKS.csv #516 — say how MLS (linear) actually ran */}
              {result.variogram && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 4 }}>
                  Kriged with a {result.variogram.model} variogram{result.variogram.fitted ? " fitted to these composites" : " as entered"}: nugget {+result.variogram.nugget.toPrecision(3)}, sill {+result.variogram.sill.toPrecision(3)}, range {Math.round(result.variogram.range)} m{trend ? ` (along the trend "${trend.name}")` : ""}{result.variogram.fitted ? " — check it against the Variogram tool before trusting it" : ""}.
                  {result.variogram.nugget / result.variogram.sill > 0.8 && <span style={{ color: "var(--color-warn-text)" }}> The nugget is {Math.round((100 * result.variogram.nugget) / result.variogram.sill)}% of the sill: the composites are barely alike even close together, so kriging gives close to a plain average of the neighbours — the variogram, not the method, is the limit here.</span>}
                  {result.okCounts && <> {result.okCounts.kriged.toLocaleString()} block(s) kriged{result.okCounts.exact ? `, ${result.okCounts.exact.toLocaleString()} on a composite` : ""}{result.okCounts.negativeWeights ? `, ${result.okCounts.negativeWeights.toLocaleString()} with a negative weight (normal for kriging; such a block can fall slightly outside its samples' range)` : ""}{result.okCounts.fallbackIdw ? `, ${result.okCounts.fallbackIdw.toLocaleString()} fell back to IDW² (their kriging system had no unique solution)` : ""}.</>}
                </div>
              )}
              {result.mlsCounts && (result.mlsCounts.reduced + result.mlsCounts.idw) > 0 && (
                <div style={{ color: "var(--color-text-secondary)" }}>
                  MLS (linear): {result.mlsCounts.full.toLocaleString()} block(s) with a full 3D trend
                  {result.mlsCounts.reduced ? `, ${result.mlsCounts.reduced.toLocaleString()} with the trend fitted in the plane / line of their samples (e.g. holes on one section — nothing is known about the trend across it)` : ""}
                  {result.mlsCounts.idw ? `, ${result.mlsCounts.idw.toLocaleString()} fell back to IDW² (their samples gave no direction to fit)` : ""}.
                </div>
              )}
              {result.singleHoleCells > 0 && (
                <div style={{ color: "var(--color-warn-text)" }}>
                  {result.singleHoleCells.toLocaleString()} of the estimated blocks ({((result.singleHoleCells / Math.max(1, result.blocksEstimated)) * 100).toFixed(0)}%) were informed by only ONE drillhole — continuity there is asserted, not demonstrated. Raise "Min distinct holes per block" to exclude them.
                </div>
              )}
              {/* TASKS.csv #676 — passing the hole rule while one hole carries nearly all the weight */}
              {result.dominatedCells > 0 && (
                <div style={{ color: "var(--color-warn-text)" }}>
                  {result.dominatedCells.toLocaleString()} of the estimated blocks ({((result.dominatedCells / Math.max(1, result.blocksEstimated)) * 100).toFixed(0)}%) use samples from two or more holes, but one hole carries at least 95% of the weight — in effect a single-hole estimate. These blocks sit close to one hole; raising Min distinct holes does not change that, so read their grade as that hole's.
                </div>
              )}
              {/* TASKS.csv #265 */}
              {collarsWithoutDepth > 0 && (
                <div style={{ color: "var(--color-warn-text)" }}>
                  {collarsWithoutDepth} collar(s) have no recorded length and no survey record — they contributed nothing to the grid's depth extent (rather than a silently assumed 300 m, which is what earlier versions did).
                </div>
              )}
              {/* TASKS.csv #91/#92 */}
              {result.supportCounts && result.blocksEstimated > 0 && (
                <div style={{ marginTop: 6, padding: "8px 9px", background: "#f5f7f9", border: "1px solid #e2e6ea", borderRadius: 6, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>Data support</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {["interpolated", "extrapolated", "unsupported"].map((k) => (
                      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--color-text-secondary)" }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: SUPPORT_COLORS[k], display: "inline-block" }} />
                        {result.supportCounts[k].toLocaleString()} {k}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 5, color: "var(--color-warn-text)" }}>
                    {summarizeSupport(result.supportCounts)}
                  </div>
                  <div style={{ marginTop: 5, color: "var(--color-text-muted)" }}>
                    Only blocks whose informing composites bracket them on all three axes, from at least two
                    holes, count as interpolated. Everything else with a value is being carried outward from
                    the data rather than between it — a real number, but not an interpolation.
                  </div>
                </div>
              )}
              {result.blocksEstimated > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <input placeholder={`${symbol} estimate (${method}, ${cellSize}m)`} value={modelName} onChange={(e) => { setModelName(e.target.value); setAdded(false); setAddedSupport(false); }} style={{ ...inp, flex: 1, width: "auto" }} />
                  <button onClick={addToProject} style={{ ...btn(true), padding: "7px 12px" }}>{added ? "Added ✓" : "Add as block model"}</button>
                </div>
              )}
              {/* TASKS.csv #92 — the index as its own block model. This IS the "where is this model
                  well constrained" field the design doc asked for, and making it a normal block model
                  means it renders, slices, sections and exports through the existing voxel viewer with
                  no new display code at all. */}
              {result.supportCounts && result.blocksEstimated > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={addSupportModel} style={{ ...btn(false), padding: "7px 12px", width: "auto" }}>
                    {addedSupport ? "Added ✓" : "Add Data Support Index as a separate block model"}
                  </button>
                </div>
              )}
              {result.variogram && result.blocksEstimated > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={addKvModel} style={{ ...btn(false), padding: "7px 12px", width: "auto" }} title="Kriging variance: how well the samples' layout constrains each block under this variogram. It does not depend on the grades themselves, so it is not an error bar on the estimate.">
                    {addedKv ? "Added ✓" : "Add kriging variance as a separate block model"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TASKS.csv #269 — the closing paragraph now names every assumption the estimate actually
              makes, not just the missing-kriging one. */}
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", lineHeight: 1.5 }}>
            <strong>Not a resource estimate.</strong> This is an interpolated block model to help you
            visualise and target mineralisation. Nothing it produces is a Mineral Resource under
            NI 43-101 or JORC, and it must not be reported publicly as one — that requires an estimate
            prepared by a Qualified Person.
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
            Nearest-neighbour, inverse-distance weighting and moving least squares are complete, defensible estimation methods (IDW especially for early-stage/scoping estimates; pick the one that suits the geology — hover the Method dropdown for what each is good for), and ordinary kriging weights the composites by a variogram (entered, or fitted at run time) and reports a kriging variance. Kriging here is point kriging at each block centre (no block discretisation), with the same search as the other methods; its variance measures the samples' layout under the variogram, not the uncertainty of the grade. A block with no sample inside its search radius is left un-estimated rather than guessed at.
            {" "}{trend
              ? <>The search follows the structural trend "{trend.name}" (an ellipsoid; change it in 3D Modelling → Model settings → Structural trends), there is</>
              : <>The search is <strong>isotropic</strong> (a plain sphere — choose a trend for block estimation in 3D Modelling → Model settings → Structural trends to make it an ellipsoid), there is</>}{" "}
            no declustering, no variogram, and no classification. Domain control applies only if you both
            select a domain layer and tick "restrict the interpolation search"; high-grade capping applies
            only if you enter a cap. Every one of those is an assumption you are making, not a property
            of the data.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(760px, 95vw)", maxHeight: "90vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const fieldLabel = { fontSize: "var(--font-size-sm)", color: "#55606e", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: "var(--font-size-base)", fontFamily: "inherit", width: 150 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid #c7ccd3", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
