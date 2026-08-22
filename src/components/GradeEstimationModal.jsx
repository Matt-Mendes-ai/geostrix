import React, { useMemo, useState } from "react";
import { X, Play } from "lucide-react";
import { compositeDownhole } from "../lib/geochem.js";
import { samplePointsFromIntervals, samplePointsFromAssays, estimateBlockModel, MAX_BLOCKS } from "../lib/estimation.js";
import { desurveyHole } from "../lib/desurvey.js";
import { LAYER_META } from "../lib/layers.js";

// TASKS.csv #117 — grade estimation into block models (not just display). Micromine-specialist AND
// Leapfrog-specialist audits both independently flagged this as the top 3D-Modelling gap: GeoStrix
// could import/display someone else's block model but had no in-app engine to populate one FROM the
// project's own composited assays — the actual "resource estimation" step both Micromine and Leapfrog
// Edge are built around. Depends on downhole compositing (#118, implemented alongside this) as its
// input — see lib/estimation.js's top comment for why kriging isn't offered here (needs a fitted
// variogram as a genuine prerequisite, not just a harder formula dropped into the same loop).
export default function GradeEstimationModal({ assays, assayElements, layers, collars, survey, onAddModel, onClose }) {
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);
  const [symbol, setSymbol] = useState(symbols[0] || "Au");
  const unit = elementUnits[symbol] || "ppm";

  const [useComposites, setUseComposites] = useState(true);
  const [compositeLength, setCompositeLength] = useState(2);
  const [domainKey, setDomainKey] = useState("");
  const domainOptions = ["litho", "alt", "vein", "geotech"].filter((k) => (layers[k] || []).length > 0);

  const collarBounds = useMemo(() => {
    if (!collars.length) return null;
    const xs = collars.map((c) => c.x), ys = collars.map((c) => c.y), zs = collars.map((c) => c.z - (c.length || 300));
    const zTops = collars.map((c) => c.z);
    return { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys), zmin: Math.min(...zs), zmax: Math.max(...zTops) };
  }, [collars]);

  const [padding, setPadding] = useState(25);
  const [cellSize, setCellSize] = useState(10);
  const [method, setMethod] = useState("idw2");
  const [searchRadius, setSearchRadius] = useState(50);
  const [minSamples, setMinSamples] = useState(1);
  const [maxSamples, setMaxSamples] = useState(16);
  const [modelName, setModelName] = useState("");
  const [result, setResult] = useState(null); // { cells, blocksEstimated, blocksSkipped, grid, samplePointCount, droppedCount } | null
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const bounds = collarBounds ? {
    xmin: collarBounds.xmin - padding, xmax: collarBounds.xmax + padding,
    ymin: collarBounds.ymin - padding, ymax: collarBounds.ymax + padding,
    zmin: collarBounds.zmin - padding, zmax: collarBounds.zmax + padding,
  } : null;
  const gridPreview = bounds ? {
    nx: Math.max(1, Math.round((bounds.xmax - bounds.xmin) / cellSize)),
    ny: Math.max(1, Math.round((bounds.ymax - bounds.ymin) / cellSize)),
    nz: Math.max(1, Math.round((bounds.zmax - bounds.zmin) / cellSize)),
  } : null;
  const totalBlocksPreview = gridPreview ? gridPreview.nx * gridPreview.ny * gridPreview.nz : 0;
  const overLimit = totalBlocksPreview > MAX_BLOCKS;

  const run = () => {
    setError(""); setResult(null);
    if (!bounds) { setError("No collars loaded — nothing to estimate from."); return; }
    setRunning(true);
    // Synchronous but wrapped in a rAF-deferred call so the "Running…" state actually paints before
    // the (potentially few-hundred-ms) estimation loop blocks the main thread — a plain synchronous
    // call here would show the button flip back to "Run" with no visible in-between state.
    requestAnimationFrame(() => {
      try {
        let intervals;
        if (useComposites) {
          intervals = compositeDownhole(assays, symbol, unit, elementUnits, {
            length: compositeLength, minCoverage: 0.5,
            domainRows: domainKey ? layers[domainKey] : null,
          });
        } else {
          intervals = assays
            .filter((a) => a.hole_id != null && a.from != null && a.to != null)
            .map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, avgGrade: a.values[symbol] != null ? a.values[symbol] : null }))
            .filter((iv) => iv.avgGrade != null);
        }
        const { points, dropped } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole);
        if (!points.length) { setError("No sample points could be placed in 3D — check that holes have collars and (ideally) survey data."); setRunning(false); return; }
        const est = estimateBlockModel(points, {
          bounds, cellSize: { dx: cellSize, dy: cellSize, dz: cellSize },
          method, searchRadius: searchRadius > 0 ? searchRadius : null, minSamples, maxSamples,
        });
        setResult({ ...est, samplePointCount: points.length, droppedCount: dropped, intervalCount: intervals.length });
      } catch (e) {
        setError(e.message || "Estimation failed.");
      }
      setRunning(false);
    });
  };

  const [added, setAdded] = useState(false);
  const addToProject = () => {
    if (!result || !result.cells.length) return;
    const name = modelName.trim() || `${symbol} estimate (${method}, ${cellSize}m)`;
    onAddModel({ name, source: `estimate-${method}`, cells: result.cells });
    setAdded(true);
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Grade estimation → block model</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>Nearest-neighbour or inverse-distance weighting from composited assays. {collars.length} holes, {assays.length} raw intervals loaded.</div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>Element
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inp}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({elementUnits[s] || "ppm"})</option>)}
              </select>
            </label>
            <label style={fieldLabel}>Method
              <select value={method} onChange={(e) => setMethod(e.target.value)} style={inp}>
                <option value="nn">Nearest neighbour</option>
                <option value="idw2">Inverse distance (power 2)</option>
                <option value="idw3">Inverse distance (power 3)</option>
              </select>
            </label>
            <label style={fieldLabel} title="No sample within this distance of a block leaves it un-estimated (no cell), rather than extrapolating grade far from any real data.">
              Search radius (m, 0 = unlimited)
              <input type="number" min="0" step="any" value={searchRadius} onChange={(e) => setSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel}>Min samples/block
              <input type="number" min="1" value={minSamples} onChange={(e) => setMinSamples(Math.max(1, Number(e.target.value) || 1))} style={inp} />
            </label>
            <label style={fieldLabel} title="Caps how many nearest samples contribute to any one block's IDW average (ignored for nearest-neighbour).">
              Max samples/block
              <input type="number" min="1" value={maxSamples} onChange={(e) => setMaxSamples(Math.max(1, Number(e.target.value) || 1))} style={inp} />
            </label>
          </div>

          <div style={{ padding: 10, background: "#f9fafb", border: "1px solid #eef1f5", borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#55606e", cursor: "pointer" }}>
              <input type="checkbox" checked={useComposites} onChange={(e) => setUseComposites(e.target.checked)} />
              Composite raw assays first (recommended — see TASKS #118)
            </label>
            {useComposites && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={fieldLabel}>Composite length (m)
                  <input type="number" step="any" min="0.1" value={compositeLength} onChange={(e) => setCompositeLength(Math.max(0.1, Number(e.target.value) || 2))} style={inp} />
                </label>
                <label style={fieldLabel}>Honor domain
                  <select value={domainKey} onChange={(e) => setDomainKey(e.target.value)} style={inp}>
                    <option value="">— none —</option>
                    {domainOptions.map((k) => <option key={k} value={k}>{LAYER_META[k].label}</option>)}
                  </select>
                </label>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel} title="Extends the block grid beyond the collar bounding box in every direction, so blocks near the edge of the drilling aren't starved of nearby samples.">
              Padding around collars (m)
              <input type="number" min="0" step="any" value={padding} onChange={(e) => setPadding(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel}>Cell size (m, cubic)
              <input type="number" min="0.5" step="any" value={cellSize} onChange={(e) => setCellSize(Math.max(0.5, Number(e.target.value) || 10))} style={inp} />
            </label>
          </div>

          {gridPreview && (
            <div style={{ fontSize: 10.5, color: overLimit ? "#a95555" : "#94a1b0" }}>
              Grid: {gridPreview.nx} × {gridPreview.ny} × {gridPreview.nz} = {totalBlocksPreview.toLocaleString()} blocks
              {overLimit && ` — over the ${MAX_BLOCKS.toLocaleString()}-block limit. Use a larger cell size.`}
            </div>
          )}
          {!collars.length && <div style={{ fontSize: 12, color: "#55606e" }}>No collars loaded — import drillhole collars first.</div>}

          <button onClick={run} disabled={!bounds || overLimit || running || !symbol} style={{ ...btn(true), alignSelf: "flex-start", padding: "8px 16px", display: "flex", alignItems: "center", gap: 6, opacity: (!bounds || overLimit || !symbol) ? 0.5 : 1 }}>
            <Play size={13} /> {running ? "Running…" : "Run estimation"}
          </button>

          {error && <div style={{ fontSize: 11.5, color: "#a95555" }}>{error}</div>}

          {result && (
            <div style={{ padding: 10, background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5, color: "#2a3340", display: "flex", flexDirection: "column", gap: 6 }}>
              <div>{result.samplePointCount} sample point(s) placed ({result.intervalCount} interval(s), {result.droppedCount} dropped — no collar/survey to place them).</div>
              <div>{result.blocksEstimated.toLocaleString()} block(s) estimated, {result.blocksSkipped.toLocaleString()} left un-estimated (no sample within search radius / below min-samples).</div>
              {result.blocksEstimated > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <input placeholder={`${symbol} estimate (${method}, ${cellSize}m)`} value={modelName} onChange={(e) => { setModelName(e.target.value); setAdded(false); }} style={{ ...inp, flex: 1, width: "auto" }} />
                  <button onClick={addToProject} style={{ ...btn(true), padding: "7px 12px" }}>{added ? "Added ✓" : "Add as block model"}</button>
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 10, color: "#94a1b0", lineHeight: 1.5 }}>
            Nearest-neighbour and inverse-distance weighting are complete, defensible estimation methods (IDW especially for early-stage/scoping estimates), but this is NOT ordinary kriging — kriging needs a fitted variogram (nugget/sill/range) as a genuine prerequisite, which isn't built yet. A block with no sample inside its search radius is left un-estimated rather than guessed at.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const overlay = { position: "fixed", inset: 0, background: "rgba(8,10,14,0.75)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center" };
const panel = { width: "min(760px, 95vw)", maxHeight: "90vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const fieldLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit", width: 150 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
