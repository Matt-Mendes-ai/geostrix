import { LAYER_META } from "../lib/layers.js"; // TASKS.csv #1215
import CompositeLengthNote from "./CompositeLengthNote.jsx"; // TASKS.csv #2549
import React, { useEffect, useMemo, useRef, useState } from "react";
import { makeVariogramClient } from "../lib/variogramClient.js"; // TASKS.csv #3009 — the pair loop in a worker
import { X, Play } from "./icons.js";
import { gradeUnitLabel } from "../lib/geochem.js";
import { compositeDownholeSliced, samplePointsSliced } from "../lib/compositeSliced.js"; // TASKS.csv #3111 — compositing and placing in slices of holes // gradeUnitLabel: #2429
import { sendVariogramToEstimation } from "../lib/estimateMemory.js"; // TASKS.csv #3273
import { excludeQAQC, labAssays } from "../lib/qaqc.js"; // TASKS.csv #266 — same QAQC exclusion the estimator uses; labAssays: #1744
import { preferredElement, rememberElement } from "../lib/preferredElement.js"; // TASKS.csv #2552
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // TASKS.csv #2552
import { makeRunCache } from "../lib/runCache.js"; // TASKS.csv #3061
import { desurveyHole } from "../lib/desurvey.js";
import {
  fitVariogramModel, /* experimentalVariogram, directionRow: in the worker since #3009 */ MIN_HOLE_PAIRS /* #3285 */, variogramModelValue, VARIOGRAM_MODELS, verticalShare /* #3015 */,
  VALUE_TRANSFORMS, applyValueTransform, groupPointsByDomain, suggestLagDistance, suggestBetweenHoleLag, variogramStationarity, siteSpacingLag, lagsShortOfSpacing, downholeLinePoints /* #1843 */, DIRECTION_TABLE, longestDirection /* #1996 */ } from "../lib/variogram.js";
import { holeSpacingSummary } from "../lib/holeSpacing.js"; // TASKS.csv #2221
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay, backdropProps } from "../lib/modalStyles.js";
import { useStore } from "../lib/store.jsx"; // TASKS.csv #135 — project desurvey method
import { cleanTrend, trendBasis } from "../lib/trend.js"; // TASKS.csv #2424 — the block-estimation trend's plane
import { surfaceElevation, flattenOnSurface } from "../lib/flattenOnSurface.js"; // TASKS.csv #2710 — pairs below a modelled contact
import { surfaceOptionLabels } from "../lib/viewer/surfaceLabels.js"; // #2710 — repeated surface names told apart
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { fontSizes } from "../lib/theme.js"; // TASKS.csv #385 — SVG font-size attributes on the type scale
import { t as tr } from "../lib/i18n.js"; // TASKS.csv #786
import { noCollarsNotice } from "../lib/noCollars.js"; // TASKS.csv #1841
import { domainLayerChoices, foldDomainRows } from "../lib/domainLayers.js"; // TASKS.csv #1571; foldDomainRows: #2427
import UnsampledChoice, { useUnsampled, unsampledResultLine } from "./UnsampledChoice.jsx"; // TASKS.csv #2417 / #2542

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
export default function VariogramModal({ assays: assaysAll, assayElements, layers, collars, survey, onClose, checkedHoleIds = null, modelArea = null /* #2544 */ }) {
  // TASKS.csv #2544 — the samples from the checked holes, by default when Model area says so (the Grade shell's and the estimate's rule)
  const checkedN = checkedHoleIds ? collars.filter((c) => checkedHoleIds.has(c.hole_id)).length : collars.length;
  const [samplesFrom, setSamplesFrom] = useState(() => (modelArea === "checked" && checkedHoleIds?.size ? "checked" : "all"));
  const assays = useMemo(() => (samplesFrom === "checked" && checkedHoleIds?.size ? assaysAll.filter((a) => checkedHoleIds.has(a.hole_id)) : assaysAll), [assaysAll, samplesFrom, checkedHoleIds]);
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  // TASKS.csv #135 — the variogram must be computed on sample points sitting on the SAME traces the
  // 3D view and the estimator use. This modal and #135's selectable desurvey method were built by two
  // agents working concurrently, so this caller was written against the pre-#135 4-argument signature
  // and silently fell back to the default method — meaning a project set to, say, tangential would
  // have had its variogram computed on minimum-curvature traces. Same store field GradeEstimationModal
  // reads.
  const { desurveyMethod, customLayers = [], structuralTrends, generatedSurfaces = [], project } = useStore(); // project: #3273 // customLayers: TASKS.csv #1571; structuralTrends: #2424 (read only); generatedSurfaces: #2710
  // TASKS.csv #2710 — a generated surface (a Top of a unit) the in-plane pairs may follow: the composites flattened on it
  const flatSurfaces = useMemo(() => generatedSurfaces.filter((x) => x.vertices?.length >= 9 && x.indices?.length >= 3), [generatedSurfaces]);
  const flatLabels = useMemo(() => surfaceOptionLabels(flatSurfaces), [flatSurfaces]);
  // TASKS.csv #2424 — the trend chosen for block estimation, whose plane (normal = its minor axis) the in-plane pairs may follow
  const estTrend = useMemo(() => { const id = structuralTrends?.use?.estimation; const t = id && (structuralTrends.trends || []).find((x) => x.id === id); return t ? cleanTrend(t) : null; }, [structuralTrends]);

  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  // TASKS.csv #1744 — only elements with a lab value; #2552 / #2429 — the element last used here, else the project's lead commodity
  const symbols = useMemo(() => { const has = new Set(); for (const a of excludeQAQC(labAssays(assays || []))) for (const k in a.values || {}) if (Number.isFinite(a.values[k])) has.add(k); return assayElements.map((e) => e.symbol).filter((s) => has.has(s)); }, [assayElements, assays]);
  const lead = useLeadCommodity();
  const [symbol, setSymbolRaw] = useState(() => preferredElement(symbols, "variogram", lead) || symbols[0] || "Au");
  const setSymbol = (v) => { setSymbolRaw(v); rememberElement("variogram", v); };
  const unit = elementUnits[symbol] || "ppm";
  const [sentToEst, setSentToEst] = useState(null); // TASKS.csv #3273
  // TASKS.csv #3273 — a semivariance with separators and its squared unit (the review read 'nugget 22800000' with none); transformed values have no grade unit
  const semi = (v) => { const t = Number.isFinite(v) && Math.abs(v) >= 1000 && Math.abs(v) < 1e15 ? Math.round(v).toLocaleString() : fmtNum(v); return result?.transform === "none" && Number.isFinite(v) ? `${t} ${gradeUnitLabel(symbol, unit)}²` : t; };

  // --- input / compositing (mirrors GradeEstimationModal so the variogram characterises the SAME
  // support the estimator would consume; see the module header of lib/variogram.js for why a variogram
  // over ragged raw intervals is not meaningful) ---
  const [compositeLength, setCompositeLength] = useState(2);
  const [minCoverage, setMinCoverage] = useState(0.5);
  const [domainKey, setDomainKey] = useState("");
  const [domainValue, setDomainValue] = useState("__all__");
  // TASKS.csv #1413 (review #1352) — a layer of numbers (Silvertip's RQD %) is not a domain: every distinct value became one
  // TASKS.csv #1571 (review #1497, Lawyers) — custom layers (Lawyers' Min Domain) are domains too
  const domainChoices = useMemo(() => domainLayerChoices(layers, customLayers, (k) => tr(LAYER_META[k]?.label || k)), [layers, customLayers]);
  const domainChoice0 = domainChoices.find((c) => c.key === domainKey) || null;
  const domainFold = useMemo(() => (domainChoice0 ? foldDomainRows(domainChoice0.rows) : null), [domainChoice0]); // #2427
  const domainChoice = domainChoice0 && domainFold ? { ...domainChoice0, rows: domainFold.rows } : domainChoice0;

  const [transform, setTransform] = useState("none");
  const [estimator, setEstimator] = useState("matheron"); // TASKS.csv #1996
  const lastRun = React.useRef(null); // #1996 — the last run's points and settings, for the direction table
  // TASKS.csv #3061 — the composites (and the points the variogram pairs) kept between Compute presses while what makes them is the same:
  // the same points array also goes to the worker only once (lib/variogramClient.js names it by identity)
  const compCache = React.useRef(null), pointCache = React.useRef(null), flatCache = React.useRef(null);
  if (!compCache.current) { compCache.current = makeRunCache(); pointCache.current = makeRunCache(); flatCache.current = makeRunCache(); }
  const [dirTable, setDirTable] = useState(null); // { rows, done } while it fills
  const [capPercentile, setCapPercentile] = useState(98);

  // --- variogram parameters ---
  const [lagDistance, setLagDistance] = useState(0); // 0 => use the suggested value
  const [nLags, setNLags] = useState(12);
  const [lagTolerance, setLagTolerance] = useState(0.5);
  // TASKS.csv #3015 (WA iron review) — on near-vertical drilling the first variogram is the one down the holes (the nugget and the short
  // range); 'All pairs' mixed 2 m downhole pairs with pairs tens of metres apart between holes and read as 'no spatial structure'
  const vertical = useMemo(() => verticalShare(collars, survey) >= 0.9, [collars, survey]);
  const [holeMode, setHoleMode] = useState(() => (verticalShare(collars, survey) >= 0.9 ? "downhole" : "all"));
  const [directional, setDirectional] = useState(false);
  const [azimuth, setAzimuth] = useState(0);
  const [dip, setDip] = useState(0);
  const [angleTol, setAngleTol] = useState(22.5);
  const [bandwidth, setBandwidth] = useState(0); // 0 => none
  // TASKS.csv #2424 (review #2325, WA uranium) — pairs in a plane, every azimuth, within ± a half-width across it (bedding); the half-width
  // starts at the composite length (blank = that), the plane at the block-estimation trend's, else horizontal
  const [inPlane, setInPlane] = useState(false);
  const [planeKind, setPlaneKind] = useState("auto"); // "auto" (the trend if one is set for block estimation, else horizontal) | "horizontal"
  const [planeHalf, setPlaneHalf] = useState("");
  const planeChoice = (kind) => {
    const sf = String(kind).startsWith("surface:") ? flatSurfaces.find((x) => `surface:${x.id}` === kind) : null;
    if (sf) return { normal: { x: 0, y: 0, z: 1 }, label: tr("below \"{name}\" (flattened)", { name: flatLabels.get(sf.id) ?? sf.name }), surface: sf }; // #2710
    return planeOf(kind === "horizontal" ? "horizontal" : "auto", estTrend);
  };
  const [model, setModel] = useState("spherical");

  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  // TASKS.csv #3009 (WA iron review) — the pair loop and the direction table run in a worker: on 147,601 composites the window froze
  // 4.3-12 s with no progress and no cancel
  const vgClient = useRef(null);
  if (!vgClient.current) vgClient.current = makeVariogramClient();
  useEffect(() => () => vgClient.current?.stop(), []);

  const srcAssays = useMemo(() => excludeQAQC(assays), [assays]);
  const uns = useUnsampled("variogram", { assays: srcAssays, collars, symbol, unit, elementUnits, layers, customLayers }); // TASKS.csv #2417 / #2542; a picked log: #2721

  // Distinct values of the chosen domain layer, so a user can run one domain at a time — the whole
  // point of the row ("per domain"): a variogram mixing two geologically different populations
  // measures the contrast between them, not the continuity within either.
  const domainValues = useMemo(() => {
    if (!domainKey) return [];
    const s = new Set();
    (domainChoice?.rows || []).forEach((r) => { if (r.value != null && r.value !== "") s.add(String(r.value)); });
    return Array.from(s).sort();
  }, [domainKey, domainChoice]);

  const run = () => {
    setError(""); setResult(null); setRunning(true);
    // Deferred so "Running…" actually paints before the O(n^2) pair loop blocks the main thread. A
    // timer, not requestAnimationFrame — rAF never fires in a hidden window, which strands the run
    // forever (the exact bug TASKS.csv #258's verification found in GradeEstimationModal).
    setTimeout(async () => {
      try {
        // TASKS.csv #3061 — composited and placed once per element / length / coverage / domain layer / unsampled reading / hole mode
        const comp = (await compCache.current.getAsync([srcAssays, uns.ready, uns.mode, uns.value, uns.logKey, uns.logFactor, uns.alsoUnassayed, layers, customLayers, symbol, unit, elementUnits, compositeLength, minCoverage, domainChoice ? domainChoice.rows : null, collars, survey, desurveyMethod, holeMode], async () => {
          const filled = uns.apply(srcAssays); // #2417 / #2542 — barren: the unsampled metres filled at the typed value
          // TASKS.csv #3111 — the first Compute for an element / length / domain froze the window about 1 s on 147,000 samples: the compositing
          // and the placing now run in slices of whole holes, a task each (the same composites and points)
          const intervals = await compositeDownholeSliced(filled.assays, symbol, unit, elementUnits, {
            length: compositeLength, minCoverage,
            domainRows: domainChoice ? domainChoice.rows : null, // #1571
          });
          if (!intervals.length) return { filled, intervals };
          await new Promise((r) => setTimeout(r, 0));
          const { points: placed3d, dropped: dropped3d } = await samplePointsSliced(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
          // TASKS.csv #1843 — Downhole only needs depths: the holes that could not be placed in 3D are placed by depth along the hole
          const byDepth = holeMode === "downhole" ? downholeLinePoints(intervals, new Set(placed3d.map((p) => p.hole_id))) : { points: [], holes: 0 };
          return { filled, intervals, byDepth, allPoints: byDepth.points.length ? [...placed3d, ...byDepth.points] : placed3d, dropped: Math.max(0, dropped3d - byDepth.points.length) };
        })).value;
        const { filled, intervals, byDepth, allPoints, dropped } = comp;
        if (!intervals.length) { setError(tr("Compositing produced no intervals — check the element and composite length.")); setRunning(false); return; }
        if (!allPoints.length) { setError(collars.length ? tr("No composite could be placed in 3D — check that holes have collars and (ideally) survey data.") : noCollarsNotice(tr("the variogram"), layers, srcAssays).text); setRunning(false); return; } // #1841 — no collars at all: say what is waiting

        // #3061 — the domain's points and their transform, kept with the composites they come from
        const pick = pointCache.current.get([allPoints, domainKey, domainValue, transform, capPercentile], () => {
          let points = allPoints, domainLabel = null;
          if (domainKey && domainValue !== "__all__") {
            points = groupPointsByDomain(allPoints).get(domainValue === "__none__" ? null : domainValue) || [];
            domainLabel = domainValue === "__none__" ? "(no domain)" : domainValue;
          }
          return { points, domainLabel, tf: points.length >= 20 || !domainLabel ? applyValueTransform(points, transform, capPercentile) : null }; // p95 / floor: #1746
        }).value;
        const { points, domainLabel } = pick;
        if (domainLabel) {
          if (points.length < 20) {
            setError(tr("Domain \"{domainLabel}\" has only {points} composites — too few for a variogram worth reading (a lag bin needs ~30 pairs to mean anything).", { domainLabel, points: points.length }));
            setRunning(false); return;
          }
        }

        const { points: tPoints, capValue, p95: tP95 = null, floor: tFloor = null } = pick.tf; // p95 / floor: #1746; kept: #3061
        // TASKS.csv #1027 — downhole pairs: the downhole spacing; all / between-hole pairs: the spacing between holes
        const between = holeMode === "downhole" ? null : suggestBetweenHoleLag(tPoints);
        // TASKS.csv #2221 — the drill sites of the holes in this run (collars within 25 m are one site)
        const holesIn = new Set(tPoints.map((p) => p.hole_id));
        const spacing = holeMode === "downhole" ? null : holeSpacingSummary((collars || []).filter((c) => holesIn.has(c.hole_id)));
        const site = holeMode === "between" ? siteSpacingLag(spacing) : null;
        const suggested = site ? site.lag : between != null ? between / 4 : suggestLagDistance(tPoints); // a quarter of it, as ordinary kriging's fit
        let lag = lagDistance > 0 ? lagDistance : Math.max(1, Math.round(suggested || 10));
        let nLagsUsed = site && !(lagDistance > 0) ? Math.max(nLags, site.nLags) : nLags; // #2221 — auto lag between sites: out to the farthest one

        const usePlane = inPlane ? planeChoice(planeKind) : null, half = Number(planeHalf) > 0 ? Number(planeHalf) : compositeLength; // #2424
        // TASKS.csv #3015 — in the plane with no lag typed: the median hole spacing, out to a third of the drilling's width (the in-plane
        // default stopped at 60 m with holes 22 m apart)
        let planeLagFrom = null;
        if (usePlane && !(lagDistance > 0)) {
          const sp = spacing || holeSpacingSummary((collars || []).filter((c) => holesIn.has(c.hole_id)));
          if (sp?.medianM > 0) {
            let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
            for (const p of tPoints) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
            lag = Math.max(1, Math.round(sp.medianM));
            nLagsUsed = Math.min(60, Math.max(nLags, Math.ceil(Math.max(x1 - x0, y1 - y0) / 3 / lag)));
            planeLagFrom = sp.medianM;
          }
        }
        // TASKS.csv #2710 — below a surface: each composite's elevation becomes its depth below it, then the pairs are level within ± half
        let vgPoints = tPoints, flatOutside = 0;
        if (usePlane?.surface) {
          const fl = flatCache.current.get([tPoints, usePlane.surface], () => flattenOnSurface(tPoints, surfaceElevation(usePlane.surface.vertices, usePlane.surface.indices))).value; // #3061 — kept too
          vgPoints = fl.points; flatOutside = fl.outside;
          if (vgPoints.length < 20) { setError(tr("Only {n} composites lie over \"{name}\": too few to pair below it.", { n: vgPoints.length, name: flatLabels.get(usePlane.surface.id) ?? usePlane.surface.name })); setRunning(false); return; }
        }
        const direction = usePlane ? { plane: { normal: usePlane.normal, halfWidth: half } } : directional
          ? { azimuth, dip, angleTol, bandwidth: bandwidth > 0 ? bandwidth : null }
          : null;
        const vg = await vgClient.current.variogram(vgPoints, { lagDistance: lag, nLags: nLagsUsed, lagTolerance, holeMode, direction, estimator }); // estimator: #1996; vgPoints: #2710; in the worker: #3009
        lastRun.current = { points: vgPoints, base: { lagDistance: lag, nLags: nLagsUsed, lagTolerance, holeMode, estimator }, model }; setDirTable(null); // #1996
        const fit = fitVariogramModel(vg.bins, { model });
        setResult({
          vg, fit, lag, suggested, capValue, domainLabel, spacing, nLagsUsed, fromSites: !!site, planeLagFrom, // #2221; planeLagFrom: #3015
          nLagsTyped: nLags, plane: usePlane ? { label: usePlane.label, half, outside: flatOutside } : null, holeMode, compositeLength, medianSampleM: medianSampleLength(srcAssays, symbol), // #2424
          nComposites: points.length, dropped, transform, model, tP95, tFloor, // #1746
          byDepthHoles: byDepth.holes, // #1843
          nIntervals: intervals.length, unsampled: uns.params(filled), // #2417
        });
      } catch (e) {
        if (!e?.cancelled) setError(e.message || tr("Variogram calculation failed.")); // #3009 — Cancel says nothing
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
    const xMax = arrMax(pts.map((b) => b.h)) * 1.05;
    const yMax = Math.max(arrMax(pts.map((b) => b.gamma)), vg.variance, fit ? fit.sill : 0) * 1.12 || 1;
    const X = (h) => ML + (h / xMax) * (W - ML - MR);
    const Y = (g) => H - MB - (g / yMax) * (H - MT - MB);
    const maxPairs = arrMax(pts.map((b) => b.nPairs));
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
  // TASKS.csv #3285 — between holes, lags with 30 pairs or more that come from under MIN_HOLE_PAIRS pairs of holes
  const holePairsLow = result && result.holeMode === "between" && result.vg.bins.some((b) => b.nPairs >= 30 && b.holePairs != null && b.holePairs < MIN_HOLE_PAIRS);
  const fitWeak = result && result.fit && result.fit.rSquared != null && result.fit.rSquared < 0.5;
  // TASKS.csv #2065 — the first lag does not clear 30 pairs (Between holes on Woodjam Cu): the fitted nugget is not read from the data
  const nuggetFree = !!(result && result.fit && !(result.vg.reliableFromLag > 0 && result.vg.reliableFromLag <= result.lag * 1.01));
  const stat = result ? variogramStationarity(result.vg, result.fit) : null; // TASKS.csv #1576

  return (
    <div style={overlay} {...backdropProps(onClose)}>
      <div style={panelStyle} role="dialog" aria-modal="true" aria-label={tr("Variogram analysis")} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Variogram — spatial continuity")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Experimental variogram + fitted nugget / sill / range, from composited assays. {collars} holes, {assays} raw intervals loaded.", { collars: samplesFrom === "checked" ? checkedN : collars.length, assays: assays.length })}</div>
            {checkedHoleIds && checkedN > 0 && checkedN < collars.length && <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>{tr("Samples from")}{/* #2544 */}
              <select value={samplesFrom} onChange={(e) => { setSamplesFrom(e.target.value); setResult(null); }} aria-label={tr("Samples from")} style={{ fontSize: "var(--font-size-sm)", padding: "2px 6px", border: "1px solid var(--color-border)", borderRadius: 4, background: "var(--color-bg)", color: "var(--color-text)" }}>
                <option value="all">{tr("Every hole")}</option>
                <option value="checked">{tr("The checked holes ({n} of {total})", { n: checkedN, total: collars.length })}</option>
              </select>
            </label>}
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* The honesty banner. Deliberately the first thing on the screen, and deliberately not
              softened: TASKS.csv #257-#270 made the estimation UI stop implying rigour it doesn't
              have, and this screen is the one most likely to be mistaken for "GeoStrix does kriging". */}
          <div style={noteBox("#f6f8fb", "#a9c6e0")}>
            <b>{tr("This is a diagnostic, not an estimator.")}</b>{" "}{tr("GeoStrix computes and fits a variogram here so you can see and measure a domain's grade continuity. It does")}{" "}<b>{tr("not")}</b>{" "}{tr("feed the estimator by itself: the Estimation tool's ordinary kriging takes its own nugget, sill and range (type the ones you read here, or leave them blank to fit at run time), and nearest-neighbour / inverse-distance use none. Fitting a model here does not change any estimate you have run.")}<div style={{ marginTop: 6 }}>{tr("What the numbers are genuinely good for: the")}{" "}<b>{tr("range")}</b>{" "}{tr("is a defensible search radius (past it, a sample tells you nothing about a block); the")}{" "}<b>{tr("nugget / sill ratio")}</b>{" "}{tr("is how much of the variability is short-scale noise no smooth interpolation can recover; and comparing ranges in two directions is the measured version of the anisotropy ratio the Modelling tab otherwise asks you to judge by eye.")}</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel}>{tr("Element")}<select value={symbol} onChange={(e) => setSymbol(e.target.value)} style={inp}>
                {symbols.map((s) => <option key={s} value={s}>{s} ({gradeUnitLabel(s, elementUnits[s] || "ppm")})</option>)}{/* #2429 */}
              </select>
            </label>
            <label style={fieldLabel} title={tr("A variogram assumes a common support — every sample the same volume. Compositing to a fixed length is what provides that; raw ragged intervals do not.")}>{tr("Composite length (m)")}<input type="number" min="0.1" step="any" value={compositeLength} onChange={(e) => setCompositeLength(Math.max(0.1, Number(e.target.value) || 2))} style={inp} />
              <CompositeLengthNote assays={srcAssays} symbol={symbol} length={compositeLength} onUse={(m) => { setCompositeLength(m); setResult(null); }} variogram />{/* #2549 */}
            </label>
            <label style={fieldLabel} title={tr("Minimum fraction of a composite that must be covered by real assay material.")}>{tr("Min coverage (%)")}<input type="number" min="0" max="100" step="1" value={Math.round(minCoverage * 100)} onChange={(e) => setMinCoverage(Math.min(100, Math.max(0, Number(e.target.value) || 0)) / 100)} style={inp} />{/* #3286 (7) — in %, as Estimation's */}
            </label>
            <label style={fieldLabel}>{tr("Domain layer")}<select value={domainKey} onChange={(e) => { setDomainKey(e.target.value); setDomainValue("__all__"); }} style={inp}>
                <option value="">{tr("(none)")}</option>
                {domainChoices.map((c) => <option key={c.key} value={c.key}>{c.custom ? tr("{name} (custom layer)", { name: c.label }) : c.label}</option>)}
              </select>
            </label>
            {domainFold?.folded.length > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", gridColumn: "1 / -1" }}>{tr("Spellings that differ only by case or spaces are one domain here: {list}.", { list: domainFold.folded.map((f) => f.codes.join(" = ")).join("; ") })}</div>}{/* #2427 */}
            {domainKey && (
              <label style={fieldLabel} title={tr("A variogram over two geologically different populations measures the contrast between them, not the continuity within either — run one domain at a time.")}>{tr("Domain")}<select value={domainValue} onChange={(e) => setDomainValue(e.target.value)} style={inp}>
                  <option value="__all__">{tr("All domains together")}</option>
                  {domainValues.map((v) => <option key={v} value={v}>{v}</option>)}
                  <option value="__none__">{tr("(unassigned)")}</option>
                </select>
              </label>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel} title={tr("The Matheron estimator squares differences, so a few very high grades can dominate every lag bin and hide real structure. Verified on the bundled Harry-property Zn data: raw r-squared 0.03, log-transformed 0.95, same points.")}>{tr("Value transform")}<select value={transform} onChange={(e) => setTransform(e.target.value)} style={inp}>
                {Object.entries(VALUE_TRANSFORMS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </select>
            </label>
            <label style={fieldLabel} title={tr("How each lag's semivariance is computed from its pairs. Matheron is the mean of half the squared differences; a few extreme pairs (a massive-sulphide composite) can dictate it. Cressie-Hawkins and Dowd are robust: they follow the bulk of the pairs.")}>{tr("Estimator")}<select value={estimator} onChange={(e) => setEstimator(e.target.value)} style={inp} aria-label={tr("Variogram estimator")}>
                <option value="matheron">{tr("Matheron (classical)")}</option>
                <option value="cressie">{tr("Cressie-Hawkins (robust)")}</option>
                <option value="dowd">{tr("Dowd (median, robust)")}</option>
              </select></label>{/* #1996 */}
            {transform === "cap" && (
              <label style={fieldLabel}>{tr("Cap percentile")}<input type="number" min="50" max="100" step="0.5" value={capPercentile} onChange={(e) => setCapPercentile(Math.min(100, Math.max(50, Number(e.target.value) || 98)))} style={inp} />
              </label>
            )}
            <label style={fieldLabel} title={tr("Bin width. Leave 0 for a quarter of the median spacing between holes (the distance from a composite to the nearest composite in another hole), as ordinary kriging's automatic fit uses, or, with downhole-only pairs, the downhole spacing.")}>{tr("Lag distance (m, 0 = auto)")}<input type="number" min="0" step="any" value={lagDistance} onChange={(e) => setLagDistance(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel} title={tr("Number of lag bins. lags x lag distance should be about half the field's extent — beyond that, pair counts collapse and the plot is noise.")}>{tr("Number of lags")}<input type="number" min="3" max="60" step="1" value={nLags} onChange={(e) => setNLags(Math.min(60, Math.max(3, Math.round(Number(e.target.value) || 12))))} style={inp} />
            </label>
            <label style={fieldLabel} title={tr("Half-width of a bin as a fraction of the lag distance. 0.5 = contiguous bins (the usual choice).")}>{tr("Lag tolerance")}<input type="number" min="0.1" max="1" step="0.05" value={lagTolerance} onChange={(e) => setLagTolerance(Math.min(1, Math.max(0.1, Number(e.target.value) || 0.5)))} style={inp} />
            </label>
            <label style={fieldLabel} title={tr("Downhole-only pairs are the classic way to resolve the nugget — only samples in the same hole get close enough together to see it.")}>{tr("Pairs")}<select value={holeMode} onChange={(e) => setHoleMode(e.target.value)} style={inp}>
                <option value="all">{tr("All pairs")}</option>
                <option value="downhole">{tr("Downhole only (resolves nugget)")}</option>
                <option value="between">{tr("Between holes only")}</option>
              </select>
            </label>
            <label style={fieldLabel}>{tr("Model")}<select value={model} onChange={(e) => setModel(e.target.value)} style={inp}>
                {Object.entries(VARIOGRAM_MODELS).map(([k, v]) => <option key={k} value={k}>{tr(v.label)}</option>)}
              </select>
            </label>
          </div>

          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={directional} onChange={(e) => setDirectional(e.target.checked)} />{tr("Directional variogram (same azimuth / dip convention as the anisotropy and search-ellipsoid fields)")}</label>
            {directional && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                <label style={fieldLabel}>{tr("Azimuth (deg)")}<input type="number" step="any" value={azimuth} onChange={(e) => setAzimuth(Number(e.target.value) || 0)} style={inp} />
                </label>
                <label style={fieldLabel}>{tr("Dip (deg below horizontal)")}<input type="number" step="any" value={dip} onChange={(e) => setDip(Number(e.target.value) || 0)} style={inp} />
                </label>
                <label style={fieldLabel} title={tr("Half-angle of the cone of accepted pair directions. Too tight and there are no pairs; too wide and the direction means nothing.")}>{tr("Angular tolerance (deg)")}<input type="number" min="1" max="89" step="any" value={angleTol} onChange={(e) => setAngleTol(Math.min(89, Math.max(1, Number(e.target.value) || 22.5)))} style={inp} />
                </label>
                <label style={fieldLabel} title={tr("Caps how far a pair may sit off the direction line. Without it, a wide cone swallows far off-axis pairs at long lags. 0 = no cap.")}>{tr("Bandwidth (m, 0 = none)")}<input type="number" min="0" step="any" value={bandwidth} onChange={(e) => setBandwidth(Math.max(0, Number(e.target.value) || 0))} style={inp} />
                </label>
              </div>
            )}
            {directional && (
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 6 }}>{tr("Directional variograms use far fewer pairs than an omnidirectional one, so they are much noisier — check the pair counts and the fit quality below before believing a directional range.")}</div>
            )}
            {/* TASKS.csv #2424 — every azimuth within a plane (the bedding), within ± a half-width across it */}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer", marginTop: 8 }} title={tr("For a layered deposit: pairs in every direction within a plane, kept only when they are within the half-width across it, so samples of the same layer in different holes are paired and samples of other layers are not. It replaces the single direction above.")}>
              <input type="checkbox" checked={inPlane} onChange={(e) => setInPlane(e.target.checked)} />{tr("In a plane, all azimuths (bedding)")}</label>
            {inPlane && (() => { const pl = planeChoice(planeKind); return (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
                <label style={fieldLabel}>{tr("Plane")}<select value={planeKind} onChange={(e) => setPlaneKind(e.target.value)} style={inp} aria-label={tr("Plane of the pairs")}>
                    <option value="auto">{estTrend ? tr("The block-estimation trend \"{name}\"", { name: estTrend.name }) : tr("Horizontal (no trend is set for block estimation)")}</option>
                    {estTrend && <option value="horizontal">{tr("Horizontal")}</option>}
                    {flatSurfaces.length > 0 && <optgroup label={tr("Below a generated surface (flattened)")}>{flatSurfaces.map((x) => <option key={x.id} value={`surface:${x.id}`}>{flatLabels.get(x.id) ?? x.name}</option>)}</optgroup>}{/* #2710 */}
                  </select>
                </label>
                <label style={fieldLabel} title={tr("How far a pair may sit across the plane. Blank = the composite length.")}>{tr("Half-width across it (m)")}<input type="number" min="0" step="any" value={planeHalf} placeholder={String(compositeLength)} onChange={(e) => setPlaneHalf(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} style={inp} aria-label={tr("Half-width across the plane (m)")} />
                </label>
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flex: "1 1 200px" }}>{tr("Pairs within ± {w} m of the plane {p}.", { w: Number(planeHalf) > 0 ? Number(planeHalf) : compositeLength, p: pl.label })}</span>
              </div>); })()}
          </div>

          <UnsampledChoice u={uns} selStyle={{ ...inp, width: "auto", padding: "3px 6px" }} />{/* TASKS.csv #2417 / #2542 */}
          <button onClick={run} disabled={running || !symbols.length || !uns.ready} style={{ ...btn(true), display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: running || !symbols.length || !uns.ready ? 0.6 : 1 }}>
            <Play size={14} /> {running ? tr("Running…") : tr("Compute variogram")}
          </button>
          {running && <button type="button" onClick={() => { vgClient.current.cancel(); setRunning(false); }} style={{ ...btn(false), marginTop: 4 }}>{tr("Cancel")}</button>}{/* #3009 */}

          {error && <div style={noteBox("#fbf0f0", "#e0a9a9")}>{error}</div>}

          {result && plot && (
            <>
              <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                {tr("{nComposites} composites{v}{v2} · {nPairsUsed} pairs used · lag {lag} m{v4}{v5}{v6}", { nComposites: result.nComposites.toLocaleString(), v: result.domainLabel ? tr(" in domain \"{domainLabel}\"", { domainLabel: result.domainLabel }) : "", v2: !result.vg.subsampled ? "" : result.vg.holesTotal != null ? tr(" ({used} of {total} holes, whole holes, for the pair loop)", { used: result.vg.holesUsed.toLocaleString(), total: result.vg.holesTotal.toLocaleString() }) /* #1572 */ : result.vg.firstPairLag != null ? tr(" (subsampled to {nPoints} for the pair loop; no pairs closer than {h} m — Downhole only resolves the nugget)", { nPoints: result.vg.nPoints.toLocaleString(), h: result.vg.firstPairLag.toFixed(1) }) : tr(" (subsampled to {nPoints} for the pair loop)", { nPoints: result.vg.nPoints.toLocaleString() }), nPairsUsed: result.vg.nPairsUsed.toLocaleString(), lag: result.lag, v4: result.planeLagFrom ? tr(" (the median hole spacing, {s} m, out to a third of the drilling's width)", { s: Math.round(result.planeLagFrom) }) /* #3015 */ : result.suggested != null ? (result.fromSites ? tr(" (suggested {suggested} m from the drill-site spacing)", { suggested: result.suggested.toFixed(1) }) : tr(" (suggested {suggested} m)", { suggested: result.suggested.toFixed(1) })) : "", v5: result.dropped ? tr(" · {dropped} composites could not be placed in 3D", { dropped: result.dropped }) : "", v6: result.capValue != null ? tr(" · capped at {capValue}", { capValue: +Number(result.capValue).toPrecision(4) /* #1420: was 2.7857037499998807 */ }) : "" })}
              </div>

              {/* TASKS.csv #1996 — the direction table: 13 directions, each fitted, one per tick so the window keeps painting */}
              {lastRun.current && holeMode !== "downhole" && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                {!dirTable && <button type="button" onClick={() => { const run = lastRun.current; if (!run) return; const rows = []; setDirTable({ rows, done: false }); const step = (i) => { if (lastRun.current !== run) return; if (i >= DIRECTION_TABLE.length) { setDirTable({ rows: [...rows], done: true }); return; } vgClient.current.directionRow(run.points, run.base, DIRECTION_TABLE[i], run.model).then((row) => { if (lastRun.current !== run) return; rows.push(row); setDirTable({ rows: [...rows], done: false }); step(i + 1); }).catch(() => {}); /* in the worker: #3009 */ }; step(0); }} style={{ fontSize: "var(--font-size-sm)" }}>{tr("Direction table (13 directions)")}</button>}
                {dirTable && (() => { const best = dirTable.done ? longestDirection(dirTable.rows) : null; return <>
                  <table style={{ borderCollapse: "collapse", marginTop: 4 }}><thead><tr>{[tr("Azimuth (°)"), tr("Dip (°)"), tr("Pairs"), tr("Range (m)"), tr("Nugget / sill"), tr("Fit r²")].map((h) => <th key={h} style={{ textAlign: "start", padding: "2px 8px", fontWeight: 600 }}>{h}</th>)}</tr></thead>
                  <tbody>{dirTable.rows.map((r) => <tr key={`${r.azimuth}_${r.dip}`} style={{ background: best && r === best ? "#eef6ee" : undefined }}><td style={{ padding: "1px 8px" }}>{r.dip === 90 ? "—" : r.azimuth}</td><td style={{ padding: "1px 8px" }}>{r.dip}</td><td style={{ padding: "1px 8px" }}>{r.nPairs.toLocaleString()}</td><td style={{ padding: "1px 8px", color: r.range != null && r.maxReliableLag > 0 && r.range > r.maxReliableLag ? "var(--color-warn-text)" : undefined }}>{r.range == null ? "—" : Math.round(r.range)}</td><td style={{ padding: "1px 8px" }}>{r.sill > 0 ? `${Math.round((100 * r.nugget) / r.sill)}%` : "—"}</td><td style={{ padding: "1px 8px" }}>{r.rSquared != null ? r.rSquared.toFixed(2) : "—"}</td></tr>)}</tbody></table>
                  {!dirTable.done && <div>{tr("Computing {n} of {m}…", { n: dirTable.rows.length + 1, m: DIRECTION_TABLE.length })}</div>}
                  {best && <div style={{ marginTop: 3 }}>{tr("Longest well-fitted range: azimuth {a}°, dip {d}°, {r} m (shaded; fits with r² 0.5 or more, within their reliable lags). A range in amber is past that direction's reliable lags; a weak r² is no direction at all. Read it as a guide to the anisotropy, then check that direction with its own variogram.", { a: best.azimuth, d: best.dip, r: Math.round(best.range) })}</div>}
                  {dirTable.done && !best && <div style={{ marginTop: 3, color: "var(--color-warn-text)" }}>{tr("No direction has a fit good enough (r² 0.5 or more, within its reliable lags) to name a long axis: this variable shows no clear anisotropy at these lags.")}</div>}
                </>; })()}
              </div>}
              {result.vg.estimator && result.vg.estimator !== "matheron" && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr(result.vg.estimator === "cressie" ? "Semivariances by the Cressie-Hawkins estimator: led by the bulk of the pairs, not by a few extreme ones. Compare with Matheron: a Matheron sill well above this one is a few outlier pairs." : "Semivariances by Dowd's median estimator: led by the bulk of the pairs, not by a few extreme ones. Compare with Matheron: a Matheron sill well above this one is a few outlier pairs.")}</div>}{/* #1996 */}
              {result.byDepthHoles > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr(result.byDepthHoles === 1 ? "One hole has no collar or trace: its composites are paired by their depths down the hole, which is all Downhole only needs." : "{n} holes have no collar or trace: their composites are paired by their depths down each hole, which is all Downhole only needs.", { n: result.byDepthHoles })}</div>}{/* #1843 */}
              {result.plane && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Pairs in the plane {p}, every azimuth, within ± {w} m across it.", { p: result.plane.label, w: result.plane.half })}</div>}{/* #2424 */}
              {result.plane?.outside > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("{n} composites lie outside the surface's footprint and are left out.", { n: result.plane.outside.toLocaleString() })}</div>}{/* #2710 */}
              {result.nLagsUsed !== result.nLagsTyped && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("{n} lags drawn, out to {max} m, to reach the farthest drill site ({typed} typed).", { n: result.nLagsUsed, max: Math.round(result.nLagsUsed * result.lag), typed: result.nLagsTyped })}</div>}{/* #2424: the lag count actually used (#2221) */}
              {result.holeMode === "downhole" && result.fit?.nuggetRatio >= 0.95 && result.medianSampleM > 0 && result.medianSampleM < 0.75 * result.compositeLength && <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.45 }}>{tr("Downhole pairs on {c} m composites are pure nugget here, and the samples are typically {s} m long: a composite as long as the samples may show the short range.", { c: result.compositeLength, s: +result.medianSampleM.toFixed(2) })}</div>}{/* #2424 */}
              {result.unsampled?.unsampledFilledM != null && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{unsampledResultLine(result.unsampled, symbol)}</div>}{/* #2417 */}
              {lagsShortOfSpacing(result.lag, result.nLagsUsed, result.spacing) && ( /* TASKS.csv #2221 */
                <div role="note" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.45 }}>{tr("The lags stop at {max} m; the {sites} drill sites are typically {typ} m apart (nearest {near} m, up to {far} m): raise the lag or the number of lags to see continuity between holes.", { max: Math.round(result.lag * result.nLagsUsed), sites: result.spacing.sites, typ: Math.round(result.spacing.medianM), near: Math.round(result.spacing.nearestM), far: Math.round(result.spacing.farthestM) })}</div>
              )}
              {/* flexShrink: 0 + an explicit aspectRatio are both load-bearing, not decoration. This
                  modal's body is a `display:flex; flexDirection:column` container, and an SVG with only
                  width="100%" and a viewBox has no intrinsic height a flex item can be sized from — it
                  collapsed to 811 x 2 px in the live check, drawing the whole plot into a 2-pixel strip
                  while every element was technically present in the DOM. */}
              <svg
                width="100%"
                viewBox={`0 0 ${plot.W} ${plot.H}`}
                preserveAspectRatio="xMidYMid meet"
                style={{ display: "block", width: "100%", height: "auto", aspectRatio: `${plot.W} / ${plot.H}`, flexShrink: 0, background: "var(--color-bg-subtlest)", border: "1px solid var(--color-border)", borderRadius: 6 }}
              >
                {/* axes */}
                <line x1={plot.ML} y1={plot.H - plot.MB} x2={plot.W - plot.MR} y2={plot.H - plot.MB} stroke="#c7ccd3" />
                <line x1={plot.ML} y1={plot.MT} x2={plot.ML} y2={plot.H - plot.MB} stroke="#c7ccd3" />
                {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                  const g = plot.yMax * f;
                  return (
                    <g key={f}>
                      <line x1={plot.ML} y1={plot.Y(g)} x2={plot.W - plot.MR} y2={plot.Y(g)} stroke="#eef0f3" />
                      <text x={plot.ML - 6} y={plot.Y(g) + 3} textAnchor="end" fontSize={fontSizes.xs} fill="#65717e">{plot.fmtY(g)}</text>
                    </g>
                  );
                })}
                {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                  const h = plot.xMax * f;
                  return <text key={f} x={plot.X(h)} y={plot.H - plot.MB + 14} textAnchor="middle" fontSize={fontSizes.xs} fill="#65717e">{h.toFixed(0)}</text>;
                })}
                <text x={(plot.ML + plot.W - plot.MR) / 2} y={plot.H - 6} textAnchor="middle" fontSize="10" fill="#55606e">{tr("Lag distance h (m)")}</text>
                <text x={12} y={(plot.MT + plot.H - plot.MB) / 2} textAnchor="middle" fontSize="10" fill="#55606e" transform={`rotate(-90 12 ${(plot.MT + plot.H - plot.MB) / 2})`}>{tr("Semivariance γ(h)")}</text>

                {/* population variance — the level a stationary variable's variogram should flatten at */}
                <line x1={plot.ML} y1={plot.Y(result.vg.variance)} x2={plot.W - plot.MR} y2={plot.Y(result.vg.variance)} stroke="#94a1b0" strokeDasharray="4 3" />
                <text x={plot.W - plot.MR - 4} y={plot.Y(result.vg.variance) - 4} textAnchor="end" fontSize={fontSizes.xs} fill="#65717e">{tr("population variance")}</text>

                {/* fitted model */}
                {plot.curve && <path d={plot.curve} fill="none" stroke="#e2a63c" strokeWidth="2" />}
                {result.fit && result.fit.range < plot.xMax && (
                  <line x1={plot.X(result.fit.range)} y1={plot.MT} x2={plot.X(result.fit.range)} y2={plot.H - plot.MB} stroke="#e2a63c" strokeDasharray="3 3" opacity="0.7" />
                )}

                {/* experimental points, radius scaled by pair count (a lag built from 12 pairs is not
                    the same measurement as one built from 4,000, and the plot should show that) */}
                {plot.pts.map((b, i) => (
                  <circle key={i} cx={plot.X(b.h)} cy={plot.Y(b.gamma)} r={3 + 4 * Math.sqrt(b.nPairs / plot.maxPairs)}
                    fill={(b.reliable ?? b.nPairs >= 30) ? "#4a9be0" : "#d98f8f"} opacity="0.85">{/* reliable: #3285 */}
                    <title>{`h = ${b.h.toFixed(1)} m\nγ = ${b.gamma.toPrecision(4)}\n${b.nPairs.toLocaleString()} pairs${b.holePairs != null && b.holePairs > 0 ? tr(" from {h} hole pair(s)", { h: b.holePairs.toLocaleString() }) : ""}${b.nPairs < 30 ? tr(" (under 30 — not a reliable measurement)") : result.holeMode === "between" && b.holePairs != null && b.holePairs < MIN_HOLE_PAIRS ? tr(" (from under {m} pairs of holes — not a reliable measurement between holes)", { m: MIN_HOLE_PAIRS }) : ""}`}</title>
                  </circle>
                ))}
              </svg>

              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: "var(--font-size-base)", color: "var(--color-text)" }}>
                {result.fit ? (
                  <>
                    <Stat label={tr("Nugget")} value={nuggetFree ? tr("{v} (not constrained)", { v: semi(result.fit.nugget) }) : semi(result.fit.nugget)} />
                    <Stat label={tr("Sill")} value={semi(result.fit.sill)} />{/* semi: #3273 — separators and the squared unit */}
                    <Stat label={tr("Variogram range")} value={result.fit.beyondData ? tr("{v} m: past the furthest lag ({max} m), not measured", { v: result.fit.range.toFixed(1), max: result.fit.maxLag.toFixed(0) }) : `${result.fit.range.toFixed(1)} m`} />{/* #1420 */}
                    <Stat label={tr("Nugget / sill")} value={result.fit.nuggetRatio == null ? "—" : nuggetFree ? tr("{v} (not constrained)", { v: `${(result.fit.nuggetRatio * 100).toFixed(0)}%` }) : `${(result.fit.nuggetRatio * 100).toFixed(0)}%`} />
                    <Stat label={tr("Fit r²")} value={result.fit.rSquared != null ? result.fit.rSquared.toFixed(3) : "—"} />
                    <Stat label={tr("Model")} value={VARIOGRAM_MODELS[result.fit.model] ? tr(VARIOGRAM_MODELS[result.fit.model].label) : result.fit.model} />
                  </>
                ) : <div style={{ color: "var(--color-text-muted)" }}>{tr("Too few usable lag bins to fit a model.")}</div>}
              </div>

              {result.fit && result.transform === "none" && ( /* TASKS.csv #3273 — the model to Estimation, not retyped (a transformed variogram is not in grade units) */
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button type="button" onClick={() => {
                    const how = tr("{mode}, lag {lag} m, r² {r}", { mode: result.holeMode === "downhole" ? tr("Downhole only (resolves nugget)") : result.holeMode === "between" ? tr("Between holes only") : tr("All pairs"), lag: +Number(result.lag).toPrecision(3), r: result.fit.rSquared != null ? result.fit.rSquared.toFixed(2) : "—" });
                    sendVariogramToEstimation(project, { symbol, model: result.fit.model, nugget: result.fit.nugget, sill: result.fit.sill, range: result.fit.range, from: how });
                    setSentToEst({ symbol, how, downhole: result.holeMode === "downhole", range: result.fit.range }); // downhole: the range is along the holes
                  }} title={tr("The next Estimation dialog for {el} opens on ordinary kriging with this model, nugget, sill and range", { el: symbol })} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", cursor: "pointer", fontSize: "var(--font-size-sm)" }}>{tr("Use this model in Estimation")}</button>
                  {sentToEst && sentToEst.symbol === symbol && <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Sent: the next Estimation dialog for {el} opens on ordinary kriging with it ({how}). With a structural trend chosen for block estimation, its range is along the trend's major axis.", { el: symbol, how: sentToEst.how })}{sentToEst.downhole ? ` ${tr("Its range ({r} m) is measured down the holes; between holes the grade may reach further or less far. Compare All pairs or Between holes only before kriging with it.", { r: +Number(sentToEst.range).toPrecision(3) })}` : ""}</span>}
                </div>
              )}
              {result.fit && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.55 }}>
                  {tr("{v} The fit is a weighted least-squares starting point, not an answer — read the plot and override it if the curve does not follow the points you trust.", { v: VARIOGRAM_MODELS[result.fit.model] ? tr(VARIOGRAM_MODELS[result.fit.model].note) : "" })}</div>
              )}

              {result.transform !== "none" && (
                <div style={noteBox("#fdf7ea", "#e2a63c")}>
                  <b>{tr("Transformed values ({label}).", { label: tr((VALUE_TRANSFORMS[result.transform] || VALUE_TRANSFORMS.none).label) })}</b> {tr("{note}{v} The", { note: tr((VALUE_TRANSFORMS[result.transform] || VALUE_TRANSFORMS.none).note), v: (result.transform === "log" || result.transform === "logfloor") && tr(" In particular, do not quote this sill as a grade variance — back-transforming it correctly needs a lognormal correction GeoStrix does not apply.") })}{" "}<b>{tr("range")}</b>{" "}{tr("is still a distance in metres and is the number to carry into a search radius.")}</div>
              )}
              {result.transform === "log" && result.tP95 != null && result.tP95 < 0.2 && <div role="note" style={noteBox("#fdf7ea", "#e2a63c")}>{tr("95 % of these values are below {p} {unit}: there log10(value + 1) is close to 0.43 × value, so this variogram is nearly the raw one rescaled. Choose \"log10(value), zeros at half the smallest value\" instead.", { p: +result.tP95.toPrecision(2), unit: gradeUnitLabel(symbol, unit) })}</div>}{/* #1746 */}
              {result.transform === "logfloor" && result.tFloor != null && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Zeros and values below {f} {unit} (half the smallest positive value) were set to {f} before the log.", { f: +result.tFloor.toPrecision(3), unit: gradeUnitLabel(symbol, unit) })}</div>}{/* #1746 */}

              {holePairsLow && <div role="note" style={noteBox("#fdf7ea", "#e2a63c")}>{tr("Between holes, each lag rests on the pairs of holes it spans: some lags here come from under {m} pairs of holes (shown in red), each counted many times over in the pairs of composites. Read them as a few hole-to-hole comparisons, not as that many measurements.", { m: MIN_HOLE_PAIRS })}</div>}{/* #3285 */}
              {nPairsLow && (
                <div style={noteBox("#fdf7ea", "#e2a63c")}>{result.vg.reliableFromLag > result.lag * 1.01 && result.vg.maxReliableLag > 0 /* #2065 — the first lags fail: name the usable run */
                  ? (result.vg.maxReliableLag > result.vg.reliableFromLag
                    ? tr("Some lag bins hold fewer than 30 pairs (shown in red), the first ones among them. Below about 30 pairs a lag is not a measurement — Journel & Huijbregts' standard caution. Read only lags {a}–{b} m, the run that clears 30 pairs, or widen the lag distance or loosen the angular tolerance.", { a: Math.round(result.vg.reliableFromLag), b: Math.round(result.vg.maxReliableLag) })
                    : tr("Some lag bins hold fewer than 30 pairs (shown in red), the first ones among them. Below about 30 pairs a lag is not a measurement — Journel & Huijbregts' standard caution. Read only the {a} m lag, the one that clears 30 pairs, or widen the lag distance or loosen the angular tolerance.", { a: Math.round(result.vg.reliableFromLag) }))
                  : <>{tr("Some lag bins hold fewer than 30 pairs (shown in red). Below about 30 pairs a lag is not a measurement — Journel & Huijbregts' standard caution. Widen the lag distance, loosen the angular tolerance, or read only out to")}{" "}<b>{result.vg.maxReliableLag} m</b>{tr(", the furthest lag that clears 30 pairs contiguously.")}</>}</div>
              )}
              {nuggetFree && <div role="note" style={noteBox("#fdf7ea", "#e2a63c")}>{result.holeMode === "between" /* #3285 — between holes a lag also needs MIN_HOLE_PAIRS pairs of holes */
                ? (result.vg.reliableFromLag > 0
                  ? tr("The nugget is not constrained: between holes, no lag closer than {h} m holds 30 pairs from {m} or more pairs of holes, so the fitted nugget is the model's guess, not a measurement.", { h: Math.round(result.vg.reliableFromLag), m: MIN_HOLE_PAIRS })
                  : tr("The nugget is not constrained: between holes, no lag holds 30 pairs from {m} or more pairs of holes, so the fitted nugget is the model's guess, not a measurement.", { m: MIN_HOLE_PAIRS }))
                : result.vg.reliableFromLag > 0
                ? tr("The nugget is not constrained: no lag closer than {h} m holds 30 pairs, so the fitted nugget is the model's guess, not a measurement.", { h: Math.round(result.vg.reliableFromLag) })
                : tr("The nugget is not constrained: no lag holds 30 pairs, so the fitted nugget is the model's guess, not a measurement.")}
                {result.holeMode !== "downhole" ? " " + tr("Take it from Downhole only, where samples in one hole are close enough to see it.") : ""}</div>}{/* #2065 */}

              {stat?.noSill && <div style={noteBox("#fdf7ea", "#e2a63c")}>{tr("No sill at the population variance: at the last reliable lags the variogram is {r}× it{v}. That points to a trend or mixed domains (several populations in one), not a stationary grade, so the range is not a correlation length. Estimate within a domain, or remove the trend, before trusting it.", { r: stat.endRatio.toFixed(2), v: stat.rising ? tr(" and still rising") : "" })}</div>}{/* #1576 */}
              {stat?.rangeBeyond && <div style={noteBox("#fdf7ea", "#e2a63c")}>{tr("The fitted range ({range} m) is beyond the furthest reliable lag ({lag} m): it is extrapolated past the measured pairs, not read from them.", { range: Math.round(result.fit.range), lag: Math.round(stat.reliableLagM) })}</div>}

              {fitWeak && vertical && result.holeMode === "all" && ( /* TASKS.csv #3015 */
                <div style={noteBox("#fdf7ea", "#e2a63c")}>
                  <b>{tr("Weak fit (r² = {rSquared}).", { rSquared: result.fit.rSquared.toFixed(3) })}</b>{" "}{tr("These holes are near-vertical, so 'All pairs' mixes the pairs down each hole (a sample length apart) with the pairs between holes (a hole spacing apart): a weak fit here does not say the grade has no spatial structure. Compute Downhole pairs (the nugget and the short range), then Between holes or In the plane (the range along the bedding), apart.")}
                </div>
              )}
              {fitWeak && !(vertical && result.holeMode === "all") && (
                <div style={noteBox("#fdf7ea", "#e2a63c")}>
                  <b>{tr("Weak fit (r² = {rSquared}).", { rSquared: result.fit.rSquared.toFixed(3) })}</b>{" "}{tr("The experimental points do not follow the {v} shape well, so the nugget / sill / range above are not meaningfully constrained. That is itself a result: a flat variogram near the population variance means this variable has no resolvable spatial structure at these lags, and any smoothly interpolated shell of it is drawing continuity the data does not support. Try a value transform, a different domain, or a smaller lag.", { v: tr(VARIOGRAM_MODELS[result.fit.model]?.label || "").toLowerCase() })}</div>
              )}

              {result.fit && result.fit.nuggetRatio != null && result.fit.nuggetRatio > 0.5 && !fitWeak && !nuggetFree /* #2065 */ && (
                <div style={noteBox("#fdf7ea", "#e2a63c")}>
                  <b>{tr("High nugget ({v}% of the sill).", { v: (result.fit.nuggetRatio * 100).toFixed(0) })}</b>{" "}{tr("Over half the variability is short-scale noise that no interpolation can recover. Estimates of this variable will be smooth because the method smooths, not because the grade is continuous — treat any resulting shell with corresponding caution.")}</div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "12px 16px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ ...btn(false), padding: "8px 20px" }}>{tr("Close")}</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: "var(--font-size-xs)", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-muted)" }}>{label}</div>
      <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, color: "var(--color-text)" }}>{value}</div>
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

const noteBox = (bg, border) => ({ background: bg, border: `1px solid ${border}`, borderRadius: 6, padding: "9px 11px", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.55 });
const panelStyle = { width: "min(860px, 95vw)", maxHeight: "92vh", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Exo 2', system-ui, sans-serif" };
const headerStyle = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--color-border)" };
const fieldLabel = { fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", flexDirection: "column", gap: 4 };
const inp = { background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 6, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", fontFamily: "inherit", width: 150 };
const btn = (primary) => ({ padding: "8px 0", borderRadius: 6, fontSize: "var(--font-size-base)", cursor: "pointer", border: primary ? "1px solid var(--color-success-border)" : "1px solid var(--color-border-light)", background: primary ? "var(--color-success-bg)" : "transparent", color: primary ? "var(--color-success-text)" : "var(--color-text-secondary)" });

// TASKS.csv #2424 — the plane of the in-plane pairs: the block-estimation trend's (its minor axis is the normal) or horizontal
function planeOf(kind, trend) {
  if (trend && kind !== "horizontal") { const m = trendBasis(trend).minor; return { normal: { x: m.x, y: m.y, z: m.z }, label: tr("of the trend \"{name}\"", { name: trend.name }) }; }
  return { normal: { x: 0, y: 0, z: 1 }, label: tr("horizontal") };
}
// the median length of the assayed samples of this element (the composite-length hint for a pure-nugget downhole variogram)
function medianSampleLength(assays, symbol) {
  const l = [];
  for (const a of assays || []) { const f = Number(a.from), t = Number(a.to); if (t > f && Number.isFinite(a.values?.[symbol])) l.push(t - f); }
  if (!l.length) return null;
  l.sort((x, y) => x - y);
  return l[l.length >> 1];
}
