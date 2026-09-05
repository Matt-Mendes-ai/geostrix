import React, { useMemo, useState } from "react";
import { X, Play } from "lucide-react";
import { compositeDownhole } from "../lib/geochem.js";
import { excludeQAQC } from "../lib/qaqc.js"; // TASKS.csv #266 — same QAQC exclusion the estimator uses
import { samplePointsFromIntervals } from "../lib/estimation.js";
import { desurveyHole } from "../lib/desurvey.js";
import {
  experimentalVariogram, fitVariogramModel, variogramModelValue, VARIOGRAM_MODELS,
  VALUE_TRANSFORMS, applyValueTransform, groupPointsByDomain, suggestLagDistance,
} from "../lib/variogram.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #135 — project desurvey method

// TASKS.csv #147 — variogram / spatial-continuity analysis per domain.
//
// This modal is the missing prerequisite that estimation.js's header and GradeEstimationModal both
// name explicitly: "kriging needs a fitted variogram model (nugget/sill/range from an experimental
// variogram the user would build and fit interactively) as a genuine prerequisite step". This builds
// and fits that variogram. It does NOT make GeoStrix a kriging engine, and the copy in here is written
// to keep saying so — TASKS.csv #257-#270 (the NI 43-101/QP review) did deliberate work to stop this
// app implying more rigour than it has, and a variogram plot is exactly the kind of screen that could
// quietly undo that. Nothing here is wired into makeCellEstimator; the estimators remain NN/IDW.
//
// What a user gets out of it, honestly stated: a defensible search radius (the fitted range), a
// nugget/sill ratio (how much of the variability is unresolvable short-scale noise), and directional
// ranges to check the anisotropy azimuth/dip they'd otherwise be typing in from geological judgement
// alone. Those are real, immediately usable numbers for the tools that DO exist.
export default function VariogramModal({ assays, assayElements, layers, collars, survey, onClose }) {
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  // TASKS.csv #135 — the variogram must be computed on sample points sitting on the SAME traces the
  // 3D view and the estimator use. This modal and #135's selectable desurvey method were built by two
  // agents working concurrently, so this caller was written against the pre-#135 4-argument signature
  // and silently fell back to the default method — meaning a project set to, say, tangential would
  // have had its variogram computed on minimum-curvature traces. Same store field GradeEstimationModal
  // reads.
  const { desurveyMethod } = useStore();

  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  const symbols = assayElements.map((e) => e.symbol);
  const [symbol, setSymbol] = useState(symbols[0] || "Au");
  const unit = elementUnits[symbol] || "ppm";

  // --- input / compositing (mirrors GradeEstimationModal so the variogram characterises the SAME
  // support the estimator would consume; see the module header of lib/variogram.js for why a variogram
  // over ragged raw intervals is not meaningful) ---
  const [compositeLength, setCompositeLength] = useState(2);
  const [minCoverage, setMinCoverage] = useState(0.5);
  const [domainKey, setDomainKey] = useState("");
  const [domainValue, setDomainValue] = useState("__all__");
  const domainOptions = ["litho", "alt", "vein", "geotech"].filter((k) => (layers[k] || []).length > 0);

  const [transform, setTransform] = useState("none");
  const [capPercentile, setCapPercentile] = useState(98);

  // --- variogram parameters ---
  const [lagDistance, setLagDistance] = useState(0); // 0 => use the suggested value
  const [nLags, setNLags] = useState(12);
  const [lagTolerance, setLagTolerance] = useState(0.5);
  const [holeMode, setHoleMode] = useState("all");
  const [directional, setDirectional] = useState(false);
  const [azimuth, setAzimuth] = useState(0);
  const [dip, setDip] = useState(0);
  const [angleTol, setAngleTol] = useState(22.5);
  const [bandwidth, setBandwidth] = useState(0); // 0 => none
  const [model, setModel] = useState("spherical");

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const srcAssays = useMemo(() => excludeQAQC(assays), [assays]);

  // Distinct values of the chosen domain layer, so a user can run one domain at a time — the whole
  // point of the row ("per domain"): a variogram mixing two geologically different populations
  // measures the contrast between them, not the continuity within either.
  const domainValues = useMemo(() => {
    if (!domainKey) return [];
    const s = new Set();
    (layers[domainKey] || []).forEach((r) => { if (r.value != null && r.value !== "") s.add(String(r.value)); });
    return Array.from(s).sort();
  }, [domainKey, layers]);

  const run = () => {
    setError(""); setResult(null); setRunning(true);
    // Deferred so "Running…" actually paints before the O(n^2) pair loop blocks the main thread. A
    // timer, not requestAnimationFrame — rAF never fires in a hidden window, which strands the run
    // forever (the exact bug TASKS.csv #258's verification found in GradeEstimationModal).
    setTimeout(() => {
      try {
        const intervals = compositeDownhole(srcAssays, symbol, unit, elementUnits, {
          length: compositeLength, minCoverage,
          domainRows: domainKey ? layers[domainKey] : null,
        });
        if (!intervals.length) { setError("Compositing produced no intervals — check the element and composite length."); setRunning(false); return; }
        const { points: allPoints, dropped } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        if (!allPoints.length) { setError("No composite could be placed in 3D — check that holes have collars and (ideally) survey data."); setRunning(false); return; }

        let points = allPoints;
        let domainLabel = null;
        if (domainKey && domainValue !== "__all__") {
          const grouped = groupPointsByDomain(allPoints);
          points = grouped.get(domainValue === "__none__" ? null : domainValue) || [];
          domainLabel = domainValue === "__none__" ? "(no domain)" : domainValue;
          if (points.length < 20) {
            setError(`Domain "${domainLabel}" has only ${points.length} composites — too few for a variogram worth reading (a lag bin needs ~30 pairs to mean anything).`);
            setRunning(false); return;
          }
        }

        const { points: tPoints, capValue } = applyValueTransform(points, transform, capPercentile);
        const suggested = suggestLagDistance(tPoints);
        const lag = lagDistance > 0 ? lagDistance : Math.max(1, Math.round(suggested || 10));

        const direction = directional
          ? { azimuth, dip, angleTol, bandwidth: bandwidth > 0 ? bandwidth : null }
          : null;
        const vg = experimentalVariogram(tPoints, { lagDistance: lag, nLags, lagTolerance, holeMode, direction });
        const fit = fitVariogramModel(vg.bins, { model });
        setResult({
          vg, fit, lag, suggested, capValue, domainLabel,
          nComposites: points.length, dropped, transform, model,
          nIntervals: intervals.length,
        });
      } catch (e) {
        setError(e.message || "Variogram calculation failed.");
      }
      setRunning(false);
    }, 40);
  };

  // ---------------------------------------------------------------------------------------------
  // Plot. Plain inline SVG (no chart dependency — same approach as the other small plots in here).
  const plot = useMemo(() => {
    if (!result) return null;
    const { vg, fit } = result;
    const pts = vg.bins.filter((b) => b.gamma != null);
    if (!pts.length) return null;
    const W = 640, H = 300, ML = 62, MR = 14, MT = 12, MB = 40;
    const xMax = Math.max(...pts.map((b) => b.h)) * 1.05;
    const yMax = Math.max(Math.max(...pts.map((b) => b.gamma)), vg.variance, fit ? fit.sill : 0) * 1.12 || 1;
    const X = (h) => ML + (h / xMax) * (W - ML - MR);
    const Y = (g) => H - MB - (g / yMax) * (H - MT - MB);
    const maxPairs = Math.max(...pts.map((b) => b.nPairs));
    const curve = fit
      ? Array.from({ length: 121 }, (_, i) => {
          const h = (xMax * i) / 120;
          return `${i === 0 ? "M" : "L"}${X(h).toFixed(1)},${Y(variogramModelValue(h, { model: fit.model, nugget: fit.nugget, sill: fit.sill, range: fit.range })).toFixed(1)}`;
        }).join(" ")
      : null;
    const fmtY = (v) => (yMax < 0.01 ? v.toExponential(1) : yMax < 10 ? v.toFixed(3) : v.toFixed(0));
    return { W, H, ML, MR, MT, MB, xMax, yMax, X, Y, pts, maxPairs, curve, fmtY };
  }, [result]);

  const nPairsLow = result && result.vg.bins.some((b) => b.nPairs > 0 && b.nPairs < 30);
  const fitWeak = result && result.fit && result.fit.rSquared != null && result.fit.rSquared < 0.5;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panelStyle} role="dialog" aria-modal="true" aria-label="Variogram analysis" onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: 15, color: "#8a6a1f", fontWeight: 600 }}>Variogram — spatial continuity</div>
            <div style={{ fontSize: 11, color: "#94a1b0", marginTop: 2 }}>
              Experimental variogram + fitted nugget / sill / range, from composited assays. {collars.length} holes, {assays.length} raw intervals loaded.
            </div>
          </div>
          <X size={18} style={{ cursor: "pointer", color: "#55606e" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* The honesty banner. Deliberately the first thing on the screen, and deliberately not
              softened: TASKS.csv #257-#270 made the estimation UI stop implying rigour it doesn't
              have, and this screen is the one most likely to be mistaken for "GeoStrix does kriging". */}
          <div style={noteBox("#f6f8fb", "#a9c6e0")}>
            <b>This is a diagnostic, not an estimator.</b> GeoStrix computes and fits a variogram here so you can
            see and measure a domain's grade continuity. It does <b>not</b> perform ordinary kriging: nothing on this
            screen is fed into the grade estimator, which remains nearest-neighbour / inverse-distance. Fitting a
            model here does not change any estimate you have run or will run.
            <div style={{ marginTop: 6 }}>
              What the numbers are genuinely good for: the <b>range</b> is a defensible search radius (past it, a
              sample tells you nothing about a block); the <b>nugget / sill ratio</b> is how much of the variability
              is short-scale noise no smooth interpolation can recover; and comparing ranges in two directions is the
              measured version of the anisotropy ratio the Modeling tab otherwise asks you to judge by eye.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>Element
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inp}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({elementUnits[s] || "ppm"})</option>)}
              </select>
            </label>
            <label style={fieldLabel} title="A variogram assumes a common support — every sample the same volume. Compositing to a fixed length is what provides that; raw ragged intervals do not.">
              Composite length (m)
              <input type="number" min="0.1" step="any" value={compositeLength} onChange={(e) => setCompositeLength(Math.max(0.1, Number(e.target.value) || 2))} style={inp} />
            </label>
            <label style={fieldLabel} title="Minimum fraction of a composite that must be covered by real assay material.">
              Min coverage (0-1)
              <input type="number" min="0" max="1" step="0.05" value={minCoverage} onChange={(e) => setMinCoverage(Math.min(1, Math.max(0, Number(e.target.value) || 0)))} style={inp} />
            </label>
            <label style={fieldLabel}>Domain layer
              <select value={domainKey} onChange={(e) => { setDomainKey(e.target.value); setDomainValue("__all__"); }} style={inp}>
                <option value="">(none)</option>
                {domainOptions.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            {domainKey && (
              <label style={fieldLabel} title="A variogram over two geologically different populations measures the contrast between them, not the continuity within either — run one domain at a time.">
                Domain
                <select value={domainValue} onChange={(e) => setDomainValue(e.target.value)} style={inp}>
                  <option value="__all__">All domains together</option>
                  {domainValues.map((v) => <option key={v} value={v}>{v}</option>)}
                  <option value="__none__">(unassigned)</option>
                </select>
              </label>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel} title="The Matheron estimator squares differences, so a few very high grades can dominate every lag bin and hide real structure. Verified on the bundled Harry-property Zn data: raw r-squared 0.03, log-transformed 0.95, same points.">
              Value transform
              <select value={transform} onChange={(e) => setTransform(e.target.value)} style={inp}>
                {Object.entries(VALUE_TRANSFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            {transform === "cap" && (
              <label style={fieldLabel}>Cap percentile
                <input type="number" min="50" max="100" step="0.5" value={capPercentile} onChange={(e) => setCapPercentile(Math.min(100, Math.max(50, Number(e.target.value) || 98)))} style={inp} />
              </label>
            )}
            <label style={fieldLabel} title="Bin width. Leave 0 to use the median nearest-neighbour spacing — the finest structure the data can actually resolve.">
              Lag distance (m, 0 = auto)
              <input type="number" min="0" step="any" value={lagDistance} onChange={(e) => setLagDistance(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel} title="Number of lag bins. lags x lag distance should be about half the field's extent — beyond that, pair counts collapse and the plot is noise.">
              Number of lags
              <input type="number" min="3" max="60" step="1" value={nLags} onChange={(e) => setNLags(Math.min(60, Math.max(3, Math.round(Number(e.target.value) || 12))))} style={inp} />
            </label>
            <label style={fieldLabel} title="Half-width of a bin as a fraction of the lag distance. 0.5 = contiguous bins (the usual choice).">
              Lag tolerance
              <input type="number" min="0.1" max="1" step="0.05" value={lagTolerance} onChange={(e) => setLagTolerance(Math.min(1, Math.max(0.1, Number(e.target.value) || 0.5)))} style={inp} />
            </label>
            <label style={fieldLabel} title="Downhole-only pairs are the classic way to resolve the nugget — only samples in the same hole get close enough together to see it.">
              Pairs
              <select value={holeMode} onChange={(e) => setHoleMode(e.target.value)} style={inp}>
                <option value="all">All pairs</option>
                <option value="downhole">Downhole only (resolves nugget)</option>
                <option value="between">Between holes only</option>
              </select>
            </label>
            <label style={fieldLabel}>Model
              <select value={model} onChange={(e) => setModel(e.target.value)} style={inp}>
                {Object.entries(VARIOGRAM_MODELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#55606e", cursor: "pointer" }}>
              <input type="checkbox" checked={directional} onChange={(e) => setDirectional(e.target.checked)} />
              Directional variogram (same azimuth / dip convention as the anisotropy and search-ellipsoid fields)
            </label>
            {directional && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                <label style={fieldLabel}>Azimuth (deg)
                  <input type="number" step="any" value={azimuth} onChange={(e) => setAzimuth(Number(e.target.value) || 0)} style={inp} />
                </label>
                <label style={fieldLabel}>Dip (deg below horizontal)
                  <input type="number" step="any" value={dip} onChange={(e) => setDip(Number(e.target.value) || 0)} style={inp} />
                </label>
                <label style={fieldLabel} title="Half-angle of the cone of accepted pair directions. Too tight and there are no pairs; too wide and the direction means nothing.">
                  Angular tolerance (deg)
                  <input type="number" min="1" max="89" step="any" value={angleTol} onChange={(e) => setAngleTol(Math.min(89, Math.max(1, Number(e.target.value) || 22.5)))} style={inp} />
                </label>
                <label style={fieldLabel} title="Caps how far a pair may sit off the direction line. Without it, a wide cone swallows far off-axis pairs at long lags. 0 = no cap.">
                  Bandwidth (m, 0 = none)
                  <input type="number" min="0" step="any" value={bandwidth} onChange={(e) => setBandwidth(Math.max(0, Number(e.target.value) || 0))} style={inp} />
                </label>
              </div>
            )}
            {directional && (
              <div style={{ fontSize: 10.5, color: "#94a1b0", marginTop: 6 }}>
                Directional variograms use far fewer pairs than an omnidirectional one, so they are much noisier — check the
                pair counts and the fit quality below before believing a directional range.
              </div>
            )}
          </div>

          <button onClick={run} disabled={running || !symbols.length} style={{ ...btn(true), display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: running || !symbols.length ? 0.6 : 1 }}>
            <Play size={13} /> {running ? "Running…" : "Compute variogram"}
          </button>

          {error && <div style={noteBox("#fbf0f0", "#e0a9a9")}>{error}</div>}

          {result && plot && (
            <>
              <div style={{ fontSize: 11, color: "#55606e" }}>
                {result.nComposites.toLocaleString()} composites{result.domainLabel ? ` in domain "${result.domainLabel}"` : ""}
                {result.vg.subsampled ? ` (subsampled to ${result.vg.nPoints.toLocaleString()} for the pair loop)` : ""}
                {" · "}{result.vg.nPairsUsed.toLocaleString()} pairs used · lag {result.lag} m
                {result.suggested != null ? ` (suggested ${result.suggested.toFixed(1)} m)` : ""}
                {result.dropped ? ` · ${result.dropped} composites could not be placed in 3D` : ""}
                {result.capValue != null ? ` · capped at ${result.capValue}` : ""}
              </div>

              {/* flexShrink: 0 + an explicit aspectRatio are both load-bearing, not decoration. This
                  modal's body is a `display:flex; flexDirection:column` container, and an SVG with only
                  width="100%" and a viewBox has no intrinsic height a flex item can be sized from — it
                  collapsed to 811 x 2 px in the live check, drawing the whole plot into a 2-pixel strip
                  while every element was technically present in the DOM. */}
              <svg
                width="100%"
                viewBox={`0 0 ${plot.W} ${plot.H}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ display: "block", width: "100%", height: "auto", aspectRatio: `${plot.W} / ${plot.H}`, flexShrink: 0, background: "#fafbfc", border: "1px solid #d9dce1", borderRadius: 6 }}
              >
                {/* axes */}
                <line x1={plot.ML} y1={plot.H - plot.MB} x2={plot.W - plot.MR} y2={plot.H - plot.MB} stroke="#c7ccd3" />
                <line x1={plot.ML} y1={plot.MT} x2={plot.ML} y2={plot.H - plot.MB} stroke="#c7ccd3" />
                {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                  const g = plot.yMax * f;
                  return (
                    <g key={f}>
                      <line x1={plot.ML} y1={plot.Y(g)} x2={plot.W - plot.MR} y2={plot.Y(g)} stroke="#eef0f3" />
                      <text x={plot.ML - 6} y={plot.Y(g) + 3} textAnchor="end" fontSize="9" fill="#94a1b0">{plot.fmtY(g)}</text>
                    </g>
                  );
                })}
                {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                  const h = plot.xMax * f;
                  return <text key={f} x={plot.X(h)} y={plot.H - plot.MB + 14} textAnchor="middle" fontSize="9" fill="#94a1b0">{h.toFixed(0)}</text>;
                })}
                <text x={(plot.ML + plot.W - plot.MR) / 2} y={plot.H - 6} textAnchor="middle" fontSize="10" fill="#55606e">Lag distance h (m)</text>
                <text x={12} y={(plot.MT + plot.H - plot.MB) / 2} textAnchor="middle" fontSize="10" fill="#55606e" transform={`rotate(-90 12 ${(plot.MT + plot.H - plot.MB) / 2})`}>Semivariance γ(h)</text>

                {/* population variance — the level a stationary variable's variogram should flatten at */}
                <line x1={plot.ML} y1={plot.Y(result.vg.variance)} x2={plot.W - plot.MR} y2={plot.Y(result.vg.variance)} stroke="#94a1b0" strokeDasharray="4 3" />
                <text x={plot.W - plot.MR - 4} y={plot.Y(result.vg.variance) - 4} textAnchor="end" fontSize="9" fill="#94a1b0">population variance</text>

                {/* fitted model */}
                {plot.curve && <path d={plot.curve} fill="none" stroke="#e2a63c" strokeWidth="2" />}
                {result.fit && result.fit.range < plot.xMax && (
                  <line x1={plot.X(result.fit.range)} y1={plot.MT} x2={plot.X(result.fit.range)} y2={plot.H - plot.MB} stroke="#e2a63c" strokeDasharray="3 3" opacity="0.7" />
                )}

                {/* experimental points, radius scaled by pair count (a lag built from 12 pairs is not
                    the same measurement as one built from 4,000, and the plot should show that) */}
                {plot.pts.map((b, i) => (
                  <circle key={i} cx={plot.X(b.h)} cy={plot.Y(b.gamma)} r={3 + 4 * Math.sqrt(b.nPairs / plot.maxPairs)}
                    fill={b.nPairs >= 30 ? "#4a9be0" : "#d98f8f"} opacity="0.85">
                    <title>{`h = ${b.h.toFixed(1)} m\nγ = ${b.gamma.toPrecision(4)}\n${b.nPairs.toLocaleString()} pairs${b.nPairs < 30 ? " (under 30 — not a reliable measurement)" : ""}`}</title>
                  </circle>
                ))}
              </svg>

              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12, color: "#1a2028" }}>
                {result.fit ? (
                  <>
                    <Stat label="Nugget" value={fmtNum(result.fit.nugget)} />
                    <Stat label="Sill" value={fmtNum(result.fit.sill)} />
                    <Stat label="Range" value={`${result.fit.range.toFixed(1)} m`} />
                    <Stat label="Nugget / sill" value={result.fit.nuggetRatio != null ? `${(result.fit.nuggetRatio * 100).toFixed(0)}%` : "—"} />
                    <Stat label="Fit r²" value={result.fit.rSquared != null ? result.fit.rSquared.toFixed(3) : "—"} />
                    <Stat label="Model" value={VARIOGRAM_MODELS[result.fit.model]?.label || result.fit.model} />
                  </>
                ) : <div style={{ color: "#94a1b0" }}>Too few usable lag bins to fit a model.</div>}
              </div>

              {result.fit && (
                <div style={{ fontSize: 11, color: "#55606e", lineHeight: 1.55 }}>
                  {VARIOGRAM_MODELS[result.fit.model]?.note}
                  {" "}The fit is a weighted least-squares starting point, not an answer — read the plot and override it if
                  the curve does not follow the points you trust.
                </div>
              )}

              {result.transform !== "none" && (
                <div style={noteBox("#fdf7ea", "#e2a63c")}>
                  <b>Transformed values ({VALUE_TRANSFORMS[result.transform].label}).</b> {VALUE_TRANSFORMS[result.transform].note}
                  {result.transform === "log" && " In particular, do not quote this sill as a grade variance — back-transforming it correctly needs a lognormal correction GeoStrix does not apply."}
                  {" "}The <b>range</b> is still a distance in metres and is the number to carry into a search radius.
                </div>
              )}

              {nPairsLow && (
                <div style={noteBox("#fdf7ea", "#e2a63c")}>
                  Some lag bins hold fewer than 30 pairs (shown in red). Below about 30 pairs a lag is not a measurement —
                  Journel &amp; Huijbregts' standard caution. Widen the lag distance, loosen the angular tolerance, or read
                  only out to <b>{result.vg.maxReliableLag} m</b>, the furthest lag that clears 30 pairs contiguously.
                </div>
              )}

              {fitWeak && (
                <div style={noteBox("#fdf7ea", "#e2a63c")}>
                  <b>Weak fit (r² = {result.fit.rSquared.toFixed(3)}).</b> The experimental points do not follow a
                  {" "}{VARIOGRAM_MODELS[result.fit.model]?.label.toLowerCase()} shape well, so the nugget / sill / range above are not
                  meaningfully constrained. That is itself a result: a flat variogram near the population variance means this
                  variable has no resolvable spatial structure at these lags, and any smoothly interpolated shell of it is
                  drawing continuity the data does not support. Try a value transform, a different domain, or a smaller lag.
                </div>
              )}

              {result.fit && result.fit.nuggetRatio != null && result.fit.nuggetRatio > 0.5 && !fitWeak && (
                <div style={noteBox("#fdf7ea", "#e2a63c")}>
                  <b>High nugget ({(result.fit.nuggetRatio * 100).toFixed(0)}% of the sill).</b> Over half the variability is
                  short-scale noise that no interpolation can recover. Estimates of this variable will be smooth because the
                  method smooths, not because the grade is continuous — treat any resulting shell with corresponding caution.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #d9dce1", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...btn(false), padding: "8px 20px" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "#94a1b0" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#1a2028" }}>{value}</div>
    </div>
  );
}

function fmtNum(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a < 0.001 || a >= 1e6) return v.toExponential(2);
  if (a < 1) return v.toPrecision(3);
  if (a < 1000) return v.toFixed(2);
  return v.toFixed(0);
}

const noteBox = (bg, border) => ({ background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "9px 11px", fontSize: 11, color: "#55606e", lineHeight: 1.55 });
const panelStyle = { width: "min(860px, 95vw)", maxHeight: "92vh", background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const headerStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid #d9dce1" };
const fieldLabel = { fontSize: 10.5, color: "#55606e", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "#ffffff", border: "1px solid #d9dce1", borderRadius: 6, padding: "6px 8px", color: "#1a2028", fontSize: 12, fontFamily: "inherit", width: 150 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: 12, cursor: "pointer", border: primary ? "1px solid #3d6b52" : "1px solid #c7ccd3", background: primary ? "#1e3629" : "transparent", color: primary ? "#8fd9ab" : "#55606e" });
