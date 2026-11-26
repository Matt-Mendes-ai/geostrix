// TASKS.csv #693 — the 3D Modelling tool panes (Model settings, grade estimation, explicit surface, modelling codes,
// litho groups, correlation, geoML, implicit surface, stratigraphic stack, structures, alteration, veins / dykes, grade
// shell), moved out of ViewerModule.jsx VERBATIM by a script (every TASKS.csv comment inside still applies where it
// stands) and loaded on demand: they are only rendered once a modelling pane is opened, and ViewerModule was over its
// startup budget. The props are exactly the free identifiers of the moved JSX that ViewerModule declares (found by
// Babel scope analysis, not by hand); module imports are re-imported here.
import { isNotLogged } from "../../lib/notLogged.js"; // TASKS.csv #1740
import { shellBudgetsFor } from "../../lib/estimationMeta.js"; // NUMERIC_CELL_DEFAULT: #3651 // gradeShellBudgetMB, shellBudgetsFor: #3581
import { useMachineMemoryGB, fetchFits } from "../../lib/fetchMemory.js"; // TASKS.csv #3581 // gradeShellBudgetNote: #1416
import { useCallback, useEffect, useMemo, useState } from "react";
import { withChangeLog } from "../../lib/explicitLog.js"; // TASKS.csv #878
import { roleForLithology } from "../../lib/layers.js"; // group roles: #2052
import { codedRuns, topsForCode, codeInfo, overburdenBases, leftOutLayers, leftOutIn, isLeftOutUnit } from "../../lib/modellingCodes.js"; // TASKS.csv #871; #1684
import { pileFromRuns, absentTops, orderFromHoles } from "../../lib/pileTops.js"; // TASKS.csv #2921; orderFromHoles: #2926
import { holesOrderPlan } from "../../lib/holesOrder.js"; // TASKS.csv #3994 — Sort by the holes
import { addAllCandidates } from "../../lib/stackAddAll.js"; // TASKS.csv #3999 — Add all
import { usePaneIntent } from "../../lib/guide/usePaneIntent.js"; import { settingsIntent, stackIntent } from "../../lib/guide/paneIntent.js"; // TASKS.csv #4033
import { pBtn } from "../../lib/sidebarStyles.js";
import { preferredElement } from "../../lib/preferredElement.js"; // TASKS.csv #2552
import { useLeadCommodity } from "../../lib/useLeadCommodity.js"; // TASKS.csv #2552
import { positionFromTraces } from "../../lib/sheetCorrelation.js"; // TASKS.csv #2625
import { t as tr } from "../../lib/i18n.js";
import { requestStep } from "../../components/StepPane.jsx"; // TASKS.csv #4070 — the panes as steps
import { elementCounts, quickCutoffs } from "../../lib/paneSteps.js"; // TASKS.csv #4070
import { holeClusters, onlyTheseHoles } from "../../lib/holeClusters.js"; // TASKS.csv #2056
import { useStore } from "../../lib/store.jsx";
import { numericLayerFields } from "../../lib/evidenceSources.js"; // TASKS.csv #1574 — the numeric fields of a log (intensity 1-3)
import { intensityVocabFields } from "../../lib/intensityVocab.js"; // TASKS.csv #2230 — intensity letters (W / M / S / I) ranked
import { numericSourceChoices, findNumericSource, sourceAssays } from "../../lib/numericSources.js"; // TASKS.csv #1741 — logs and numeric layer fields as a grade-shell source
import { excludeQAQC, labAssays } from "../../lib/qaqc.js"; // labAssays: #1744; TASKS.csv #2060 — the proposed cutoff without the QC inserts (this file loads lazily, so qaqc.js stays off the startup path)
import { restrictRowsToHoles } from "../../lib/modelArea.js"; // TASKS.csv #1546; restrictRowsToHoles: #3272
import { holeSpacingSummary, searchFromSpacingM } from "../../lib/holeSpacing.js"; // TASKS.csv #3272 — the shell's search from the drilling, as Estimation's (#2420)
import { sampleSpacing } from "../../lib/sampleSpacing.js"; // TASKS.csv #3580 — the spacing at the samples
import { shellPaneMemory, memoryRef } from "./shellPaneMemory.js"; // TASKS.csv #3651
// TASKS.csv #4070 — each pane in its own file (panes/), so they can be converted in parallel
import SettingsPane from "./panes/SettingsPane.jsx";
import EstimationPane from "./panes/EstimationPane.jsx";
import MapModelPane from "./panes/MapModelPane.jsx";
import ExplicitPane from "./panes/ExplicitPane.jsx";
import CodesPane from "./panes/CodesPane.jsx";
import LithoGroupsPane from "./panes/LithoGroupsPane.jsx";
import CorrelationPane from "./panes/CorrelationPane.jsx";
import GeomlPane from "./panes/GeomlPane.jsx";
import ImplicitPane from "./panes/ImplicitPane.jsx";
import StackPane from "./panes/StackPane.jsx";
import FaultsPane from "./panes/FaultsPane.jsx";
import StructuralPane from "./panes/StructuralPane.jsx";
import AlterationPane from "./panes/AlterationPane.jsx";
import VeinPane from "./panes/VeinPane.jsx";
import GradeShellPane from "./panes/GradeShellPane.jsx";
export default function ModellingPanes(props) {
  const {
    viewDragHookRef, cameraRef, rendererRef, explicitOverlayRef, // TASKS.csv #813 — dragging explicit-surface picks
    sceneRef, layerGroupsRef, // TASKS.csv #1333 — the box selection of intervals
    tracesSeq, // TASKS.csv #888
    explicitTrend, // TASKS.csv #881
    camState, sectionImages, setDigitizeImageId, // TASKS.csv #824 — digitizing section images in the 3D view
    runMapModel, MapModelPanel, // TASKS.csv #817
    ExplicitSurfacePanel,
    ModellingCodesPane,
    PredictivePanel,
    SurfaceGeologyProjection,
    TrendsPanel,
    activeInterceptSet,
    activeInterceptSetId,
    addLithoGroup,
    addStackUnit,
    alt_units,
    alterationBusy,
    alterationCellSize,
    alterationSearchRadius,
    alterationTarget,
    askPrompt,
    assayElements,
    assays,
    clipToDomainBoundary,
    clipToTopo,
    limitToContacts, setLimitToContacts, contactReachM, setContactReachM, // TASKS.csv #1335
    collars,
    desurveyMethod,
    domains,
    emptyPaneHint,
    expandedLithoGroupId,
    explicitClickRef,
    explicitPickFor,
    explicitSnap,
    explicitSurfaces,
    faultCandidates,
    implicitBusy,
    implicitGroupRef,
    implicitMeshesRef,
    implicitSurfaces,
    implicitTarget,
    includeSectionContacts,
    interceptSets,
    isLithoGroupKey,
    isMcodeKey,
    lastActivityRef,
    layers: layersAll,
    lithoGroupCrossCuts,
    lithoGroupKey,
    lithoGroupRole,
    lithoGroups,
    litho_units: lithoUnitsAll,
    mapConstraint,
    mapLayers,
    mcConnectFrom,
    mcGroupOf,
    mcPickMode,
    mcSelected,
    mcodeDefaultRole,
    miniField,
    modelDomainId,
    modelArea, setModelArea, // TASKS.csv #1546
    unitField, setUnitField, unitFields, // TASKS.csv #2378
    modelResolution,
    modellingCodeList: mcodeListAll,
    modellingCodes,
    moveStackUnit,
    numericBudgetHint,
    numericBusy,
    numericCapValue,
    numericCellSize,
    numericCellHeight, setNumericCellHeight, numericFlatReach, setNumericFlatReach, // TASKS.csv #3062
    numericCloseShell,
    numericCompositeLength,
    numericCutoff,
    numericIncludeQAQC,
    numericMaxBlocks,
    numericMethod,
    numericVariogram, setNumericVariogram, // TASKS.csv #1015
    numericMinCoverage,
    numericMinHoles,
    numericPadding,
    numericSearchRadius,
    numericSymbol,
    numericUseComposites,
    orientTypes,
    orientTypesSel,
    originRef,
    paneHeader,
    projectMapContact,
    rangeMultiplier,
    removeImplicitSurface,
    removeLithoGroup,
    removeStackUnit,
    resolveLithoTarget,
    runAlterationModel,
    runImplicitModel,
    runNumericModel,
    runStackModel,
    runStructuralModel,
    runVeinModel,
    searchEllipsoid,
    sections,
    sensBudget,
    sensN,
    sensOpen,
    sensSigmaDeg,
    sensSigmaPos,
    setActiveInterceptSetId,
    setAlterationCellSize,
    setAlterationSearchRadius,
    setAlterationTarget,
    setClipToDomainBoundary,
    setClipToTopo,
    setCoreOrientOpen,
    setExpandedLithoGroupId,
    setExplicitPickFor,
    setExplicitSnap,
    setExplicitSurfaces,
    setFenceOpen,
    setGradeEstOpen,
    setImplicitSurfaces,
    setImplicitTarget,
    setIncludeSectionContacts,
    setMapConstraint,
    setMcConnectFrom,
    setMcPickMode,
    setMcSelected,
    setModelDomainId,
    setModelResolution,
    setModellingCodes,
    setNotices,
    setNumericBudgetHint,
    setNumericCapValue,
    setNumericCellSize,
    setNumericCloseShell,
    setNumericCompositeLength,
    setNumericCutoff,
    setNumericIncludeQAQC,
    setNumericMaxBlocks,
    setNumericMethod,
    setNumericMinCoverage,
    setNumericMinHoles,
    setNumericPadding,
    setNumericSearchRadius,
    setNumericSymbol,
    setNumericUseComposites,
    setOrientTypesSel,
    setRangeMultiplier,
    setSearchEllipsoid,
    setSensBudget,
    setSensN,
    setSensOpen,
    setSensSigmaDeg,
    setSensSigmaPos,
    setSmoothClusters,
    setStackAdd,
    setStackFaults,
    stackFaultOffsets, setStackFaultOffsets, // TASKS.csv #1054
    setStackRelation,
    setStereonetOpen,
    setStructuralTarget,
    setStructuralTrends,
    setSurfaceDetail,
    setTadpoleOpen,
    setThinPicks,
    setThinWindowM,
    orientationReachM, setOrientationReachM, // TASKS.csv #1170
    stackBreaks, setStackBreaks, // TASKS.csv #1309
    setStackUnits, // TASKS.csv #3994
    visibleHoles, // TASKS.csv #1315
    setVisibleHoles, setHoleFilter, // TASKS.csv #2536 — Model area by an E / N range; setHoleFilter: #3775 (4)
    setTrendPreviewId,
    setVariogramOpen,
    setVeinCellSize,
    setVeinDip,
    setVeinDipDir,
    setVeinSearchRadius,
    setVeinTarget,
    smoothClusters,
    stackAdd,
    stackFaults,
    stackRelation,
    stackUnits,
    struct_types,
    structuralTarget,
    structuralTrends,
    structurePicksWithHoleAttitude,
    structureTypes,
    surfaceDetail,
    surfaceStructures,
    survey,
    terrain,
    thinPicks,
    thinWindowM,
    toolPane,
    tracesRef,
    trendFor,
    trendPreviewId,
    updateLithoGroup,
    veinBusy,
    veinCellSize,
    veinDip,
    veinDipDir,
    veinSearchRadius,
    veinTarget,
    vein_units,
    worldPointFromHits,
  } = props;
  // TASKS.csv #4026 — 'Leave out of the model' (Modelling codes): the tools here read the Lithology without the left-out codes, as if they were not logged; the Modelling
  // codes pane and the Litho groups pane still list every code (so one can be put back). The logs, legend and data table are not touched.
  const layers = useMemo(() => leftOutLayers(layersAll, modellingCodes, mcGroupOf), [layersAll, modellingCodes, mcGroupOf]);
  const litho_units = useMemo(() => lithoUnitsAll.filter((u) => !isLeftOutUnit(modellingCodes, mcGroupOf, u)), [lithoUnitsAll, modellingCodes, mcGroupOf]);
  const modellingCodeList = useMemo(() => (mcodeListAll || []).filter((c) => !c.leftOut), [mcodeListAll]);
  const leftOutCodes = useMemo(() => leftOutIn(layersAll.litho, modellingCodes, mcGroupOf), [layersAll.litho, modellingCodes, mcGroupOf]);
  const leftOutNote = leftOutCodes.length > 0 ? <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4, marginBottom: 8 }}>{tr("Left out of the model: {codes}.", { codes: leftOutCodes.join(", ") })}</div> : null;
  // TASKS.csv #3025 (6) — the Grade shell's cutoff proposed on an element change (the 90th percentile of its assays) said as such: 57.3 % Fe
  // appeared with no word
  // TASKS.csv #3651 — the pane's memory of its own proposals outlives the pane (shellPaneMemory.js: one per 3D View)
  const shellMem = useMemo(() => shellPaneMemory(tracesRef), [tracesRef]);
  const [shellCutoffAuto, setShellCutoffAutoState] = useState(() => shellMem.cutoff ?? null); // { symbol, value }
  const setShellCutoffAuto = (v) => { shellMem.cutoff = v; setShellCutoffAutoState(v); };
  // TASKS.csv #871 — the logged tops of a unit for the Explicit surface pane, by the implicit tool's rules (#354 / #495 /
  // #599); recomputed only when the logs, the modelling codes or the groups change
  // TASKS.csv #2532 (review #2486) — a raw lithology code's role: the one set for it in Modelling codes when listed there, else the guess from its name
  const mcodeRole = useMemo(() => new Map((modellingCodeList || []).map((c) => [c.name, c.role])), [modellingCodeList]);
  const rawRole = (u) => mcodeRole.get(u) || roleForLithology(u);
  const setExplicitLogged = useMemo(() => withChangeLog(setExplicitSurfaces), [setExplicitSurfaces]);
  // TASKS.csv #901 — the Explicit surface pane's scene handles: one object while its parts are the same (it was a new
  // object every render, so the pane's effects that list it re-ran on every render)
  const explicitScene = useMemo(() => ({origin: originRef, meshes: implicitMeshesRef, group: implicitGroupRef, traces: tracesRef, activity: lastActivityRef, setSurfaces: setImplicitSurfaces, worldPointFromHits, clickRef: explicitClickRef,
              dragHookRef: viewDragHookRef, camera: cameraRef, renderer: rendererRef, overlay: explicitOverlayRef, litho: layers.litho /* #813 */, structure: layers.structure /* #1002 */, camState /* #824 */ }), [originRef, implicitMeshesRef, implicitGroupRef, tracesRef, lastActivityRef, setImplicitSurfaces, worldPointFromHits, explicitClickRef, viewDragHookRef, cameraRef, rendererRef, explicitOverlayRef, layers.litho, layers.structure, camState]); // TASKS.csv #878 — every edit of a surface goes in its history
  // TASKS.csv #1543 — each fault candidate's Fisher k in 'Add a fault...' (random picks said before anyone picks them); stereonet.js
  // (38 kB) loads only when the Strat. stack pane opens with candidates
  const [faultK, setFaultK] = useState({});
  // TASKS.csv #2905 — the Strat. stack's method: GemPy (one implicit field) or a layer-cake (elevation grids kept in order, lib/layerCake.js).
  // A personal choice kept on this computer (localStorage), as the panels' other preferences.
  const [stackMethod, setStackMethodState] = useState(() => { try { return localStorage.getItem("geostrix.stackMethod") === "layercake" ? "layercake" : "gempy"; } catch { return "gempy"; } });
  const setStackMethod = (m) => { setStackMethodState(m); try { localStorage.setItem("geostrix.stackMethod", m); } catch { /* private window */ } };
  useEffect(() => {
    if (toolPane !== "stack" || !faultCandidates.length) return undefined;
    let live = true;
    import("../../lib/stereonet.js").then(({ fisherStats }) => {
      if (!live) return;
      const by = new Map();
      (layers.structure || []).forEach((s) => { if (!Number.isFinite(s.dip) || !Number.isFinite(s.azimuth)) return; const key = `${s.value}|${s.structure_id || ""}`; if (!by.has(key)) by.set(key, []); by.get(key).push(s); });
      const out = {};
      by.forEach((rows, key) => { const fs = rows.length >= 4 ? fisherStats(rows) : null; if (fs) out[key] = { k: fs.k, random: !!fs.noPreferred }; });
      setFaultK(out);
    }).catch(() => {});
    return () => { live = false; };
  }, [toolPane, faultCandidates, layers.structure]);
  const [gtOpen, setGtOpen] = useState(false); // TASKS.csv #2419
  // TASKS.csv #1744 / #2552 — the Grade shell offers only elements with a lab value, and opens on the element last used for a shell, else the
  // project's lead commodity; set into the shared state so the run reads the same element as the pane (modellingRuns falls back to the first)
  const shellSymbols = useMemo(() => { const has = new Set(); for (const a of labAssays(assays || [])) for (const k in a.values || {}) if (Number.isFinite(a.values[k])) has.add(k); return (assayElements || []).map((e) => e.symbol).filter((x) => has.has(x)); }, [assays, assayElements]);
  const shellLead = useLeadCommodity();
  useEffect(() => {
    if (!shellSymbols.length || findNumericSource(numericSymbol, { layers, customLayers: customLayersAll })) return;
    if (!numericSymbol || !shellSymbols.includes(numericSymbol)) setNumericSymbol(preferredElement(shellSymbols, "gradeShell", shellLead));
  }, [shellSymbols, shellLead]); // once per element list (the choice itself stays the user's)
  // TASKS.csv #3272 (Galore Creek review) — the Grade shell opened on a porphyry at a 1 ppm Cu cutoff (the cutoff was proposed only on an element
  // change, never for the element it opened on), a cap from all 46 assayed holes while it ran on the 14 checked ones (P99 22,900 against
  // 25,600), and ViewerModule's fixed 50 m search (1,505 of 1,720 ore-grade composites outside the shell; Estimation proposed 500 m). Now the
  // cutoff, the cap and the search are worked out on the holes the run uses (Model area), and proposed once for the opening element; a value
  // the user typed is kept (the opening values are ViewerModule's 1 and 50).
  const shellAreaAssays = useMemo(() => (modelArea === "checked" ? restrictRowsToHoles(assays || [], visibleHoles) : assays || []), [assays, modelArea, visibleHoles]);
  const shellAreaCollars = useMemo(() => (modelArea === "checked" ? restrictRowsToHoles(collars || [], visibleHoles) : collars || []), [collars, modelArea, visibleHoles]);
  const proposeShellCutoff = (next, onOpen = false) => {
    const ns = findNumericSource(next, { layers, customLayers: customLayersAll, logValidRange: storeProject?.logValidRange }); // #1741; logValidRange: #3116 — the cutoff proposed from the filtered readings
    // #2060 (review #2013, Woodjam) — and without the QC inserts unless the pane includes them: Cu proposed 4470 ppm (a CRM's value), the drill samples' P90 is 4120
    const base = ns ? sourceAssays(ns, { layers, customLayers: customLayersAll }).assays : shellAreaAssays;
    const inArea = ns && modelArea === "checked" ? restrictRowsToHoles(base, visibleHoles) : base; // #3272 — the holes the run uses
    const rowsFor = ns ? inArea : (numericIncludeQAQC ? inArea.filter((a) => a.source !== "pXRF") : excludeQAQC(inArea));
    const v = rowsFor.map((a) => a.values?.[ns ? ns.symbol : next]).filter((x) => Number.isFinite(x) && x > 0).sort((x, y) => x - y);
    if (v.length) {
      let p90 = +v[Math.floor(0.9 * (v.length - 1))].toPrecision(3), floor = null;
      // TASKS.csv #3788 (Scottie Gold) — tin proposed 'Sn > 5 ppm', the column's lowest AND commonest value (98.7 % of the results were exactly the half-limit): a shell round the whole drilled volume. When the
      // proposal is the lowest value, it is the 90th percentile of the values ABOVE that floor, and the note says how many sit on it
      if (p90 <= v[0]) { const above = v.filter((x) => x > v[0]); floor = { value: v[0], share: (v.length - above.length) / v.length }; if (above.length) p90 = +above[Math.floor(0.9 * (above.length - 1))].toPrecision(3); }
      setNumericCutoff(p90); setShellCutoffAuto({ symbol: next, value: p90, n: v.length, onOpen, ...(floor ? { floor } : {}) });
    } // said below: #3025 (6)
  };
  const shellSpacing = useMemo(() => {
    if (toolPane !== "shell" || !numericSymbol) return null;
    const has = new Set(); for (const a of shellAreaAssays) if (Number.isFinite(a.values?.[numericSymbol])) has.add(a.hole_id);
    const c = shellAreaCollars.filter((x) => has.has(x.hole_id)); // #2062 — the holes that carry the element, not every collar
    return holeSpacingSummary(c.length ? c : shellAreaCollars);
  }, [toolPane, numericSymbol, shellAreaAssays, shellAreaCollars]);
  const sheetPositionAt = useMemo(() => positionFromTraces(tracesRef?.current || []), [tracesSeq]); // #2625: the traces change with tracesSeq (#888)
  // TASKS.csv #3580 (cause 2, Review on Macpass Tom West) — the search from the spacing AT THE SAMPLES (from a sample, the nearest sample of another
  // hole), not between collar sites: holes fanned from one pad or station share a site, and Tom West's 15 m between sites gave a 40 m search
  // against 24 m between samples, so a third of the composites at the cutoff sat on blocks Min holes 2 never estimated. The collar
  // spacing stays the fallback (a log or a layer field as the source, no traces yet).
  // TASKS.csv #3593 — an element's samples at or above their 90th percentile (the Grade shell pane's proposed cut-off, #3272), placed on the traces,
  // in the model area: the trend panel fits its plane, pitch and ratios to them (lib/samplesTrend.js)
  const trendSamplePoints = (sym) => {
    const rows = excludeQAQC(shellAreaAssays).filter((a) => Number.isFinite(a.values?.[sym]) && a.values[sym] > 0 && Number.isFinite(a.from) && Number.isFinite(a.to));
    if (!rows.length) return null;
    const v = rows.map((a) => a.values[sym]).sort((x, y) => x - y), cutoff = +v[Math.floor(0.9 * (v.length - 1))].toPrecision(3);
    const pts = [];
    for (const a of rows) { if (a.values[sym] < cutoff) continue; const p = sheetPositionAt(a.hole_id, (a.from + a.to) / 2); if (p) pts.push(p); }
    // TASKS.csv #3769 — a cut-off on the column's lowest value (a detection floor) takes every sample at it: said
    const floor = cutoff === +v[0].toPrecision(3) ? v.filter((x) => +x.toPrecision(3) === cutoff).length / v.length : null;
    return { pts, cutoff, unit: (assayElements || []).find((e) => e.symbol === sym)?.unit || "", floor };
  };
  // TASKS.csv #3769 — every assayed sample of the model area, grade ignored, on the traces: the drilling's own plane (lib/drillingPlane.js)
  const trendDrillingPoints = () => {
    const pts = [];
    for (const a of excludeQAQC(shellAreaAssays)) { if (!Number.isFinite(a.from) || !Number.isFinite(a.to)) continue; const p = sheetPositionAt(a.hole_id, (a.from + a.to) / 2); if (p) pts.push({ x: p.x, y: p.y, z: p.z, hole_id: a.hole_id }); }
    return pts;
  };
  const shellSampleSpacing = useMemo(() => {
    if (toolPane !== "shell" || !numericSymbol) return null;
    const pts = [];
    for (const a of shellAreaAssays) {
      if (!Number.isFinite(a.values?.[numericSymbol]) || !Number.isFinite(a.from) || !Number.isFinite(a.to)) continue;
      const p = sheetPositionAt(a.hole_id, (a.from + a.to) / 2);
      if (p) pts.push({ hole_id: a.hole_id, x: p.x, y: p.y, z: p.z });
    }
    return sampleSpacing(pts);
  }, [toolPane, numericSymbol, shellAreaAssays, sheetPositionAt]);
  const shellSearchFrom = shellSampleSpacing?.medianM > 0 ? { m: Math.round(shellSampleSpacing.medianM), at: "samples" } : shellSpacing?.medianM > 0 ? { m: Math.round(shellSpacing.medianM), at: "collars" } : null;
  const shellSearchAuto = shellSearchFrom ? searchFromSpacingM(shellSampleSpacing?.medianM > 0 ? shellSampleSpacing.medianM : shellSpacing.medianM) : null;
  const ramGB = useMachineMemoryGB(); // TASKS.csv #3581 — the budgets this computer's memory allows (#3251's share of it)
  const shellBudgetOk = useMemo(() => new Set(shellBudgetsFor((mb) => fetchFits(mb, ramGB))), [ramGB]);
  const [shellSearchSet, setShellSearchSetState] = useState(() => shellMem.search ?? null);
  const setShellSearchSet = (v) => { shellMem.search = v; setShellSearchSetState(v); }; // #3651
  // TASKS.csv #3655 — search along the plane of the composites at the cut-off (modellingRuns.js, lib/viewer/shellPlane.js); a per-user preference
  // TASKS.csv #3673 — the shell: an envelope (the default) or the tight shell, and the envelope's probability; per-user preferences, read by the run
  const [shellMode, setShellModeState] = useState(() => { try { const m = localStorage.getItem("geostrix.shellMode"); return m === "auto" || m === "tight" || m === "envelope" ? m : "tight"; } catch { return "tight"; } }); // "auto": #3673; the default Tight: Matt, 2026-11-20 (a saved choice stays)
  const setShellMode = (m) => { setShellModeState(m); try { localStorage.setItem("geostrix.shellMode", m); } catch { /* storage off */ } };
  const [shellEnvIso, setShellEnvIsoState] = useState(() => { try { const v = Number(localStorage.getItem("geostrix.shellEnvelopeIso")); return v >= 0.3 && v <= 0.7 ? v : 0.5; } catch { return 0.5; } });
  const setShellEnvIso = (v) => { const x = Math.min(0.7, Math.max(0.3, Number(v) || 0.5)); setShellEnvIsoState(x); try { localStorage.setItem("geostrix.shellEnvelopeIso", String(x)); } catch { /* storage off */ } };
  const [shellPlaneSearch, setShellPlaneSearchState] = useState(() => { try { return localStorage.getItem("geostrix.shellPlaneSearch") !== "0"; } catch { return true; } });
  const setShellPlaneSearch = (on) => { setShellPlaneSearchState(on); try { localStorage.setItem("geostrix.shellPlaneSearch", on ? "1" : "0"); } catch { /* storage off */ } };
  const shellSearchTyped = useMemo(() => memoryRef(shellMem, "searchTyped", false), [shellMem]); // #3651: was useRef(false) // TASKS.csv #3607 (3) — a typed 50 m was replaced by 120 m when the pane reopened (50 is the untouched opening value) // { r, m, at }: the search this pane set from the spacing (at: "samples" | "collars")
  const shellCapAuto = useMemo(() => memoryRef(shellMem, "cap", { symbol: null, value: null }), [shellMem]); // #3651: was useRef; #3272 — the cap ShellCapNote set, kept while the note itself unmounts with the pane
  useEffect(() => {
    if (toolPane !== "shell" || !numericSymbol) return;
    if (numericCutoff === 1 && shellCutoffAuto?.value !== 1) proposeShellCutoff(numericSymbol, true); // #3651: the memory outlives a project load, so not '!shellCutoffAuto' // ViewerModule's opening 1: never a cutoff anyone typed for a grade shell
    // the opening 50, or a search this pane set from the collars and nobody changed since, once the samples' spacing is known (#3580)
    const untouchedCollarSearch = shellSearchSet?.at === "collars" && shellSearchFrom?.at === "samples" && numericSearchRadius === shellSearchSet.r;
    // #3607 (3) — a search the user typed (even the opening 50) is never replaced
    // #3651 — and a search this pane set, untouched, when the model area or the checked holes change (80 m for the property kept on Tom West's 143 holes)
    const untouchedOtherArea = shellSearchSet && numericSearchRadius === shellSearchSet.r && shellSearchAuto !== shellSearchSet.r;
    if (shellSearchAuto && !shellSearchTyped.current && ((numericSearchRadius === 50 && shellSearchSet?.r !== 50) || untouchedCollarSearch || untouchedOtherArea)) { setNumericSearchRadius(shellSearchAuto); setShellSearchSet({ r: shellSearchAuto, ...shellSearchFrom }); }
  }, [toolPane, numericSymbol, shellSearchAuto]); // once the pane opens on an element, and again when the spacing first becomes known
  // TASKS.csv #3651 — the cut-off this pane proposed, untouched, is proposed again for the holes the run now uses (Model area, the checked holes)
  const shellAreaSeen = useMemo(() => memoryRef(shellMem, "area", null), [shellMem]); // #3651 — survives the pane; null: none proposed for yet
  useEffect(() => {
    if (toolPane !== "shell" || shellAreaSeen.current === shellAreaAssays) return; // an area changed in Model settings is seen when the pane opens
    const first = shellAreaSeen.current == null;
    shellAreaSeen.current = shellAreaAssays;
    if (first) return; // the pane's first look: the opening proposals are made by the effect below
    if (numericSymbol && shellCutoffAuto && shellCutoffAuto.symbol === numericSymbol && numericCutoff === shellCutoffAuto.value) proposeShellCutoff(numericSymbol, shellCutoffAuto.onOpen);
  }, [shellAreaAssays, toolPane]);
  const [unitBody, setUnitBody] = useState({ iso: 0.5, largest: false, search: 0, cell: 0 }); // TASKS.csv #1340 — its own settings: a rock unit is not an alteration halo
  const tracedHoles = useMemo(() => new Set((tracesRef?.current || []).filter((t) => t?.pts?.length >= 2).map((t) => t.hole_id)).size, [tracesSeq]); // #2053
  // TASKS.csv #1574 (review #1497, Lawyers) — the alteration halo from the Alteration log OR a categorical custom layer, and only
  // the intervals whose numeric field is at or above a value (Silicification intensity >= 2)
  const { customLayers: customLayersAll = [], layers: storeLayers = {}, geochemThresholds = [] /* #2689 */, project: storeProject /* #3116 */, addVoxelModel /* #4070 */ } = useStore();
  const numericSources = useMemo(() => numericSourceChoices({ layers, customLayers: customLayersAll, logValidRange: storeProject?.logValidRange /* #3116 */ }), [layers, customLayersAll, storeProject?.logValidRange]); // TASKS.csv #1741
  // TASKS.csv #4070 — the Grade shell's steps: the elements by sample count (the rows the run reads: QC left out unless included, pXRF never) and
  // the chosen element's or log's positive values in the holes the run uses, for its quick cut-offs and the share at or above the cut-off
  const shellStep = useMemo(() => {
    if (toolPane !== "shell") return null;
    const rows = numericIncludeQAQC ? shellAreaAssays.filter((a) => a.source !== "pXRF") : excludeQAQC(shellAreaAssays);
    const ns = findNumericSource(numericSymbol, { layers, customLayers: customLayersAll, logValidRange: storeProject?.logValidRange });
    const base = ns ? sourceAssays(ns, { layers, customLayers: customLayersAll }).assays : null;
    const src = ns ? (modelArea === "checked" ? restrictRowsToHoles(base, visibleHoles) : base) : rows;
    const vals = src.map((a) => a.values?.[ns ? ns.symbol : numericSymbol]).filter((x) => Number.isFinite(x) && x > 0).sort((x, y) => x - y);
    return { counts: elementCounts(rows, shellSymbols), vals, quick: quickCutoffs(vals) };
  }, [toolPane, shellAreaAssays, shellSymbols, numericSymbol, numericIncludeQAQC, layers, customLayersAll, storeProject?.logValidRange, modelArea, visibleHoles]);
  const [altSource, setAltSource] = useState({ layer: "alt", field: "", min: "" });
  const altCustomLayers = useMemo(() => customLayersAll.filter((c) => (c.rows || []).some((r) => r.value != null && r.value !== "" && !Number.isFinite(Number(r.value)))), [customLayersAll]);
  // TASKS.csv #2540 (2) (review #2486, WA lithium) — the halo opened on an empty 'Alteration' layer: start on the first layer that has codes
  const altEmpty = !(storeLayers.alt || []).length;
  useEffect(() => {
    if (altSource.layer !== "alt" || !altEmpty) return;
    const first = (storeLayers.vein || []).length ? "vein" : (storeLayers.litho || []).length ? "litho" : (storeLayers.weath || []).length ? "weath" : altCustomLayers[0] ? `custom:${altCustomLayers[0].id}` : null;
    if (first) setAltSource({ layer: first, field: "", min: "" });
  }, [altEmpty, altSource.layer, storeLayers.vein, storeLayers.litho, storeLayers.weath, altCustomLayers]);
  // TASKS.csv #2050 — the Vein log too: a vein SET (stockwork) is modelled as an envelope of where it occurs, floored on its density
  // TASKS.csv #2945 — the chosen custom layer's rows only: a model run adds a custom layer ('modelled unit'), which re-ran the two passes below
  // over the 150,455-row log when the source was Lithology (about 60 ms of the stall when a GemPy result lands)
  const altCustomRows = useMemo(() => (altSource.layer.startsWith("custom:") ? altCustomLayers.find((c) => `custom:${c.id}` === altSource.layer)?.rows || [] : null), [altSource.layer, altCustomLayers]);
  const altSourceRows = useMemo(() => (altSource.layer === "alt" ? storeLayers.alt || [] : altSource.layer === "vein" ? storeLayers.vein || [] : altSource.layer === "litho" ? storeLayers.litho || [] : altSource.layer === "weath" ? storeLayers.weath || [] /* #2529 */ : altCustomRows || []), [altSource.layer, storeLayers.alt, storeLayers.vein, storeLayers.litho, storeLayers.weath, altCustomRows]);
  const altSourceCodes = useMemo(() => { if (altSource.layer === "alt") return alt_units.filter((u) => !isNotLogged(u)); const vals = new Set(); for (const r of altSourceRows) vals.add(String(r.value ?? "")); return [...vals].filter((v) => v && !isNotLogged(v)).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true })); }, [altSource.layer, alt_units, altSourceRows]); /* #3283 (3) — without regard to case, i2 before i10: it was "WFP, i, i1, i10" */ // #2945: 'not logged' tested once per code, not per row
  // TASKS.csv #1421 (review #1352, Silvertip) — a code logged only as zero-length points (POT) cannot make a halo: it failed with
  // 'indicator never crosses 0.5'. The logged metres per code, so those are shown disabled and say why.
  // TASKS.csv #3876 (#3767) — the lithology groups with a logged member, offered as one unit from the Lithology layer, and each member's group
  const altGroups = useMemo(() => (altSource.layer !== "litho" ? [] : (lithoGroups || []).filter((g) => g?.name && (g.codes || []).some((c) => altSourceCodes.includes(c)))), [altSource.layer, lithoGroups, altSourceCodes]);
  const altGroupOf = useMemo(() => new Map(altGroups.flatMap((g) => (g.codes || []).map((c) => [c, g.name]))), [altGroups]);
  // TASKS.csv #3876 (#3767) — a group and its Modelling codes twin (the same name) are one unit in the Implicit and Strat. stack pickers
  const mcodeNames = useMemo(() => new Set((modellingCodeList || []).map((c) => c.name)), [modellingCodeList]);
  const twinInStack = (name) => (lithoGroups || []).some((g) => g.name === name && stackUnits.includes(lithoGroupKey(g)));
  const altLoggedM = useMemo(() => { const m = new Map(); for (const r of altSourceRows) { const k = String(r.value ?? ""), len = Number(r.to) - Number(r.from); if (k && len > 0) m.set(k, (m.get(k) || 0) + len); } return m; }, [altSourceRows]);
  // TASKS.csv #1553 (review #1497, Lawyers) — the Structures picker listed 27 types, VnGy and V1/V3 among them with no dip / dip
  // direction, and 'Run' only then said there was nothing to model: each type with its picks and how many are oriented
  // TASKS.csv #3282 (review #3195, Galore Creek) — with Model area = checked holes the menu gave the project's counts ('Shear · 21 of 25
  // oriented') and the run used 13: the area's counts first (an, ak), the project's after
  const structCounts = useMemo(() => { const m = new Map(), inArea = (r) => modelArea !== "checked" || visibleHoles?.[r.hole_id] !== false; for (const r of layers.structure || []) { const k = String(r.value ?? ""); const e = m.get(k) || { n: 0, k: 0, an: 0, ak: 0 }; const ok = Number.isFinite(Number(r.dip)) && Number.isFinite(Number(r.azimuth)) && r.dip !== null && r.azimuth !== null && r.dip !== "" && r.azimuth !== ""; e.n++; if (ok) e.k++; if (inArea(r)) { e.an++; if (ok) e.ak++; } m.set(k, e); } return m; }, [layers.structure, modelArea, visibleHoles]);
  const altNumericFields = useMemo(() => numericLayerFields(altSourceRows, { min: 3 }).filter((f) => f !== "from" && f !== "to"), [altSourceRows]);
  const altVocabFields = useMemo(() => intensityVocabFields(altSourceRows, { min: 3 }), [altSourceRows]); // #2230
  const altVocab = altVocabFields.find((v) => v.field === altSource.field) || null;
  const mcodesView = useMemo(() => ({ scene: sceneRef, groups: layerGroupsRef, camera: cameraRef, renderer: rendererRef, traces: tracesRef, activity: lastActivityRef, dragHook: viewDragHookRef }), [sceneRef, layerGroupsRef, cameraRef, rendererRef, tracesRef, lastActivityRef, viewDragHookRef]);
  // TASKS.csv #2535 — the Explicit surface seeds from the Model area's holes (it seeded 206 picks across the property, then fed a 30-hole run)
  // Both built on first use only (the Explicit surface pane), once per change of the logs, the codes or the Model area.
  const areaRuns = useMemo(() => { let v = null; return () => v || (v = codedRuns(modelArea === "checked" ? (layers.litho || []).filter((r) => visibleHoles?.[r.hole_id] !== false) : layers.litho || [], modellingCodes, mcGroupOf)); },
    [layers.litho, modellingCodes, lithoGroups, modelArea, visibleHoles]); // mcGroupOf is rebuilt every render from lithoGroups
  // TASKS.csv #2921 — the pile's order from the holes (stratigraphic codes only), for the explicit tops of one pile
  const areaPile = useMemo(() => { let v = null; return () => v || (v = pileFromRuns(areaRuns(), (c) => !["intrusion", "cross-cutting", "overburden", "ignore"].includes(codeInfo(modellingCodes, c, mcodeDefaultRole).role))); },
    [areaRuns, modellingCodes, lithoGroups]); // mcodeDefaultRole is rebuilt every render from lithoGroups
  // TASKS.csv #3767 — a lithology group is one unit in 'Set the plane from' (its tops are the group's runs'): offered in place of its member codes, which hold no runs of their own
  const tiedUnits = (units, groups) => { const gs = (groups || []).filter((g) => (g.codes || []).some((c) => units.includes(c))); const taken = new Set(gs.flatMap((g) => g.codes || [])); return [...units.filter((u) => !taken.has(u)), ...gs.map((g) => g.name)]; };
  const topsOfUnit = useCallback((unit) => {
    const runs = areaRuns(), pile = areaPile();
    const holes = [...new Set(runs.filter((r) => r.code === unit).map((r) => r.hole_id))];
    if (codeInfo(modellingCodes, unit, mcodeDefaultRole).role === "overburden") { // TASKS.csv #1684 — an overburden unit seeds its BASE
      const { bases, skipped } = overburdenBases(runs, modellingCodes, mcodeDefaultRole, unit);
      return { base: true, tops: bases.map((b) => ({ hole_id: b.hole_id, md: b.md, above: b.above, below: b.below })), skipped: { holeStart: 0, gap: 0, belowRole: 0, olderAbove: 0, holeEnd: skipped.holeEnd }, holes };
    }
    const { tops, skipped } = topsForCode(runs, unit, modellingCodes, mcodeDefaultRole);
    // TASKS.csv #2921 — where the unit is missing from a hole that passes from a unit above it into one under it: its top at zero thickness
    const absent = pile.kOf.has(unit) ? absentTops(runs, unit, pile).tops : [];
    return { tops: tops.map((r) => ({ hole_id: r.hole_id, md: r.from, end: r.to /* #3771 — the base of the same run */, above: r.above?.code ?? null, below: r.code })), skipped, holes, absent, pile };
  }, [areaRuns, areaPile, modellingCodes, lithoGroups]); // mcodeDefaultRole is rebuilt every render from lithoGroups
  // TASKS.csv #2926 (review #2876, WA iron) — the stack's order against the holes, as the units are added (the run's own check, #2382, came
  // after Run and said 'Reorder the units with the arrows'): each unit's logged values, as runStackModel reads them. Only while the pane is open.
  const stackHoles = useMemo(() => {
    if (toolPane !== "stack" || stackUnits.length < 2) return null;
    const mcodeVals = (name) => { const v = new Set(); for (const r of areaRuns()) if (r.code === name) for (const row of r.rows) v.add(row.value); return [...v]; };
    const codesOf = (u) => (isLithoGroupKey(u) ? resolveLithoTarget(u)?.codes || [] : isMcodeKey(u) ? mcodeVals(u.slice(6)) : [u]);
    const r = orderFromHoles(layers.litho || [], stackUnits, codesOf);
    return r.conflicts.length ? r : null;
  }, [toolPane, stackUnits, layers.litho, areaRuns, lithoGroups]); // resolveLithoTarget is rebuilt every render from lithoGroups
  // TASKS.csv #3994 (Matt, Century) — the stack as the holes would put it: the fewest moves, units the holes never show together keep their place, contradictions listed (lib/holesOrder.js)
  const stackCodesOf = (u) => { // the logged values that are this stack unit (a group's codes, a Modelling code's, or the code)
    if (isLithoGroupKey(u)) return resolveLithoTarget(u)?.codes || [];
    if (!isMcodeKey(u)) return [u];
    const v = new Set(); for (const r of areaRuns()) if (r.code === u.slice(6)) for (const row of r.rows) v.add(row.value); return [...v];
  };
  const holesPlan = useMemo(() => {
    if (toolPane !== "stack" || stackUnits.length < 2) return null;
    return holesOrderPlan(layers.litho || [], stackUnits, stackCodesOf);
  }, [toolPane, stackUnits, layers.litho, areaRuns, lithoGroups]); // resolveLithoTarget is rebuilt every render from lithoGroups
  // TASKS.csv #3999 — what 'Add all' could add: the codes the 'Add a unit…' list offers (not a cross-cutting, no-recovery, cover or left-out one), by the same rules
  const [addAllOpen, setAddAllOpen] = useState(false);
  // TASKS.csv #4033 — the guide's doors (lib/guide/paneIntent.js): Model settings and Strat. stack open filled in. Nothing is run or added; the person presses the button.
  const [addAllStart, setAddAllStart] = useState(null);
  usePaneIntent(["settings", "stack"].includes(toolPane) ? toolPane : null, (it) => {
    if (it.pane === "settings") {
      const s = settingsIntent(it);
      if (s.holes) { setVisibleHoles(onlyTheseHoles(collars, s.holes)); setHoleFilter?.(""); }
      if (s.area) setModelArea(s.area);
      if (s.resolution) setModelResolution(s.resolution);
      requestStep("settings", s.resolution && !s.area && !s.holes ? "detail" : "area"); // #4070 — the step the Guide's door is about
      return;
    }
    const s = stackIntent(it);
    if (s.addAll) { requestStep("stack", "units"); /* #4070 — the step it is on */ setAddAllStart({ ...s.addAll }); setAddAllOpen(true); setTimeout(() => document.querySelector("[data-add-all]")?.scrollIntoView({ block: "nearest" }), 80); }
    if (s.faults) {
      const known = new Set((faultCandidates || []).map((c) => c.key));
      const add = s.faults.filter((k) => known.has(k) && !stackFaults.includes(k)).slice(0, Math.max(0, 6 - stackFaults.length));
      if (add.length) setStackFaults((p) => [...p, ...add.filter((k) => !p.includes(k))]);
      requestStep("stack", "faults"); // #4070 — the Faults step
      setTimeout(() => { const el = document.querySelector("[data-stack-faults]"); el?.scrollIntoView({ block: "center" }); el?.nextElementSibling?.focus?.(); }, 80);
    }
  });
  const addAllC = useMemo(() => (toolPane !== "stack" ? null : addAllCandidates({ rows: layers.litho || [], litho_units, modellingCodeList, roleOf: rawRole, stackUnits, codesOf: stackCodesOf,
    groupOf: (u) => lithoGroups.some((g) => stackUnits.includes(lithoGroupKey(g)) && (g.codes || []).includes(u)), twinInStack })), [toolPane, layers.litho, litho_units, modellingCodeList, stackUnits, lithoGroups, areaRuns]);
  // the 'Add a unit' list in the order the holes give (youngest first), not by interval count
  const unitRank = useMemo(() => {
    if (toolPane !== "stack") return null;
    const r = orderFromHoles(layers.litho || [], litho_units);
    return new Map(r.order.map((u, i) => [u, i]));
  }, [toolPane, layers.litho, litho_units]);
  // TASKS.csv #2056 (review #2013, Woodjam) — the logged holes the model area feeds, and their clusters in plan (a gap over 5 x the hole spacing)
  const loggedInArea = useMemo(() => { const logged = new Set((layers.litho || []).map((r) => r.hole_id)); return (collars || []).filter((c) => (!logged.size || logged.has(c.hole_id)) && (modelArea !== "checked" || visibleHoles?.[c.hole_id] !== false)); }, [layers.litho, collars, modelArea, visibleHoles]);
  const areaClusters = useMemo(() => holeClusters(loggedInArea), [loggedInArea]);
  // TASKS.csv #3268 (review #3195, Galore Creek) — the note was only in Model settings, which the Simple ribbon hides: a first Run in Simple spanned
  // 9 clusters over 29 km unwarned. The same note, with its buttons, heads the Implicit surface and Strat. stack panes too.
  const clusterBody = () => (areaClusters && areaClusters.clusters.length > 1 ? (<div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 6, lineHeight: 1.4 }}>{/* #2056 */}
          {(layers.litho || []).length ? tr("The {n} logged holes in the model area lie in {k} clusters over {g} m apart: one model would span the gaps between them. Model one cluster at a time:", { n: loggedInArea.length, k: areaClusters.clusters.length, g: Math.round(areaClusters.gapM).toLocaleString() }) : tr("The {n} holes in the model area lie in {k} clusters over {g} m apart: one model would span the gaps between them. Model one cluster at a time:", { n: loggedInArea.length, k: areaClusters.clusters.length, g: Math.round(areaClusters.gapM).toLocaleString() }) /* #3606: no lithology logged, so not "logged holes" */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>{areaClusters.clusters.slice(0, 6).map((c) => (
            <button key={c.ids[0]} type="button" title={c.ids.join(", ")} onClick={() => { setVisibleHoles(onlyTheseHoles(collars, c.ids)); setModelArea("checked"); setHoleFilter?.(""); }} className="gs-btn gs-btn--block" style={{ width: "auto", marginBottom: 0, padding: "2px 7px" }}>{tr(c.n === 1 ? "Around E {e}, N {nn} ({first})" : "Around E {e}, N {nn}: {n} holes over {s} km", { first: c.ids[0], n: c.n, e: Math.round(c.cx / 100) * 100, nn: Math.round(c.cy / 100) * 100, s: Math.max(0.1, c.spanM / 1000).toFixed(1) }) /* #2928 (3): a place, not one hole id */}</button>))}</div>
        </div>) : null);
  // TASKS.csv #4070 — in a step pane, one line that opens to the note and its cluster buttons (the note took 60 words above the stack's steps)
  const clusterNote = (compact = false) => {
    const b = clusterBody();
    return b && compact ? (<details style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6 }}><summary style={{ cursor: "pointer" }}>
      {tr("{k} clusters of holes, over {g} m apart: model one at a time", { k: areaClusters.clusters.length, g: Math.round(areaClusters.gapM).toLocaleString() })}</summary>{b}</details>) : b;
  };
  // TASKS.csv #1844 (review #1646, Kodiak) — a disabled GemPy Run button said only 'Runs in GeoStrix's Python engine…' (the status bar read
  // 'Py: idle', ready): its title now says first what is missing, or that a model is running
  const gempyTitle = (missing) => (implicitBusy ? tr("A model is already running.") : missing || tr("Runs in GeoStrix's Python engine (GemPy) — the status bar's Py shows whether it is ready"));
  // TASKS.csv #2054 — Modelling codes' pane, whole or (focus "correlate") its hole-to-hole tools only, for the Correlation pane; one state for both
  const mcodesPane = (focus) => <ModellingCodesPane focus={focus} inArea={modelArea === "checked" ? (id) => visibleHoles?.[id] !== false : null} /* #2533 — Auto-number follows the Model area */ litho={layersAll.litho || []} modellingCodes={modellingCodes} setModellingCodes={setModellingCodes} groupOf={mcGroupOf} defaultRole={mcodeDefaultRole}
          pickMode={mcPickMode} setPickMode={setMcPickMode} selected={mcSelected} setSelected={setMcSelected} connectFrom={mcConnectFrom} setConnectFrom={setMcConnectFrom}
          view={mcodesView} unitBody={unitBody} setUnitBody={setUnitBody} onBuildBody={(code) => runAlterationModel(`mcode:${code}`, unitBody)} assayElements={assayElements} /* #2634 */ positionAt={sheetPositionAt} /* #2625 */
          askPrompt={askPrompt} pBtn={pBtn} inputStyle={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />;
  return (<>
        {toolPane === "settings" && <SettingsPane {...{ TrendsPanel, activeInterceptSet, activeInterceptSetId, camState, clipToDomainBoundary, clipToTopo, clusterNote, collars, contactReachM, domains, explicitClickRef, implicitMeshesRef, implicitSurfaces, interceptSets, limitToContacts, lithoGroups, litho_units, mapLayers, miniField, modelArea, modelDomainId, modelResolution, orientTypes, orientTypesSel, orientationReachM, originRef, paneHeader, rangeMultiplier, sceneRef, searchEllipsoid, setActiveInterceptSetId, setClipToDomainBoundary, setClipToTopo, setContactReachM, setExplicitPickFor, setLimitToContacts, setModelArea, setModelDomainId, setModelResolution, setOrientTypesSel, setOrientationReachM, setRangeMultiplier, setSearchEllipsoid, setSmoothClusters, setStructuralTrends, setSurfaceDetail, setThinPicks, setThinWindowM, setTrendPreviewId, setUnitField, setVisibleHoles, sheetPositionAt, shellSymbols, smoothClusters, structuralTrends, structurePicksWithHoleAttitude, structureTypes, surfaceDetail, surfaceStructures, terrain, thinPicks, thinWindowM, tiedUnits, toolPane, topsOfUnit, tracedHoles, trendDrillingPoints, trendPreviewId, trendSamplePoints, unitField, unitFields, visibleHoles, worldPointFromHits }} />}
        {toolPane === "gradeEst" && <EstimationPane {...{ assayElements, assays, collars, gtOpen, layers, modelArea, paneHeader, setGradeEstOpen, setGtOpen, setVariogramOpen, survey, toolPane, visibleHoles }} />}
        {toolPane === "mapmodel" && <MapModelPane {...{ MapModelPanel, collars, desurveyMethod, implicitBusy, implicitGroupRef, implicitMeshesRef, layers, leftOutNote, mapLayers, originRef, paneHeader, runMapModel, setImplicitSurfaces, setNotices, surfaceStructures, survey, terrain, toolPane }} />}{/* TASKS.csv #817 */}
        {toolPane === "explicit" && <ExplicitPane {...{ ExplicitSurfacePanel, askPrompt, explicitPickFor, explicitScene, explicitSnap, explicitSurfaces, explicitTrend, implicitMeshesRef, implicitSurfaces, lithoGroups, litho_units, mapLayers, modellingCodeList, paneHeader, removeImplicitSurface, sectionImages, sections, setDigitizeImageId, setExplicitLogged, setExplicitPickFor, setExplicitSnap, setExplicitSurfaces, surfaceStructures, terrain, toolPane, topsOfUnit, tracesSeq }} />}
        {toolPane === "mcodes" && <CodesPane {...{ emptyPaneHint, litho_units, mcodesPane, paneHeader, toolPane }} />}
        {toolPane === "groups" && <LithoGroupsPane {...{ addLithoGroup, askPrompt, emptyPaneHint, expandedLithoGroupId, layers, lithoGroupCrossCuts, lithoGroupRole, lithoGroups, lithoUnitsAll, litho_units, paneHeader, removeLithoGroup, setExpandedLithoGroupId, toolPane, updateLithoGroup }} />}
        {toolPane === "correlation" && <CorrelationPane {...{ SurfaceGeologyProjection, collars, emptyPaneHint, litho_units, mapConstraint, mapLayers, mcodesPane, paneHeader, projectMapContact, setFenceOpen, setMapConstraint, surfaceStructures, terrain, toolPane }} />}
        {toolPane === "geoml" && <GeomlPane {...{ PredictivePanel, assayElements, assays, clipToTopo, collars, desurveyMethod, layers, leftOutNote, lithoGroups, modellingCodes, paneHeader, setNotices, survey, terrain, toolPane, trendFor, visibleHoles }} />}
        {toolPane === "implicit" && <ImplicitPane {...{ clusterNote, implicitSurfaces, collars, emptyPaneHint, gempyTitle, implicitBusy, implicitTarget, includeSectionContacts, leftOutCodes, leftOutNote, lithoGroupCrossCuts, lithoGroupKey, lithoGroupRole, lithoGroups, litho_units, mcodeNames, mcodeRole, modellingCodeList, paneHeader, rawRole, runImplicitModel, sections, sensBudget, sensN, sensOpen, sensSigmaDeg, sensSigmaPos, setImplicitTarget, setIncludeSectionContacts, setSensBudget, setSensN, setSensOpen, setSensSigmaDeg, setSensSigmaPos, toolPane }} />}
        {toolPane === "stack" && <StackPane {...{ addAllC, addAllOpen, addAllStart, addStackUnit, clusterNote, collars, emptyPaneHint, faultCandidates, faultK, gempyTitle, holesPlan, implicitBusy, implicitSurfaces, includeSectionContacts, isLithoGroupKey, isMcodeKey, layers, leftOutNote, lithoGroupCrossCuts, lithoGroupKey, lithoGroupRole, lithoGroups, litho_units, mcodeNames, mcodeRole, modellingCodeList, moveStackUnit, paneHeader, rawRole, removeStackUnit, resolveLithoTarget, runStackModel, sections, setAddAllOpen, setIncludeSectionContacts, setStackAdd, setStackBreaks, setStackFaultOffsets, setStackFaults, setStackMethod, setStackRelation, setStackUnits, stackAdd, stackBreaks, stackCodesOf, stackFaultOffsets, stackFaults, stackHoles, stackMethod, stackRelation, stackUnits, toolPane, twinInStack, unitRank }} />}
        {toolPane === "faults" && <FaultsPane {...{ paneHeader, props, toolPane }} />}
        {toolPane === "structural" && <StructuralPane {...{ implicitSurfaces, emptyPaneHint, gempyTitle, implicitBusy, layers, modelArea, paneHeader, runStructuralModel, setCoreOrientOpen, setStereonetOpen, setStructuralTarget, setTadpoleOpen, structCounts, struct_types, structuralTarget, surfaceStructures, toolPane }} />}
        {toolPane === "alteration" && <AlterationPane {...{ altCustomLayers, implicitSurfaces, altEmpty, altGroupOf, altGroups, altLoggedM, altNumericFields, altSource, altSourceCodes, altVocab, altVocabFields, alt_units, alterationBusy, alterationCellSize, alterationSearchRadius, alterationTarget, miniField, paneHeader, runAlterationModel, setAltSource, setAlterationCellSize, setAlterationSearchRadius, setAlterationTarget, storeLayers, toolPane }} />}
        {toolPane === "vein" && <VeinPane {...{ implicitSurfaces, miniField, paneHeader, runVeinModel, setVeinCellSize, setVeinDip, setVeinDipDir, setVeinSearchRadius, setVeinTarget, toolPane, veinBusy, veinCellSize, veinDip, veinDipDir, veinSearchRadius, veinTarget, vein_units, props }} />}
        {toolPane === "shell" && <GradeShellPane {...{ addVoxelModel, assayElements, assays, clipToTopo, collars, customLayersAll, desurveyMethod, geochemThresholds, implicitGroupRef, implicitMeshesRef, implicitSurfaces, layers, miniField, modelArea, numericBudgetHint, numericBusy, numericCapValue, numericCellHeight, numericCellSize, numericCloseShell, numericCompositeLength, numericCutoff, numericFlatReach, numericIncludeQAQC, numericMaxBlocks, numericMethod, numericMinCoverage, numericMinHoles, numericPadding, numericSearchRadius, numericSources, numericSymbol, numericUseComposites, numericVariogram, originRef, paneHeader, proposeShellCutoff, ramGB, runNumericModel, setClipToTopo, setImplicitSurfaces, setNotices, setNumericBudgetHint, setNumericCapValue, setNumericCellHeight, setNumericCellSize, setNumericCloseShell, setNumericCompositeLength, setNumericCutoff, setNumericFlatReach, setNumericIncludeQAQC, setNumericMaxBlocks, setNumericMethod, setNumericMinCoverage, setNumericMinHoles, setNumericPadding, setNumericSearchRadius, setNumericSymbol, setNumericUseComposites, setNumericVariogram, setShellEnvIso, setShellMode, setShellPlaneSearch, shellAreaAssays, shellBudgetOk, shellCapAuto, shellCutoffAuto, shellEnvIso, shellMode, shellPlaneSearch, shellSampleSpacing, shellSearchSet, shellSearchTyped, shellStep, shellSymbols, storeProject, survey, terrain, toolPane, trendFor, visibleHoles }} />}
  </>);
}

