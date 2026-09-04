import React, { useMemo, useState } from "react";
import { X, Play } from "lucide-react";
import { compositeDownhole, PRECIOUS_METALS } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js"; // TASKS.csv #266
import { samplePointsFromIntervals, samplePointsFromAssays, estimateBlockModel, MAX_BLOCKS } from "../lib/estimation.js";
import { desurveyHole } from "../lib/desurvey.js";
import { LAYER_META } from "../lib/layers.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";

// TASKS.csv #117 — grade estimation into block models (not just display). Micromine-specialist AND
// Leapfrog-specialist audits both independently flagged this as the top 3D-Modelling gap: GeoStrix
// could import/display someone else's block model but had no in-app engine to populate one FROM the
// project's own composited assays — the actual "resource estimation" step both Micromine and Leapfrog
// Edge are built around. Depends on downhole compositing (#118, implemented alongside this) as its
// input — see lib/estimation.js's top comment for why kriging isn't offered here (needs a fitted
// variogram as a genuine prerequisite, not just a harder formula dropped into the same loop).
export default function GradeEstimationModal({ assays, assayElements, layers, collars, survey, onAddModel, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
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
  const domainOptions = ["litho", "alt", "vein", "geotech"].filter((k) => (layers[k] || []).length > 0);

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
    return { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys), zmin: Math.min(...zs), zmax: Math.max(...zTops) };
  }, [collars, surveyMaxDepth]);

  const [padding, setPadding] = useState(25);
  const [cellSize, setCellSize] = useState(10);
  const [method, setMethod] = useState("idw2");
  const [searchRadius, setSearchRadius] = useState(50);
  const [minSamples, setMinSamples] = useState(1);
  const [minHoles, setMinHoles] = useState(2);          // TASKS.csv #258
  const [maxSamples, setMaxSamples] = useState(16);
  const [capValue, setCapValue] = useState(NaN);        // TASKS.csv #259
  const [includeQAQC, setIncludeQAQC] = useState(false); // TASKS.csv #266
  const [restrictToDomain, setRestrictToDomain] = useState(false); // TASKS.csv #260
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
    if (!collars.length) { setError("No collars loaded — nothing to estimate from."); return; }
    if (!bounds) { setError("None of the loaded collars has a recorded length or any survey data, so there's no defensible depth to build a grid down to. Import hole lengths or survey records first — GeoStrix will not assume one (TASKS #265)."); return; }
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
    setTimeout(() => {
      try {
        const cap = Number.isFinite(capValue) && capValue > 0 ? capValue : null; // TASKS.csv #259
        let intervals;
        if (useComposites) {
          intervals = compositeDownhole(srcAssays, symbol, unit, elementUnits, {
            length: compositeLength, minCoverage, // TASKS.csv #262 — was hardcoded 0.5
            capValue: cap,
            domainRows: domainKey ? layers[domainKey] : null,
          });
        } else {
          intervals = srcAssays
            .filter((a) => a.hole_id != null && a.from != null && a.to != null)
            .map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, avgGrade: a.values[symbol] != null ? a.values[symbol] : null }))
            .filter((iv) => iv.avgGrade != null)
            .map((iv) => (cap != null && iv.avgGrade > cap ? { ...iv, avgGrade: cap } : iv));
        }
        const { points, dropped, clamped } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole);
        if (!points.length) { setError("No sample points could be placed in 3D — check that holes have collars and (ideally) survey data."); setRunning(false); return; }
        // TASKS.csv #292 — an unbounded search makes every sample a candidate for every block
        // (measured: 81 s of blocked main thread at 62,500 blocks x 5,000 points). 0 now means "cap at
        // the grid's own diagonal", which is a mathematical no-op but a real computational bound.
        const gridDiagonal = Math.sqrt(
          (bounds.xmax - bounds.xmin) ** 2 + (bounds.ymax - bounds.ymin) ** 2 + (bounds.zmax - bounds.zmin) ** 2
        );
        const est = estimateBlockModel(points, {
          bounds, cellSize: { dx: cellSize, dy: cellSize, dz: cellSize },
          method, searchRadius: searchRadius > 0 ? searchRadius : gridDiagonal, minSamples, maxSamples,
          minHoles,                                              // TASKS.csv #258
          restrictToDomain: restrictToDomain && !!domainKey,     // TASKS.csv #260
        });
        setResult({ ...est, samplePointCount: points.length, droppedCount: dropped, clampedCount: clamped, intervalCount: intervals.length });
      } catch (e) {
        setError(e.message || "Estimation failed.");
      }
      setRunning(false);
    }, 40);
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
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
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
            <label style={fieldLabel} title="No sample within this distance of a block leaves it un-estimated (no cell), rather than extrapolating grade far from any real data. 0 = no radius assumption, capped internally at the grid's own diagonal so the run can't hang (TASKS #292).">
              Search radius (m, 0 = no limit)
              <input type="number" min="0" step="any" value={searchRadius} onChange={(e) => setSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel} title="Counts sample POINTS, not holes — one hole composited at 2m supplies ~25 of them inside a 50m radius, so this alone can never express 'more than one hole must see this block'. Use Min distinct holes for that.">Min samples/block
              <input type="number" min="1" value={minSamples} onChange={(e) => setMinSamples(Math.max(1, Number(e.target.value) || 1))} style={inp} />
            </label>
            {/* TASKS.csv #258 */}
            <label style={fieldLabel} title="A block is only estimated if samples from at least this many DISTINCT drillholes fall inside its search radius. With 1, a single intercept becomes a full search-radius sphere of 'resource' with continuity asserted rather than demonstrated. Every resource practitioner's first sanity constraint is at least two, usually three.">
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
          </div>

          {/* TASKS.csv #259 — CV > 150% means a skewed, outlier-driven distribution: the classic setup
              for an uncapped bonanza assay driving IDW² over its whole search neighbourhood. */}
          {elementCV != null && elementCV > 150 && !(Number.isFinite(capValue) && capValue > 0) && (
            <div style={{ fontSize: 11, color: "#7a4a1f", background: "#fdf4e6", border: "1px solid #edd9b7", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>
              This element's coefficient of variation is {elementCV.toFixed(0)}% — a skewed, outlier-driven
              distribution. Estimating it without a high-grade cap will overstate grade. Set a cap
              (commonly the 97.5th–99th percentile) before trusting this result.
            </div>
          )}
          {/* TASKS.csv #266 — same toggle Best Intercepts / Compositing / Grade Statistics already have. */}
          {qaqcExcludedCount > 0 && (
            <label style={{ fontSize: 11, color: "#55606e", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title="QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so a standard's own repeat-insertion grade can't bias the estimate — a field duplicate logged under its parent hole's id would otherwise be double-counted.">
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />
              Include QC samples (standards/blanks/duplicates) in this estimate — {qaqcExcludedCount} detected
            </label>
          )}
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
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11.5, color: "#55606e", cursor: "pointer" }} title="Restricts each block's candidate samples to composites carrying the same domain as the block itself (the block adopts the domain of its nearest composite). Without this, the search is a plain sphere through all the data and grade is smeared across contacts and faults.">
                  <input type="checkbox" checked={restrictToDomain} onChange={(e) => setRestrictToDomain(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>Also restrict the interpolation search to the same domain <em>(recommended)</em></span>
                </label>
                <div style={{ fontSize: 10, color: "#94a1b0", lineHeight: 1.5 }}>
                  {restrictToDomain
                    ? "Each block adopts the domain of its nearest composite and only ever sees composites from that same domain — a nearest-neighbour domain model, the simplest defensible way to give a point in space a domain from downhole-only logging. Blocks whose nearest composite has no logged domain are left un-estimated."
                    : "Selecting a domain above only stops a single composite from spanning two domains. It does NOT stop the interpolation search itself from drawing samples across a contact or a fault — that search is a plain sphere through all the data, so grade will be smeared across geological boundaries. Tick the box above to restrict the search too."}
                </div>
              </>
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
          {/* TASKS.csv #292 — warn BEFORE doing the work (the same pattern #209 used for the 10M-row
              CSV case). With no radius every block gets estimated from the whole dataset, which is
              inherently expensive however well the search is indexed. */}
          {searchRadius === 0 && totalBlocksPreview > 25000 && (
            <div style={{ fontSize: 10.5, color: "#7a4a1f", background: "#fdf4e6", border: "1px solid #edd9b7", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>
              With no search radius, every one of these {totalBlocksPreview.toLocaleString()} blocks gets
              estimated from the whole dataset — this run can take a minute or more and the window will be
              unresponsive while it does. It is also rarely what you want: a block with no sample anywhere
              near it still gets a grade. Set a real search radius (50 m is the default) unless you
              specifically want an unbounded first pass.
            </div>
          )}
          {!collars.length && <div style={{ fontSize: 12, color: "#55606e" }}>No collars loaded — import drillhole collars first.</div>}

          {/* TASKS.csv #265 — the refusal path used to live ONLY in run()'s setError, which is
              unreachable: the same !bounds condition disables the Run button, so a user whose collars
              have no length and no survey got a greyed-out button and no explanation at all. Caught by
              live verification with length-less collars (the original pass checked this branch by code
              trace only, and the sample dataset can't trigger it — every Harry collar has a length).
              Stated inline instead, so the reason is visible without clicking anything. */}
          {collars.length > 0 && !bounds && (
            <div style={{ fontSize: 11.5, color: "#7a4a1f", background: "#fdf4e6", border: "1px solid #edd9b7", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>
              None of the {collars.length} loaded collar(s) has a recorded length or any survey record, so
              there's no defensible depth to build a grid down to. Import hole lengths or survey data first —
              GeoStrix won't assume one (earlier versions silently assumed 300 m).
            </div>
          )}
          {/* Also surfaced BEFORE a run, not just in the result block, so a partially-length-less
              dataset is visible while setting parameters rather than only afterwards. */}
          {bounds && collarsWithoutDepth > 0 && (
            <div style={{ fontSize: 11, color: "#7a4a1f", lineHeight: 1.45 }}>
              {collarsWithoutDepth} of {collars.length} collar(s) have no recorded length and no survey record —
              they contribute nothing to the grid's depth extent.
            </div>
          )}

          <button onClick={run} disabled={!bounds || overLimit || running || !symbol} style={{ ...btn(true), alignSelf: "flex-start", padding: "8px 16px", display: "flex", alignItems: "center", gap: 6, opacity: (!bounds || overLimit || !symbol) ? 0.5 : 1 }}>
            <Play size={13} /> {running ? "Running…" : "Run estimation"}
          </button>

          {error && <div style={{ fontSize: 11.5, color: "#a95555" }}>{error}</div>}

          {result && (
            <div style={{ padding: 10, background: "#f4f5f7", border: "1px solid #d9dce1", borderRadius: 6, fontSize: 11.5, color: "#2a3340", display: "flex", flexDirection: "column", gap: 6 }}>
              <div>{result.samplePointCount} sample point(s) placed ({result.intervalCount} interval(s), {result.droppedCount} dropped — no collar/survey to place them{result.clampedCount ? `; ${result.clampedCount} negative grade(s) clamped to zero` : ""}).</div>
              <div>{result.blocksEstimated.toLocaleString()} block(s) estimated, {result.blocksSkipped.toLocaleString()} left un-estimated (no sample within search radius / below min-samples / below min distinct holes).</div>
              {/* TASKS.csv #258 */}
              {result.singleHoleCells > 0 && (
                <div style={{ color: "#7a4a1f" }}>
                  {result.singleHoleCells.toLocaleString()} of the estimated blocks ({((result.singleHoleCells / Math.max(1, result.blocksEstimated)) * 100).toFixed(0)}%) were informed by only ONE drillhole — continuity there is asserted, not demonstrated. Raise "Min distinct holes per block" to exclude them.
                </div>
              )}
              {/* TASKS.csv #265 */}
              {collarsWithoutDepth > 0 && (
                <div style={{ color: "#7a4a1f" }}>
                  {collarsWithoutDepth} collar(s) have no recorded length and no survey record — they contributed nothing to the grid's depth extent (rather than a silently assumed 300 m, which is what earlier versions did).
                </div>
              )}
              {result.blocksEstimated > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <input placeholder={`${symbol} estimate (${method}, ${cellSize}m)`} value={modelName} onChange={(e) => { setModelName(e.target.value); setAdded(false); }} style={{ ...inp, flex: 1, width: "auto" }} />
                  <button onClick={addToProject} style={{ ...btn(true), padding: "7px 12px" }}>{added ? "Added ✓" : "Add as block model"}</button>
                </div>
              )}
            </div>
          )}

          {/* TASKS.csv #269 — the closing paragraph now names every assumption the estimate actually
              makes, not just the missing-kriging one. */}
          <div style={{ fontSize: 10.5, color: "#7a4a1f", background: "#fdf4e6", border: "1px solid #edd9b7", borderRadius: 6, padding: "8px 9px", lineHeight: 1.5 }}>
            <strong>Not a resource estimate.</strong> This is an interpolated block model to help you
            visualise and target mineralisation. Nothing it produces is a Mineral Resource under
            NI 43-101 or JORC, and it must not be reported publicly as one — that requires an estimate
            prepared by a Qualified Person.
          </div>
          <div style={{ fontSize: 10, color: "#94a1b0", lineHeight: 1.5 }}>
            Nearest-neighbour and inverse-distance weighting are complete, defensible estimation methods (IDW especially for early-stage/scoping estimates), but this is NOT ordinary kriging — kriging needs a fitted variogram (nugget/sill/range) as a genuine prerequisite, which isn't built yet. A block with no sample inside its search radius is left un-estimated rather than guessed at.
            {" "}The search is <strong>isotropic</strong> (a plain sphere — no anisotropy or trend), there is
            no declustering, no variogram, and no classification. Domain control applies only if you both
            select a domain layer and tick "restrict the interpolation search"; high-grade capping applies
            only if you enter a cap. Every one of those is an assumption you are making, not a property
            of the data.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #d9dce1" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const panel = { width: "min(760px, 95vw)", maxHeight: "90vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" };
const header = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const fieldLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit", width: 150 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
