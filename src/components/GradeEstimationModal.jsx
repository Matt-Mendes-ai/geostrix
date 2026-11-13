import React, { useEffect, useMemo, useRef, useState } from "react";
import { trendRatioText } from "../lib/trend.js"; // TASKS.csv #2423
import CompositeLengthNote from "./CompositeLengthNote.jsx"; // TASKS.csv #2549
import { belowDrilling } from "../lib/belowDrilling.js"; // TASKS.csv #2546
import { buildMeshQuery, isPointInsideMesh, isMeshClosed } from "../lib/meshQuery.js"; // TASKS.csv #517
import { validateSolid } from "../lib/meshValidate.js"; // TASKS.csv #860
import { X, Play } from "./icons.js";
import { compositeDownhole, rawSampleIntervals, PRECIOUS_METALS, capAudit, lengthWeightedPercentile, gradeUnitLabel, resolvedSegments } from "../lib/geochem.js"; // gradeUnitLabel: #2218; // rawSampleIntervals: #571; lengthWeightedPercentile: #1573
import CapAuditHint from "./CapAuditHint.jsx"; // TASKS.csv #533
import EstimateCheck from "./EstimateCheck.jsx"; // TASKS.csv #1051
import { NEAR_UNSAMPLED_HOLES } from "../lib/unsampledFlags.js"; // TASKS.csv #3065
import { estimateCheck, swath } from "../lib/estimateCheck.js"; // TASKS.csv #3060 — worked out during the run
import { excludeQAQC, labAssays } from "../lib/qaqc.js"; // TASKS.csv #266
import { samplePointsFromIntervals, MAX_BLOCKS, ESTIMATION_METHODS, SUPPORT_COLORS, summarizeSupport, supportInReach, supportBeyondReach, retallyKeptCells } from "../lib/estimation.js"; // retallyKeptCells: #2106
import { BLOCK_MODEL_BUDGETS, MAX_BLOCK_MODEL_BUDGET, blockModelBudgetNote, cellToFit, blockModelLattice, snapBoundsToLattice, overlapBox, blockModelExtent /* #2729 */ } from "../lib/estimationMeta.js"; // TASKS.csv #626; block-model budgets: #661
import { runEstimation } from "../lib/estimationClient.js"; // TASKS.csv #520 — off the UI thread
import { setChoices, setOthers, newSetId, setRecord, memberName, domainNameSuffix, trimLike, memberSummary, MAX_SET_ELEMENTS, MEMBER_OWN_KEYS } from "../lib/estimateSet.js"; // TASKS.csv #3014 — several elements in one run
import { makeReachClient } from "../lib/blockReachClient.js"; // TASKS.csv #1416; in a worker: #1579
import { preferredElement, rememberElement } from "../lib/preferredElement.js"; // TASKS.csv #2552
import { useLeadCommodity } from "../lib/useLeadCommodity.js"; // TASKS.csv #2552
import { sampledByHole, unsampledDrillPoints } from "../lib/insideSampling.js"; // TASKS.csv #2596
import { verticalReach } from "../lib/blockReach.js"; // TASKS.csv #2422 — a flat trend's vertical reach, as the estimator counts it
import { desurveyHole } from "../lib/desurvey.js";
import { gradeStops } from "../lib/inversion.js"; // TASKS.csv #702
import { LAYER_META } from "../lib/layers.js";
import { useEscapeKey } from "../lib/useEscapeKey.js";
import { useFocusTrap } from "../lib/useFocusTrap.js";
import { overlay } from "../lib/modalStyles.js";
import { useStore } from "../lib/store.jsx";
import { pointInPolygon } from "../lib/pointInPolygon.js"; // TASKS.csv #1570 // TASKS.csv #135 — project desurvey method
import { activateOnKey } from "../lib/a11y.js"; // TASKS.csv #238 — Enter/Space on clickable non-button elements
import { arrMin, arrMax } from "../lib/arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)
import { trendBasis, trendSearchScales, describeTrend } from "../lib/trend.js"; // TASKS.csv #650
import { flatSearchTrend, flatSearchProposal } from "../lib/estimationShape.js"; // TASKS.csv #2418
import { t as tr } from "../lib/i18n.js";
import GeochemCompositingNote from "./GeochemCompositingNote.jsx"; // TASKS.csv #2224
import CollarLevelsNote from "./CollarLevelsNote.jsx"; // TASKS.csv #2584 — the lowest collar used where collars stand on benches
import { holeSpacingSummary, zeroBlockAdvice, searchFromSpacingM } from "../lib/holeSpacing.js"; // TASKS.csv #1738; searchFromSpacingM: #2420
import { topCompositesWithoutBlocks } from "../lib/shellSupport.js"; // TASKS.csv #1735 // TASKS.csv #786
import { domainLayerChoices, foldDomainRows } from "../lib/domainLayers.js"; // TASKS.csv #1571; foldDomainRows: #2427
import { numericSourceChoices, sourceAssays, logPoints, unlogValue } from "../lib/numericSources.js"; // TASKS.csv #1741 — a downhole log or a numeric layer field as the source
import DomainCaps from "./DomainCaps.jsx"; // TASKS.csv #1571
import { solidChoices } from "../lib/solidChoices.js"; // TASKS.csv #1578
import { lazyModal } from "../lib/lazyModal.jsx";
import { collarsLookUnderground, collarBenches } from "../lib/pitShell.js"; // TASKS.csv #2217; collarBenches: #2584
import { stampEpsg } from "../lib/provenance.js"; // TASKS.csv #2195
import UnsampledChoice, { useUnsampled, unsampledResultLine, resolveUnsampled } from "./UnsampledChoice.jsx"; // resolveUnsampled: #3014 // TASKS.csv #2417 / #2542
const GradeTonnageModal = lazyModal(() => import("./GradeTonnageModal.jsx")); // TASKS.csv #1577 — from the result, not only from Geophysics

// TASKS.csv #117 — grade estimation into block models (not just display). Micromine-specialist AND
// Leapfrog-specialist audits both independently flagged this as the top 3D-Modelling gap: GeoStrix
// could import/display someone else's block model but had no in-app engine to populate one FROM the
// project's own composited assays — the actual "resource estimation" step both Micromine and Leapfrog
// Edge are built around. Depends on downhole compositing (#118, implemented alongside this) as its
// input — see lib/estimation.js's top comment for why kriging isn't offered here (needs a fitted
// variogram as a genuine prerequisite, not just a harder formula dropped into the same loop).
// checkedHoleIds (a Set, or null) and areaStrings (closed design strings): two more grid sources, TASKS.csv #1570
// TASKS.csv #1580 (review #1497, Lawyers) — the dialog's settings come back when it is reopened in the session, per project: a reopen
// started again on IDW, no cap, 50 m radius and an automatic cell. A value that no longer applies (an element, domain, volume or block
// model not in the project, a cap kept for another element) starts at its default.
const lastEstimateSettings = new Map(); // project key -> settings
export const estimateSettingsKey = (project) => String(project?.id ?? project?.name ?? "");
export default function GradeEstimationModal({ modelArea = null /* #2544 */, assays: assaysProp, assayElements: assayElementsProp, layers, collars, survey, onAddModel, onClose, volumeShells = [], trend: modelTrend = null, groundAt = null, groundSource = null, checkedHoleIds = null, areaStrings = [] }) { // groundAt: TASKS.csv #803; groundSource "terrain" | "collars": #1616
  useEscapeKey(onClose); // TASKS.csv #238
  useFocusTrap(); // TASKS.csv #238
  const { desurveyMethod, voxelModels, project, customLayers = [] } = useStore(); // TASKS.csv #135 — estimation samples must sit on the same trace the 3D view draws; customLayers: #1571
  // TASKS.csv #1741 / #1708 (review #1645, Copley) — a numeric downhole log (mag susc, SG) or a numeric field of a custom layer (a SWIR
  // wavelength, a chalcopyrite %) is estimated like a grade: its rows become assay-shaped intervals under one "element"
  const saved = useRef(lastEstimateSettings.get(estimateSettingsKey(project)) || null).current; // #1580
  const keep = (k, d, ok = () => true) => (saved && saved[k] !== undefined && ok(saved[k]) ? saved[k] : d);
  const [sourceKey, setSourceKey] = useState(() => keep("sourceKey", "assay", (k) => k === "assay" || numericSourceChoices({ layers, customLayers, models: false }).some((x) => x.key === k)));
  const numericSources = useMemo(() => numericSourceChoices({ layers, customLayers, models: false /* #2397 — not a model of a model */ }), [layers, customLayers]);
  const source = useMemo(() => numericSources.find((s) => s.key === sourceKey) || null, [numericSources, sourceKey]);
  const sourceData = useMemo(() => (source ? sourceAssays(source, { layers, customLayers }) : null), [source, layers, customLayers]);
  const assaysIn = sourceData ? sourceData.assays : assaysProp, assayElements = sourceData ? sourceData.assayElements : assayElementsProp;
  const [logValues, setLogValues] = useState(() => keep("logValues", false)); // log10 values: each block a geometric mean, the usual for susceptibility
  const assays = useMemo(() => labAssays(assaysIn), [assaysIn]), pxrfLeft = (assaysIn || []).length - assays.length; // #1673 — lab grades only
  const elementUnits = useMemo(() => Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit])), [assayElements]);
  // TASKS.csv #1744 (review #1645) — only elements with a lab value (pXRF-only and empty columns cannot be estimated); #2552 / #2429 — it opens on
  // the element last used here, else the project's lead commodity (lib/preferredElement.js), not the file's first column
  const symbols = useMemo(() => { const all = assayElements.map((e) => e.symbol); if (sourceData) return all; const has = new Set(); for (const a of assays) for (const k in a.values || {}) if (Number.isFinite(a.values[k])) has.add(k); return all.filter((s) => has.has(s)); }, [assayElements, assays, sourceData]);
  const lead = useLeadCommodity();
  const [symbol, setSymbolRaw] = useState(() => keep("symbol", preferredElement(symbols, "estimate", lead) || symbols[0] || "Au", (v) => sourceKey !== "assay" || symbols.includes(v)));
  const setSymbol = (v) => { setSymbolRaw(v); if (sourceKey === "assay") rememberElement("estimate", v); };
  const unit = elementUnits[symbol] || "ppm";
  // TASKS.csv #3014 — other elements estimated in the same run, on the same grid, search and domain rule, added as a set (assays only)
  const [setPicked, setSetPicked] = useState(() => keep("setOthers", [], Array.isArray));
  const others = useMemo(() => (sourceKey === "assay" ? setOthers(setPicked, symbols, symbol) : []), [setPicked, symbols, symbol, sourceKey]);
  const [stage, setStage] = useState(null); // the element being run, while a set runs

  const [useComposites, setUseComposites] = useState(() => keep("useComposites", true));
  const [compositeLength, setCompositeLength] = useState(() => keep("compositeLength", 2));
  // TASKS.csv #262 — minCoverage was hardcoded at 0.5 here (and in the grade-shell tool), so a
  // half-missing-core composite silently counted as a full sample in the estimate with no way to
  // tighten it. Same control CompositingModal has always exposed, same 0.5 default (unchanged
  // behaviour until the user moves it).
  const [minCoverage, setMinCoverage] = useState(() => keep("minCoverage", 0.5));
  const [domainKey, setDomainKey] = useState(() => keep("domainKey", "", (k) => !k || domainLayerChoices(layers, customLayers, (x) => x).some((c) => c.key === k)));
  // TASKS.csv #1413 (review #1352) — a layer of numbers (Silvertip's RQD %) is not a domain: every distinct value became one
  // TASKS.csv #1571 (review #1497, Lawyers) — every categorical interval layer, custom layers included (Lawyers' Min Domain), is a domain choice
  const domainChoices = useMemo(() => domainLayerChoices(layers, customLayers, (k) => tr(LAYER_META[k].label)), [layers, customLayers]);
  const domainChoice = domainChoices.find((c) => c.key === domainKey) || null;
  const domainFold = useMemo(() => (domainChoice ? foldDomainRows(domainChoice.rows) : null), [domainChoice]); // #2427 — Dcb = DCB = DCb
  const domainRowsSel = domainFold ? domainFold.rows : null;
  const [capByDomain, setCapByDomain] = useState(() => (saved && saved.symbol === symbol && saved.domainKey === domainKey ? saved.capByDomain || {} : {})); // TASKS.csv #1571 — { domain value: cap }, blank = the global cap

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
  // #1570 — the same box over a subset of the holes (the checked ones)
  const boundsOfHoles = (keep) => {
    const assayed = new Set(assays.map((a) => a.hole_id));
    const byHole = new Map();
    survey.forEach((s) => { if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []); byHole.get(s.hole_id).push(s); });
    let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity, holes = 0;
    for (const c of collars) {
      if (assayed.size && !assayed.has(c.hole_id)) continue;
      if (keep && !keep(c)) continue;
      let trace = [];
      try { trace = desurveyHole(c, byHole.get(c.hole_id) || [], desurveyMethod) || []; } catch { trace = []; }
      if (!trace.length) continue;
      holes++;
      for (const p of trace) {
        if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y;
        if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z;
      }
    }
    return holes && Number.isFinite(xmin) ? { xmin, xmax, ymin, ymax, zmin, zmax, holes } : null;
  };
  const traceBounds = useMemo(() => {
    const assayed = new Set(assays.map((a) => a.hole_id));
    const byHole = new Map();
    survey.forEach((s) => { if (!byHole.has(s.hole_id)) byHole.set(s.hole_id, []); byHole.get(s.hole_id).push(s); });
    let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity, holes = 0;
    const traces = [], traceOf = new Map(); // TASKS.csv #1416 — for the blocks within reach of the drilling; traceOf: hole -> trace, reused by the run (#3008)
    for (const c of collars) {
      if (assayed.size && !assayed.has(c.hole_id)) continue;
      let trace = [];
      try { trace = desurveyHole(c, byHole.get(c.hole_id) || [], desurveyMethod) || []; } catch { trace = []; }
      if (!trace.length) continue;
      traces.push(trace); traceOf.set(c.hole_id, trace);
      holes++;
      for (const p of trace) {
        if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x; if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y;
        if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z;
      }
    }
    return holes && Number.isFinite(xmin) ? { xmin, xmax, ymin, ymax, zmin, zmax, holes, traces, traceOf } : null;
  }, [assays, collars, survey, desurveyMethod]);

  const [padding, setPadding] = useState(() => keep("padding", 25));
  // TASKS.csv #2416 (review #2325, WA uranium) — the cell size is always a positive number: on a matched grid the over-budget button offered
  // 'Use null m blocks' and set it to null, and back on 'Fit to the drilling' the window died. A remembered null is read as the default too.
  const [cellSize, setCellSizeRaw] = useState(() => { const v = Number(keep("cellSize", 10)); return Number.isFinite(v) && v > 0 ? v : 10; });
  const setCellSize = (v) => setCellSizeRaw((p) => { const n = typeof v === "function" ? v(p) : v; return Number.isFinite(n) && n > 0 ? n : p; });
  // TASKS.csv #2418 — a cell height of its own (blank = cubic) and a flat search typed here (the vertical reach; blank = a sphere)
  const [cellHeight, setCellHeight] = useState(() => { const v = Number(keep("cellHeight", "")); return Number.isFinite(v) && v > 0 ? v : ""; });
  const [flatReach, setFlatReach] = useState(() => { const v = Number(keep("flatReach", "")); return Number.isFinite(v) && v > 0 ? v : ""; });
  // TASKS.csv #724 — the grid: "data" (the drilling's box + padding, as before), "model:<id>" (an existing block model's
  // cell size and origin, so the estimate's centroids coincide with it), or "origin" (the cell size above on a typed origin)
  // TASKS.csv #2425 (review #2325) — Model settings › Model area = the checked holes: the grid fits them too, as the Grade shell's does (#2059);
  // samples follow it since #2544. A remembered model match or origin still wins; a remembered 'data' box does not override the Model area.
  const areaChecked = modelArea === "checked" && checkedHoleIds?.size > 0 && collars.some((c) => !checkedHoleIds.has(c.hole_id));
  const [gridMode, setGridMode] = useState(() => keep("gridMode", areaChecked ? "checked" : "data", (g) => !(areaChecked && g === "data") && (!g.startsWith("model:") || (voxelModels || []).some((m) => m.id === g.slice(6)))));
  const [originE, setOriginE] = useState(() => keep("originE", "")); const [originN, setOriginN] = useState(() => keep("originN", "")); const [originZ, setOriginZ] = useState(() => keep("originZ", ""));
  const latticeModels = useMemo(() => (voxelModels || []).map((m) => ({ m, L: blockModelLattice(m) })).filter((x) => x.L), [voxelModels]);
  // TASKS.csv #626 — block budget, as the grade shell's (#625): a per-computer preference, 200,000 by default
  const [blockBudget, setBlockBudgetState] = useState(() => { try { return Math.min(MAX_BLOCK_MODEL_BUDGET, Number(localStorage.getItem("geostrix.estimateBlockBudget")) || MAX_BLOCKS); } catch { return MAX_BLOCKS; } });
  const setBlockBudget = (v) => { setBlockBudgetState(v); try { localStorage.setItem("geostrix.estimateBlockBudget", String(v)); } catch { /* private window */ } };
  const [method, setMethod] = useState(() => keep("method", "idw2"));
  // TASKS.csv #709 — ordinary kriging's variogram: blank = fitted to the composites at run time
  const sameElement = saved && saved.symbol === symbol; // a variogram and a cap belong to their element
  const [vgModel, setVgModel] = useState(() => (sameElement ? keep("vgModel", "spherical") : "spherical"));
  const [vgNugget, setVgNugget] = useState(() => (sameElement ? keep("vgNugget", "") : "")), [vgSill, setVgSill] = useState(() => (sameElement ? keep("vgSill", "") : "")), [vgRange, setVgRange] = useState(() => (sameElement ? keep("vgRange", "") : ""));
  const [addedKv, setAddedKv] = useState(false);
  const [searchRadius, setSearchRadius] = useState(() => keep("searchRadius", 50));
  // #2418 — the model's structural trend when one is chosen for block estimation; otherwise the flat search typed in the dialog
  const flatTrend = !modelTrend ? flatSearchTrend(searchRadius, flatReach, tr("flat search")) : null;
  const trend = modelTrend || flatTrend;
  const [minSamples, setMinSamples] = useState(() => keep("minSamples", 1));
  const [minHoles, setMinHoles] = useState(() => keep("minHoles", 2));          // TASKS.csv #258
  const [materialHoles, setMaterialHoles] = useState(() => keep("materialHoles", true)); // TASKS.csv #1573 — a second hole must carry at least 5 % of the weight
  const [maxSamples, setMaxSamples] = useState(() => keep("maxSamples", 16));
  const [maxPerHole, setMaxPerHole] = useState(() => keep("maxPerHole", 0)); // TASKS.csv #709 — 0 = no explicit cap
  const [capValue, setCapValue] = useState(() => (sameElement ? keep("capValue", NaN) : NaN));        // TASKS.csv #259
  const capClearedFor = useRef(null); // TASKS.csv #1573 — the element whose default cap the user emptied: no refill
  const [capAuto, setCapAuto] = useState(() => (sameElement ? keep("capAuto", false) : false));
  const [includeQAQC, setIncludeQAQC] = useState(() => keep("includeQAQC", false)); // TASKS.csv #266
  const [restrictToDomain, setRestrictToDomain] = useState(() => keep("restrictToDomain", false)); // TASKS.csv #260
  const [noCodeAsDomain, setNoCodeAsDomain] = useState(() => keep("noCodeAsDomain", false)); // TASKS.csv #2541 — the samples with no code as a domain of their own
  const [classifySupport, setClassifySupport] = useState(() => keep("classifySupport", true)); // TASKS.csv #91/#92
  const [shellId, setShellId] = useState(() => keep("shellId", "", (id) => !id || (volumeShells || []).some((v) => v.id === id))); // TASKS.csv #517 — restrict to a closed modelled volume ("" = none)
  // TASKS.csv #1570 (review #1497, Lawyers) — the grid spanned the whole district even when the estimate was restricted to one solid
  // (Lawyers: 100 x 116 x 17 blocks of 53.5 m, 99 % empty, the 0.3 g/t shell holding 131 of them). Restricted, the grid is the
  // solid's box where it overlaps the drilling's (the solid's own box when they do not overlap), so a prospect gets small blocks.
  const shellBox = useMemo(() => {
    const sh = shellId ? (volumeShells || []).find((v) => v.id === shellId) : null;
    const pos = sh?.positions;
    if (!pos || pos.length < 9) return null;
    let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
    for (let i = 0; i + 2 < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; if (z < zmin) zmin = z; if (z > zmax) zmax = z;
    }
    return Number.isFinite(xmin) ? { xmin, xmax, ymin, ymax, zmin, zmax, name: sh.name } : null;
  }, [shellId, volumeShells]);
  const drillBox = traceBounds || collarBounds;
  // TASKS.csv #1570 (the open part) — two more grid sources: the box of the CHECKED holes (the sidebar's Holes list), and the box of
  // a closed design string (Mine Design › Strings), whose blocks outside the polygon are dropped after the run. Either gives one
  // prospect small blocks on a district-wide project (Lawyers: 53.5 m blocks over 5 x 6 km, 99 % empty).
  const checkedCount = checkedHoleIds ? collars.filter((c) => checkedHoleIds.has(c.hole_id)).length : collars.length;
  const checkedBounds = useMemo(() => (gridMode === "checked" && checkedHoleIds ? boundsOfHoles((c) => checkedHoleIds.has(c.hole_id)) : null), [gridMode, checkedHoleIds, assays, collars, survey, desurveyMethod]);
  const areaString = gridMode.startsWith("string:") ? (areaStrings || []).find((s) => s.id === gridMode.slice(7)) || null : null;
  const areaBox = useMemo(() => {
    if (!areaString || !drillBox) return null;
    const xs = areaString.vertices.map((q) => q[0]), ys = areaString.vertices.map((q) => q[1]);
    return { xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys), zmin: drillBox.zmin, zmax: drillBox.zmax, name: areaString.name };
  }, [areaString, drillBox]);
  const gridBox = shellBox ? (drillBox ? overlapBox(shellBox, drillBox) || shellBox : shellBox) : areaBox ? (overlapBox(areaBox, drillBox) || areaBox) : gridMode === "checked" && checkedBounds ? checkedBounds : drillBox;
  const [belowGround, setBelowGround] = useState(() => keep("belowGround", true)); // TASKS.csv #803 — drop blocks whose centre is above the terrain
  // TASKS.csv #2217 — with no terrain the "ground" is interpolated between the collars: not a ground at all when the holes were drilled from underground
  const underground = useMemo(() => (groundSource === "collars" ? collarsLookUnderground(collars, survey) : null), [groundSource, collars, survey]);
  const cutAtGround = belowGround && !underground?.underground;
  const [modelName, setModelName] = useState("");
  const [result, setResult] = useState(null); // { cells, blocksEstimated, blocksSkipped, grid, samplePointCount, droppedCount } | null
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  const qaqcExcludedCount = useMemo(() => assays.length - excludeQAQC(assays).length, [assays]);
  // TASKS.csv #2544 (review #2486) — 'Fit to the checked holes' moved the grid, but all 21,500 composites (aircore included) still informed every
  // run: the samples can come from the checked holes too, by default when Model area says so (the Grade shell's rule, #2059)
  const [samplesFrom, setSamplesFrom] = useState(() => (modelArea === "checked" && checkedHoleIds?.size ? "checked" : "all"));
  const sampleAssays = useMemo(() => (samplesFrom === "checked" && checkedHoleIds?.size ? assays.filter((a) => checkedHoleIds.has(a.hole_id)) : assays), [assays, samplesFrom, checkedHoleIds]);
  const srcAssays = useMemo(() => (includeQAQC ? sampleAssays : excludeQAQC(sampleAssays)), [sampleAssays, includeQAQC]);
  // TASKS.csv #3006 (WA iron review) — with the samples from the checked holes, the holes the run uses are the checked ones: every unchecked hole
  // was a hole 'never assayed' (5,968 of them, 288,935 m written at 0 % Fe by the barren option, the composite mean 38.3 -> 1.78 %) and its
  // drilled metres 'unsampled drilling' nearer than a block's samples. A hole left out of the run is neither sampled nor unsampled.
  const runCollars = useMemo(() => (samplesFrom === "checked" && checkedHoleIds?.size ? collars.filter((c) => checkedHoleIds.has(c.hole_id)) : collars), [collars, samplesFrom, checkedHoleIds]);
  const uns = useUnsampled("estimate", { assays: srcAssays, collars: runCollars /* #3006 */, symbol, unit, elementUnits, layers, customLayers }); // TASKS.csv #2417 / #2542; layers / customLayers: a picked log, #2721
  // TASKS.csv #1738 (review #1645, Copley) — how far apart the holes are, under the radius and in a zero-block result
  // TASKS.csv #2062 (review #2013, Woodjam) — over the holes that carry the chosen element, not every collar: 534 district collars with no
  // assays made it '442 drill sites ... typically 82 m from the next' for an estimate informed by 8 holes in clusters 3-5 km apart
  const assayedHoles = useMemo(() => { const s = new Set(); for (const a of srcAssays) if (Number.isFinite(a.values?.[symbol])) s.add(a.hole_id); return s; }, [srcAssays, symbol]);
  const spacingCollars = useMemo(() => { const c = collars.filter((x) => assayedHoles.has(x.hole_id)); return c.length ? c : collars; }, [collars, assayedHoles]);
  const spacing = useMemo(() => holeSpacingSummary(spacingCollars), [spacingCollars]);
  // TASKS.csv #2420 (review #2325, WA uranium) — the search opens from the drilling: 2.5 x the typical site spacing (sites 77 m apart ->
  // 190 m), not 50 m beside a line saying the holes are 77 m apart (0.45 % of the grid estimated, 137 of the 294 highest composites with
  // no block). A remembered or typed radius is kept.
  const searchFromSpacing = !(saved && saved.searchRadius !== undefined) && spacing?.medianM > 0 ? searchFromSpacingM(spacing.medianM) : null;
  const searchTouched = useRef(false);
  useEffect(() => { if (searchFromSpacing && !searchTouched.current) setSearchRadius(searchFromSpacing); }, [searchFromSpacing]);

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

  // TASKS.csv #1573 (review #1497, Lawyers) — a CV over 150 % starts CAPPED at P99 (the default run on Lawyers was uncapped: one
  // 52.8 g/t sample made a 13.3 g/t block); emptying the cap runs uncapped for that element, and the result says which
  useEffect(() => {
    if (!(elementCV > 150)) { setCapAuto(false); return; }
    if (!symbol || (Number.isFinite(capValue) && capValue > 0) || capClearedFor.current === symbol) return;
    const p99 = lengthWeightedPercentile(srcAssays, symbol, unit, elementUnits, 99);
    if (Number.isFinite(p99) && p99 > 0) { setCapValue(Number(p99.toPrecision(4))); setCapAuto(true); }
  }, [symbol, elementCV]); // the cap and the assays are read when the element or its CV changes, on purpose
  const matched = gridMode.startsWith("model:") ? latticeModels.find((x) => x.m.id === gridMode.slice(6)) || null : null;
  const originOk = [originE, originN, originZ].every((v) => v !== "" && Number.isFinite(Number(v)));
  const cellDz = cellHeight > 0 ? cellHeight : cellSize; // #2418
  const lattice = matched ? matched.L : gridMode === "origin" && originOk ? { dx: cellSize, dy: cellSize, dz: cellDz, ox: Number(originE), oy: Number(originN), oz: Number(originZ) } : null;
  const cell3 = lattice ? { dx: lattice.dx, dy: lattice.dy, dz: lattice.dz } : { dx: cellSize, dy: cellSize, dz: cellDz };
  const dataBounds = gridBox ? { // #521 — the traces' box (collar box only as a fallback)
    xmin: gridBox.xmin - padding, xmax: gridBox.xmax + padding,
    ymin: gridBox.ymin - padding, ymax: gridBox.ymax + padding,
    zmin: gridBox.zmin - padding, zmax: gridBox.zmax + padding,
  } : null;
  // TASKS.csv #2729 — 'Match <model>': its extent too, so a by-product (#2598) lands on the same blocks
  const matchedExtent = useMemo(() => (matched ? blockModelExtent(matched.m) : null), [matched]);
  const bounds = matchedExtent || (dataBounds && lattice ? snapBoundsToLattice(dataBounds, lattice) : dataBounds); // #724
  const gridPreview = bounds ? {
    nx: Math.max(1, Math.round((bounds.xmax - bounds.xmin) / cell3.dx)),
    ny: Math.max(1, Math.round((bounds.ymax - bounds.ymin) / cell3.dy)),
    nz: Math.max(1, Math.round((bounds.zmax - bounds.zmin) / cell3.dz)),
  } : null;
  const totalBlocksPreview = gridPreview ? gridPreview.nx * gridPreview.ny * gridPreview.nz : 0;
  const gridDiagonalM = bounds ? Math.round(Math.hypot(bounds.xmax - bounds.xmin, bounds.ymax - bounds.ymin, bounds.zmax - bounds.zmin)) : 0; // #710: what radius 0 becomes
  // TASKS.csv #1416 (review #1352, Silvertip) — the estimate keeps only the blocks a composite can reach (lib/blockReach.js), so the
  // budget counts the blocks within the search radius of the drill traces (composites lie on them: never fewer than the run's),
  // not the box: Silvertip's three pads ~1 km apart made a 2.3 M-block box of which a few per cent can be estimated
  const reachRadius = searchRadius > 0 ? searchRadius : null;
  // TASKS.csv #1579 (review #1497, Lawyers) — the reach count and the cell-fit searches run in a worker (lib/blockReach.worker.js): on
  // Lawyers (446 holes, a 5 x 6 km box) they froze the window 1.2-1.7 s when the dialog opened. Until the answer for the current
  // grid comes back the dialog says it is counting, and Run waits.
  const reachClient = useRef(null);
  if (!reachClient.current) reachClient.current = makeReachClient();
  useEffect(() => () => reachClient.current?.stop(), []);
  // TASKS.csv #2422 (review #2325) — the count is of the blocks the run can fill: a structural trend whose short axis is vertical reaches
  // only radius / minor up and down (the estimator's own verticalReach), and with 'Restrict to a modelled volume' only the samples
  // inside the solid inform the run, so only the trace parts inside it count (lib/reachSolid.js, in the reach worker). A flat search
  // typed here (#2418) keeps its vertical reach.
  const reachRz = flatTrend ? flatReach : modelTrend && reachRadius ? verticalReach(reachRadius, { basis: trendBasis(modelTrend), scales: trendSearchScales(modelTrend) }) : null;
  const solidCache = useRef({ key: null, closed: false });
  const reachSolid = (() => {
    const sh = shellId ? (volumeShells || []).find((v) => v.id === shellId) : null;
    if (!sh?.positions || !sh?.indices) return null;
    const key = `${sh.id}:${sh.positions.length}:${sh.indices.length}`; // the parent rebuilds the arrays every render: a stable key
    if (solidCache.current.key !== key) solidCache.current = { key, closed: !!isMeshClosed(sh.positions, sh.indices)?.closed };
    return solidCache.current.closed ? { key, positions: sh.positions, indices: sh.indices, name: sh.name } : null; // an open mesh is refused at Run
  })();
  const reachArgs = traceBounds?.traces?.length && reachRadius && bounds ? { traces: traceBounds.traces, bounds: { xmin: bounds.xmin, xmax: bounds.xmax, ymin: bounds.ymin, ymax: bounds.ymax, zmin: bounds.zmin, zmax: bounds.zmax }, cell3: { dx: cell3.dx, dy: cell3.dy, dz: cell3.dz }, radius: reachRadius, rz: reachRz, ...(modelTrend && !flatTrend ? { metric: { basis: trendBasis(modelTrend), scales: trendSearchScales(modelTrend) } } : {}) /* #2696: the tilted ellipsoid, as the estimator counts it */, ...(reachSolid ? { solid: reachSolid } : {}) /* #2422 */, fixedDz: cellHeight > 0 && !matched ? cellHeight : null /* #2418 */, budget: blockBudget, maxBudget: MAX_BLOCK_MODEL_BUDGET, from: cellSize, fitAllowed: !matched } : null;
  const reachKey = reachArgs ? JSON.stringify([reachArgs.bounds, reachArgs.cell3, reachRadius, reachArgs.rz, reachArgs.metric ?? null /* #2696 */, reachSolid?.key ?? null, reachArgs.fixedDz, blockBudget, cellSize, !!matched, traceBounds.traces.length]) : null;
  const [reachState, setReachState] = useState(null); // { key, reach, tooBig, fitCell, fitCellMax }
  useEffect(() => {
    if (!reachArgs) return undefined;
    let live = true;
    const t = setTimeout(() => {
      const { promise, latest } = reachClient.current.request(reachArgs);
      promise.then((r) => { if (live && latest()) setReachState({ key: reachKey, ...r }); }).catch(() => { if (live && latest()) setReachState({ key: reachKey, reach: null, tooBig: false, failed: true }); });
    }, 120); // typing a cell size or radius sends one request, not one per key
    return () => { live = false; clearTimeout(t); };
  }, [reachKey, traceBounds]);
  const reachPending = !!reachArgs && reachState?.key !== reachKey;
  const reach = reachArgs && !reachPending && reachState && !reachState.failed ? { reach: reachState.reach, tooBig: reachState.tooBig } : null;
  const blocksInReach = reach ? (reach.tooBig ? Infinity : reach.reach) : totalBlocksPreview;
  const overLimit = !reachPending && blocksInReach > blockBudget; // #626; #1416 — the blocks in reach
  // TASKS.csv #2418 — the data's case for a flat search (near-vertical holes, a sampled span far shorter than the hole spacing), offered
  const sampledSpans = useMemo(() => {
    const m = new Map();
    for (const a of srcAssays) {
      const f = Number(a.from), t = Number(a.to);
      if (!Number.isFinite(a.values?.[symbol]) || !Number.isFinite(f) || !Number.isFinite(t)) continue;
      const p = m.get(a.hole_id); if (!p) m.set(a.hole_id, [f, t]); else { if (f < p[0]) p[0] = f; if (t > p[1]) p[1] = t; }
    }
    return [...m.values()].map(([f, t]) => t - f);
  }, [srcAssays, symbol]);
  const flatProposal = useMemo(() => (modelTrend || matched ? null : flatSearchProposal({ traces: traceBounds?.traces, spans: sampledSpans, spacingM: spacing?.medianM, compositeM: useComposites ? compositeLength : 2 })), [modelTrend, matched, traceBounds, sampledSpans, spacing, useComposites, compositeLength]);
  const proposalApplied = !!flatProposal && Number(flatReach) === flatProposal.reachV && Number(searchRadius) === flatProposal.radius && cellSize === flatProposal.cell && Number(cellHeight) === flatProposal.cellHeight;
  const cellLabel = matched || cell3.dz !== cell3.dx ? (cell3.dx === cell3.dy && cell3.dy === cell3.dz ? cell3.dx : `${cell3.dx}×${cell3.dy}×${cell3.dz}`) : cellSize; // #724 — names say the real block size; #2418 a cell height
  const fitCell = overLimit && bounds && !matched ? (reachArgs ? reachState?.fitCell ?? null : cellToFit(bounds, blockBudget, cellSize)) : null;
  const fitCellMax = overLimit && bounds && !matched && blockBudget < MAX_BLOCK_MODEL_BUDGET ? (reachArgs ? reachState?.fitCellMax ?? null : cellToFit(bounds, MAX_BLOCK_MODEL_BUDGET, cellSize)) : null;
  // TASKS.csv #1416 (review #1352) — the default 10 m cell could not run on Silvertip (2.3 M blocks over the budget, Run disabled): the
  // first time the grid is over the budget, before the cell size is touched, the cell that fits is filled in, and said
  const cellTouched = useRef(!!(saved && saved.cellSize !== undefined)); // #1580 — a remembered cell is not refitted
  const [autoCell, setAutoCell] = useState(null);
  // TASKS.csv #2543 (review #2486) — the cell chosen for the budget did not fit it: 15 m 'for the 200,000-block budget' gave 202,924 blocks in
  // reach and Run stayed disabled (the worker's fit is checked at the new cell only after it is set). A cell the dialog chose is refitted
  // upward (never down, so it cannot oscillate) until the blocks in reach fit; a cell the user typed is left alone, as before.
  useEffect(() => {
    if (!fitCell) return;
    if (!cellTouched.current) { cellTouched.current = true; setAutoCell(fitCell); setCellSize(fitCell); return; }
    if (autoCell != null && cellSize === autoCell && fitCell > cellSize) { setAutoCell(fitCell); setCellSize(fitCell); }
  }, [fitCell]); // autoCell / cellSize read as they are when the fit changes
  // #1570 — a restricting solid changes the box: a cell the dialog chose (not typed) is chosen again for it, 10 m when that fits
  useEffect(() => {
    if (!bounds || matched || autoCell == null || cellSize !== autoCell) return undefined;
    let live = true;
    const done = (c) => { if (live && c && c !== cellSize) { setAutoCell(c); setCellSize(c); } };
    if (!reachArgs) { done(cellToFit(bounds, blockBudget, 10)); return undefined; } // #1416 — 10 m when its blocks in reach fit
    const { promise } = reachClient.current.request({ ...reachArgs, fitAllowed: false, fit10: true }, "fit10"); // #2636: its own channel, so the count is not dropped
    promise.then((r) => done(r.fit10)).catch(() => {});
    return () => { live = false; };
  }, [shellBox, areaBox, checkedBounds]); // #1570: any change of the box's source

  // #1580 — what to restore next time: kept current every render, stored when the dialog closes
  const remember = useRef(null);
  remember.current = { sourceKey, logValues, symbol, useComposites, compositeLength, minCoverage, domainKey, noCodeAsDomain, capByDomain, padding, cellSize, cellHeight, flatReach, gridMode, originE, originN, originZ, method, vgModel, vgNugget, vgSill, vgRange, searchRadius, minSamples, minHoles, materialHoles, maxSamples, maxPerHole, capValue, capAuto, includeQAQC, restrictToDomain, classifySupport, shellId, belowGround, setOthers: setPicked /* #3014 */ };
  const settingsKey = estimateSettingsKey(project);
  useEffect(() => () => { lastEstimateSettings.set(settingsKey, remember.current); }, [settingsKey]);
  // TASKS.csv #520 — the estimate runs in a worker: the window keeps repainting, shows progress and can be cancelled
  const [progress, setProgress] = useState(null); // 0..1 while running
  const abortRef = useRef(null);
  const cancelRun = () => abortRef.current?.abort();
  const run = () => {
    setError(""); setResult(null); setProgress(0);
    if (!collars.length) { setError(tr("No collars loaded — nothing to estimate from.")); return; }
    // TASKS.csv #676 — with fewer samples than holes, no block can ever reach the hole rule (it just reported 0 blocks)
    if (maxSamples < minHoles) { setError(tr("Max samples per block ({maxSamples}) is below Min distinct holes ({minHoles}), so no block could ever be estimated. Raise Max samples or lower Min holes.", { maxSamples, minHoles })); return; }
    if (!bounds) { setError(tr("None of the loaded collars has a recorded length or any survey data, so there's no defensible depth to build a grid down to. Import hole lengths or survey records first — GeoStrix will not assume one.")); return; }
    if (!uns.ready) { setError(tr("Choose how the unsampled metres inside the sampled holes are read (and, for barren, type their value) before running.")); setProgress(null); return; } // #2417
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
        const filled = uns.apply(srcAssays), runAssays = filled.assays; // #2417 / #2542 — barren: the unsampled metres filled at the typed value
        if (useComposites) {
          intervals = compositeDownhole(runAssays, symbol, unit, elementUnits, {
            length: compositeLength, minCoverage, // TASKS.csv #262 — was hardcoded 0.5
            capValue: cap,
            domainRows: domainRowsSel, // #1571 — a built-in or a custom layer
            ...(domainRowsSel && Object.values(capByDomain).some((v) => Number(v) > 0) ? { capByDomain: Object.fromEntries(Object.entries(capByDomain).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) } : {}), // #1571
          });
        } else {
          // TASKS.csv #571 — duplicates / overlaps resolved, values in `unit`, as in compositing
          const raw = rawSampleIntervals(runAssays, symbol, unit, elementUnits, { capValue: cap });
          intervals = raw.intervals;
          rawStats = raw.stats;
        }
        await new Promise((r) => setTimeout(r, 0)); // TASKS.csv #3060 — compositing, placing the points and the unsampled metres were one ~1 s task: the window paints between them
        let { points, dropped, clamped, beyondTrace } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        // TASKS.csv #2721 — each composite's share of its metres filled from the picked log (its value is partly the log's)
        const logFills = uns.mode === "log" ? (filled.fills || []).filter((f) => f.unsampledFill === "log") : [];
        if (logFills.length) {
          const byHole = new Map(); for (const f of logFills) (byHole.get(f.hole_id) || byHole.set(f.hole_id, []).get(f.hole_id)).push(f);
          points = points.map((p) => { const L = byHole.get(p.hole_id); if (!L) return p; let m = 0; for (const f of L) { const a = Math.max(p.from, f.from), b = Math.min(p.to, f.to); if (b > a) m += b - a; } return m > 0 ? { ...p, logFrac: Math.min(1, m / Math.max(1e-9, p.to - p.from)) } : p; });
        }
        // TASKS.csv #517 — a hard boundary at a closed modelled volume: only samples inside it inform the estimate,
        // and only blocks whose centre is inside it are kept (a block outside is not estimated, not set to zero)
        let inShell = null, shellInfo = null;
        if (shellId) {
          const sh = (volumeShells || []).find((v) => v.id === shellId);
          const closed = sh ? isMeshClosed(sh.positions, sh.indices) : null;
          if (!sh || !closed?.closed) { setError(sh ? tr("\"{name}\" is not a closed solid ({boundaryEdges} open edges) — it has no inside to restrict to.", { name: sh.name, boundaryEdges: closed.boundaryEdges }) : tr("That volume is no longer in the project.")); setRunning(false); return; }
          // TASKS.csv #860 — a shell that crosses itself has no well-defined inside (parity flips inside the overlap)
          const vs = validateSolid(sh.positions, sh.indices);
          if (vs.selfIntersectingPairs > 0) { setError(tr("\"{name}\" crosses itself ({n} triangle pairs), so it has no well-defined inside to restrict to. Fix or rebuild it first.", { name: sh.name, n: vs.selfIntersectingPairs })); setRunning(false); return; }
          const q = buildMeshQuery(sh.positions, sh.indices);
          inShell = (p) => isPointInsideMesh(q, p);
          const before = points.length;
          points = points.filter((p) => inShell(p));
          shellInfo = { name: sh.name, samplesInside: points.length, samplesOutside: before - points.length };
        }
        if (!points.length) { setError(shellInfo ? tr("No {symbol} samples fall inside \"{name}\".", { symbol, name: shellInfo.name }) : tr("No sample points could be placed in 3D — check that holes have collars and (ideally) survey data.")); setRunning(false); return; }
        let logInfo = null; // TASKS.csv #1741 — a geometric mean per block: interpolate log10 values, convert the blocks back below
        if (logValues) logInfo = logPoints(points);
        const estPts = logInfo ? logInfo.points : points; // the raw points stay for the checks and the composite statistics
        // TASKS.csv #292 — an unbounded search makes every sample a candidate for every block
        // (measured: 81 s of blocked main thread at 62,500 blocks x 5,000 points). 0 now means "cap at
        // the grid's own diagonal", which is a mathematical no-op but a real computational bound.
        const gridDiagonal = Math.sqrt(
          (bounds.xmax - bounds.xmin) ** 2 + (bounds.ymax - bounds.ymin) ** 2 + (bounds.zmax - bounds.zmin) ** 2
        );
        // TASKS.csv #1411 — no search radius: support is still scored against a distance from the data, twice the median spacing
        // between the holes' sample centroids (a fan's holes spread apart at depth), not the grid diagonal
        let supportRef = 0;
        if (!(searchRadius > 0)) {
          const cen = new Map();
          for (const p of points) { const c = cen.get(p.hole_id) || { x: 0, y: 0, z: 0, n: 0 }; c.x += p.x; c.y += p.y; c.z += p.z; c.n++; cen.set(p.hole_id, c); }
          const cs = [...cen.values()].map((c) => [c.x / c.n, c.y / c.n, c.z / c.n]);
          const nn = cs.map((a) => Math.min(...cs.filter((b) => b !== a).map((b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])))).filter(Number.isFinite).sort((a, b) => a - b);
          if (nn.length) supportRef = Math.max(2 * nn[nn.length >> 1], 2 * Math.max(cell3.dx, cell3.dy, cell3.dz));
        }
        const ac = new AbortController(); abortRef.current = ac;
        await new Promise((r) => setTimeout(r, 0)); // #3060
        // TASKS.csv #2596 (review #2486, WA lithium) — every hole's drilled metres with no sample of this element (barren-filled metres count
        // as sampled: #2417), so each block can be flagged when such a metre is nearer to it than its nearest sample
        const unsampledPointsFor = (rows, el, u) => { // #3014 — per element: a set's members get their own
          const sampled = sampledByHole(resolvedSegments(rows, el, u, elementUnits));
          const byHole = new Map(); for (const sv of survey) { if (!byHole.has(sv.hole_id)) byHole.set(sv.hole_id, []); byHole.get(sv.hole_id).push(sv); }
          // #3008 — the traces desurveyed when the dialog opened are reused; only the holes it skipped (no assay) are desurveyed here
          const known = traceBounds?.traceOf;
          const traces = runCollars.map((c) => { let pts = known?.get(c.hole_id) || null; if (!pts) { try { pts = desurveyHole(c, byHole.get(c.hole_id) || [], desurveyMethod) || []; } catch { pts = []; } } return { hole_id: c.hole_id, pts }; }); // runCollars: #3006
          const pad = Math.min(searchRadius > 0 ? searchRadius : gridDiagonal, 1000);
          const step = Math.max(1, Math.min(useComposites ? compositeLength : 2, Math.min(cell3.dx, cell3.dy, cell3.dz) / 2));
          return unsampledDrillPoints(traces, sampled, step, { xmin: bounds.xmin - pad, xmax: bounds.xmax + pad, ymin: bounds.ymin - pad, ymax: bounds.ymax + pad, zmin: bounds.zmin - pad, zmax: bounds.zmax + pad });
        };
        const unsPts = unsampledPointsFor(runAssays, symbol, unit);
        await new Promise((r) => setTimeout(r, 0)); // #3060
        // #3014 — the grid, search and domain rule, shared by a set's members
        const baseOpts = {
          bounds, cellSize: cell3, maxBlocks: blockBudget, // #626; cell3 / bounds: the matched lattice (#724)
          method, searchRadius: searchRadius > 0 ? searchRadius : gridDiagonal, minSamples, maxSamples, maxPerHole, // maxPerHole: #709
          minHoles,                                              // TASKS.csv #258
          materialHoles,                                         // TASKS.csv #1573
          restrictToDomain: restrictToDomain && !!domainKey, noCodeAsDomain: restrictToDomain && !!domainKey && noCodeAsDomain /* #2541 */,     // TASKS.csv #260
          support: classifySupport,                              // TASKS.csv #91/#92
          ...(supportRef > 0 ? { supportRef } : {}),             // #1411
          ...(trend ? { trend: { basis: trendBasis(trend), scales: trendSearchScales(trend) } } : {}), // TASKS.csv #650 — ellipsoidal search
        };
        const share = others.length ? 1 / (1 + others.length) : 1; // #3014 — the primary's part of the progress bar
        setStage(others.length ? symbol : null);
        const est = await runEstimation("block", estPts, {
          ...baseOpts,
          ...(method === "ok" ? { variogram: { model: vgModel, ...(vgNugget !== "" && vgSill !== "" && vgRange !== "" ? { nugget: Number(vgNugget), sill: Number(vgSill), range: Number(vgRange) } : {}) } } : {}), // #709
          ...(unsPts.length ? { unsampledPoints: unsPts } : {}), // #2596
          ...(logFills.length ? { logShare: true } : {}), // #2721
        }, { onProgress: (f) => setProgress(share * (method === "nn" ? f : 0.8 * f)), signal: ac.signal });
        // TASKS.csv #1051 — a nearest-neighbour model over the same grid, search, domains and trend (one sample per block,
        // so it is cheap): its mean over the same blocks is the declustered mean the estimate is checked against
        const nnEst = method === "nn" ? est : await runEstimation("block", estPts, {
          bounds, cellSize: cell3, maxBlocks: blockBudget, method: "nn", searchRadius: searchRadius > 0 ? searchRadius : gridDiagonal,
          minSamples: 1, maxSamples: 1, minHoles: 1, restrictToDomain: restrictToDomain && !!domainKey, noCodeAsDomain: restrictToDomain && !!domainKey && noCodeAsDomain /* #2541 */,
          ...(trend ? { trend: { basis: trendBasis(trend), scales: trendSearchScales(trend) } } : {}),
        }, { onProgress: (f) => setProgress(share * (0.8 + 0.2 * f)), signal: ac.signal, checkOnly: true /* #3060 — only joined against the estimate: kept as columns */ });
        if (logInfo) { for (const c of est.cells) c.value = unlogValue(c.value); if (nnEst !== est) { const v = nnEst.checkColumns.value; for (let i = 0; i < v.length; i++) v[i] = unlogValue(v[i]); } } // #1741 — back to data units
        // TASKS.csv #404 — the parameters are captured AT RUN TIME (the form can be edited before
        // "Add to project"), and travel with the block model into the project file.
        let outsideArea = 0; // #1570 — set below when a design-string area drops blocks; params read it, so it is declared first
        const params = {
          tool: "Grade estimation", element: symbol, method, samplesFrom: samplesFrom === "checked" && checkedHoleIds?.size ? `holes checked in the Holes list (${checkedCount} of ${collars.length})` : "every hole", /* #2544 */ cellSizeM: matched || cell3.dz !== cell3.dx ? [cell3.dx, cell3.dy, cell3.dz] : cellSize, paddingM: padding, // #2423: the #2544 note had commented out cellSizeM and paddingM
          ...(lattice ? { gridOrigin: [lattice.ox, lattice.oy, lattice.oz], gridMatched: matched ? matched.m.name : "typed origin" } : {}), // #724
          gridFrom: shellBox ? `box of the restricting solid "${shellBox.name}" within the drilling` : areaString ? `inside the closed design string "${areaString.name}" (${outsideArea} block(s) outside it dropped)` : gridMode === "checked" && checkedBounds ? `desurveyed traces of the ${checkedBounds.holes} checked hole(s)` : traceBounds ? `desurveyed traces of ${traceBounds.holes} assayed hole(s)` : "collar box (no hole could be desurveyed)", // #521; #1570
          searchRadiusM: searchRadius > 0 ? searchRadius : Math.round(gridDiagonal), searchRadiusWasUnlimited: !(searchRadius > 0), ...(supportRef > 0 ? { supportScoredAgainstM: Math.round(supportRef) } : {}), // #1411
          minSamples, maxSamples, minHoles, maxSamplesPerHole: maxPerHole || null,
          // TASKS.csv #3255 — the record says whether #1573's 5 % rule was on (two models differing only in it had identical parameters)
          ...(minHoles > 1 ? { secondHoleRule: materialHoles ? "a second hole counts when it carries at least 5 % of the inverse-distance weight, except for a block within a cell of its nearest composite (there every hole in reach counts)" : "every hole in reach counts" } : {}),
          searchTrend: trend ? { name: trend.name, dip: trend.dip, dipAzimuth: trend.dipAzimuth, pitch: trend.pitch, ratios: trend.ratios, ellipsoidM: [1, trend.ratios.int / trend.ratios.max, trend.ratios.min / trend.ratios.max].map((f) => Math.round(f * (searchRadius > 0 ? searchRadius : gridDiagonal))) } : null, // #650
          composited: useComposites, compositeLengthM: useComposites ? compositeLength : null, minCoverage: useComposites ? minCoverage : null,
          capValue: Number.isFinite(cap) ? cap : null, capAudit: cap != null ? capAudit(srcAssays, symbol, unit, elementUnits, cap) : null, includeQAQC, // capAudit: #533
          // TASKS.csv #529 — the unit of the estimated values and of the cap (an "Au" column could be ppm or ppb); and the
          // domain fields, which #533's edit had left inside the comment above (estimates since then lacked them)
          unit, capUnit: cap != null ? unit : null, domain: domainChoice ? domainChoice.label : null, ...(domainRowsSel && Object.values(capByDomain).some((v) => Number(v) > 0) ? { capByDomain: Object.fromEntries(Object.entries(capByDomain).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])) } : {}), /* #1571 */ restrictToDomain: restrictToDomain && !!domainKey, noCodeAsDomain: restrictToDomain && !!domainKey && noCodeAsDomain /* #2541 */, // #2423: the #1571 note had commented these out of the record
          desurveyMethod: desurveyMethod || "minimum curvature", samplePoints: points.length, generatedAt: new Date().toISOString(),
          ...uns.params(filled), beyondFlagged: true, // #2417 / #2542 — the unsampled metres' reading; each block flagged above / below its samples
          nearUnsampledFlagged: true, unsampledDrillPoints: unsPts.length, // #2596 — each block flagged when unsampled drilling is nearer than its nearest sample
          nearUnsampledHoles: NEAR_UNSAMPLED_HOLES, // #3065 — the test took the run's holes (#3006): a model without this, from the checked holes, may carry stale flags
          ...(source ? { source: `${source.label} (${sourceData.assays.length} readings, values as logged)`, valueTransform: logInfo ? `log10 (each block a geometric mean; ${logInfo.belowFloor} value(s) at or below zero floored at ${logInfo.floor})` : "none", ...(sourceData.pointRows ? { pointSupportM: sourceData.pointSupport } : {}) } : {}), // #1741
        };
        if (est.mlsCounts) params.mlsBlocks = est.mlsCounts; // #516 — how the linear trend was fitted
        if (est.variogram) { params.variogram = { ...est.variogram, frame: trend ? `in the trend "${trend.name}" frame: the range is along its major axis` : "isotropic" }; params.krigingBlocks = est.okCounts; } // #709
        if (est.dominatedCells) params.effectivelyOneHoleBlocks = est.dominatedCells; // #676 — 2+ holes, one with >= 95 % of the weight
        if (est.piercedBlocks) params.drilledBlocks = { blocks: est.piercedBlocks.blocks, estimated: est.piercedBlocks.estimated, holes: est.piercedBlocks.holes, holesWithNone: est.piercedBlocks.holesEmpty.length }; // #3255
        est.blocksBeforeTrims = est.cells.length; // #2106
        if (inShell) { // #517
          const before = est.cells.length;
          est.cells = est.cells.filter((c) => inShell(c));
          est.blocksSkipped += before - est.cells.length; est.blocksEstimated = est.cells.length;
          params.restrictedToVolume = `${shellInfo.name}: ${shellInfo.samplesInside} sample(s) inside used, ${shellInfo.samplesOutside} outside left out; ${before - est.cells.length} block(s) outside it dropped`;
          params.restrictedToVolumeName = shellInfo.name; // #2069 — the default name says it
          // TASKS.csv #1410 (review #1352) — the tallies describe the blocks kept, not the whole grid (they read "22 estimated" beside
          // "48 extrapolated, 190,032 unsupported"). Unsupported blocks have no cell, so inside or outside cannot be told: not counted.
          // The recount itself now runs once, after every trim (#2106, below).
        }
        // TASKS.csv #803 — Matt: "I can't get my grade shell block model to end at surface". The grid is padded around the
        // samples, so near the surface its top layers were in the air: a block whose centre is above the terrain is dropped
        // (outside the terrain's footprint nothing is known, so nothing is dropped)
        // #1570 — a design-string area: blocks whose centre is outside the polygon are dropped
        if (areaString) {
          const pts = areaString.vertices.map((q) => ({ x: q[0], y: q[1] }));
          const before = est.cells.length;
          est.cells = est.cells.filter((c) => pointInPolygon(c.x, c.y, pts));
          outsideArea = before - est.cells.length;
          est.blocksSkipped += outsideArea; est.blocksEstimated = est.cells.length;
          est.cutOutsideArea = outsideArea;
        }
        await new Promise((r) => setTimeout(r, 0)); // TASKS.csv #3060 — the ground cut (a terrain lookup per block) is a task of its own
        if (groundAt && cutAtGround) { // cutAtGround: #2217
          const before = est.cells.length;
          est.cells = est.cells.filter((c) => { const g = groundAt(c.x, c.y); return !(Number.isFinite(g) && c.z > g); });
          const cut = before - est.cells.length;
          est.blocksSkipped += cut; est.blocksEstimated = est.cells.length;
          params.cutAtTerrain = groundSource === "collars" ? `${cut} block(s) whose centre is above the ground interpolated between the collars dropped (no terrain)${((b) => (b.higher.length ? `; ${b.higher.length} collar(s) with another collar within ${b.planM} m in plan over ${b.rlM} m lower left out of that ground, so the lowest collar is used there (benches)` : ""))(collarBenches(collars))}` /* #2584 */ : `${cut} block(s) whose centre is above the terrain dropped`; // #1616
          params.groundFrom = groundSource || "terrain";
          est.cutAboveGround = cut;
        }
        // TASKS.csv #2106 — every trim above (volume, area, terrain) drops blocks: recount the one-hole / dominated / support tallies from
        // the blocks kept, or the one-hole share read 102 % on Woodjam after the terrain cut
        if (est.cells.length !== est.blocksBeforeTrims) {
          const t = retallyKeptCells(est.cells, { method, supportCounts: est.supportCounts, dropUnsupported: !!inShell });
          est.singleHoleCells = t.singleHoleCells; est.dominatedCells = t.dominatedCells;
          if (t.supportCounts) est.supportCounts = t.supportCounts;
          if (est.dominatedCells) params.effectivelyOneHoleBlocks = est.dominatedCells; else delete params.effectivelyOneHoleBlocks;
        }
        // TASKS.csv #1735 (review #1645, Copley) — the highest composites with no estimated block within a cell of them: the
        // two-hole rule left the only Cu intercept without a block and put the copper 90-110 m away
        await new Promise((r) => setTimeout(r, 0)); // TASKS.csv #2547 — the checks after the worker answers run as separate tasks, so the window paints between them
        est.topUnsupported = topCompositesWithoutBlocks(points, est.cells, Math.max(cell3.dx, cell3.dy, cell3.dz), { bounds }); // #2418: the real cell; bounds: #2456
        { let all = 0, out = 0; for (const c of est.cells) { const m = Math.max(0, c.value) * c.dx * c.dy * c.dz; all += m; if (c.beyond) out += m; } est.beyondShare = all > 0 ? out / all : 0; } // #2417 — metal share above / below every informing sample
        { let all = 0, near = 0, nb = 0; for (const c of est.cells) { const m = Math.max(0, c.value) * c.dx * c.dy * c.dz; all += m; if (c.nearUnsampled) { near += m; nb++; } } est.nearUnsampledShare = all > 0 ? near / all : 0; est.nearUnsampledCount = nb; } // #2596 — the kept blocks
        if (logFills.length) { let all = 0, lg = 0; for (const c of est.cells) { const m = Math.max(0, c.value) * c.dx * c.dy * c.dz; all += m; lg += m * (c.fromLog || 0); } est.fromLogShare = all > 0 ? lg / all : 0; } // #2721
        await new Promise((r) => setTimeout(r, 0)); // #2547
        est.belowDrilling = belowDrilling(est.cells, points, Number(searchRadius) || 0); // TASKS.csv #2546
        // TASKS.csv #3060 — the check against the NN model and the first swath (Easting) worked out here, a task each, so the result's first
        // render reads them (lib/estimateCheck.js keeps them) instead of joining every block inside it
        const nnCheck = method === "nn" ? est.cells : nnEst.checkColumns;
        await new Promise((r) => setTimeout(r, 0)); estimateCheck(est.cells, nnCheck, points);
        await new Promise((r) => setTimeout(r, 0)); swath(est.cells, nnCheck, points, "x");
        await new Promise((r) => setTimeout(r, 0)); 
        // TASKS.csv #3014 — the set's other elements: the same grid (bounds, cell size and budget: the same lattice), search, trend and domain
        // rule. Each is composited on its own (a sample missing the element is left out for it), takes the unsampled-metres choice saved for it
        // here (else left out), has no top cut (a cap belongs to its element), and kriging fits its own variogram; then the primary's trims.
        const members = [];
        const inArea = areaString ? ((pts) => (x, y) => pointInPolygon(x, y, pts))(areaString.vertices.map((q) => ({ x: q[0], y: q[1] }))) : null;
        for (let k = 0; k < others.length; k++) {
          const el = others[k], u = elementUnits[el] || "ppm";
          setStage(el);
          await new Promise((r) => setTimeout(r, 0));
          const unsM = resolveUnsampled("estimate", { assays: srcAssays, collars: runCollars, symbol: el, unit: u, elementUnits, logCtx: { layers, customLayers } });
          const fm = unsM.apply(srcAssays), rows = fm.assays;
          const iv = useComposites ? compositeDownhole(rows, el, u, elementUnits, { length: compositeLength, minCoverage, capValue: null, domainRows: domainRowsSel }) : rawSampleIntervals(rows, el, u, elementUnits, { capValue: null }).intervals;
          let mp = samplePointsFromIntervals(iv, collars, survey, desurveyHole, desurveyMethod).points;
          if (inShell) mp = mp.filter((q) => inShell(q));
          if (!mp.length) { members.push({ ...memberSummary(el, u, [], 0), cells: [] }); continue; }
          const mUns = unsampledPointsFor(rows, el, u);
          let me;
          try {
            me = await runEstimation("block", mp, { ...baseOpts, ...(method === "ok" ? { variogram: { model: vgModel } } : {}), ...(mUns.length ? { unsampledPoints: mUns } : {}) }, { onProgress: (f) => setProgress(share * (1 + k + f)), signal: ac.signal });
          } catch (err) { if (err.cancelled) throw err; throw new Error(`${el}: ${err.message}`); }
          const t = trimLike(me.cells, { inShell, inArea, groundAt: groundAt && cutAtGround ? groundAt : null });
          let supportCounts = me.supportCounts, dominated = me.dominatedCells;
          if (t.dropped) { const rt = retallyKeptCells(t.cells, { method, supportCounts, dropUnsupported: !!inShell }); if (rt.supportCounts) supportCounts = rt.supportCounts; dominated = rt.dominatedCells; }
          const mParams = { ...params };
          for (const key of MEMBER_OWN_KEYS) delete mParams[key];
          Object.assign(mParams, {
            element: el, unit: u, capValue: null, capUnit: null, samplePoints: mp.length, ...unsM.params(fm), unsampledDrillPoints: mUns.length,
            ...(me.variogram ? { variogram: { ...me.variogram, frame: params.variogram?.frame }, krigingBlocks: me.okCounts } : {}), ...(me.mlsCounts ? { mlsBlocks: me.mlsCounts } : {}),
            ...(dominated ? { effectivelyOneHoleBlocks: dominated } : {}),
            ...(t.dropped ? { trimmedLikeThePrimary: `${t.dropped} block(s) dropped by the primary's limits (the restricting solid, the area string, the ground)` } : {}),
          });
          members.push({ ...memberSummary(el, u, t.cells, mp.length), cells: t.cells, params: mParams, supportCounts });
        }
        setStage(null);
        const withBlocks = members.filter((m) => m.cells.length);
        if (withBlocks.length) { const set = setRecord(newSetId(), symbol, withBlocks.map((m) => m.element)); params.set = set; for (const m of withBlocks) m.params.set = set; }
        setResult({ ...est, params, members, nnCells: nnCheck /* #3060 */, checkPoints: points, samplePointCount: points.length, noCodeComposites: domainKey ? points.filter((p) => p.domain == null).length : 0 /* #2541 */, droppedCount: dropped, clampedCount: clamped, beyondTraceCount: beyondTrace, rawStats, intervalCount: intervals.length });
        setAdded(false); setAddedSupport(false); setAddedKv(false); // a fresh run invalidates every "Added ✓" state
      } catch (e) {
        setError(e.cancelled ? tr("Estimation cancelled.") : (e.message || tr("Estimation failed.")));
      }
      abortRef.current = null; setProgress(null); setStage(null);
      setRunning(false);
    }, 40);
  };

  const [added, setAdded] = useState(false);
  const [gtOpen, setGtOpen] = useState(false); // TASKS.csv #1577
  const [addedSupport, setAddedSupport] = useState(false); // TASKS.csv #92
  // TASKS.csv #92 — same cells, `value` swapped for the 0–1 Data Support Index. Named explicitly so it
  // can never be mistaken for a grade model or for a statistical confidence surface once it is sitting
  // in the project's model list months later.
  // TASKS.csv #1737 (review #1645, Copley) — a result is named from ITS settings, not the dialog's current ones: a capped Cu IDW2 result was
  // added as "Au estimate (ok, 20.5m)" after the form had been changed
  const resultName = () => {
    const p = result?.params || {};
    const c = Array.isArray(p.cellSizeM) ? (p.cellSizeM.every((v) => v === p.cellSizeM[0]) ? p.cellSizeM[0] : p.cellSizeM.join("×")) : p.cellSizeM;
    const r = p.searchRadiusM > 0 && !p.searchRadiusWasUnlimited ? `, r${Math.round(p.searchRadiusM)}m` : searchRadius > 0 ? `, r${Math.round(searchRadius)}m` : ""; // #1752 — estimates at different radii get different names
    const tr3 = trendRatioText(p.searchTrend || p.anisotropy), a = tr3 ? `, ${tr3}` : ""; // #2423 — estimates under different trends get different names
    // TASKS.csv #2069 (review #2013, Woodjam) — a restricted estimate and the whole-grid one had the same name; so did one from the checked holes
    const chk = /^holes checked in the Holes list \((\d+) of/.exec(p.samplesFrom || ""), w = p.restrictedToVolumeName ? `, in ${p.restrictedToVolumeName}` : "", h = chk ? `, ${chk[1]} checked holes` : "";
    const dn = domainNameSuffix(p); // #3014 — a hard-boundary estimate says so: ", by Lithology"
    return modelName.trim() || (p.element ? `${p.element} estimate (${p.method}, ${c}m${r}${a}${w}${h}${dn})` : `${symbol} estimate (${method}, ${cellLabel}m${r}${a})`);
  };
  const addSupportModel = () => {
    if (!result || !result.cells.length) return;
    const base = resultName();
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
    const base = resultName(); // #1737
    const cells = result.cells.filter((c) => Number.isFinite(c.kv)).map((c) => ({ x: c.x, y: c.y, z: c.z, dx: c.dx, dy: c.dy, dz: c.dz, value: c.kv, nSamples: c.nSamples, nHoles: c.nHoles }));
    onAddModel({ name: `${base} — kriging variance (data layout, not a grade error)`, source: "kriging-variance", cells, params: { ...result.params, value: `kriging variance (${unit} squared): how well the samples' layout constrains the block under the variogram` } });
    setAddedKv(true);
  };
  // TASKS.csv #702 — the shared grade ramp (lib/inversion.js gradeStops), the one a geoML estimate gets too
  const rampOf = (cells) => {
    let gMin = Infinity, gMax = -Infinity;
    for (const c of cells) { if (Number.isFinite(c.value)) { if (c.value < gMin) gMin = c.value; if (c.value > gMax) gMax = c.value; } }
    return gMin <= gMax ? { min: gMin, max: gMax, colorMode: "continuous", stops: gradeStops(gMin, gMax) } : {};
  };
  const addToProject = () => {
    if (!result || !result.cells.length) return;
    const name = resultName(); // #1737
    const set = result.params?.set; // #3014 — the set's models are added together, each named for its element and the set
    const p0 = result.params?.element || symbol, typed = !!modelName.trim();
    onAddModel({ name: set ? memberName(name, p0, p0, set, typed) : name, source: `estimate-${method}`, cells: result.cells, ...rampOf(result.cells), params: result.params }); // params: TASKS.csv #404
    if (set) for (const m of result.members || []) if (m.cells.length) onAddModel({ name: memberName(name, p0, m.element, set, typed), source: `estimate-${method}`, cells: m.cells, ...rampOf(m.cells), params: m.params });
    setAdded(true);
  };

  return (
    <div style={overlay}>
      <div style={panel} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={{ fontSize: "var(--font-size-lg)", color: "var(--color-accent-dark)", fontWeight: 600 }}>{tr("Grade estimation → block model")}</div>
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Nearest-neighbour, inverse-distance, moving-least-squares or ordinary-kriging interpolation from composited assays. {collars} holes, {assays} raw intervals loaded.", { collars: collars.length, assays: assays.length })}{" "}{tr("{h} of the holes have {symbol} values{v}.", { h: assayedHoles.size, symbol, v: !includeQAQC && qaqcExcludedCount ? tr("; {q} QC sample(s) left out", { q: qaqcExcludedCount }) : "" })}{/* #2062 */}</div>
          </div>
          <X role="button" tabIndex={0} onKeyDown={activateOnKey} aria-label={tr("Close")} size={18} style={{ cursor: "pointer", color: "var(--color-text-secondary)" }} onClick={onClose} />
        </div>

        <div style={{ padding: 16, overflow: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            {numericSources.length > 0 && <label style={fieldLabel} title={tr("Assays, or a numeric downhole log / a numeric field of a custom layer, estimated like a grade")}>{tr("Source")}{/* #1741 */}
              <select value={sourceKey} onChange={(e) => { const k = e.target.value, s = numericSources.find((x) => x.key === k); setSourceKey(k); setSymbol(s ? s.symbol : (assayElementsProp[0]?.symbol || "Au")); setLogValues(!!s?.logScale); setCapValue(NaN); setResult(null); }} style={inp}>
                <option value="assay">{tr("Assays")}</option>
                {numericSources.map((s) => <option key={s.key} value={s.key}>{tr("{label} ({n} readings)", { label: s.label, n: s.n.toLocaleString() })}</option>)}
              </select>
            </label>}
            {source && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", paddingBottom: 6 }} title={tr("Interpolates log10 of the values and converts the blocks back, so each block is a geometric mean — the usual choice for susceptibility, which varies over decades. Values at or below zero are floored at half the smallest positive value.")}>
              <input type="checkbox" checked={logValues} onChange={(e) => setLogValues(e.target.checked)} />{tr("Interpolate log10 values")}
            </label>}
            {sourceData && <div style={{ width: "100%", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("{n} readings from {label}, values as logged (the import does not rescale them){v}.", { n: sourceData.assays.length.toLocaleString(), label: source.label, v: sourceData.pointRows ? tr("; {p} depth-only readings are given {s} m of core each", { p: sourceData.pointRows.toLocaleString(), s: sourceData.pointSupport }) : "" })}</div>}
            <label style={fieldLabel}>{tr("Element")}<select value={symbol} onChange={(e) => { setSymbol(e.target.value); setCapValue(NaN); setResult(null); }} style={inp}>{/* #1736 — a cap belongs to its element */}
                {symbols.map((s) => <option key={s} value={s}>{s} ({gradeUnitLabel(s, elementUnits[s] || "ppm")})</option>)}{/* #2429 — g/t for gold, as the cap field */}
              </select>
            </label>
            {/* TASKS.csv #3014 — other elements estimated in the same run and added with it as a set */}
            {sourceKey === "assay" && setChoices(symbols, symbol).length > 0 && (
              <details style={{ fontSize: "var(--font-size-sm)", paddingBottom: 6 }} open={others.length > 0}>
                <summary style={{ cursor: "pointer" }} title={tr("Estimates other elements in the same run, on the same blocks, with the same search and domain rule, and adds them with this one as a set of block models. Each is composited on its own. The top cut and a typed variogram apply to {symbol} only; the unsampled metres of each other element are read as you last chose for it here, else left out.", { symbol })}>{others.length ? tr("Also estimate: {list}", { list: others.join(", ") }) : tr("Also estimate other elements…")}</summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 10px", marginTop: 4, maxWidth: 520 }}>
                  {setChoices(symbols, symbol).map((s) => {
                    const on = others.includes(s), full = !on && others.length >= MAX_SET_ELEMENTS - 1;
                    return <label key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: full ? "var(--color-text-muted)" : undefined }}>
                      <input type="checkbox" checked={on} disabled={full} onChange={(e) => { const want = new Set(setPicked); if (e.target.checked) want.add(s); else want.delete(s); setSetPicked([...want]); setResult(null); }} />{s}
                    </label>;
                  })}
                </div>
                {others.length >= MAX_SET_ELEMENTS - 1 && <div style={{ color: "var(--color-text-muted)", marginTop: 2 }}>{tr("Up to {n} elements in one run.", { n: MAX_SET_ELEMENTS })}</div>}
              </details>
            )}
            <label style={fieldLabel}>{tr("Method")}{/* TASKS.csv #87 — the method list comes from estimation.js's own table so the dropdown
                  and the estimator can never disagree about what a method id means. */}
              <select value={method} onChange={(e) => setMethod(e.target.value)} style={inp} title={tr(ESTIMATION_METHODS.find((m) => m.id === method)?.blurb || "")}>
                {ESTIMATION_METHODS.map((m) => <option key={m.id} value={m.id}>{tr(m.label)}</option>)}
              </select>
            </label>
            {method === "ok" && (
              <div style={{ flex: "1 1 100%", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end", padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}
                title={tr("The variogram ordinary kriging weights the composites with. Leave nugget, sill and range blank to fit one to these composites at run time (omnidirectional; with a trend, in the trend's frame, so the range is along its major axis). The Variogram tool shows the experimental points if you want to choose them yourself.")}>
                <label style={fieldLabel}>{tr("Variogram model")}<select value={vgModel} onChange={(e) => setVgModel(e.target.value)} style={inp} aria-label={tr("Variogram model")}>
                    <option value="spherical">{tr("Spherical")}</option><option value="exponential">{tr("Exponential")}</option><option value="gaussian">{tr("Gaussian")}</option>
                  </select>
                </label>
                {[[tr("Nugget"), vgNugget, setVgNugget], [tr("Sill (total)"), vgSill, setVgSill], [tr("Range (m)"), vgRange, setVgRange]].map(([l, v, set]) => (
                  <label key={l} style={{ ...fieldLabel, width: 90 }}>{l}
                    <input type="number" min="0" step="any" value={v} placeholder={tr("fit")} onChange={(e) => set(e.target.value)} style={inp} aria-label={tr("Variogram {l}", { l })} />
                  </label>
                ))}
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flex: "1 1 160px" }}>{tr("Blank = fitted to these composites when you run. Values in the estimated unit ({unit}), squared for nugget and sill.", { unit })}</div>
              </div>
            )}
            {flatProposal && !proposalApplied && ( /* TASKS.csv #2418 — offered, from these holes; never applied by itself */
              <div role="note" style={{ fontSize: "var(--font-size-sm)", marginBottom: 6, lineHeight: 1.45, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
                {tr("These holes look flat-lying at the drilling's scale: {v}% of {n} holes are within 5° of vertical, drilled over {d} m of depth across {w} m (the holes {sp} m apart, sampled over a median {span} m). A flat search fits that: {r} m across and {h} m up and down, on {c} × {c} × {ch} m cells.", { v: Math.round(flatProposal.vertical * 100), n: flatProposal.holes, d: Math.round(flatProposal.depthM), w: Math.round(flatProposal.widthM).toLocaleString(), span: Math.round(flatProposal.spanM), sp: Math.round(flatProposal.spacingM), /* #3011 */ r: flatProposal.radius, h: flatProposal.reachV, c: flatProposal.cell, ch: flatProposal.cellHeight })}{" "}
                <button type="button" onClick={() => { cellTouched.current = true; setAutoCell(null); setSearchRadius(flatProposal.radius); setFlatReach(flatProposal.reachV); setCellSize(flatProposal.cell); setCellHeight(flatProposal.cellHeight); }} style={{ fontSize: "var(--font-size-sm)" }}>{tr("Use it")}</button>
              </div>
            )}
            {spacing && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>{tr(spacing.sites === 2 ? "Holes: the two drill sites are {near} m apart. Two holes must both lie within the search radius of a block for it to count (Min distinct holes)." : "Holes: {sites} drill sites, the nearest {near} m apart, typically {median} m from the next (up to {far} m). Two holes must both lie within the search radius of a block for it to count (Min distinct holes).", { sites: spacing.sites, near: Math.round(spacing.nearestM), median: Math.round(spacing.medianM), far: Math.round(spacing.farthestM) })}</div>}{/* #1738 */}
            {searchFromSpacing && !searchTouched.current && searchRadius === searchFromSpacing && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 4, lineHeight: 1.4 }}>{tr("Search radius {r} m: 2.5 times the {m} m typical spacing, so a block between two holes reaches both.", { r: searchFromSpacing, m: Math.round(spacing.medianM) })}</div>}{/* #2420 */}
            <label style={fieldLabel} title={tr("No sample within this distance of a block leaves it un-estimated (no cell), rather than extrapolating grade far from any real data. 0 = no radius assumption, capped internally at the grid's own diagonal so the run can't hang.")}>{tr("Search radius (m, 0 = no limit)")}<input type="number" min="0" step="any" value={searchRadius} onChange={(e) => { searchTouched.current = true; setSearchRadius(Math.max(0, Number(e.target.value) || 0)); }} style={inp} />
              {trend && !(searchRadius > 0) && gridDiagonalM > 0 && ( /* #710: 0 is not "no limit" across the trend */
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontWeight: 400 }}>{tr("Along trend \"{name}\": with no radius the search reaches the grid diagonal ({d} m) along the trend but only {v} × {v2} m across it ({v3}); a sample farther across the trend is left out.", { name: trend.name, d: gridDiagonalM, v: Math.round((gridDiagonalM * trend.ratios.int) / trend.ratios.max), v2: Math.round((gridDiagonalM * trend.ratios.min) / trend.ratios.max), v3: describeTrend(trend) })}</span>
              )}
              {trend && searchRadius > 0 && (
                <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", fontWeight: 400 }}>{tr("Along trend \"{name}\": an ellipsoid of {searchRadius} × {v} × {v2} m ({v3})", { name: trend.name, searchRadius, v: Math.round((searchRadius * trend.ratios.int) / trend.ratios.max), v2: Math.round((searchRadius * trend.ratios.min) / trend.ratios.max), v3: describeTrend(trend) })}</span>
              )}
            </label>
            {/* TASKS.csv #2418 — a search flattened into the bedding, typed here (a structural trend chosen for block estimation takes its place) */}
            <label style={fieldLabel} title={modelTrend ? tr("The structural trend \"{name}\" shapes the search; clear it in 3D Modelling → Model settings to type a flat search here.", { name: modelTrend.name }) : tr("Flatten the search: the reach up and down from a block, with the search radius across. Blank = a sphere of the search radius.")}>{tr("Vertical reach (m)")}
              <input type="number" min="0" step="any" value={modelTrend ? "" : flatReach} disabled={!!modelTrend} placeholder={modelTrend ? tr("trend") : tr("sphere")} onChange={(e) => { const v = Number(e.target.value); setFlatReach(e.target.value === "" || !(v > 0) ? "" : v); }} style={{ ...inp, width: 80 }} aria-label={tr("Vertical reach (m)")} />
              {!modelTrend && flatReach > 0 && !flatTrend && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", fontWeight: 400 }}>{searchRadius > 0 ? tr("Less than the search radius, or it is a sphere.") : tr("A flat search needs a search radius.")}</span>}
            </label>
            <label style={fieldLabel} title={tr("Counts sample POINTS, not holes — one hole composited at 2m supplies ~25 of them inside a 50m radius, so this alone can never express 'more than one hole must see this block'. Use Min distinct holes for that.")}>{tr("Min samples/block")}<input type="number" min="1" value={minSamples} onChange={(e) => setMinSamples(Math.max(1, Number(e.target.value) || 1))} style={inp} />
            </label>
            {/* TASKS.csv #258 */}
            <label style={fieldLabel} title={tr("A block is only estimated if samples from at least this many DISTINCT drillholes fall inside its search radius. With 1, a single intercept becomes a full search-radius sphere of 'resource' with continuity asserted rather than demonstrated. Every resource practitioner's first sanity constraint is at least two, usually three. With 2 or more, each hole supplies at most (max samples / min holes) of a block's samples, e.g. 8 of 16.")}>{tr("Min distinct holes per block")}<input type="number" min="1" step="1" value={minHoles} onChange={(e) => setMinHoles(Math.max(1, Math.round(Number(e.target.value) || 1)))} style={inp} />
            </label>
            {minHoles > 1 && ( // TASKS.csv #1573 (review #1497, Lawyers)
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer", flex: "1 1 100%" }} title={tr("On Lawyers a block beside a 16 m bonanza intercept counted a second hole whose near-zero grades 48 m away carried a third of the weight; with this on, a hole with under 5 % of the inverse-distance weight is not a second hole, and the block waits for real support.")}>
                <input type="checkbox" checked={materialHoles} onChange={(e) => setMaterialHoles(e.target.checked)} />
                <span>{tr("A hole counts only when it carries at least 5% of the weight")}</span>
              </label>
            )}
            {/* TASKS.csv #259 */}
            <label style={fieldLabel} title={tr("Caps every RAW assay at this grade before compositing (compositeDownhole applies it per sample, before length-weighted averaging — the correct order). Blank = no cap. Commonly set at the 97.5th–99th percentile of the element's distribution.")}>{tr("High-grade cap ({v})", { v: PRECIOUS_METALS.has(symbol) && unit === "ppm" ? "g/t" : unit })}<input type="number" min="0" step="any" placeholder={tr("none")} value={Number.isFinite(capValue) ? capValue : ""} onChange={(e) => { const v = e.target.value === "" ? NaN : Number(e.target.value); capClearedFor.current = Number.isFinite(v) && v > 0 ? null : symbol; setCapAuto(false); setCapValue(v); }} style={inp} />
            </label>
            <label style={fieldLabel} title={tr("Caps how many nearest samples contribute to any one block's IDW average (ignored for nearest-neighbour).")}>{tr("Max samples/block")}<input type="number" min="1" value={maxSamples} onChange={(e) => setMaxSamples(Math.max(1, Number(e.target.value) || 1))} style={inp} />
            </label>
            <label style={fieldLabel} title={tr("At most this many of a block's samples from any one hole, so a hole drilled straight through the block can't supply them all (0 = no cap beyond the one Min distinct holes implies).")}>{tr("Max samples/hole")}<input type="number" min="0" value={maxPerHole} onChange={(e) => setMaxPerHole(Math.max(0, Math.floor(Number(e.target.value) || 0)))} style={inp} aria-label={tr("Max samples per hole")} />
            </label>
          </div>
          {/* TASKS.csv #533 — P97.5 / P99 caps and the capping audit (samples cut, metal removed) */}
          {domainRowsSel && useComposites && <DomainCaps assays={srcAssays} symbol={symbol} unit={unit} elementUnits={elementUnits} domainRows={domainRowsSel} caps={capByDomain} setCaps={setCapByDomain} />}{/* #1571 */}
          <CapAuditHint assays={srcAssays} symbol={symbol} unit={unit} unitLabel={gradeUnitLabel(symbol, unit)} /* #2218 */ elementUnits={elementUnits} capValue={Number.isFinite(capValue) && capValue > 0 ? capValue : null} onSetCap={(v) => setCapValue(Number(v.toPrecision(4)))} /* #2677: one unitLabel (the #2218 one) */ />

          {/* TASKS.csv #259 — CV > 150% means a skewed, outlier-driven distribution: the classic setup
              for an uncapped bonanza assay driving IDW² over its whole search neighbourhood. */}
          {elementCV != null && elementCV > 150 && !(Number.isFinite(capValue) && capValue > 0) && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>{tr("This element's coefficient of variation is {elementCV}% — a skewed, outlier-driven distribution. Estimating it without a high-grade cap will overstate grade. Set a cap (commonly the 97.5th–99th percentile) before trusting this result.", { elementCV: elementCV.toFixed(0) })}</div>
          )}
          {capAuto && Number.isFinite(capValue) && capValue > 0 && elementCV != null && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", lineHeight: 1.45 }}>{tr("Capped at P99 = {cap} by default: this element's coefficient of variation is {cv}%. Clear the cap to run uncapped; the result says which.", { cap: capValue, cv: elementCV.toFixed(0) })}</div>}{/* TASKS.csv #1573 */}
          {/* TASKS.csv #266 — same toggle Best Intercepts / Compositing / Grade Statistics already have. */}
          {pxrfLeft > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", marginTop: 2 }}>{tr("{n} pXRF reading(s) left out: the grades here come from lab assays only.", { n: pxrfLeft })}</div>}{/* #1673 */}
          {qaqcExcludedCount > 0 && (
            <label style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} title={tr("QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default so a standard's own repeat-insertion grade can't bias the estimate — a field duplicate logged under its parent hole's id would otherwise be double-counted.")}>
              <input type="checkbox" checked={includeQAQC} onChange={(e) => setIncludeQAQC(e.target.checked)} />{tr("Include QC samples (standards/blanks/duplicates) in this estimate — {qaqcExcludedCount} detected", { qaqcExcludedCount })}</label>
          )}
          <div style={{ padding: 10, background: "#f9fafb", border: "1px solid var(--color-hover-bg)", borderRadius: 6, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
              <input type="checkbox" checked={useComposites} onChange={(e) => setUseComposites(e.target.checked)} />{tr("Composite raw assays first (recommended)")}</label>
            <UnsampledChoice u={uns} selStyle={{ ...inp, width: "auto", padding: "3px 6px" }} />{/* TASKS.csv #2417 / #2542 */}
            {useComposites && <GeochemCompositingNote symbol={symbol} length={compositeLength} minCoverage={minCoverage} cap={capValue} unitLabel={gradeUnitLabel(symbol, unit)}
              onUse={(g) => { setCompositeLength(g.length); setMinCoverage(g.minCoverage); setCapValue(g.cap ?? NaN); setCapAuto(false); capClearedFor.current = g.cap == null ? symbol : null; setResult(null); }} />}{/* TASKS.csv #2224 */}
            {useComposites && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={fieldLabel}>{tr("Composite length (m)")}<input type="number" step="any" min="0.1" value={compositeLength} onChange={(e) => setCompositeLength(Math.max(0.1, Number(e.target.value) || 2))} style={inp} />
                  <CompositeLengthNote assays={srcAssays} symbol={symbol} length={compositeLength} onUse={setCompositeLength} />{/* #2549 */}
                </label>
                {/* TASKS.csv #262 — was hardcoded at 0.5 with no way to tighten it. Same control and
                    wording CompositingModal already exposes. */}
                <label style={fieldLabel} title={tr("Minimum fraction of a composite interval that must actually be covered by real assay data (vs. missing/lost core) for it to be used in the estimate. A composite that is used weighs its assayed length, not its full window: at the 50% default, a half-missing-core composite counts as half a sample.")}>{tr("Min coverage (%)")}<input type="number" step="1" min="0" max="100" value={Math.round(minCoverage * 100)} onChange={(e) => setMinCoverage(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} style={inp} />
                </label>
                {/* TASKS.csv #260 — renamed. "Honor domain" reads as "the estimate respects my geology";
                    it never did that. All it does on its own is break composites at domain edges. */}
                <label style={fieldLabel}>{tr("Break composites at domain boundary")}<select value={domainKey} onChange={(e) => { setDomainKey(e.target.value); setCapByDomain({}); }} style={inp}>
                    <option value="">{tr("— none —")}</option>
                    {domainChoices.map((c) => <option key={c.key} value={c.key}>{c.custom ? tr("{name} (custom layer)", { name: c.label }) : c.label}</option>)}
                  </select>
                </label>
                {domainFold?.folded.length > 0 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("Spellings that differ only by case or spaces are one domain here: {list}.", { list: domainFold.folded.map((f) => f.codes.join(" = ")).join("; ") })}</div>}{/* #2427 */}
                {domainChoice && domainChoice.overlap > 0.05 && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)" }}>{tr("{p}% of this layer's intervals overlap another in the same hole (several types logged over one depth): a composite takes the first interval by depth, so its domain among the overlapping ones is arbitrary. A layer with one value per depth makes a defensible domain.", { p: Math.round(domainChoice.overlap * 100) })}</div>}{/* #1571 */}
              </div>
            )}
            {useComposites && domainKey && (
              <>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={tr("Restricts each block's candidate samples to composites carrying the same domain as the block itself (the block adopts the domain of its nearest composite). Without this, the search is a plain sphere through all the data and grade is smeared across contacts and faults.")}>
                  <input type="checkbox" checked={restrictToDomain} onChange={(e) => setRestrictToDomain(e.target.checked)} style={{ marginTop: 2 }} />
                  <span>{tr("Also restrict the interpolation search to the same domain")}{" "}<em>{tr("(recommended)")}</em></span>
                </label>
                {restrictToDomain && ( /* TASKS.csv #2541 — the samples with no code: left out (counted in the result) or a domain of their own */
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer", marginLeft: 22 }} title={tr("Off: a block whose nearest composite has no code is left un-estimated, and the result says how many. On: those blocks are estimated from the composites with no code, as one more domain.")}>
                    <input type="checkbox" checked={noCodeAsDomain} onChange={(e) => setNoCodeAsDomain(e.target.checked)} style={{ marginTop: 2 }} aria-label={tr("Estimate the samples with no code as a domain of their own")} />
                    <span>{tr("Estimate the samples with no code as a domain of their own")}</span>
                  </label>
                )}
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                  {restrictToDomain
                    ? tr("Each block adopts the domain of its nearest composite and only ever sees composites from that same domain — a nearest-neighbour domain model, the simplest defensible way to give a point in space a domain from downhole-only logging. Blocks whose nearest composite has no logged domain are left un-estimated.")
                    : tr("Selecting a domain above only stops a single composite from spanning two domains. It does NOT stop the interpolation search itself from drawing samples across a contact or a fault — that search is a plain sphere through all the data, so grade will be smeared across geological boundaries. Tick the box above to restrict the search too.")}
                </div>
              </>
            )}
          </div>

          {/* TASKS.csv #803 */}
          {groundAt && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={groundSource === "collars" ? tr("The grid is padded around the samples, so near the surface its top layers can be in the air. With no terrain loaded the ground is interpolated between the collar elevations (as the pit shell takes it); ticked, a block whose centre is above it is left out.") : tr("The grid is padded around the samples, so near the surface its top layers can be in the air. Ticked, a block whose centre is above the terrain is left out.")}>
              <input type="checkbox" checked={cutAtGround} disabled={!!underground?.underground} onChange={(e) => setBelowGround(e.target.checked)} />{groundSource === "collars" ? tr("Only blocks below the ground (interpolated between the collars: no terrain)") : tr("Only blocks below the terrain surface")}
            </label>
          )}
          {underground?.underground && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", margin: "2px 0 6px 22px", lineHeight: 1.4 }}>{tr("Off: the collars look like underground collars ({upward} hole(s) drilled upward, {stacked} pair(s) of collars stacked over each other), so they are not a ground surface and no block is cut. Load a terrain to cut at the surface.", { upward: underground.upward, stacked: underground.stacked })}</div>}{/* #2217 */}
          {groundAt && groundSource === "collars" && !underground?.underground && <CollarLevelsNote collars={collars} style={{ margin: "2px 0 6px 22px" }} />}{/* #2584 */}
          {/* TASKS.csv #517 — a modelled unit volume (or an imported closed solid) as a hard domain boundary */}
          {volumeShells.length > 0 && (
            <label style={fieldLabel} title={tr("Only samples inside this closed solid inform the estimate, and only blocks whose centre is inside it are kept — e.g. Au inside the modelled DACT. Build unit volumes from an implicit model (3D Modelling, after a stack run: Add unit volumes).")}>{tr("Restrict to a modelled volume")}<select value={shellId} onChange={(e) => setShellId(e.target.value)} style={inp} aria-label={tr("Restrict to a modelled volume")}>
                <option value="">{tr("— none (whole grid) —")}</option>
                {/* TASKS.csv #1578 (review #1497, Lawyers) — closed solids with their volumes (two 'Au > 1 ppm shell' told apart), open meshes
                    greyed with their open edges: the 12 VLF isosurfaces and an open shell were offered and refused only after Run */}
                {(() => { const ch = solidChoices(volumeShells); return (<>
                  {ch.closed.map((v) => <option key={v.id} value={v.id}>{tr("{name} — {v}", { name: v.name, v: v.volumeM3 >= 1e5 ? `${(v.volumeM3 / 1e6).toFixed(2)} Mm³` : `${Math.round(v.volumeM3).toLocaleString()} m³` })}</option>)}
                  {ch.open.length > 0 && <optgroup label={tr("Open meshes (no inside to search)")}>{ch.open.map((v) => <option key={v.id} value={v.id} disabled>{tr("{name} (open: {n} edges)", { name: v.name, n: v.openEdges.toLocaleString() })}</option>)}</optgroup>}
                </>); })()}
              </select>
            {/* TASKS.csv #896 — a unit volume is a count of model blocks: its boundary is stepped at that block size */}
            {(() => { const sh = volumeShells.find((v) => v.id === shellId); const c = Math.min(cell3.dx, cell3.dy, cell3.dz); return sh?.blockSizeM && c < sh.blockSizeM - 1e-6 ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", lineHeight: 1.4, marginTop: 4 }}>{tr("\"{name}\" was counted in {b} m blocks, so its boundary steps every {b} m. Estimating in {c} m blocks inside it does not place the contact any closer than {b} m: rebuild the unit volume at {c} m, or estimate in {b} m blocks.", { name: sh.name, b: sh.blockSizeM, c })}</div> : null; })()}
            </label>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={fieldLabel} title={tr("Extends the block grid beyond the collar bounding box in every direction, so blocks near the edge of the drilling aren't starved of nearby samples.")}>{tr("Padding around collars (m)")}<input type="number" min="0" step="any" value={padding} onChange={(e) => setPadding(Math.max(0, Number(e.target.value) || 0))} style={inp} />
            </label>
            <label style={fieldLabel}>{cellHeight > 0 && !matched ? tr("Cell E × N (m)") : tr("Cell size (m, cubic)")}<input type="number" min="0.5" step="any" value={matched ? "" : cellSize} placeholder={matched ? `${cell3.dx} × ${cell3.dy} × ${cell3.dz}` : undefined} disabled={!!matched} onChange={(e) => { cellTouched.current = true; setAutoCell(null); setCellSize(Math.max(0.5, Number(e.target.value) || 10)); }} style={inp} />
            </label>
            {/* TASKS.csv #2418 — a flat, thin body needs a thin cell: the height on its own (blank = cubic) */}
            <label style={fieldLabel} title={tr("The block height on its own, for a flat, thin body: a seam, a palaeochannel, a laterite. Blank = the same as the cell size (cubic).")}>{tr("Cell height (m)")}<input type="number" min="0.25" step="any" value={matched ? "" : cellHeight} placeholder={matched ? String(cell3.dz) : tr("cubic")} disabled={!!matched} onChange={(e) => { const v = Number(e.target.value); setCellHeight(e.target.value === "" || !(v > 0) ? "" : Math.max(0.25, v)); }} style={{ ...inp, width: 70 }} aria-label={tr("Cell height (m)")} />
            </label>
            {autoCell != null && autoCell === cellSize && !matched && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("Cell size set to {c} m: the 10 m default needs more blocks than the {b}-block budget.", { c: autoCell, b: blockBudget.toLocaleString() })}</div>}{/* #1416 */}
            <label style={fieldLabel} title={tr("Fit to the drilling: the box of the assayed holes plus the padding, as before. Match a block model: its cell size and origin, so this estimate's blocks sit exactly on that model's blocks and the two can be compared or merged block for block. Origin: the cell size above, on block corners at a typed E / N / RL.")}>{tr("Grid")}
              <select value={gridMode} onChange={(e) => setGridMode(e.target.value)} style={inp}>
                <option value="data">{tr("Fit to the drilling")}</option>
                {checkedHoleIds && checkedCount < collars.length && checkedCount > 0 && <option value="checked">{tr("Fit to the checked holes ({n} of {total})", { n: checkedCount, total: collars.length })}</option>}{/* #1570 */}
                {(areaStrings || []).map((s) => <option key={s.id} value={`string:${s.id}`}>{tr("Inside the string \"{name}\"", { name: s.name })}</option>)}
                {latticeModels.map(({ m, L }) => <option key={m.id} value={`model:${m.id}`}>{tr("Match {name} ({dx} × {dy} × {dz} m)", { name: m.name, dx: L.dx, dy: L.dy, dz: L.dz })}</option>)}
                <option value="origin">{tr("Origin (E, N, RL)…")}</option>
              </select>
            </label>
            {matchedExtent && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{tr("The grid takes {name}'s blocks and its extent, so every estimated block is one of its blocks.", { name: matched.m.name })}</div>}{/* #2729 */}
            {checkedHoleIds && checkedCount < collars.length && checkedCount > 0 && <label style={fieldLabel} title={tr("Which holes' samples inform the estimate and its checks. The grid is set above, apart.")}>{tr("Samples from")}{/* #2544 */}
              <select value={samplesFrom} onChange={(e) => setSamplesFrom(e.target.value)} style={inp} aria-label={tr("Samples from")}>
                <option value="all">{tr("Every hole")}</option>
                <option value="checked">{tr("The checked holes ({n} of {total})", { n: checkedCount, total: collars.length })}</option>
              </select>
            </label>}
            {gridMode === "origin" && [[originE, setOriginE, "E"], [originN, setOriginN, "N"], [originZ, setOriginZ, "RL"]].map(([v, set, lbl]) => (
              <label key={lbl} style={fieldLabel}>{tr("Origin {axis}", { axis: lbl })}<input type="number" step="any" value={v} onChange={(e) => set(e.target.value)} style={{ ...inp, width: 110 }} /></label>
            ))}
          </div>
          {lattice && bounds && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Blocks on a lattice with corners at {e}, {n}, {z} (E, N, RL), {dx} × {dy} × {dz} m: the drilling's box is grown outward to whole blocks.", { e: +lattice.ox.toFixed(3), n: +lattice.oy.toFixed(3), z: +lattice.oz.toFixed(3), dx: cell3.dx, dy: cell3.dy, dz: cell3.dz })}</div>}
          {gridMode === "origin" && !originOk && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("Type all three origin coordinates; until then the grid fits the drilling.")}</div>}
          {areaString && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("The grid is the string's box within the drilling; after the run, blocks whose centre lies outside the string are dropped. Every sample still informs the estimate.")}</div>}{/* #1570 */}
          {gridMode === "checked" && !checkedBounds && <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)" }}>{tr("None of the checked holes carries assays: the grid fits the drilling.")}</div>}

          {/* TASKS.csv #91/#92 — data support classification. */}
          <div>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)", cursor: "pointer" }} title={tr("Classifies every block as interpolated (informing composites bracket the block on all three axes, from at least two holes), extrapolated (an estimate was produced, but all the informing data lies to one side) or unsupported (no estimate). Adds roughly 80% to the run time.")}>
              <input type="checkbox" checked={classifySupport} onChange={(e) => setClassifySupport(e.target.checked)} style={{ marginTop: 2 }} />
              <span>{tr("Classify data support per block (interpolated / extrapolated / unsupported)")}</span>
            </label>
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5, marginTop: 4 }}>{tr("Adds a support class and a 0–1")}{" "}<strong>{tr("Data Support Index")}</strong>{" "}{tr("to every block, and lets you add the index to the project as its own block model. The index is a")}{" "}<em>{tr("geometric")}</em>{" "}{tr("measure — distance to the nearest composite, how many distinct holes informed the block, and how well they surround it. It is")}{" "}<strong>{tr("not")}</strong>{" "}{tr("a confidence interval, a probability or a kriging variance: nothing here measures how the grade itself decorrelates with distance, so it would return the same number for a nuggety vein and a smooth porphyry drilled on the same pattern. Costs about 80% extra run time.")}</div>
          </div>

          {/* TASKS.csv #626 — the block budget (runs in a worker with progress and Cancel since #520) */}
          <label style={{ ...fieldLabel, flexDirection: "row", alignItems: "center", gap: 8 }}
            title={tr("How many blocks the grid may have. Larger budgets allow smaller blocks over a large area, at the cost of time, memory (about 0.4 GB for 1 million blocks, 0.9 GB for 2 million) and project-file size (every estimated block is saved with the project). Block models stop at 2 million so an 8 GB laptop keeps working; the grade shell goes higher. Remembered on this computer.")}>{tr("Block budget")}<select value={blockBudget} onChange={(e) => setBlockBudget(Number(e.target.value))} style={{ ...inp, width: "auto" }} aria-label={tr("Block model block budget")}>
              {BLOCK_MODEL_BUDGETS.map((b) => <option key={b} value={b}>{tr("{b} blocks ({v})", { b: b.toLocaleString(), v: tr(blockModelBudgetNote(b)) })}</option>)}
            </select>
          </label>
          {gridPreview && (
            <div style={{ fontSize: "var(--font-size-sm)", color: overLimit ? "var(--color-danger-icon-strong)" : "var(--color-text-muted)" }}>{tr("Grid: {nx} × {ny} × {nz} = {totalBlocksPreview} blocks{v}", { nx: gridPreview.nx, ny: gridPreview.ny, nz: gridPreview.nz, totalBlocksPreview: totalBlocksPreview.toLocaleString(),
              v: (reachPending ? (reachSolid || reachRz || reachArgs?.metric /* #2696: an ellipsoid has no one radius */ ? tr(", counting the blocks within reach of the drilling…") : tr(", counting the blocks within {r} m of the drilling…", { r: reachRadius }))
                : reach && blocksInReach < totalBlocksPreview ? (reachSolid /* #2422: the trace parts inside the solid, the search shaped by the trend */
                  ? tr(", {n} within reach of the drilling inside \"{name}\" (only those can be estimated, and only those count)", { n: Number.isFinite(blocksInReach) ? blocksInReach.toLocaleString() : "?", name: reachSolid.name })
                  : reachRz || reachArgs?.metric ? tr(", {n} within reach of the drilling (only those can be estimated, and only those count)", { n: Number.isFinite(blocksInReach) ? blocksInReach.toLocaleString() : "?" })
                  : tr(", {n} within {r} m of the drilling (only those can be estimated, and only those count)", { n: Number.isFinite(blocksInReach) ? blocksInReach.toLocaleString() : "?", r: reachRadius })) : "") + (overLimit ? tr(" — over the {blockBudget}-block budget.", { blockBudget: blockBudget.toLocaleString() }) : "") })}
              {overLimit && (
                <span style={{ display: "inline-flex", gap: 6, marginLeft: 6, flexWrap: "wrap" }}>
                  {Number.isFinite(fitCell) && fitCell > 0 && <button type="button" onClick={() => { cellTouched.current = true; setCellSize(fitCell); }} style={{ ...btn(false), padding: "2px 8px" }}>{tr("Use {fitCell} m blocks", { fitCell })}</button>}
                  {matched && <span style={{ color: "var(--color-text-secondary)" }}>{tr("The matched model's grid has more blocks in reach than the budget, and its block size is fixed: match a coarser model, shorten the search radius, or use 'Fit to the drilling' with a cell that fits.")}</span>}{/* #2416 */}
                  {Number.isFinite(fitCellMax) && fitCellMax > 0 && <button type="button" onClick={() => { setBlockBudget(MAX_BLOCK_MODEL_BUDGET); setCellSize(fitCellMax); }} style={{ ...btn(false), padding: "2px 8px" }}>{tr("Largest budget + {fitCellMax} m blocks", { fitCellMax })}</button>}
                </span>
              )}
            </div>
          )}
          {/* TASKS.csv #292 — warn BEFORE doing the work (the same pattern #209 used for the 10M-row
              CSV case). With no radius every block gets estimated from the whole dataset, which is
              inherently expensive however well the search is indexed. */}
          {searchRadius === 0 && totalBlocksPreview > 25000 && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>{tr("With no search radius, every one of these {totalBlocksPreview} blocks gets estimated from the whole dataset — this run can take a minute or more (it runs in the background with a progress count, and Cancel stops it). It is also rarely what you want: a block with no sample anywhere near it still gets a grade. Set a real search radius (50 m is the default) unless you specifically want an unbounded first pass.", { totalBlocksPreview: totalBlocksPreview.toLocaleString() })}</div>
          )}
          {!collars.length && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-text-secondary)" }}>{tr("No collars loaded — import drillhole collars first.")}</div>}

          {/* TASKS.csv #265 — the refusal path used to live ONLY in run()'s setError, which is
              unreachable: the same !bounds condition disables the Run button, so a user whose collars
              have no length and no survey got a greyed-out button and no explanation at all. Caught by
              live verification with length-less collars (the original pass checked this branch by code
              trace only, and the sample dataset can't trigger it — every Harry collar has a length).
              Stated inline instead, so the reason is visible without clicking anything. */}
          {collars.length > 0 && !bounds && (
            <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", lineHeight: 1.45 }}>{tr("None of the {collars} loaded collar(s) has a recorded length or any survey record, so there's no defensible depth to build a grid down to. Import hole lengths or survey data first — GeoStrix won't assume one (earlier versions silently assumed 300 m).", { collars: collars.length })}</div>
          )}
          {/* Also surfaced BEFORE a run, not just in the result block, so a partially-length-less
              dataset is visible while setting parameters rather than only afterwards. */}
          {bounds && collarsWithoutDepth > 0 && (
            <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", lineHeight: 1.45 }}>
              {tr("{collarsWithoutDepth} of {collars} collar(s) have no recorded length and no survey record — they contribute nothing to the grid's depth extent.", { collarsWithoutDepth, collars: collars.length })}</div>
          )}

          <button onClick={run} disabled={!bounds || overLimit || reachPending || running || !symbol || !uns.ready /* #2417 */} style={{ ...btn(true), alignSelf: "flex-start", padding: "8px 16px", display: "flex", alignItems: "center", gap: 6, opacity: (!bounds || overLimit || !symbol || !uns.ready) ? 0.5 : 1 }}>
            <Play size={14} /> {running ? (stage ? tr("Running {el}… {v}", { el: stage, v: progress != null ? Math.round(progress * 100) + "%" : "" }) /* #3014 */ : tr("Running… {v}", { v: progress != null ? Math.round(progress * 100) + "%" : "" })) : tr("Run estimation")}
          </button>
          {running && <button type="button" onClick={cancelRun} style={{ ...btn(false), alignSelf: "flex-start", padding: "6px 14px" }}>{tr("Cancel")}</button>}

          {error && <div style={{ fontSize: "var(--font-size-base)", color: "var(--color-danger-icon-strong)" }}>{error}</div>}

          {result && (
            <div style={{ padding: 10, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-base)", color: "var(--color-text-strong)", display: "flex", flexDirection: "column", gap: 6 }}>
              {result.supportCounts && result.blocksEstimated > 0 && (() => { // TASKS.csv #1573 — the support split first, in plain words
                const sc = result.supportCounts, n = result.blocksEstimated, pct = Math.round((100 * sc.interpolated) / n);
                const one = result.singleHoleCells || 0, dom = result.dominatedCells || 0;
                const tail = one || dom ? " " + tr("{one} rest on one hole and {dom} effectively on one hole.", { one: one.toLocaleString(), dom: dom.toLocaleString() }) : "";
                return sc.interpolated > 0
                  ? <div style={{ fontWeight: 600 }}>{tr("{k} of {n} blocks ({pct}%) lie between holes (interpolated); {e} are extrapolated beyond the data.", { k: sc.interpolated.toLocaleString(), n: n.toLocaleString(), pct, e: sc.extrapolated.toLocaleString() })}{tail}</div>
                  : <div style={{ fontWeight: 600, color: "var(--color-warn-text)" }}>{tr("None of these {n} blocks lies between holes: every one is extrapolated from the nearest holes.", { n: n.toLocaleString() })}{tail}</div>;
              })()}
              {result.belowDrilling?.blocks > 0 && result.belowDrilling.metalShare >= 0.05 && <div style={{ color: "var(--color-warn-text)" }}>{modelTrend ? tr("{pct}% of the estimated metal ({k} of {n} blocks) lies below the deepest sample of every hole within {r} m: carried down past the drilling. The structural trend \"{name}\" sets the reach up and down: a flatter trend in Model settings keeps it nearer the samples.", { pct: Math.round(100 * result.belowDrilling.metalShare), k: result.belowDrilling.blocks.toLocaleString(), n: result.belowDrilling.of.toLocaleString(), r: Number(searchRadius) || 0, name: modelTrend.name }) /* #2697 — the Vertical reach box is disabled under a trend */ : Number(flatReach) > 0 ? tr("{pct}% of the estimated metal ({k} of {n} blocks) lies below the deepest sample of every hole within {r} m: carried down past the drilling, within the {h} m Vertical reach.", { pct: Math.round(100 * result.belowDrilling.metalShare), k: result.belowDrilling.blocks.toLocaleString(), n: result.belowDrilling.of.toLocaleString(), r: Number(searchRadius) || 0, h: Number(flatReach) }) /* #3025 (1) — no advice to set what is set */ : tr("{pct}% of the estimated metal ({k} of {n} blocks) lies below the deepest sample of every hole within {r} m: carried down past the drilling. A Vertical reach under the search radius keeps it near the samples.", { pct: Math.round(100 * result.belowDrilling.metalShare), k: result.belowDrilling.blocks.toLocaleString(), n: result.belowDrilling.of.toLocaleString(), r: Number(searchRadius) || 0 })}</div>}{/* #2546 */}
              <div>{tr("{samplePointCount} sample point(s) placed ({intervalCount} interval(s), {droppedCount} dropped — no collar/survey to place them{v}{v2}).", { samplePointCount: result.samplePointCount, intervalCount: result.intervalCount, droppedCount: result.droppedCount, v: result.beyondTraceCount ? tr(", {beyondTraceCount} of them deeper than the hole's trace", { beyondTraceCount: result.beyondTraceCount }) : "", v2: result.clampedCount ? tr("; {clampedCount} negative grade(s) clamped to zero", { clampedCount: result.clampedCount }) : "" })}</div>
              {/* TASKS.csv #571 */}
              {result.rawStats && (result.rawStats.duplicatesSkipped > 0 || result.rawStats.overlappingRows > 0) && (
                <div>{tr("Raw assays: {duplicatesSkipped} exact duplicate row(s) left out; {overlappingRows} overlapping row(s) resolved into segments at the mean of the overlapping results.", { duplicatesSkipped: result.rawStats.duplicatesSkipped, overlappingRows: result.rawStats.overlappingRows })}</div>
              )}
              {result.params?.capValue != null && <div>{tr("Grades capped at {cap} {unit} before estimating.", { cap: result.params.capValue, unit: result.params.capUnit ? gradeUnitLabel(symbol, result.params.capUnit) : "" /* #2218 */ })}</div>}{/* #1736 — said in the result */}
              <div>{tr("{blocksEstimated} block(s) estimated, {blocksSkipped} left un-estimated (no sample within search radius / below min-samples / below min distinct holes).", { blocksEstimated: result.blocksEstimated.toLocaleString(), blocksSkipped: result.blocksSkipped.toLocaleString() })}</div>
              {result.piercedBlocks?.blocks > 0 && result.piercedBlocks.estimated < result.piercedBlocks.blocks && ( /* TASKS.csv #3255 — the best-informed blocks, said when some are empty */
                <div role="note" style={{ color: result.piercedBlocks.holesEmpty.length ? "var(--color-warn-text)" : undefined }}>{tr("{e} of the {b} blocks a drillhole passes through were estimated.", { e: result.piercedBlocks.estimated.toLocaleString(), b: result.piercedBlocks.blocks.toLocaleString() })}{result.piercedBlocks.holesEmpty.length ? " " + tr("{k} of the {h} holes have no estimated block anywhere along them ({list}): Min distinct holes ({m}) or the search left them out.", { k: result.piercedBlocks.holesEmpty.length, h: result.piercedBlocks.holes, list: result.piercedBlocks.holesEmpty.slice(0, 5).join(", ") + (result.piercedBlocks.holesEmpty.length > 5 ? ", …" : ""), m: result.params?.minHoles ?? minHoles }) : ""}</div>
              )}
              {result.noCodeBlocks > 0 && <div role="note" style={{ color: "var(--color-warn-text)" }}>{tr("{n} of them because their nearest composite has no {domain} code ({c} of {all} composites have none): the domain search does not estimate them. Tick 'Estimate the samples with no code as a domain of their own' to fill them from those composites.", { n: result.noCodeBlocks.toLocaleString(), domain: result.params?.domain || tr("domain"), c: (result.noCodeComposites ?? 0).toLocaleString(), all: (result.samplePointCount ?? 0).toLocaleString() })}</div>}{/* #2541 */}
              {(() => { // TASKS.csv #1738 — a zero-block run says which rule emptied it and what would change that
                const adv = zeroBlockAdvice({ blocksEstimated: result.blocksEstimated, searchRadiusM: result.params?.searchRadiusM ?? searchRadius, minHoles: result.params?.minHoles ?? minHoles, spacing });
                if (!adv) return null;
                const r = Math.round(result.params?.searchRadiusM ?? searchRadius), k = result.params?.minHoles ?? minHoles;
                return <div style={{ color: "var(--color-warn-text)", marginTop: 4, lineHeight: 1.45 }}>{adv.kind === "holes-apart"
                  ? tr("No block has samples from {k} holes within {r} m: your nearest drill sites are {near} m apart and most are {median} m or more from the next. This is reconnaissance drilling on separate prospects, and a block between the holes is not supported. A radius of about {need} m would let the nearest pair meet; or set Min distinct holes to 1 (single-hole blocks are flagged), or estimate one prospect with its own area.", { k, r, near: Math.round(spacing.nearestM), median: Math.round(spacing.medianM), need: adv.radiusNeededM })
                  : tr("No block met the rules: no composite within {r} m of a block, or fewer than the minimum samples or distinct holes ({k}) inside that radius. Raise the search radius first; the holes are {near}–{far} m from their nearest neighbour.", { r: Number.isFinite(r) && r > 0 ? r : "∞", k, near: spacing ? Math.round(spacing.nearestM) : "?", far: spacing ? Math.round(spacing.farthestM) : "?" })}</div>;
              })()}
              {result.cutOutsideArea > 0 && <div>{tr("{n} of those lie outside the string and were left out.", { n: result.cutOutsideArea.toLocaleString() })}</div>}{/* #1570 */}
              {result.cutAboveGround > 0 && <div>{groundSource === "collars" ? tr("{n} of those are above the ground interpolated between the collars (no terrain) and were left out.", { n: result.cutAboveGround.toLocaleString() }) : tr("{n} of those are above the terrain surface and were left out.", { n: result.cutAboveGround.toLocaleString() })}</div>}{/* collars: #1932 */}
              {/* TASKS.csv #258 */}
              {/* TASKS.csv #516 — say how MLS (linear) actually ran */}
              {result.variogram && (
                <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 4 }}>{tr("Kriged with the {model} variogram{v}: nugget {v2}, sill {v3}, range {v4} m{v5}{v6}." /* #2429: was 'the fitted ... fitted to' */, { model: result.variogram.model, v: result.variogram.fitted ? tr(" fitted to these composites") : tr(" as entered"), v2: +result.variogram.nugget.toPrecision(3), v3: +result.variogram.sill.toPrecision(3), v4: Math.round(result.variogram.range), v5: trend ? tr(" (along the trend \"{name}\")", { name: trend.name }) : "", v6: result.variogram.fitted ? tr(" — check it against the Variogram tool before trusting it") : "" })}{(() => { // TASKS.csv #1027 — a range the holes cannot see across
                  const v = result.variogram, far = result.params?.krigingBlocks?.beyondRange || 0, kr = result.params?.krigingBlocks?.kriged || 0;
                  const short = v.betweenHoleM != null && v.range < v.betweenHoleM;
                  if (short) return <span style={{ color: "var(--color-warn-text)" }}>{" "}{tr("The variogram cannot see between your holes: the range ({r} m) is shorter than the typical spacing between holes ({s} m){v}, so kriging is close to a plain average of the neighbours here.", { r: Math.round(v.range), s: v.betweenHoleM, v: kr ? tr(" and {n} of {m} kriged blocks have their nearest composite beyond it", { n: far.toLocaleString(), m: kr.toLocaleString() }) : "" })}</span>;
                  return kr && far > kr / 2 ? <span style={{ color: "var(--color-warn-text)" }}>{" "}{tr("{n} of {m} kriged blocks have their nearest composite beyond the range ({r} m): there, kriging is close to a plain average of the neighbours. A smaller search radius leaves them un-estimated instead.", { n: far.toLocaleString(), m: kr.toLocaleString(), r: Math.round(v.range) })}</span> : null;
                })()}{result.variogram.nuggetFrom && <span>{" "}{tr("The nugget ({pct}% of the sill) is read from the downhole variogram of every composite ({pairs} pairs at a {lag} m lag): the fit's own subsample held no pair closer than {h} m.", { pct: Math.round(100 * result.variogram.nuggetFrom.ratio), pairs: result.variogram.nuggetFrom.pairs.toLocaleString(), lag: result.variogram.nuggetFrom.lagM, h: result.variogram.nuggetFrom.firstPairLagM })}</span>}{/* TASKS.csv #1572 */}{result.variogram.nugget / result.variogram.sill > 0.8 && <span style={{ color: "var(--color-warn-text)" }}>{" "}{tr("The nugget is {v}% of the sill: the composites are barely alike even close together, so kriging gives close to a plain average of the neighbours — the variogram, not the method, is the limit here.", { v: Math.round((100 * result.variogram.nugget) / result.variogram.sill) })}</span>}
                  {result.variogram.fitted && result.variogram.rSquared != null && <span>{tr(" Fit r² {r}.", { r: result.variogram.rSquared.toFixed(2) })}</span>}{/* #1742 */}
                  {result.variogram.fitted && result.variogram.rSquared != null && result.variogram.rSquared < 0.5 && <span style={{ color: "var(--color-warn-text)" }}>{" "}{tr("Weak fit (r² {r}): these points do not pin the nugget, sill and range, so the kriging weights rest on a guess. Read the variogram in the Variogram tool and enter its values here, or estimate by inverse distance.", { r: result.variogram.rSquared.toFixed(2) })}</span>}{/* #1742 — the Variogram tool's own 'Weak fit' threshold */}
                  {result.variogram.stationarity?.noSill && <span style={{ color: "var(--color-warn-text)" }}>{" "}{tr("No sill at the population variance: at the last reliable lags the variogram is {r}× it{v}. That points to a trend or mixed domains (several populations in one), not a stationary grade, so the range is not a correlation length. Estimate within a domain, or remove the trend, before trusting it.", { r: result.variogram.stationarity.endRatio, v: result.variogram.stationarity.rising ? tr(" and still rising") : "" })}</span>}{/* #1576 */}
                  {result.variogram.stationarity?.rangeBeyond && <span style={{ color: "var(--color-warn-text)" }}>{" "}{tr("The fitted range ({range} m) is beyond the furthest reliable lag ({lag} m): it is extrapolated past the measured pairs, not read from them.", { range: Math.round(result.variogram.range), lag: Math.round(result.variogram.stationarity.reliableLagM) })}</span>}
                  {result.okCounts && <> {tr("{kriged} block(s) kriged{v}{v2}{v3}.", { kriged: result.okCounts.kriged.toLocaleString(), v: result.okCounts.exact ? tr(", {exact} on a composite", { exact: result.okCounts.exact.toLocaleString() }) : "", v2: result.okCounts.negativeWeights ? tr(", {negativeWeights} with a negative weight (normal for kriging; such a block can fall slightly outside its samples' range)", { negativeWeights: result.okCounts.negativeWeights.toLocaleString() }) : "", v3: result.okCounts.fallbackIdw ? tr(", {fallbackIdw} fell back to IDW² (their kriging system had no unique solution)", { fallbackIdw: result.okCounts.fallbackIdw.toLocaleString() }) : "" })}{result.okCounts.clampedNegative ? ` ${tr("{n} kriged grade(s) below zero were set to 0.", { n: result.okCounts.clampedNegative.toLocaleString() })}` : ""}{result.okCounts.kriged > result.blocksEstimated ? ` ${tr("Kriged before {n} block(s) were removed (above the ground, outside the area or outside the solid), so more were kriged than are kept.", { n: (result.okCounts.kriged - result.blocksEstimated).toLocaleString() })}` : "" /* #3025 (9) */}</>}
                </div>
              )}
              {result.mlsCounts && (result.mlsCounts.reduced + result.mlsCounts.idw) > 0 && (
                <div style={{ color: "var(--color-text-secondary)" }}>{tr("MLS (linear): {full} block(s) with a full 3D trend{v}{v2}.", { full: result.mlsCounts.full.toLocaleString(), v: result.mlsCounts.reduced ? tr(", {reduced} with the trend fitted in the plane / line of their samples (e.g. holes on one section — nothing is known about the trend across it)", { reduced: result.mlsCounts.reduced.toLocaleString() }) : "", v2: result.mlsCounts.idw ? tr(", {idw} fell back to IDW² (their samples gave no direction to fit)", { idw: result.mlsCounts.idw.toLocaleString() }) : "" })}</div>
              )}
              {/* TASKS.csv #1419 (review #1352, Silvertip) — MLS on mostly extrapolated blocks: the mean ran 87 % above nearest neighbour */}
              {result.params?.method === "mls1" && result.supportCounts && result.blocksEstimated > 0 && result.supportCounts.extrapolated / result.blocksEstimated > 0.5 && (
                <div style={{ color: "var(--color-warn-text)" }}>{tr("Moving least squares fits a linear trend through each block's samples, and {pct}% of these blocks lie beyond the holes: there the trend keeps rising or falling past the data (held only to the neighbourhood's highest and lowest values), which can lift the mean well above the samples'. Inverse distance or kriging keep the grade nearer the samples outside the drilling.", { pct: Math.round((100 * result.supportCounts.extrapolated) / result.blocksEstimated) })}</div>
              )}
              {result.singleHoleCells > 0 && (
                <div style={{ color: "var(--color-warn-text)" }}>
                  {tr("{singleHoleCells} of the estimated blocks ({v}%) were informed by only ONE drillhole — continuity there is asserted, not demonstrated. Raise \"Min distinct holes per block\" to exclude them.", { singleHoleCells: result.singleHoleCells.toLocaleString(), v: ((result.singleHoleCells / Math.max(1, result.blocksEstimated)) * 100).toFixed(0) })}</div>
              )}
              {result.topUnsupported?.unsupported.length > 0 && ( // TASKS.csv #1735
                <div style={{ color: "var(--color-warn-text)" }}>
                  {tr("{k} of the {n} highest composites have no estimated block within a cell of them ({list}): the blocks around them failed the Min distinct holes rule ({minHoles}) or the search, so this model puts the grade away from where it was drilled. Run with Min distinct holes 1 to estimate those blocks (they are flagged as informed by one hole), or widen the search.", { k: result.topUnsupported.unsupported.length, n: result.topUnsupported.checked, minHoles: result.params?.minHoles ?? "—", list: result.topUnsupported.unsupported.slice(0, 3).map((u) => `${u.hole_id ? `${u.hole_id} ` : ""}${u.value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}${u.nearestM != null ? tr(", nearest block {m} m", { m: Math.round(u.nearestM) }) : ""}`).join("; ") + (result.topUnsupported.unsupported.length > 3 ? ", …" : "") })}</div>
              )}
              {result.topUnsupported?.unsupported.length > 0 && result.topUnsupported.outsideGrid > 0 && <div style={{ color: "var(--color-text-secondary)" }}>{tr(result.topUnsupported.outsideGrid === 1 ? "One more of the highest composites lies outside this grid and was not checked." : "{n} more of the highest composites lie outside this grid and were not checked.", { n: result.topUnsupported.outsideGrid })}</div>}{/* #2456 */}
              {unsampledResultLine(result.params, symbol) && <div style={{ color: result.params.unsampledFilledM != null ? "var(--color-text-secondary)" : "var(--color-warn-text)" }}>{unsampledResultLine(result.params, symbol)}</div>}{/* #2417 */}
              {result.beyondShare > 0 && <div style={{ color: result.beyondShare > 0.1 ? "var(--color-warn-text)" : "var(--color-text-secondary)" }}>{tr("{p} % of the estimated metal is in blocks above or below every sample that informs them (Grade-tonnage gives it per cutoff).", { p: Math.round(result.beyondShare * 1000) / 10 })}</div>}{/* #2417 */}
              {result.nearUnsampledShare > 0 && <div style={{ color: result.nearUnsampledShare > 0.1 ? "var(--color-warn-text)" : "var(--color-text-secondary)" }}>{tr("{p} % of the estimated metal ({n} blocks) is in blocks whose nearest drilling was never sampled for {el}: the grade was carried across unsampled core, which is unknown here, not barren (Unsampled metres inside a sampled hole reads it as barren).", { p: Math.round(result.nearUnsampledShare * 1000) / 10, n: result.nearUnsampledCount.toLocaleString(), el: symbol })}</div>}{/* #2596 */}
              {result.fromLogShare > 0 && <div style={{ color: "var(--color-text-secondary)" }}>{tr("About {p} % of the estimated metal comes from the readings of the log \"{log}\" that filled the unsampled metres (Grade-tonnage gives it per cutoff).", { p: Math.round(result.fromLogShare * 1000) / 10, log: result.params.unsampledLog })}</div>}{/* #2721 */}
              {result.params?.supportScoredAgainstM > 0 && <div style={{ color: "var(--color-text-secondary)" }}>{tr("No search radius: data support was scored against {m} m (twice the median spacing between holes); a block farther than that from every sample, not between holes, is unsupported.", { m: result.params.supportScoredAgainstM.toLocaleString() })}</div>}{/* #1411 */}
              {result.params?.restrictedToVolume && <div style={{ color: "var(--color-text-secondary)" }}>{tr("Restricted to {v}.", { v: result.params.restrictedToVolume })}</div>}{/* #1410 */}
              {/* TASKS.csv #676 — passing the hole rule while one hole carries nearly all the weight */}
              {result.dominatedCells > 0 && (
                <div style={{ color: "var(--color-warn-text)" }}>
                  {tr("{dominatedCells} of the estimated blocks ({v}%) use samples from two or more holes, but one hole carries at least 95% of the weight — in effect a single-hole estimate. These blocks sit close to one hole; raising Min distinct holes does not change that, so read their grade as that hole's.", { dominatedCells: result.dominatedCells.toLocaleString(), v: ((result.dominatedCells / Math.max(1, result.blocksEstimated)) * 100).toFixed(0) })}</div>
              )}
              {/* TASKS.csv #265 */}
              {collarsWithoutDepth > 0 && (
                <div style={{ color: "var(--color-warn-text)" }}>
                  {tr("{collarsWithoutDepth} collar(s) have no recorded length and no survey record — they contributed nothing to the grid's depth extent (rather than a silently assumed 300 m, which is what earlier versions did).", { collarsWithoutDepth })}</div>
              )}
              {/* TASKS.csv #91/#92 */}
              {result.supportCounts && result.blocksEstimated > 0 && (
                <div style={{ marginTop: 6, padding: "8px 9px", background: "#f5f7f9", border: "1px solid #e2e6ea", borderRadius: 6, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600, color: "var(--color-text-secondary)", marginBottom: 4 }}>{tr("Data support")}</div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {["interpolated", "extrapolated", "unsupported"].map((k) => ( /* #2066: unsupported within reach */
                      <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--color-text-secondary)" }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: SUPPORT_COLORS[k], display: "inline-block" }} />
                        {supportInReach(result.supportCounts, supportBeyondReach(result))[k].toLocaleString()} {k}
                      </span>
                    ))}
                  </div>
                  <div style={{ marginTop: 5, color: "var(--color-warn-text)" }}>
                    {summarizeSupport(result.supportCounts, { beyond: supportBeyondReach(result) })}
                    {supportBeyondReach(result) > 0 && <>{" "}{tr("{n} more blocks of the grid's box lie beyond every composite's reach: not estimated, and not counted here.", { n: supportBeyondReach(result).toLocaleString() })}</>}{/* #2066 */}
                  </div>
                  <div style={{ marginTop: 5, color: "var(--color-text-muted)" }}>{tr("Only blocks whose informing composites bracket them on all three axes, from at least two holes, count as interpolated. Everything else with a value is being carried outward from the data rather than between it — a real number, but not an interpolation.")}</div>
                </div>
              )}
              {/* TASKS.csv #3014 — the set's other elements, on the same blocks */}
              {result.members?.length > 0 && (
                <div style={{ marginTop: 4, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600 }}>{tr("Also estimated on the same grid (added with {symbol} as a set):", { symbol: result.params?.element || symbol })}</div>
                  {result.members.map((m) => <div key={m.element} style={{ color: m.blocks ? undefined : "var(--color-warn-text)" }}>{m.blocks ? tr("{el}: {blocks} blocks from {n} composites, mean {mean} {unit}", { el: m.element, blocks: m.blocks.toLocaleString(), n: m.composites.toLocaleString(), mean: m.mean != null ? +m.mean.toPrecision(3) : "—", unit: gradeUnitLabel(m.element, m.unit) }) : tr("{el}: no samples to estimate from; not added.", { el: m.element })}</div>)}
                </div>
              )}
              {result.blocksEstimated > 0 && result.nnCells && <EstimateCheck cells={result.cells} nnCells={result.nnCells} points={result.checkPoints} unit={gradeUnitLabel(symbol, unit) /* #2218: display only */} symbol={symbol} method={result.params.method} epsg={stampEpsg(project)} composited={result.params.composited !== false} />}
              {result.blocksEstimated > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <input placeholder={modelName.trim() ? "" : resultName() /* #1737 — the name the result will get, not the form's current settings */} value={modelName} onChange={(e) => { setModelName(e.target.value); setAdded(false); setAddedSupport(false); }} style={{ ...inp, flex: 1, width: "auto" }} />
                  <button type="button" onClick={() => setGtOpen(true)} style={{ ...btn(false), padding: "7px 12px", width: "auto" }} title={tr("Tonnage and mean grade above a series of cutoffs, for this result (an exploration target, not a Mineral Resource)")}>{tr("Grade-tonnage…")}</button>{/* #1577 */}
                  <button onClick={addToProject} style={{ ...btn(true), padding: "7px 12px" }}>{added ? tr("Added ✓") : result.params?.set ? tr("Add the set ({n} block models)", { n: result.params.set.elements.length }) /* #3014 */ : result.supportCounts ? tr("Add as block model ({pct}% interpolated)", { pct: Math.round((100 * result.supportCounts.interpolated) / Math.max(1, result.blocksEstimated)) }) : tr("Add as block model")}</button>{/* pct: TASKS.csv #1573 */}
                </div>
              )}
              {/* TASKS.csv #92 — the index as its own block model. This IS the "where is this model
                  well constrained" field the design doc asked for, and making it a normal block model
                  means it renders, slices, sections and exports through the existing voxel viewer with
                  no new display code at all. */}
              {result.supportCounts && result.blocksEstimated > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={addSupportModel} style={{ ...btn(false), padding: "7px 12px", width: "auto" }}>
                    {addedSupport ? tr("Added ✓") : tr("Add Data Support Index as a separate block model")}
                  </button>
                </div>
              )}
              {result.variogram && result.blocksEstimated > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={addKvModel} style={{ ...btn(false), padding: "7px 12px", width: "auto" }} title={tr("Kriging variance: how well the samples' layout constrains each block under this variogram. It does not depend on the grades themselves, so it is not an error bar on the estimate.")}>
                    {addedKv ? tr("Added ✓") : tr("Add kriging variance as a separate block model")}
                  </button>
                </div>
              )}
            </div>
          )}

          {gtOpen && result && <GradeTonnageModal model={{ name: resultName(), source: `estimate-${result.params?.method || method}`, cells: result.cells, params: result.params }} setModels={result.params?.set ? (result.members || []).filter((m) => m.cells.length).map((m) => ({ name: `${m.element} estimate`, cells: m.cells, params: m.params })) : null /* #3014 part b — the set before it is added */} epsg={stampEpsg(project)} onClose={() => setGtOpen(false)} />}{/* #1577 */}
          {/* TASKS.csv #269 — the closing paragraph now names every assumption the estimate actually
              makes, not just the missing-kriging one. */}
          <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", lineHeight: 1.5 }}>
            <strong>{tr("Not a resource estimate.")}</strong>{" "}{tr("This is an interpolated block model to help you visualize and target mineralization. Nothing it produces is a Mineral Resource under NI 43-101 or JORC, and it must not be reported publicly as one — that requires an estimate prepared by a Qualified Person.")}</div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.5 }}>{tr("Nearest-neighbour, inverse-distance weighting and moving least squares are complete, defensible estimation methods (IDW especially for early-stage/scoping estimates; pick the one that suits the geology — hover the Method dropdown for what each is good for), and ordinary kriging weights the composites by a variogram (entered, or fitted at run time) and reports a kriging variance. Kriging here is point kriging at each block centre (no block discretization), with the same search as the other methods; its variance measures the samples' layout under the variogram, not the uncertainty of the grade. A block with no sample inside its search radius is left un-estimated rather than guessed at.")}{" "}{trend
              ? (trend.local ? <>{tr("The search is flat: {r} m across and {v} m up and down (typed in this dialog), there is", { r: trend.ratios.max, v: trend.ratios.min })}</> /* #2418 */
                : <>{tr("The search follows the structural trend \"{name}\" (an ellipsoid; change it in 3D Modelling → Model settings → Structural trends), there is", { name: trend.name })}</>)
              : <>{tr("The search is")}{" "}<strong>{tr("isotropic")}</strong>{" "}{tr("(a plain sphere — choose a trend for block estimation in 3D Modelling → Model settings → Structural trends to make it an ellipsoid), there is")}</>}{" "}{method === "ok" /* #1098 — kriging HAS a variogram */
                ? tr("no declustering and no resource classification. Domain control applies only if you both select a domain layer and tick \"restrict the interpolation search\"; high-grade capping applies only if you enter a cap. Every one of those is an assumption you are making, not a property of the data.")
                : tr("no declustering, no variogram, and no resource classification. Domain control applies only if you both select a domain layer and tick \"restrict the interpolation search\"; high-grade capping applies only if you enter a cap. Every one of those is an assumption you are making, not a property of the data.")}</div>
        </div>

        <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--color-border)" }}>
          <button onClick={onClose} style={{ ...btn(false), flex: 1 }}>{tr("Close")}</button>
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
