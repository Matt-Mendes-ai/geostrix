// TASKS.csv #693 — the 3D Modelling tool panes (Model settings, grade estimation, explicit surface, modelling codes,
// litho groups, correlation, geoML, implicit surface, stratigraphic stack, structures, alteration, veins / dykes, grade
// shell), moved out of ViewerModule.jsx VERBATIM by a script (every TASKS.csv comment inside still applies where it
// stands) and loaded on demand: they are only rendered once a modelling pane is opened, and ViewerModule was over its
// startup budget. The props are exactly the free identifiers of the moved JSX that ViewerModule declares (found by
// Babel scope analysis, not by hand); module imports are re-imported here.
import { isNotLogged } from "../../lib/notLogged.js"; // TASKS.csv #1740
import { Activity, Calculator, ChevronDown, ChevronRight, ChevronUp, Compass, Droplets, FileBarChart2, Gem, GitCompare, Group, Layers, Layers3, Milestone, Mountain, Settings, Shapes, Sparkles, Trash2, Waves, Waypoints, X, PenTool } from "../../components/icons.js";
import { BLOCK_BUDGETS, ESTIMATION_METHODS, gradeShellBudgetNote } from "../../lib/estimationMeta.js"; // gradeShellBudgetNote: #1416
import InfoButton from "../../components/InfoButton.jsx";
import { PRECIOUS_METALS, gradeUnitLabel } from "../../lib/geochem.js"; // gradeUnitLabel: #2218
import { Fragment, Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { withChangeLog } from "../../lib/explicitLog.js"; // TASKS.csv #878
import { activateOnKey, iconAction } from "../../lib/a11y.js";
import { colorForLithology, isCrossCuttingRole, roleForLithology, groupMemberRole, groupNameHint } from "../../lib/layers.js"; // group roles: #2052
import { codedRuns, topsForCode, codeInfo, overburdenBases } from "../../lib/modellingCodes.js"; // TASKS.csv #871; #1684
import { pileFromRuns, absentTops, orderFromHoles, movesToOrder } from "../../lib/pileTops.js"; // TASKS.csv #2921; orderFromHoles / movesToOrder: #2926
import { pBtn, smallSel } from "../../lib/sidebarStyles.js";
import { sceneVertsToWorldFlat } from "../../lib/meshFlat.js";
import { octreeCellM } from "../../lib/viewer/contactFit.js"; // TASKS.csv #1171
import { drillThresholdOffers } from "../../lib/thresholds.js"; // TASKS.csv #2689
import { preferredElement, rememberElement } from "../../lib/preferredElement.js"; // TASKS.csv #2552
import { useLeadCommodity } from "../../lib/useLeadCommodity.js"; // TASKS.csv #2552
import { describeTrend, searchEllipsoidAxes } from "../../lib/trend.js"; // TASKS.csv #2676 — the Grade shell pane's trend line
import { trendCellM, trendCellText } from "../../lib/trendCell.js"; // TASKS.csv #3010
import { positionFromTraces } from "../../lib/sheetCorrelation.js"; // TASKS.csv #2625
import { t as tr } from "../../lib/i18n.js";
import GeochemCompositingNote from "../../components/GeochemCompositingNote.jsx"; // TASKS.csv #2224
import { errorNotice } from "../../lib/notices.js";
import { tx } from "../../lib/i18nRich.js";
import { betaReferenceCounts } from "../../lib/coreOrientation.js"; // TASKS.csv #2055
import { holeClusters, onlyTheseHoles } from "../../lib/holeClusters.js"; // TASKS.csv #2056
import { groupOverlaps, groupOfCode, caseVariantGroups, subdivisionGroups } from "../../lib/lithoGroups.js"; // TASKS.csv #1685; caseVariantGroups: #2386; subdivisionGroups: #2928
import GradeTonnageLauncher from "../../components/GradeTonnageLauncher.jsx"; // TASKS.csv #1577
import { useStore } from "../../lib/store.jsx";
import { numericLayerFields } from "../../lib/evidenceSources.js"; // TASKS.csv #1574 — the numeric fields of a log (intensity 1-3)
import { intensityVocabFields } from "../../lib/intensityVocab.js"; // TASKS.csv #2230 — intensity letters (W / M / S / I) ranked
import { numericSourceChoices, findNumericSource, sourceAssays } from "../../lib/numericSources.js"; // TASKS.csv #1741 — logs and numeric layer fields as a grade-shell source
import { excludeQAQC, labAssays } from "../../lib/qaqc.js"; // labAssays: #1744; TASKS.csv #2060 — the proposed cutoff without the QC inserts (this file loads lazily, so qaqc.js stays off the startup path)
import { checkedHoleCount } from "../../lib/modelArea.js"; // TASKS.csv #1546
import { GradeShellUnsampled } from "../../components/UnsampledChoice.jsx"; // TASKS.csv #2417 / #2542
import ShellCapNote from "./ShellCapNote.jsx"; // TASKS.csv #2222 — the Estimation dialog's default cap (#1573) here too
import { zoneAlphaPicks, customAlphaPicks } from "../../lib/alphaPicks.js"; // TASKS.csv #1686
const ModelAreaRange = lazy(() => import("../../components/ModelAreaRange.jsx")); // TASKS.csv #2536
const GradeThicknessModal = lazy(() => import("../../components/GradeThicknessModal.jsx")); // TASKS.csv #2419

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
    addVoxelModel,
    addWorldMeshSurface,
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
    layers,
    lithoGroupCrossCuts,
    lithoGroupKey,
    lithoGroupRole,
    lithoGroups,
    litho_units,
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
    modellingCodeList,
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
    visibleHoles, // TASKS.csv #1315
    setVisibleHoles, // TASKS.csv #2536 — Model area by an E / N range
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
  // TASKS.csv #3025 (6) — the Grade shell's cutoff proposed on an element change (the 90th percentile of its assays) said as such: 57.3 % Fe
  // appeared with no word
  const [shellCutoffAuto, setShellCutoffAuto] = useState(null); // { symbol, value }
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
  const [unitBody, setUnitBody] = useState({ iso: 0.5, largest: false, search: 0, cell: 0 }); // TASKS.csv #1340 — its own settings: a rock unit is not an alteration halo
  const sheetPositionAt = useMemo(() => positionFromTraces(tracesRef?.current || []), [tracesSeq]); // #2625: the traces change with tracesSeq (#888)
  const tracedHoles = useMemo(() => new Set((tracesRef?.current || []).filter((t) => t?.pts?.length >= 2).map((t) => t.hole_id)).size, [tracesSeq]); // #2053
  // TASKS.csv #1574 (review #1497, Lawyers) — the alteration halo from the Alteration log OR a categorical custom layer, and only
  // the intervals whose numeric field is at or above a value (Silicification intensity >= 2)
  const { customLayers: customLayersAll = [], layers: storeLayers = {}, geochemThresholds = [] /* #2689 */ } = useStore();
  const numericSources = useMemo(() => numericSourceChoices({ layers, customLayers: customLayersAll }), [layers, customLayersAll]); // TASKS.csv #1741
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
  const altSourceCodes = useMemo(() => { if (altSource.layer === "alt") return alt_units.filter((u) => !isNotLogged(u)); const vals = new Set(); for (const r of altSourceRows) vals.add(String(r.value ?? "")); return [...vals].filter((v) => v && !isNotLogged(v)).sort(); }, [altSource.layer, alt_units, altSourceRows]); // #2945: 'not logged' tested once per code, not per row
  // TASKS.csv #1421 (review #1352, Silvertip) — a code logged only as zero-length points (POT) cannot make a halo: it failed with
  // 'indicator never crosses 0.5'. The logged metres per code, so those are shown disabled and say why.
  const altLoggedM = useMemo(() => { const m = new Map(); for (const r of altSourceRows) { const k = String(r.value ?? ""), len = Number(r.to) - Number(r.from); if (k && len > 0) m.set(k, (m.get(k) || 0) + len); } return m; }, [altSourceRows]);
  // TASKS.csv #1553 (review #1497, Lawyers) — the Structures picker listed 27 types, VnGy and V1/V3 among them with no dip / dip
  // direction, and 'Run' only then said there was nothing to model: each type with its picks and how many are oriented
  const structCounts = useMemo(() => { const m = new Map(); for (const r of layers.structure || []) { const k = String(r.value ?? ""); const e = m.get(k) || { n: 0, k: 0 }; e.n++; if (Number.isFinite(Number(r.dip)) && Number.isFinite(Number(r.azimuth)) && r.dip !== null && r.azimuth !== null && r.dip !== "" && r.azimuth !== "") e.k++; m.set(k, e); } return m; }, [layers.structure]);
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
    return { tops: tops.map((r) => ({ hole_id: r.hole_id, md: r.from, above: r.above?.code ?? null, below: r.code })), skipped, holes, absent, pile };
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
  // the 'Add a unit' list in the order the holes give (youngest first), not by interval count
  const unitRank = useMemo(() => {
    if (toolPane !== "stack") return null;
    const r = orderFromHoles(layers.litho || [], litho_units);
    return new Map(r.order.map((u, i) => [u, i]));
  }, [toolPane, layers.litho, litho_units]);
  // TASKS.csv #2056 (review #2013, Woodjam) — the logged holes the model area feeds, and their clusters in plan (a gap over 5 x the hole spacing)
  const loggedInArea = useMemo(() => { const logged = new Set((layers.litho || []).map((r) => r.hole_id)); return (collars || []).filter((c) => (!logged.size || logged.has(c.hole_id)) && (modelArea !== "checked" || visibleHoles?.[c.hole_id] !== false)); }, [layers.litho, collars, modelArea, visibleHoles]);
  const areaClusters = useMemo(() => holeClusters(loggedInArea), [loggedInArea]);
  // TASKS.csv #1844 (review #1646, Kodiak) — a disabled GemPy Run button said only 'Runs in GeoStrix's Python engine…' (the status bar read
  // 'Py: idle', ready): its title now says first what is missing, or that a model is running
  const gempyTitle = (missing) => (implicitBusy ? tr("A model is already running.") : missing || tr("Runs in GeoStrix's Python engine (GemPy) — the status bar's Py shows whether it is ready"));
  // TASKS.csv #2054 — Modelling codes' pane, whole or (focus "correlate") its hole-to-hole tools only, for the Correlation pane; one state for both
  const mcodesPane = (focus) => <ModellingCodesPane focus={focus} inArea={modelArea === "checked" ? (id) => visibleHoles?.[id] !== false : null} /* #2533 — Auto-number follows the Model area */ litho={layers.litho || []} modellingCodes={modellingCodes} setModellingCodes={setModellingCodes} groupOf={mcGroupOf} defaultRole={mcodeDefaultRole}
          pickMode={mcPickMode} setPickMode={setMcPickMode} selected={mcSelected} setSelected={setMcSelected} connectFrom={mcConnectFrom} setConnectFrom={setMcConnectFrom}
          view={mcodesView} unitBody={unitBody} setUnitBody={setUnitBody} onBuildBody={(code) => runAlterationModel(`mcode:${code}`, unitBody)} assayElements={assayElements} /* #2634 */ positionAt={sheetPositionAt} /* #2625 */
          askPrompt={askPrompt} pBtn={pBtn} inputStyle={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />;
  return (<>
        {toolPane === "settings" && (<>
        {paneHeader("Model settings", Settings, "model")}
        {/* TASKS.csv #309 — this block of explanatory prose used to render ALWAYS-ON directly under
            the section label, at the smallest font size in the app. The 3D Modelling sidebar had five
            of these (Domain / Intercept set / Resolution / Surface stiffness / Search ellipsoid),
            roughly four lines of help per control, so a 900px sidebar showed about five actual
            controls and the rest was prose — while the 3D View sidebar, rendered by this SAME
            component, is almost entirely controls. The writing is good and specific and is NOT cut;
            it moves behind the existing InfoButton disclosure (already used 8x in GeophysicsModule,
            1x in RasterModule, and 0x here until now), which opens on hover OR click. */}
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Domain")}</span>
          <InfoButton title={tr("Domain")} width={280} text={tr("Restricts every tool below to one side of one or more faults — build domains in \"Domains\" further down first, then pick one here. Applies to every modelling tool on this tab (implicit surface, stack, structural, model from map, alteration, vein / dyke, grade shell); \"Whole property\" is the original, undomained behaviour.")} />
        </div>
        <select aria-label={tr("Model domain")} value={modelDomainId} onChange={(e) => setModelDomainId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", marginBottom: 4 }}>
          <option value="">{tr("Whole property")}</option>
          {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {/* TASKS.csv #1546 (review #1497, Lawyers) — one prospect, not the district: the tools read only the checked holes */}
        <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <span>{tr("Model area")}</span>
          <InfoButton title={tr("Model area")} width={280} text={tr("Which holes feed every modelling tool on this tab. 'Holes checked in the Holes list' models one prospect of a district on its own: the box and the cell size follow those holes' contacts instead of spanning prospects kilometres apart. Tick the holes under Holes in the 3D View sidebar ('Only these' on a prospect's holes).")} />
        </div>
        <select aria-label={tr("Model area")} value={modelArea || "all"} onChange={(e) => setModelArea(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
          <option value="all">{tr("Whole property")}</option>
          <option value="checked">{tracedHoles < checkedHoleCount(collars, visibleHoles).all /* #2053 — 544 collars, 10 with a trace on Woodjam */
            ? tr("Holes checked in the Holes list ({n} of {m}; {t} of the holes have a trace)", { n: checkedHoleCount(collars, visibleHoles).checked, m: checkedHoleCount(collars, visibleHoles).all, t: tracedHoles })
            : tr("Holes checked in the Holes list ({n} of {m})", { n: checkedHoleCount(collars, visibleHoles).checked, m: checkedHoleCount(collars, visibleHoles).all })}</option>
        </select>
        {modelArea === "checked" && <Suspense fallback={null}><ModelAreaRange collars={collars} visibleHoles={visibleHoles} setVisibleHoles={setVisibleHoles} small={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }} inp={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "3px 6px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} /></Suspense>}{/* #2536 */}
        {areaClusters && areaClusters.clusters.length > 1 && (<div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginTop: 6, lineHeight: 1.4 }}>{/* #2056 */}
          {tr("The {n} logged holes in the model area lie in {k} clusters more than {g} m apart: one model spans the gaps between them, and its box, cells and unit volumes cover them. Model one cluster at a time:", { n: loggedInArea.length, k: areaClusters.clusters.length, g: Math.round(areaClusters.gapM).toLocaleString() })}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>{areaClusters.clusters.slice(0, 6).map((c) => (
            <button key={c.ids[0]} type="button" title={c.ids.join(", ")} onClick={() => { setVisibleHoles(onlyTheseHoles(collars, c.ids)); setModelArea("checked"); }} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "2px 7px" }}>{tr(c.n === 1 ? "Around E {e}, N {nn} ({first})" : "Around E {e}, N {nn}: {n} holes over {s} km", { first: c.ids[0], n: c.n, e: Math.round(c.cx / 100) * 100, nn: Math.round(c.cy / 100) * 100, s: Math.max(0.1, c.spanM / 1000).toFixed(1) }) /* #2928 (3): a place, not one hole id */}</button>))}</div>
        </div>)}
        {/* TASKS.csv #2378 (review #2325, WA uranium) — rock code and stratigraphic unit logged on the same intervals: which one the tools model */}
        {(unitFields || []).length > 0 && setUnitField && (
          <>
            <div className="ge-section-label" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <span>{tr("Model the units from")}</span>
              <InfoButton title={tr("Model the units from")} width={280} text={tr("What every modelling tool on this tab reads as the unit: the Lithology code, an extra field imported with it (a stratigraphic unit, a formation), or another coded layer (Weathering, a custom layer of codes). The Strat. stack, Implicit surface, Explicit surface, Litho groups, Modelling codes and the unit lists all follow it; the 3D view and the logs keep showing the Lithology code. Intervals with nothing in the chosen field are left out of the models.")} />
            </div>
            <select aria-label={tr("Model the units from")} value={unitField || ""} onChange={(e) => setUnitField(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
              <option value="">{tr("Lithology code")}</option>
              {(unitFields || []).map((f) => <option key={f.name} value={f.name}>{f.label ? tr("{layer} layer ({n} codes)", { layer: f.label, n: f.distinct }) : tr("{field} (extra field, {n} values)", { field: f.name, n: f.distinct })}</option>)}{/* #2529 — another coded layer */}
            </select>
          </>
        )}
        {/* TASKS.csv #52 (c) — named intercept sets. Sits with the Domain selector because it is the
            same kind of control: both narrow WHICH picks feed every tool below, one spatially and one
            by hand. */}
        <div className="ge-section-label" style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Intercept set")}</span>
          <InfoButton title={tr("Intercept set")} width={280} text={tr("Restricts every tool below to a hand-picked set of intercepts — the way to model a unit that repeats in the pile as the separate surfaces it really is, instead of every pick of that code feeding one surface. Build sets in \"Boundary intercepts\" on the Home tab. \"All intercepts\" is the original behaviour. Structural orientation picks are not covered: the tools read those directly from the structure layer, not through this table.")} />
        </div>
        <select aria-label={tr("Intercept set")} value={activeInterceptSetId} onChange={(e) => setActiveInterceptSetId(e.target.value)} style={{ width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)", marginBottom: 4 }}>
          <option value="">{tr("All intercepts")}</option>
          {(interceptSets || []).map((x) => <option key={x.id} value={x.id}>{x.name} ({(x.ids || []).length})</option>)}
        </select>
        {activeInterceptSet && (activeInterceptSet.ids || []).length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon-strong)", marginBottom: 4, lineHeight: 1.4 }}>
            {tr("\"{name}\" is empty, so every tool below has nothing to model. Add intercepts to it in \"Boundary intercepts\", or switch back to All intercepts.", { name: activeInterceptSet.name })}</div>
        )}

        {/* TASKS.csv #88 — boundary constraint: #89 above only restricts which control points feed a
            run, this additionally clips the OUTPUT mesh to the domain, since GemPy still fits/
            extrapolates across the whole extent regardless. */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: modelDomainId ? "var(--color-text-secondary)" : "#4a5262", marginBottom: 4, cursor: modelDomainId ? "pointer" : "default" }}>
          <input type="checkbox" checked={clipToDomainBoundary} disabled={!modelDomainId} onChange={(e) => setClipToDomainBoundary(e.target.checked)} />{tr("Clip result to domain boundary")}</label>
        {/* TASKS.csv #358; #2470 — with no terrain, at the collar surface */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: terrain || (collars || []).length >= 3 ? "var(--color-text-secondary)" : "#4a5262", marginBottom: 4, cursor: terrain || (collars || []).length >= 3 ? "pointer" : "default" }} title={terrain ? tr("Removes the parts of modelled surfaces that lie above the terrain surface.") : tr("No terrain is loaded: cuts the surfaces and the block at the collar surface, the ground interpolated between the collars (not when the collars look drilled from underground). Load a terrain (Maps > Terrain) for the real ground.")}>
          <input type="checkbox" checked={clipToTopo && (!!terrain || (collars || []).length >= 3)} disabled={!terrain && (collars || []).length < 3} onChange={(e) => setClipToTopo(e.target.checked)} />{terrain ? tr("Cut surfaces at topography") : tr("Cut surfaces at the collar surface")}</label>
        {/* TASKS.csv #1335 */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Sizes the model box to the contacts of the units being modelled and cuts each surface a short way past them, instead of filling a box around every hole in the project. Faults still run through the box.")}>
          <input type="checkbox" checked={limitToContacts} onChange={(e) => setLimitToContacts(e.target.checked)} />{tr("Stop surfaces near their own contacts")}</label>
        {limitToContacts && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, marginLeft: 22 }}>
            {tr("Extend past them by")}<input type="number" min={10} max={20000} step={50} value={contactReachM || ""} placeholder={tr("auto")} onChange={(e) => setContactReachM(Math.max(0, Math.min(20000, Number(e.target.value) || 0)))} aria-label={tr("How far a surface runs past its own contacts (m)")} style={{ ...smallSel, width: 64 }} />m
          </label>
        )}

        {/* TASKS.csv #361 — which structure types are contact orientations (litho + alteration tools). */}
        {structureTypes.length > 0 && (<>
          <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{tr("Contact orientations")}</span>
            <InfoButton title={tr("Contact orientations")} width={300} text={tr("Which structure-pick types are used as the dip/dip-direction of the contacts being modelled. Faults, veins, joints and foliation are not contacts and usually point the surface the wrong way. With none chosen, the orientation is estimated from the contact points' own shape (and the run says so).")} />
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
            {structureTypes.map((t) => {
              const on = orientTypes.includes(t);
              return (
                <button key={t} aria-pressed={on} onClick={() => setOrientTypesSel(on ? orientTypes.filter((x) => x !== t) : [...orientTypes, t])}
                  style={{ padding: "2px 8px", borderRadius: 10, fontSize: "var(--font-size-sm)", cursor: "pointer", border: `1px solid ${on ? "var(--color-accent-dark)" : "var(--color-border)"}`, background: on ? "var(--color-selected-bg)" : "transparent", color: on ? "var(--color-text)" : "var(--color-text-muted)", fontWeight: on ? 600 : 400 }}>
                  {t}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8 }}>
            {orientTypes.length ? tr(orientTypesSel === null ? "Using {codes} (picked automatically as contact/bedding codes)." : "Using {codes}.", { codes: orientTypes.join(", ") }) : tr("None chosen — orientations will be estimated from the contact points.")}
          </div>
        </>)}

        {/* TASKS.csv #231 — resolution control for every GemPy run (Implicit Model, Stratigraphic
            Stack, Structural, Alteration all funnel through the same runSurfaceStack). Lower = faster/
            coarser, higher = slower/finer; GemPy's own cost scales with grid cell count, so this is the
            single biggest lever a user has over the 80s+ run times real properties hit. */}
        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Resolution")}</span>
          <InfoButton title={tr("Resolution")} width={300} text={tr("The model's lithology block holds about this number cubed of cells, shared out between the axes by the shape of the model box (a flat, wide box gets more cells across than down): the grid the model check against the logs falls back to, the unit volumes, \"Add as block model\" and the block read on sections. It does not change how finely the surfaces are drawn — that is Surface detail below. Lower is faster; a real property-scale run at 36 (the default) commonly takes 60-90+ seconds — try 24 or lower for a quick first look.")} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <input type="range" min={12} max={64} step={4} value={modelResolution} onChange={(e) => setModelResolution(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text)", width: 46, textAlign: "right", flexShrink: 0 }}>{modelResolution}³</span>
        </div>
        {/* TASKS.csv #2624 — the counts follow the box's shape at this total: what the last model box got */}
        {(() => { const p = implicitSurfaces[implicitSurfaces.length - 1]?.params; const r = p?.resolution, c = p?.blockCellM; return Array.isArray(r) && r.length === 3 ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -6, marginBottom: 10, lineHeight: 1.4 }}>{Array.isArray(c) ? tr("About {n} cells, shaped to the model box: the last box got {nx} x {ny} x {nz} cells of {dx} x {dy} x {dz} m.", { n: (modelResolution ** 3).toLocaleString(), nx: r[0], ny: r[1], nz: r[2], dx: c[0], dy: c[1], dz: c[2] }) : tr("About {n} cells, shaped to the model box: the last box got {nx} x {ny} x {nz} cells.", { n: (modelResolution ** 3).toLocaleString(), nx: r[0], ny: r[1], nz: r[2] })}</div> : null; })()}

        {/* TASKS.csv #766 — GemPy's octree level for the surface mesh (dual contouring), fixed at 4 before */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Surface detail")}</span>
          <InfoButton title={tr("Surface detail")} width={300} text={tr("How finely the model surfaces are triangulated. Finer follows tight folds and fault steps more closely and gives smoother sections through the surfaces; it does not move the surface (measured: the same mean distance to the true surface at every level), and it does not change the block, the model check or the volumes. Measured on the Harry sample (two-unit stack): Standard 34 s; Fine 4x the triangles in 77 s (2.2x); Very fine 16x the triangles in 248 s (7x). Try Fine on the final run, not while iterating.")} />
        </div>
        <select value={surfaceDetail} onChange={(e) => setSurfaceDetail(Number(e.target.value))} style={{ ...smallSel, width: "100%", marginBottom: 10 }} aria-label={tr("Surface detail")}>
          <option value={4}>{tr("Standard (fastest)")}</option>
          <option value={5}>{tr("Fine — 4x the triangles, ~2x the time")}</option>
          <option value={6}>{tr("Very fine — 16x the triangles, ~7x the time")}</option>
        </select>
        {/* TASKS.csv #1171 — the options in metres for the box the last run used: a large box means large cells */}
        {(() => { const ext = implicitSurfaces[implicitSurfaces.length - 1]?.params?.extent; return ext?.length === 6 ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: -6, marginBottom: 10, lineHeight: 1.4 }}>{tr("On the last model box the mesh cells are about {a} m (Standard), {b} m (Fine) and {c} m (Very fine). Each run reports how far the mesh misses its contact points.", { a: Math.round(octreeCellM(ext, 4)), b: Math.round(octreeCellM(ext, 5)), c: Math.round(octreeCellM(ext, 6)) })}</div> : null; })()}

        {/* TASKS.csv #274 — GemPy's potential-field range: the parameter that actually controls how
            tight or smooth a fitted surface is. It was never set and never reported, so the same job
            re-run could look different with nothing in the UI to point at. Auto = don't send it (GemPy's
            own default, byte-identical to every run before this control existed); the effective value is
            reported in the run notice and stamped into the surface's export provenance either way. */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Surface stiffness (advanced)")}</span>
          <InfoButton title={tr("Surface stiffness")} width={280} text={tr("Scales GemPy's potential-field range — the interpolator's own smoothness lever. Lower follows your control points more tightly (more curvature, more risk of over-fitting sparse data); higher gives stiffer, smoother surfaces. Leave on Auto unless a surface is visibly too wobbly or too flat for the data.")} />
        </div>
        <select aria-label={tr("Surface stiffness")} value={rangeMultiplier} onChange={(e) => setRangeMultiplier(Number(e.target.value))} style={{ ...smallSel, width: "100%", marginBottom: 10 }}>
          <option value={0}>{tr("Auto — GemPy's own default")}</option>
          <option value={0.5}>{tr("0.5x — tighter, follows the points more closely")}</option>
          <option value={0.75}>{tr("0.75x — slightly tighter")}</option>
          <option value={1.5}>{tr("1.5x — slightly smoother")}</option>
          <option value={2}>{tr("2x — smoother, stiffer surfaces")}</option>
        </select>

        {/* TASKS.csv #765 — structure picks averaged per hole: faster and less pick-scatter in the surface */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Contact orientations from picks")}</span>
          <InfoButton title={tr("Average picks per hole")} width={300} text={tr("GemPy honours every orientation it is given, one by one, and its run time grows with their number. Averaging the picks of each hole in depth windows sends a few representative orientations instead: much faster, and the scatter between neighbouring oriented-core picks no longer bends the surface. A window never mixes picks more than 30 degrees apart (a fold limb, an overturned pick, a different structure). Untick to send every pick as it is.")} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <input type="checkbox" checked={thinPicks} onChange={(e) => setThinPicks(e.target.checked)} />{tr("Average picks per hole, in windows of")}<input type="number" min={5} max={500} step={5} value={thinWindowM} disabled={!thinPicks} onChange={(e) => setThinWindowM(Math.max(5, Math.min(500, Number(e.target.value) || 50)))} style={{ ...smallSel, width: 56 }} aria-label={tr("Averaging window along the hole (m)")} /> m
        </label>

        {/* TASKS.csv #1170 — blank = automatic (twice the contacts' spacing in plan); the run notice says which distance it used */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }}>
          {tr("Only picks within")}<input type="number" min={10} max={20000} step={50} value={orientationReachM || ""} placeholder={tr("auto")} onChange={(e) => setOrientationReachM(Math.max(0, Math.min(20000, Number(e.target.value) || 0)))} aria-label={tr("Only picks within this distance of the unit's contacts (m)")} style={{ ...smallSel, width: 64 }} />{tr("m of the unit's contacts")}
        </label>

        {/* TASKS.csv #761 — automatic local smoothing of clustered contacts (off by default) */}
        <div className="ge-section-label" style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <span>{tr("Clustered contacts")}</span>
          <InfoButton title={tr("Smooth clustered contacts")} width={300} text={tr("GemPy passes exactly through every contact point. Where many noisy picks crowd one spot (holes from one pad, digitised map or section lines) it bends the surface to honour them all, and the kink spreads. With this on, each surface's contacts are scanned for clusters (a kernel density over the points, as in von Harten et al. 2021): points at least twice as crowded as an even spread would be, and near the densest, are fitted loosely instead of exactly. Isolated points stay exact. The run says how many were smoothed. Off by default: if the clustered picks are accurate, smoothing throws away real detail.")} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }}>
          <input type="checkbox" checked={smoothClusters} onChange={(e) => setSmoothClusters(e.target.checked)} />{tr("Smooth clustered contacts")}</label>

        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>{tr("Search ellipsoid")}<InfoButton title={tr("Search ellipsoid")} width={300} text={tr("GemPy fits one global surface, not per-query local kriging, so this can't steer the interpolator's own search the way classic kriging software would. What it does instead: drops any control point with fewer than the minimum neighbour count within this ellipsoid, oriented by its own Azimuth and Dip here, so isolated points don't quietly feed a run alongside well-supported ones. The structural trends below are set separately and do not orient it.")} />
          </span>
          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            <input type="checkbox" checked={searchEllipsoid.enabled} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, enabled: e.target.checked }))} />{" "}{tr("On")}</label>
        </div>
        {searchEllipsoid.enabled && (
          <div style={{ opacity: searchEllipsoid.enabled ? 1 : 0.5, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>{tr("Azimuth°")}<input type="number" value={searchEllipsoid.azimuth} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, azimuth: Number(e.target.value) || 0 }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Dip°")}<input type="number" value={searchEllipsoid.dip} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, dip: Number(e.target.value) || 0 }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <label style={miniField}>{tr("Major (m)")}<input type="number" value={searchEllipsoid.major} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, major: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Semi-major (m)")}<input type="number" value={searchEllipsoid.semiMajor} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, semiMajor: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
              <label style={miniField}>{tr("Minor (m)")}<input type="number" value={searchEllipsoid.minor} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, minor: Math.max(1, Number(e.target.value) || 1) }))} style={{ ...smallSel, width: "100%" }} />
              </label>
            </div>
            <label style={miniField}>{tr("Min. neighbours required")}<input type="number" value={searchEllipsoid.minSamples} onChange={(e) => setSearchEllipsoid((p) => ({ ...p, minSamples: Math.max(0, Number(e.target.value) || 0) }))} style={{ ...smallSel, width: 70 }} />
            </label>
          </div>
        )}

        {/* TASKS.csv #650 — named structural trends (replaces the single unsaved "Anisotropy" on/off) */}
        <div className="ge-section-label" style={{ marginTop: 16 }}>{tr("Structural trends")}</div>
        <Suspense fallback={null}>
          <TrendsPanel structuralTrends={structuralTrends} setStructuralTrends={setStructuralTrends}
            structurePicks={structurePicksWithHoleAttitude}
            units={litho_units} unitTopPoints={(code) => (topsOfUnit(code)?.tops || []).map((t) => sheetPositionAt(t.hole_id, t.md)).filter(Boolean)} /* #2428 */
            surfaces={implicitSurfaces.map((x) => ({ id: x.id, name: x.name }))}
            surfacePoints={(id) => {
              const geo = implicitMeshesRef.current[id]?.geometry; if (!geo) return [];
              const { vertices } = sceneVertsToWorldFlat(geo, originRef.current);
              const pts = []; for (let i = 0; i < vertices.length; i += 3) pts.push({ x: vertices[i], y: vertices[i + 1], z: vertices[i + 2] });
              return pts;
            }}
            onView={(t) => setTrendPreviewId(t ? t.id : null)} viewingId={trendPreviewId}
            small={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}
            inputStyle={smallSel} btnStyle={pBtn} />
        </Suspense>

        </>)}
        {toolPane === "gradeEst" && (<>
        {paneHeader("Grade estimation", Calculator, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Populate a block model FROM composited assays — nearest neighbour, inverse distance, moving least squares or ordinary kriging, not a surface — a separate workflow from the implicit surface tools.")}</div>
        <button onClick={() => setGradeEstOpen(true)} disabled={!assayElements.length} style={{ ...pBtn, opacity: assayElements.length ? 1 : 0.5, marginBottom: 8 }}>
          <FileBarChart2 size={14} />{" "}{tr("Estimate grade into block model…")}</button>
        {/* TASKS.csv #2419 — grade × thickness per hole and its plan estimate: a thin flat body, lighter than a block model */}
        <button onClick={() => setGtOpen(true)} disabled={!assayElements.length} style={{ ...pBtn, opacity: assayElements.length ? 1 : 0.5, marginBottom: 8 }} title={tr("Per hole, thickness and grade × thickness from the intercepts; graduated on a plan, estimated in 2D and contoured at a GT cut-off you choose")}>
          <FileBarChart2 size={14} />{" "}{tr("Grade × thickness, in plan or on a long section…") /* #3089 */}</button>
        {gtOpen && <Suspense fallback={null}><GradeThicknessModal assays={assays} assayElements={assayElements} collars={collars} survey={survey} layers={layers} inArea={modelArea === "checked" ? (id) => visibleHoles?.[id] !== false : null} /* #3016 */ onClose={() => setGtOpen(false)} /></Suspense>}
        {/* TASKS.csv #147 — deliberately sits directly under the estimation button, because it is the
            diagnostic you are supposed to run BEFORE choosing a search radius or an anisotropy ratio,
            not a separate curiosity. It does NOT feed the estimator (GeoStrix still does not krige) —
            the modal itself says so up front; see VariogramModal.jsx's header. */}
        <button onClick={() => setVariogramOpen(true)} disabled={!assayElements.length} style={{ ...pBtn, opacity: assayElements.length ? 1 : 0.5, marginBottom: 16 }}>
          <Activity size={14} />{" "}{tr("Variogram / spatial continuity…")}</button>
        <GradeTonnageLauncher />{/* TASKS.csv #1577 */}

        {/* TASKS.csv #176 — lithology groups: lump codes logged differently for the same real unit
            (AND + BAS, SLT + GWK...) into one modelled unit. Same terse add/remove-list style as the
            Layers "+ Group" header above and CoreOrientationCalculator's field-reference library —
            a short, infrequently-edited list, not a modal workflow. */}
        </>)}
        {toolPane === "mapmodel" && (<>
        {paneHeader("Model from map", Mountain, "model")}
        <Suspense fallback={null}>
          <MapModelPanel mapLayers={mapLayers} surfaceStructures={surfaceStructures} terrain={terrain} busy={implicitBusy} onRun={runMapModel} pBtn={pBtn} smallSel={smallSel} holeCount={collars.length} lithoRows={layers.litho} /* #1718 */
            onBuildBodies={(p) => import("./intrusionRun.js").then((m) => m.buildIntrusionBodies(p, { implicitGroupRef, implicitMeshesRef, originRef, setImplicitSurfaces, setNotices, terrain, collars, survey, desurveyMethod /* #2663 */ })).catch((e) => setNotices((q) => [...q, errorNotice(tr("Intrusion bodies could not be built: {v}", { v: e?.message || String(e) }))]))} /* #992 — a failed load or throw is said, not swallowed */ /* #821, loaded on use */ />
        </Suspense>
        </>)}{/* TASKS.csv #817 */}
        {toolPane === "explicit" && (<>
        {paneHeader("Explicit surface", PenTool, "model")}
        <Suspense fallback={null}>
          <ExplicitSurfacePanel surfaces={implicitSurfaces} /* #861 */ tracesSeq={tracesSeq} /* #888 */ trend={explicitTrend} /* #881 */ topsOfUnit={topsOfUnit} /* #871 */ defs={explicitSurfaces || []} setDefs={setExplicitLogged} /* #878 */ sections={sections} terrain={terrain} mapLayers={mapLayers} surfaceStructures={surfaceStructures} /* #817 */ sectionImages={sectionImages} onDigitizeImage={setDigitizeImageId} /* #824 */ unitChoices={[...modellingCodeList.map((c) => c.name), ...lithoGroups.map((g) => g.name)]} loggedUnits={litho_units} /* #1547 */ /* #831 */ pickFor={explicitPickFor} setPickFor={setExplicitPickFor} snap={explicitSnap} setSnap={setExplicitSnap}
            scene={explicitScene} /* #901 — memoized below the props */
            onRemove={(d) => { if (d.surfaceId && implicitMeshesRef.current[d.surfaceId]) removeImplicitSurface(d.surfaceId); setExplicitSurfaces((p) => p.filter((x) => x.id !== d.id)); }}
            askPrompt={askPrompt} pBtn={pBtn} smallSel={smallSel} numInput={{ background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
        </Suspense>
        </>)}
        {toolPane === "mcodes" && (<>
        {paneHeader("Modelling codes", Waypoints, "model")}
        <Suspense fallback={null}>        {mcodesPane(null)}</Suspense>
        </>)}
        {toolPane === "groups" && (<>
        {paneHeader("Lithology groups", Group, "model")}
        <div className="ge-section-label" style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>{tr("Lithology groups")}</span>
          <span role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => askPrompt("New lithology group name:", "", (name) => { if (name && name.trim()) setExpandedLithoGroupId(addLithoGroup({ name: name.trim() })); })}
            style={{ cursor: "pointer", color: "var(--color-text-secondary)", fontSize: "var(--font-size-xs)", textTransform: "none", letterSpacing: 0 }} title={tr("New lithology group")}>{tr("+ New group")}</span>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Lump codes that were logged differently for the same real unit (e.g. andesite + basalt) into one modelled unit. Groups appear alongside raw codes in the pickers below; raw intervals keep their own colours in 3D.")}</div>
        {lithoGroups.length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("No groups yet.")}</div>
        )}
        {(() => { // TASKS.csv #2386 — one unit logged in several spellings (case, spaces): offered as one group each, one click
          const sug = caseVariantGroups(layers.litho || [], lithoGroups);
          if (!sug.length) return null;
          const add = (s) => addLithoGroup({ name: s.name, codes: s.codes });
          return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.45, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr(sug.length === 1 ? "One code is logged in several spellings that differ only by case or spaces:" : "{n} codes are logged in several spellings that differ only by case or spaces:", { n: sug.length })}</div>
            {sug.slice(0, 8).map((s) => <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><span style={{ flex: 1, minWidth: 0 }}>{tr("{codes} = {n} intervals", { codes: s.codes.map((c) => `${c} (${s.counts[c].toLocaleString()})`).join(" + "), n: s.total.toLocaleString() })}</span><button type="button" onClick={() => add(s)} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "2px 7px" }}>{tr("Group them")}</button></div>)}
            {sug.length > 1 && <button type="button" onClick={() => sug.forEach(add)} style={{ ...pBtn, width: "auto", marginBottom: 0, marginTop: 4, padding: "3px 8px" }}>{tr("Group all {n}", { n: sug.length })}</button>}
            {sug.length > 8 && <span style={{ marginLeft: 6 }}>{tr("({n} more not listed)", { n: sug.length - 8 })}</span>}
          </div>;
        })()}
        {(() => { // TASKS.csv #2928 (2) — sub-divided codes of one unit (DID_U / DID_M / DID_L beside DID): offered as one group each, one click
          const sug = subdivisionGroups(layers.litho || [], lithoGroups);
          if (!sug.length) return null;
          const add = (s) => addLithoGroup({ name: s.name, codes: s.codes });
          return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.45, padding: "6px 8px", border: "1px solid var(--color-border)", borderRadius: 6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{tr(sug.length === 1 ? "One unit is logged in sub-divided parts (a part suffix such as _U, _M, _L):" : "{n} units are logged in sub-divided parts (a part suffix such as _U, _M, _L):", { n: sug.length })}</div>
            {sug.slice(0, 8).map((s) => <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}><span style={{ flex: 1, minWidth: 0 }}>{tr("{codes} = {n} intervals", { codes: s.codes.map((c) => `${c} (${s.counts[c].toLocaleString()})`).join(" + "), n: s.total.toLocaleString() })}</span>
              <button type="button" onClick={() => add(s)} title={tr("Model the parts as one unit, \"{name}\". Leave them apart when the parts are units of their own.", { name: s.name })} style={{ ...pBtn, width: "auto", marginBottom: 0, padding: "2px 7px" }}>{tr("Group as {name}", { name: s.name })}</button></div>)}
            {sug.length > 8 && <span>{tr("({n} more not listed)", { n: sug.length - 8 })}</span>}
          </div>;
        })()}
        {groupOverlaps(lithoGroups).map((o) => ( // TASKS.csv #1685 — a saved project with a code in two groups: the tools would disagree
          <div key={o.code} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.4 }}>{tr("{code} is in {n} groups ({groups}): the tools would read different memberships. Click it in the group it belongs to, and it leaves the others.", { code: o.code, n: o.groups.length, groups: o.groups.join(", ") })}</div>
        ))}
        {lithoGroups.map((g) => {
          const open = expandedLithoGroupId === g.id;
          const codesInGroup = g.codes || [];
          const crossCuts = lithoGroupCrossCuts(g);
          const role = lithoGroupRole(g);
          return (
            <div key={g.id} style={{ border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6, background: "var(--color-bg-subtle)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px" }}>
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setExpandedLithoGroupId(open ? null : g.id)} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0, display: "flex" }} title={open ? tr("Collapse") : tr("Choose which codes belong to this group")}>
                  {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
                <input type="color" value={g.color || "#8a7fbf"} onChange={(e) => updateLithoGroup(g.id, { color: e.target.value })} title={tr("Surface / legend colour for this group")}
                  style={{ width: 20, height: 18, padding: 0, border: "1px solid var(--color-border)", borderRadius: 3, background: "transparent", cursor: "pointer", flexShrink: 0 }} />
                <div role="button" tabIndex={0} onKeyDown={activateOnKey} style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}
                  onClick={() => askPrompt("Rename lithology group:", g.name, (name) => { if (name && name.trim()) updateLithoGroup(g.id, { name: name.trim() }); })} title={tr("Click to rename")}>
                  {g.name} <span style={{ color: "var(--color-text-muted)" }}>({codesInGroup.length})</span>
                </div>
                {crossCuts && <span title={tr("Contains a cross-cutting code (fault/dyke/breccia) — excluded from the Stratigraphic stack, same rail as a raw cross-cutting code")} style={{ fontSize: "var(--font-size-xs)", color: "var(--color-danger-icon)", background: "#f3e3e3", border: "1px solid #dcc2c2", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("X-cut")}</span>}
                {!crossCuts && role === "overburden" && <span title={tr("Every member is overburden — modelled as an overburden_base surface")} style={{ fontSize: "var(--font-size-xs)", color: "#8a7860", background: "#eee6da", border: "1px solid #d9cdb8", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("OB")}</span>}
                <Trash2 size={12} style={{ cursor: "pointer", color: "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => { if (window.confirm(tr("Delete lithology group \"{name}\"? Its codes stay in the log — they just stop being modelled together.", { name: g.name }))) removeLithoGroup(g.id); }, tr("Delete lithology group \"{name}\" (its codes stay in the log, just ungrouped)", { name: g.name }))} />
              </div>
              {open && codesInGroup.length > 0 && ( /* TASKS.csv #2052 — one rule for the group's role, said here */
                <div style={{ padding: "0 8px 6px", fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                  {tr("Role: {role}, from its codes (Modelling codes, the implicit picker and the stack all read it).", { role: tr(groupMemberRole(g)) })}
                  {groupNameHint(g) && " " + tr("Its name suggests {role}: set that in Modelling codes if it is what you mean.", { role: tr(groupNameHint(g)) })}
                </div>
              )}
              {open && (
                <div style={{ padding: "0 8px 8px", display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {litho_units.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>{tr("No lithology codes loaded yet — import a litho CSV first.")}</div>}
                  {litho_units.map((u) => {
                    const on = codesInGroup.includes(u);
                    const elsewhere = on ? null : groupOfCode(lithoGroups, u, g.id); // TASKS.csv #1685 — held by another group: a click moves it here
                    return (
                      <span role="button" tabIndex={0} onKeyDown={activateOnKey} key={u} onClick={() => updateLithoGroup(g.id, { codes: on ? codesInGroup.filter((c) => c !== u) : [...codesInGroup, u] })}
                        title={on ? tr("Remove {u} from this group", { u }) : elsewhere ? tr("In \"{group}\" — click to move it here", { group: elsewhere.name }) : tr("Add {u} to this group", { u })}
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "var(--font-size-sm)", padding: "2px 7px", borderRadius: 10, cursor: "pointer", userSelect: "none", opacity: elsewhere ? 0.55 : 1,
                          background: on ? "var(--color-success-bg)" : "var(--color-bg)", color: on ? "var(--color-success-text)" : "var(--color-text-secondary)", border: `1px ${elsewhere ? "dashed" : "solid"} ${on ? "var(--color-success-border)" : "var(--color-border)"}` }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: colorForLithology(u), flexShrink: 0 }} />{u}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* TASKS.csv #139 — fence/panel diagram. Deliberately sits immediately ABOVE the implicit
            modelling tools because it is the lighter-weight companion to them: three holes on a line
            cannot support a GemPy surface but can absolutely support a hand correlation, and that is
            the stage of a project this answers. */}
        </>)}
        {toolPane === "correlation" && (<>
        {paneHeader("Section correlation", GitCompare, "model")}
        <button
          onClick={() => setFenceOpen(true)}
          disabled={!collars.length}
          style={{ ...pBtn, marginBottom: 8, opacity: collars.length ? 1 : 0.5, cursor: collars.length ? "pointer" : "default" }}
          title={collars.length ? tr("Fence / panel diagram — project the holes onto a common vertical panel along the drill line and correlate lithology hole-to-hole, with each hole's perpendicular offset from the section shown") : tr("No holes with collars yet: import collars first.") /* #1844 */}
        ><Layers3 size={14} />{" "}{tr("Fence / panel diagram…")}</button>

        <Suspense fallback={null}>{mcodesPane("correlate")}</Suspense>{/* #2054 — the correlation tools themselves, beside the fence */}

        {/* TASKS.csv #318 — mapped surface contacts projected underground (dip projection), or fed to the
            implicit model run just below as extra interface points + orientations. */}
        <SurfaceGeologyProjection
          mapLayers={mapLayers} surfaceStructures={surfaceStructures} terrain={terrain} pBtn={pBtn}
          onProject={projectMapContact} mapConstraint={mapConstraint} setMapConstraint={setMapConstraint}
        />

        </>)}
        {toolPane === "geoml" && (<>
        {/* TASKS.csv #750 — the former Predictive tab, as a 3D Modelling tool */}
        {paneHeader("geoML models", Sparkles, "model")}
        <Suspense fallback={null}>
          <PredictivePanel visibleHoles={visibleHoles} collars={collars} survey={survey} litho={layers.litho || []} assays={assays} assayElements={assayElements} terrain={terrain} desurveyMethod={desurveyMethod} trend={trendFor("geoml")}
            addVoxelModel={addVoxelModel} addSurface={addWorldMeshSurface} setNotices={setNotices} />
        </Suspense>
        </>)}
        {toolPane === "implicit" && (<>
        {paneHeader("Implicit surface", Mountain, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models the top contact of one unit from litho intervals, via GemPy in GeoStrix's Python engine. Uses structure dip/azimuth for orientation when available; if not, estimates one from the contact points themselves so it can still run.")}</div>
        {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the 3D View tab (Add layer › Lithology), or load the sample project."))}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }} title={tr("Also feed drawn cross-section contacts (Draw upper contact, in the section pop-out) tagged as this unit's upper contact into the run as extra interface points")}>
          <input type="checkbox" checked={includeSectionContacts} onChange={(e) => setIncludeSectionContacts(e.target.checked)} />{tr("Include drawn cross-section contacts{v}", { v: sections?.some((s) => s.contacts?.length) ? ` (${sections.reduce((n, s) => n + (s.contacts?.length || 0), 0)} drawn)` : "" })}
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Unit to model")} value={implicitTarget} onChange={(e) => setImplicitTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a unit…")}</option>
            {litho_units.filter((u) => !mcodeRole.has(u)).map((u) => { // #2532 — a code listed under Modelling codes is offered there, once
              const role = rawRole(u);
              return <option key={u} value={u}>{u}{role !== "stratigraphic" ? ` (${role}${isCrossCuttingRole(role) ? ", cross-cutting" : ""})` : ""}</option>;
            })}
            {/* TASKS.csv #176 — groups under their own optgroup; a mixed-role group gets no role
                suffix (no guessing), a cross-cutting group is still offered HERE (this tool has no
                non-crossing constraint), just labelled. */}
            {lithoGroups.length > 0 && (
              <optgroup label={tr("Groups")}>
                {lithoGroups.map((g) => {
                  const role = lithoGroupRole(g);
                  const xcut = lithoGroupCrossCuts(g);
                  const empty = !(g.codes || []).length;
                  return <option key={g.id} value={lithoGroupKey(g)} disabled={empty}>{g.name} [{(g.codes || []).join("+") || tr("no codes yet")}]{xcut ? tr(" (cross-cutting)") : role && role !== "stratigraphic" ? ` (${role})` : ""}</option>;
                })}
              </optgroup>
            )}
            {modellingCodeList.length > 0 && (
              <optgroup label={tr("Modelling codes")}>
                {modellingCodeList.map((c) => <option key={c.name} value={`mcode:${c.name}`}>{c.name}{c.role !== "stratigraphic" ? ` (${c.role})` : ""}</option>)}
              </optgroup>
            )}
          </select>
          <button
            onClick={() => runImplicitModel(implicitTarget)}
            disabled={!implicitTarget || implicitBusy}
            aria-label={tr("Run the implicit model (GemPy)")}
            title={gempyTitle(!collars.length ? tr("No holes with collars yet: import collars first.") : !implicitTarget ? tr("Choose a unit first.") : null)}
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", whiteSpace: "nowrap", opacity: implicitTarget && !implicitBusy ? 1 : 0.5, cursor: implicitTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? tr("Running…") : <><Layers3 size={14} aria-hidden="true" />{" "}{tr("Run")}</>}</button>{/* #572 — was an unlabeled icon */}
        </div>
        {/* TASKS.csv #52 (a) — sensitivity spread. Collapsed by default: it is N+1 GemPy runs, not a
            casual click. Copy says "spread", never "confidence" — see lib/surfaceSpread.js's header. */}
        <div role="button" tabIndex={0} onKeyDown={activateOnKey} onClick={() => setSensOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}>
          {sensOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{" "}{tr("Sensitivity: spread across realizations")}<InfoButton title={tr("Sensitivity spread")} width={380} text={tr("Re-runs the implicit model for the chosen unit several times with every contact point moved by a random amount (standard deviation = the position sigma you enter, in metres, per axis) and every orientation tipped by a random angle (the orientation sigma, in degrees), then colours the surface by how far the realizations land from it (RMS distance per vertex). Pale = the surface barely moves under that input uncertainty; dark = it moves a lot. Grey = at least one realization produced no surface there at all. It is a spread under the uncertainty YOU state — not a probability or a confidence, and only as meaningful as the sigmas entered. There is deliberately no default for them. A per-pick value in an 'uncertainty_m' number column (mapped as an extra field when importing lithology) overrides the position sigma for that pick. Cost: each realization is a full GemPy run. The base run is timed first and the number of realizations is cut to fit your time budget.")} />
        </div>
        {sensOpen && (
          <div style={{ padding: "8px 9px", marginBottom: 8, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
            {[
              [tr("Contact position ±"), sensSigmaPos, setSensSigmaPos, "m", "e.g. 2"],
              [tr("Orientation ±"), sensSigmaDeg, setSensSigmaDeg, "°", "e.g. 5"],
            ].map(([label, val, set, unit, ph]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                <span style={{ width: 108, flexShrink: 0 }}>{label}</span>
                <input type="number" min={0} step="any" value={val} placeholder={ph} onChange={(e) => set(e.target.value)} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
                <span>{unit} (1 σ)</span>
              </div>
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
              <span style={{ width: 108, flexShrink: 0 }}>{tr("Realizations")}</span>
              <input type="number" min={3} max={50} value={sensN} onChange={(e) => setSensN(e.target.value)} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 7 }}>
              <span style={{ width: 108, flexShrink: 0 }}>{tr("Time budget")}</span>
              <input type="number" min={10} step={30} value={sensBudget} onChange={(e) => setSensBudget(e.target.value)} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 4, padding: "3px 5px", color: "var(--color-text)", fontSize: "var(--font-size-sm)" }} />
              <span>s</span>
            </div>
            {(() => {
              const sp = Number(sensSigmaPos), sd = Number(sensSigmaDeg);
              const ready = implicitTarget && !implicitBusy && sensSigmaPos !== "" && sensSigmaDeg !== "" && sp >= 0 && sd >= 0 && (sp > 0 || sd > 0);
              return (
                <button
                  onClick={() => runImplicitModel(implicitTarget, { ensemble: { n: Math.min(50, Math.max(3, Number(sensN) || 8)), sigmaPos: sp, sigmaDeg: sd, budgetS: Math.max(10, Number(sensBudget) || 300) } })}
                  disabled={!ready}
                  title={!implicitTarget ? tr("Choose a unit above first") : (sensSigmaPos === "" || sensSigmaDeg === "") ? tr("Enter both sigmas — there is deliberately no default") : tr("Run the model, then the realizations")}
                  style={{ ...pBtn, marginBottom: 0, justifyContent: "center", opacity: ready ? 1 : 0.5, cursor: ready ? "pointer" : "default" }}
                >{tr("Run with sensitivity spread")}</button>
              );
            })()}
          </div>
        )}

        </>)}
        {toolPane === "stack" && (<>
        {paneHeader("Stratigraphic stack", Layers, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models several units' top contacts together in one run so they can't cross each other — add units below in order, youngest (shallowest) first. Litho-only: veins/dykes cut across a stack by nature, so model those with the Vein / dyke tool instead, not here.")}</div>
        {!litho_units.length && emptyPaneHint(tr("No lithology intervals loaded — import them on the 3D View tab (Add layer › Lithology), or load the sample project."))}
        {/* TASKS.csv #810 — the stack reads the same option; it had no checkbox, so drawn contacts were dropped unseen */}
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }} title={tr("Also feed drawn cross-section contacts (Draw upper contact, in the section pop-out) tagged as this unit's upper contact into the run as extra interface points")}>
          <input type="checkbox" checked={includeSectionContacts} onChange={(e) => setIncludeSectionContacts(e.target.checked)} />{tr("Include drawn cross-section contacts{v}", { v: sections?.some((s) => s.contacts?.length) ? ` (${sections.reduce((n, s) => n + (s.contacts?.length || 0), 0)} drawn)` : "" })}
        </label>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Add a unit to the stack")} value={stackAdd} onChange={(e) => { addStackUnit(e.target.value); setStackAdd(""); }} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Add a unit…")}</option>
            {/* TASKS.csv #241 — cross-cutting units (fault/dyke/breccia) are hidden here, not just
                warned about in the paragraph above: they break the tool's own non-crossing guarantee,
                so they're unselectable rather than trusting the user to read the warning first. */}
            {/* TASKS.csv #1541 — a code whose group is already in the stack, or a group with a member already in it, is not offered: the
                same unit twice ('Intermediate volcanics' after two of its members) */}
            {(unitRank ? [...litho_units].sort((a, b) => (unitRank.get(a) ?? 1e9) - (unitRank.get(b) ?? 1e9)) : litho_units).filter((u) => !mcodeRole.has(u) && !stackUnits.includes(u) && !isCrossCuttingRole(rawRole(u)) && rawRole(u) !== "no recovery" && !lithoGroups.some((g) => stackUnits.includes(lithoGroupKey(g)) && (g.codes || []).includes(u))).map((u) => { // no recovery: #1369; #2532: the role set in Modelling codes, the code offered there once
              const role = rawRole(u);
              return <option key={u} value={u}>{u}{role === "overburden" ? tr(" (overburden)") : ""}</option>;
            })}
            {/* TASKS.csv #176 — groups with ANY cross-cutting member are excluded here, same rail as
                a raw cross-cutting code just above. */}
            {lithoGroups.some((g) => !stackUnits.includes(lithoGroupKey(g)) && !lithoGroupCrossCuts(g) && !(g.codes || []).some((c) => stackUnits.includes(c))) && (
              <optgroup label={tr("Groups")}>
                {lithoGroups.filter((g) => !stackUnits.includes(lithoGroupKey(g)) && !lithoGroupCrossCuts(g) && !(g.codes || []).some((c) => stackUnits.includes(c))).map((g) => {
                  const empty = !(g.codes || []).length;
                  return <option key={g.id} value={lithoGroupKey(g)} disabled={empty}>{g.name} [{(g.codes || []).join("+") || tr("no codes yet")}]{lithoGroupRole(g) === "overburden" ? tr(" (overburden)") : ""}</option>;
                })}
              </optgroup>
            )}
            {/* TASKS.csv #599 — intrusion / cross-cutting / ignored codes break the stack's non-crossing rule: not offered */}
            {modellingCodeList.some((c) => !stackUnits.includes(`mcode:${c.name}`) && (c.role === "stratigraphic" || c.role === "overburden")) && (
              <optgroup label={tr("Modelling codes")}>
                {modellingCodeList.filter((c) => !stackUnits.includes(`mcode:${c.name}`) && (c.role === "stratigraphic" || c.role === "overburden")).map((c) => <option key={c.name} value={`mcode:${c.name}`}>{c.name}{c.role === "overburden" ? tr(" (overburden)") : ""}</option>)}
              </optgroup>
            )}
          </select>
        </div>
        {stackUnits.length === 0 && (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("No units added yet.")}</div>
        )}
        {stackHoles && ( // TASKS.csv #2926 — checked as the units are added; the holes' order one click away
          <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 8, lineHeight: 1.4 }}>
            {tr("The holes give the order {order} (youngest first): {list}.", { order: stackHoles.order.map((u) => (isLithoGroupKey(u) ? resolveLithoTarget(u)?.name || u : isMcodeKey(u) ? u.slice(6) : u)).join(", "),
              list: stackHoles.conflicts.slice(0, 3).map((q) => tr("{older} is logged above {younger} in {against} of {of} holes that have both", { older: stackUnits[q.older].replace(/^mcode:/, ""), younger: stackUnits[q.younger].replace(/^mcode:/, ""), against: q.against, of: q.of })).join("; ") })}{" "}
            <button type="button" onClick={() => movesToOrder(stackUnits, stackHoles.order).forEach(([u, d]) => moveStackUnit(u, d))} style={{ ...pBtn, width: "auto", display: "inline-flex", marginBottom: 0, padding: "2px 7px" }}>{tr("Use the order from the holes")}</button>
          </div>
        )}
        {stackUnits.map((u, i) => {
          // TASKS.csv #176 — a `group:` entry shows the group's name and gets a badge only when every
          // member shares the role (mixed => plain, no guessing); a since-deleted group is flagged.
          const grp = isLithoGroupKey(u) ? resolveLithoTarget(u) : null;
          const role = isLithoGroupKey(u) ? (grp ? lithoGroupRole(grp) : null) : isMcodeKey(u) ? (modellingCodeList.find((c) => c.name === u.slice(6))?.role ?? null) : roleForLithology(u);
          const display = isLithoGroupKey(u) ? (grp ? grp.name : "(deleted group)") : isMcodeKey(u) ? `${u.slice(6)} (code)` : u; // #599
          const hasBreak = stackBreaks.includes(u); // TASKS.csv #1309
          return (
          <Fragment key={u}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 8px", background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, marginBottom: 6 }}>
            <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", width: 14, flexShrink: 0 }}>{i + 1}</span>
            {grp && <span style={{ width: 8, height: 8, borderRadius: 2, background: grp.color || "#8a7fbf", flexShrink: 0 }} title={tr("Group: {v}", { v: (grp.codes || []).join(" + ") })} />}
            <div style={{ flex: 1, minWidth: 0, fontSize: "var(--font-size-base)", color: grp || !isLithoGroupKey(u) ? "var(--color-text)" : "var(--color-danger-icon)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={grp ? tr("Group: {v}", { v: (grp.codes || []).join(" + ") }) : undefined}>{display}</div>
            {role === "overburden" && <span title={tr("Overburden — tagged as its own surface type (overburden_base) rather than an ordinary stratigraphic contact")} style={{ fontSize: "var(--font-size-xs)", color: "#8a7860", background: "#eee6da", border: "1px solid #d9cdb8", borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>{tr("OB")}</span>}
            <ChevronUp size={14} style={{ cursor: i === 0 ? "default" : "pointer", color: i === 0 ? "var(--color-border-light)" : "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => moveStackUnit(u, -1), tr("Move \"{u}\" up in the stratigraphic stack", { u: display }) /* #1378 */)} />
            <ChevronDown size={14} style={{ cursor: i === stackUnits.length - 1 ? "default" : "pointer", color: i === stackUnits.length - 1 ? "var(--color-border-light)" : "var(--color-text-secondary)", flexShrink: 0 }} {...iconAction(() => moveStackUnit(u, 1), tr("Move \"{u}\" down in the stratigraphic stack", { u: display }))} />
            <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => removeStackUnit(u), tr("Remove \"{u}\" from the stratigraphic stack", { u: display }))} />
          </div>
          {/* TASKS.csv #2381 — no unconformity above the last unit: its top would follow the units above it, and no package starts below */}
          {i === stackUnits.length - 2 && !hasBreak && (
            <div style={{ textAlign: "center", fontSize: "var(--font-size-xs)", color: "var(--color-text-faint)", padding: "1px 0 3px", marginBottom: 4 }} title={tr("The top of the unit under an unconformity follows the units above it, so with nothing under the last unit no package would start there. Model the last unit's top on its own (Implicit surface, or an Explicit surface from its logged tops).")}>{tr("No unconformity above the last unit")}</div>
          )}
          {i < stackUnits.length - 1 && (i < stackUnits.length - 2 || hasBreak) && (
            <button type="button" aria-pressed={hasBreak} onClick={() => setStackBreaks((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]))}
              title={tr("Units above and below an unconformity are fitted as separate conformable packages. The top of the unit below it follows the upper package.")}
              style={{ display: "block", width: "100%", background: "none", border: "none", borderTop: hasBreak ? "2px dashed var(--color-accent)" : "none", padding: "1px 0 3px", marginBottom: 4, cursor: "pointer", textAlign: "center", fontSize: "var(--font-size-xs)", color: hasBreak ? "var(--color-accent-dark)" : "var(--color-text-muted)" }}>
              {hasBreak ? tr("Unconformity here (click to remove)") : tr("Mark an unconformity here")}
            </button>
          )}
          </Fragment>
          );
        })}
        {/* TASKS.csv #360 — faults solved WITH the stack: contacts either side become offset blocks */}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 6 }} title={tr("Each fault is its own GemPy group ahead of the stack (a FAULT relation): the contacts either side are fitted as offset blocks in one run, instead of one surface ramped across the fault. Faults come from the Structure planes layer (picks with dip and dip direction), one per structure type and name.")}>{tr("Faults that offset the stack")}</div>
        <select value="" onChange={(e) => { const k = e.target.value; if (k && !stackFaults.includes(k) && stackFaults.length < 6) setStackFaults((p) => [...p, k]); }} style={{ ...smallSel, width: "100%", marginTop: 3 }} aria-label={tr("Add a fault that offsets the stack")}>
          <option value="">{faultCandidates.length ? tr("Add a fault…") : tr("No structure picks with dip / dip direction")}</option>
          {/* TASKS.csv #1225 — bedding and fractures are not faults: apart, for a geologist who knows a code the name does not show */}
          {[[true, tr("Named as faults")], [false, tr("Other structure types")]].map(([like, label]) => {
            const list = faultCandidates.filter((c) => !stackFaults.includes(c.key) && !!c.faultLike === like);
            return list.length ? <optgroup key={label} label={label}>{list.map((c) => <option key={c.key} value={c.key}>{c.id ? `${c.type} — ${c.id}` : tr("{type} (all picks)", { type: c.type })} · {tr(c.n === 1 ? "{n} pick" : "{n} picks", { n: c.n })}{faultK[c.key] ? (faultK[c.key].random ? tr(" · k {k}, no preferred orientation", { k: Number(faultK[c.key].k).toFixed(1) }) : tr(" · k {k}", { k: Number.isFinite(faultK[c.key].k) ? Number(faultK[c.key].k).toFixed(0) : "∞" })) : ""}</option>)}</optgroup> : null;
          })}
        </select>
        {stackFaults.map((k, fi) => {
          // TASKS.csv #1054 — what this fault offsets: every unit (GemPy's default) or the units from one down (an erosional
          // stack: a cover laid down after the fault stays whole), and the faults listed after it that it also displaces
          const cfg = (stackFaultOffsets || {})[k] || {}, later = stackFaults.slice(fi + 1);
          const setCfg = (patch) => setStackFaultOffsets?.((p) => ({ ...p, [k]: { ...(p[k] || {}), ...patch } }));
          const label = (x) => x.replace(/\|$/, " (all picks)").replace("|", " — ");
          return (
          <div key={k} style={{ padding: "4px 8px", marginTop: 4, background: "var(--color-bg-subtle)", border: "1px solid var(--color-border)", borderRadius: 6, fontSize: "var(--font-size-sm)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label(k)}</span>
              <X size={14} style={{ cursor: "pointer", color: "var(--color-danger-icon)", flexShrink: 0 }} {...iconAction(() => setStackFaults((p) => p.filter((x) => x !== k)), tr("Remove fault \"{k}\" from the stack", { k }))} />
            </div>
            {(stackRelation === "erode" || stackBreaks.some((b) => stackUnits.includes(b))) && stackUnits.length > 1 && (
              <select value={cfg.from || ""} onChange={(e) => setCfg({ from: e.target.value })} style={{ ...smallSel, width: "100%", marginTop: 3 }} aria-label={tr("Units this fault offsets")} title={tr("Units younger than the chosen one were laid down after the fault and are not offset by it")}>
                <option value="">{tr("Offsets every unit")}</option>
                {stackUnits.slice(1).map((u) => <option key={u} value={u}>{tr("Offsets {unit} and the units below it", { unit: resolveLithoTarget(u)?.name || u })}</option>)}
              </select>
            )}
            {later.map((g) => (
              <label key={g} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", cursor: "pointer" }}>
                <input type="checkbox" checked={(cfg.faults || []).includes(g)} onChange={(e) => setCfg({ faults: e.target.checked ? [...(cfg.faults || []), g] : (cfg.faults || []).filter((x) => x !== g) })} />
                {tr("Also offsets the fault {fault}", { fault: label(g) })}
              </label>
            ))}
          </div>
          );
        })}
        {stackFaults.length > 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginTop: 3, lineHeight: 1.4 }}>{tr("Each fault runs through the whole model box: GemPy here cannot end a fault where its picks stop. By default a fault offsets every unit and no other fault.")}</div>}
        {/* TASKS.csv #2905 — the method: GemPy, or a layer-cake for a flat-lying pile (Matt's decision 2026-11-12) */}
        <label style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 6 }}>{tr("Method")}
          <select value={stackMethod} onChange={(e) => setStackMethod(e.target.value)} aria-label={tr("Stack method")} style={{ display: "block", width: "100%", marginTop: 2, fontSize: "var(--font-size-sm)" }}>
            <option value="gempy">{tr("GemPy (implicit) — folded or steep ground")}</option>
            <option value="layercake">{tr("Layer-cake (flat-lying) — tops as elevation grids, kept in order")}</option>
          </select>
        </label>
        {stackMethod === "layercake" ? (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 6px", lineHeight: 1.45 }}>
            {tr("Layer-cake: the first top is an elevation grid through its picks, and each lower top is the one above minus the unit's thickness in the holes (zero where the unit is absent), so tops never cross or fold back. For a flat-lying pile, in seconds. An unconformity starts a new layer-cake that cuts the units under it. A fault in the stack splits it into fault blocks, each a layer-cake of its own, so the tops step at the fault (each fault a plane through its picks, along its measured dip).")}
          </div>
        ) : stackBreaks.some((b) => stackUnits.slice(0, -1).includes(b)) ? (
          <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "6px 0", lineHeight: 1.45 }}>{tr("Packages: units between unconformities share one field and stay parallel, and each package truncates the ones below. Units missing inside a package cannot pinch out. A surface flattens beyond its own contacts, so compare the predicted map with your map.")}</div>
        ) : (<>
        <label style={{ display: "block", fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 6 }} title={tr("Erode: each younger unit truncates everything below it (an erosional unconformity), and a unit missing between its neighbours in a hole pinches out there. Conformable: every unit is a level of one shared field, so the surfaces stay parallel, never cross and never meet: a unit keeps a thickness everywhere and cannot pinch out.")}>{tr("Unit relationship")}<select value={stackRelation} onChange={(e) => setStackRelation(e.target.value)} style={{ ...smallSel, width: "100%", marginTop: 3 }}>
            <option value="erode">{tr("Erode — younger units truncate older (unconformity)")}</option>
            <option value="onlap">{tr("Conformable — one shared field (units keep a thickness everywhere, cannot pinch out)")}</option>
          </select>
        </label>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", margin: "4px 0 6px", lineHeight: 1.45 }}>
          {stackRelation === "erode"
            ? tr("Erosional: each unit is fitted in its own structural group and truncates the ones beneath it. Right for an unconformity; wrong for a conformable volcanic pile, where it will cut contacts that should simply drape.")
            : tr("Conformable: every unit shares one interpolated field, so the surfaces stay parallel and can never cross. Right for a continuous layered sequence. A unit that is missing between its neighbours in some holes cannot pinch out in this mode (it keeps a thickness there): use Erode for discontinuous units.")}
        </div>
        </>)}
        <button
          onClick={() => runStackModel(stackUnits, { method: stackMethod })}
          disabled={stackUnits.length < 2 || implicitBusy}
          title={gempyTitle(!collars.length ? tr("No holes with collars yet: import collars first.") : stackUnits.length < 2 ? tr("Choose at least two units for the stack first.") : null)}
          style={{ ...pBtn, marginTop: 4, opacity: stackUnits.length >= 2 && !implicitBusy ? 1 : 0.5, cursor: stackUnits.length >= 2 && !implicitBusy ? "pointer" : "default" }}
        ><Layers3 size={14} /> {implicitBusy ? tr("Running…") : tr(stackUnits.length === 1 ? "Run stack ({n} unit)" : "Run stack ({n} units)", { n: stackUnits.length })}</button>


        </>)}
        {toolPane === "structural" && (<>
        {paneHeader("Structural modelling", Compass, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models a surface from one structure-plane type (e.g. a fault or shear) using each pick's own position and dip/azimuth — no separate contact layer needed.")}</div>
        {/* User request: "we need to find a way to calculate the beta angle for non-oriented drilling
            based on field structural measurements" — the alpha-beta method (coreOrientation.js), placed
            right above the Stereonet QC button since it's the natural upstream step: solve a pick's true
            orientation here, then feed it (or the whole layer) into that QC/trend-checking tool. */}
        <button
          onClick={() => setCoreOrientOpen(true)}
          style={{ ...pBtn, marginBottom: 8 }}
          title={tr("Recover a non-oriented core pick's true dip/dip-direction by calibrating against a known field/outcrop structural reading")}
        ><Compass size={14} />{" "}{tr("Core orientation calculator")}</button>
        {/* TASKS.csv #141 — check the structure picks' own orientation trend/scatter BEFORE feeding them
            into the anisotropy or structural-surface tools above/below. */}
        <button
          onClick={() => setStereonetOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth)) && !(surfaceStructures || []).some((st) => (st.rows || []).length)} // #428: outcrop data alone is enough
          style={{ ...pBtn, marginBottom: 8, opacity: (layers.structure || []).length || (surfaceStructures || []).length ? 1 : 0.5, cursor: (layers.structure || []).length || (surfaceStructures || []).length ? "pointer" : "default" }}
          title={tr("Pole-plot / great-circle stereonet of the Structure layer's downhole picks and/or outcrop measurements")}
        ><Milestone size={14} />{" "}{tr("Stereonet (QC picks)")}</button>
        {/* TASKS.csv #277 — the downhole (tadpole) view, sitting next to the Stereonet because the two
            are the pair a geologist works structural data with: this one answers "where in the hole,
            and does it change at a contact", the stereonet answers "what is the orientation
            population". Neither replaces the other, and this one is normally opened first. */}
        <button
          onClick={() => setTadpoleOpen(true)}
          disabled={!(layers.structure || []).some((s) => s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth))}
          style={{ ...pBtn, marginBottom: 8, opacity: (layers.structure || []).length ? 1 : 0.5, cursor: (layers.structure || []).length ? "pointer" : "default" }}
          title={tr("Downhole tadpole plot — depth vs alpha/dip with an azimuth tail, plus lithology and structure-frequency tracks, per hole")}
        ><Milestone size={14} />{" "}{tr("Downhole structure (tadpole)")}</button>
        {(() => { const b = betaReferenceCounts(layers.structure || []); return b.top + b.bottom > 0 ? <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginBottom: 8, lineHeight: 1.4 }}>{[b.bottom && tr("{n} of these picks were oriented from alpha / beta with beta measured from the {ref}-of-hole line, as chosen when they were imported (a structure file does not say). Had the core been marked on the other line, each would plot elsewhere, by tens of degrees for some.", { n: b.bottom.toLocaleString(), ref: tr("bottom") }), b.top && tr("{n} of these picks were oriented from alpha / beta with beta measured from the {ref}-of-hole line, as chosen when they were imported (a structure file does not say). Had the core been marked on the other line, each would plot elsewhere, by tens of degrees for some.", { n: b.top.toLocaleString(), ref: tr("top") })].filter(Boolean).join(" ")}</div> : null; })()}{/* #2055 */}
        {!struct_types.length && <AlphaOnlyHint layers={layers} fallback={emptyPaneHint(tr("No structure picks loaded — import downhole structure planes on the 3D View tab (Add layer › Structure planes), or load the sample project."))} />}{/* #1686 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Structure type")} value={structuralTarget} onChange={(e) => setStructuralTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a structure type…")}</option>
            {struct_types.map((u) => { const c = structCounts.get(u) || { n: 0, k: 0 }; return <option key={u} value={u} disabled={!c.k}>{tr("{type} · {k} of {n} oriented", { type: u, k: c.k, n: c.n })}</option>; })}{/* #1553 */}
          </select>
          <button
            onClick={() => runStructuralModel(structuralTarget)}
            disabled={!structuralTarget || implicitBusy}
            aria-label={tr("Run the structural model (GemPy)")}
            title={gempyTitle(!struct_types.length ? tr("No structure picks with an orientation yet.") : !structuralTarget ? tr("Choose a structure type first.") : null)}
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", whiteSpace: "nowrap", opacity: structuralTarget && !implicitBusy ? 1 : 0.5, cursor: structuralTarget && !implicitBusy ? "pointer" : "default" }}
          >{implicitBusy ? tr("Running…") : <><Layers3 size={14} aria-hidden="true" />{" "}{tr("Run")}</>}</button>{/* #572 */}
        </div>

        </>)}
        {toolPane === "alteration" && (<>
        {paneHeader("Alteration modelling", Droplets, "model")}
        {/* TASKS.csv #272 — this tool no longer builds a draped contact through the alteration tops via
            GemPy; it interpolates a 0/1 "altered?" indicator and takes the 0.5 iso-surface, which is a
            closed envelope with no assumed up-direction. Runs in-app, no sidecar. */}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Builds a closed halo envelope for one assemblage: every logged alteration interval becomes a 0/1 \"altered?\" sample down its hole, interpolated onto a grid, iso-surfaced at 0.5. Unlike the lithology/structural tools this makes no assumption about which way is \"up\" — a halo wraps its conduit rather than draping like a contact. Runs in-app, no Python engine needed.")}</div>
        {alt_units.some((u) => isNotLogged(u)) && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6 }}>{tr("Not offered: {v} (intervals with no assemblage logged).", { v: alt_units.filter((u) => isNotLogged(u)).map((u) => `"${u}"`).join(", ") })}</div>}
        {(altCustomLayers.length > 0 || altNumericFields.length > 0 || altVocabFields.length > 0 || (storeLayers.vein || []).length > 0) && ( // TASKS.csv #1574 — which log, and an intensity floor; vein: #2050
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
            {(altCustomLayers.length > 0 || (storeLayers.vein || []).length > 0 || (storeLayers.litho || []).length > 0) && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                <span style={{ flexShrink: 0 }}>{tr("Layer")}</span>
                <select aria-label={tr("Alteration layer")} value={altSource.layer} onChange={(e) => { setAltSource({ layer: e.target.value, field: "", min: "" }); setAlterationTarget(""); }} style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)" }}>
                  <option value="alt">{altEmpty ? tr("Alteration (none logged)") : tr("Alteration")}</option>{/* #2540 (2) */}
                  {(storeLayers.vein || []).length > 0 && <option value="vein">{tr("Veins (a vein set as an envelope)")}</option>}{/* #2050 */}
                  {(storeLayers.litho || []).length > 0 && <option value="litho">{tr("Lithology (a code set as an envelope)")}</option>}{/* #2226 */}
                  {(storeLayers.weath || []).length > 0 && <option value="weath">{tr("Weathering (a code set as an envelope)")}</option>}{/* #2529 */}
                  {altCustomLayers.map((c) => <option key={c.id} value={`custom:${c.id}`}>{tr("{name} (custom layer)", { name: c.name })}</option>)}
                </select>
              </label>
            )}
              {altSource.layer === "alt" && <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginTop: 4 }} title={tr("For a log that records alteration only where it is seen: the rock logged in Lithology between its rows counts as unaltered, which closes the halo there. Off: that rock is unknown.")}><input type="checkbox" checked={!!altSource.unloggedZero} onChange={(e) => setAltSource((x) => ({ ...x, unloggedZero: e.target.checked }))} />{tr("Count logged rock with no alteration row as unaltered")}</label>}{/* #2380 */}
            {(altNumericFields.length > 0 || altVocabFields.length > 0) && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }} title={tr("Only the intervals whose field is at or above this value become altered samples; the rest count as unaltered, which is what closes the halo.")}>
                <span style={{ flexShrink: 0 }}>{tr("Only where")}</span>
                <select aria-label={tr("Intensity field")} value={altSource.field} onChange={(e) => { const f = e.target.value, v = altVocabFields.find((x) => x.field === f); setAltSource((s) => ({ ...s, field: f, vocab: !!v, min: v ? String(v.levels[Math.min(1, v.levels.length - 1)].rank) : s.min, minLabel: v ? v.levels[Math.min(1, v.levels.length - 1)].label : null })); }} style={{ flex: 1, minWidth: 0, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)" }}>
                  <option value="">{tr("(no filter)")}</option>
                  {altNumericFields.map((f) => <option key={f} value={f}>{f}</option>)}
                  {altVocabFields.map((v) => <option key={v.field} value={v.field}>{`${v.field} (${v.levels.map((l) => l.label).join(" / ")})`}</option>)}{/* #2230 */}
                </select>
                <span>≥</span>
                {altVocab ? (
                  <select aria-label={tr("At least")} value={altSource.min} onChange={(e) => { const label = e.target.selectedOptions[0]?.text || null; setAltSource((s) => ({ ...s, min: e.target.value, minLabel: label })); }} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)" }}>
                    {[...new Map(altVocab.levels.map((l) => [l.rank, l])).values()].map((l) => <option key={l.rank} value={String(l.rank)}>{altVocab.levels.filter((x) => x.rank === l.rank).map((x) => x.label).join(" / ")}</option>)}
                  </select>
                ) :
                <input type="number" step="any" aria-label={tr("At least")} value={altSource.min} disabled={!altSource.field} onChange={(e) => setAltSource((s) => ({ ...s, min: e.target.value }))} style={{ width: 64, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "4px 6px", color: "var(--color-text)" }} />}
              </label>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Code")} value={alterationTarget} onChange={(e) => setAlterationTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>{/* "Code", not "Assemblage": #1574 — Lawyers' Alteration log holds oxidation forms */}
            <option value="">{tr("Choose a code…")}</option>
            {altSourceCodes.map((u) => (altLoggedM.get(u) > 0 ? <option key={u} value={u}>{u}</option> : <option key={u} value={u} disabled>{tr("{code} (no logged length)", { code: u })}</option>))}{/* #1421; #1740 — 'Unknown' is not an assemblage; #1574 — the chosen layer's codes */}
          </select>
          <button
            onClick={() => runAlterationModel(alterationTarget, { unloggedZero: altSource.layer === "alt" && !!altSource.unloggedZero } /* #2380 */, altSource.layer === "alt" && !altSource.field ? null : { layer: altSource.layer, field: altSource.field || null, min: altSource.field ? Number(altSource.min) : null, vocab: !!(altSource.field && altSource.vocab), minLabel: altSource.minLabel || null /* #2230 */ })}
            disabled={!alterationTarget || alterationBusy}
            title={tr("Build a closed alteration-halo envelope from the logged intervals (runs in-app)")}
            aria-label={tr("Build a closed alteration-halo envelope from the logged intervals (runs in-app)")}
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", gap: 5, opacity: alterationTarget && !alterationBusy ? 1 : 0.5, cursor: alterationTarget && !alterationBusy ? "pointer" : "default" }}
          >{alterationBusy ? <span style={{ fontSize: "var(--font-size-sm)" }}>…</span> : <><Layers3 size={14} />{tr("Build halo")}</>}</button>{/* #1421 — the only run control was an unlabelled icon */}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Grid cell size for the indicator interpolation. 0 = auto (about 1/8 of the search radius).")}>{tr("Cell size (m)")}<input type="number" min={0} value={alterationCellSize} onChange={(e) => setAlterationCellSize(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("Search radius for the indicator interpolation, and the padding the envelope is given to close outside the outermost altered sample. 0 = auto (about 1.2x the median hole spacing).")}>{tr("Search (m)")}<input type="number" min={0} value={alterationSearchRadius} onChange={(e) => setAlterationSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("0 = auto (derived from your own hole spacing). The model domain and the structural trend chosen for alteration halos (Model settings → Structural trends) are honoured; the search ellipsoid's minimum-neighbour filter is not — it exists to drop under-supported contact picks, which a closed envelope has none of.")}</div>
        {alterationBusy && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success-fg)", marginTop: -4, marginBottom: 8 }}>{tr("Building the halo envelope…")}</div>}

        {/* TASKS.csv #144 — vein/dyke tool. The copy here deliberately states what the construction can
            and cannot do (paired by construction; thickness between holes is interpolated), because a
            vein drawn from a handful of intercepts looks far more certain on screen than it is. */}
        </>)}
        {toolPane === "vein" && (<>
        {paneHeader("Vein / dyke modelling", Waves, "model")}
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Models a vein or dyke as a PAIR of contacts: each logged interval's from-depth and to-depth are the two walls of one structure. A midplane is fitted through the intercept midpoints and a TRUE-thickness field (downhole length corrected for how obliquely each hole cuts the vein) is interpolated over it; the hangingwall and footwall are that midplane offset by half the thickness each way, so they stay a consistent thickness apart and cannot cross. Runs in-app, no Python engine needed.")}</div>
        {vein_units.length === 0 && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6, lineHeight: 1.4 }}>{tr("Nothing to model yet: there is no Veins log, and no lithology code is cross-cutting. If your veins are logged as lithology codes, set their role to cross-cutting in Modelling codes.")}</div>}{/* #2226 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <select aria-label={tr("Vein or dyke")} value={veinTarget} onChange={(e) => setVeinTarget(e.target.value)} style={{ width: 0, flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)", borderRadius: 5, padding: "6px 8px", color: "var(--color-text)", fontSize: "var(--font-size-base)" }}>
            <option value="">{tr("Choose a vein / dyke…")}</option>
            {vein_units.map((u) => <option key={u} value={u}>{u.startsWith("litho:") ? tr("{code} (Lithology)", { code: u.slice(6) }) : u.startsWith("mcode:") ? tr("{code} (Modelling code)", { code: u.slice(6) }) : u}</option>)}{/* #2226; modelling codes: #2533 */}
          </select>
          <button
            onClick={() => runVeinModel(veinTarget)}
            disabled={!veinTarget || veinBusy}
            title={tr("Build paired hangingwall/footwall surfaces (and a closed solid when they do not cross) from the logged vein intervals (runs in-app)")}
            aria-label={tr("Build paired hangingwall/footwall surfaces (and a closed solid when they do not cross) from the logged vein intervals (runs in-app)")}
            style={{ ...pBtn, width: "auto", minWidth: 30, marginBottom: 0, padding: "6px 9px", opacity: veinTarget && !veinBusy ? 1 : 0.5, cursor: veinTarget && !veinBusy ? "pointer" : "default" }}
          >{veinBusy ? <span style={{ fontSize: "var(--font-size-sm)" }}>…</span> : <><Layers3 size={14} />{" "}{tr("Build vein")}</>}</button>{/* #2540 (1): a worded button, as every other tool */}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Grid spacing across the vein plane. 0 = auto (about 1/12 of the search radius).")}>{tr("Cell size (m)")}<input type="number" min={0} value={veinCellSize} onChange={(e) => setVeinCellSize(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("In-plane search radius for the midplane and thickness interpolation, and how far the modelled vein is allowed to extend past the outermost intercept. 0 = auto (about 1.5x the median intercept spacing).")}>{tr("Search (m)")}<input type="number" min={0} value={veinSearchRadius} onChange={(e) => setVeinSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <label style={{ ...miniField }} title={tr("Optional. Leave both blank to fit the vein's attitude from the intercept midpoints. Required when every intercept lies on one section line, because collinear midpoints cannot fix a plane.")}>{tr("Dip (°)")}<input type="number" min={0} max={90} value={veinDip} placeholder={tr("fit")} onChange={(e) => setVeinDip(e.target.value)} style={{ ...smallSel, width: "100%" }} />
          </label>
          <label style={{ ...miniField }} title={tr("Optional. Dip DIRECTION (not strike), 0-360. Only used when a dip is also entered.")}>{tr("Dip dir (°)")}<input type="number" min={0} max={360} value={veinDipDir} placeholder={tr("fit")} onChange={(e) => setVeinDipDir(e.target.value)} style={{ ...smallSel, width: "100%" }} />
          </label>
        </div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("0 = auto (derived from your own intercept spacing). Dip / dip direction blank = fitted from the data, or taken from the oriented-core measurements at the intercepts when they contradict that fit. Adds a hangingwall and a footwall, and a closed solid for volume when the two do not cross. Between holes the shape and thickness are interpolated, so treat the result as an interpretation — a pinch-out or swell no hole intersected will not be in it.")}</div>
        {veinBusy && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-success-fg)", marginTop: -4, marginBottom: 8 }}>{tr("Building the vein pair…")}</div>}

        {/* TASKS.csv #142 — numeric implicit model (grade shell). Runs entirely in the browser (no
            sidecar): IDW onto a dense grid + marching cubes at the cutoff. Result lands in the
            Generated surfaces list below like any GemPy surface. */}
        </>)}
        {toolPane === "shell" && (<>
        {paneHeader("Grade shell", Gem, "model")}
        {/* TASKS.csv #269 — standing, unmissable framing. The QP review's explicit recommendation was
            NOT to add a Measured/Indicated/Inferred classifier (that is a QP's professional judgement,
            and deriving a regulatory label from a search radius would launder a parameter choice into
            a regulatory term). The real live risk is the opposite one: the app emitted confident
            tonnages with zero classification context. This is the fix — framing, not features.
            TASKS.csv #674 — it said "no anisotropy", untrue since #650 lets the shell follow a structural trend. */}
        <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 6, padding: "8px 9px", marginBottom: 8, lineHeight: 1.45 }}>
          <strong>{tr("Not a resource estimate.")}</strong>{" "}{tr("This builds an interpolated envelope to help you visualize and target mineralization. It can follow a structural trend you choose; Ordinary kriging fits a variogram to the composites automatically (check it in the Variogram tool), and there is no classification, dilution or recovery. Nothing it produces is a Mineral Resource under NI 43-101 or JORC, and it must not be reported publicly as one.")}</div>
        <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 8, lineHeight: 1.4 }}>{tr("Builds a wireframe envelope of everything at or above a cutoff grade directly from assay values — interpolation onto a grid (by the method chosen below), then an iso-surface at the cutoff. Runs in-app, no Python engine needed.")}{/* TASKS.csv #273 — this tool was a second, uncoupled interpolator that consumed none of the
              shared search-ellipsoid/anisotropy/domain machinery. The domain and the anisotropy trend
              are now threaded through it (see runNumericModel); the search ellipsoid's minimum-neighbour
              filter deliberately still isn't, and the panel says so instead of leaving the difference
              for the user to discover. */}
          {" "}{tx("It honours the model domain and the structural trend chosen for grade shells (Model settings → Structural trends). It does {not} apply the search ellipsoid's minimum-neighbour filter — that exists to drop under-supported contact picks, and dropping isolated assays would delete grade rather than improve the shell.", { not: <strong>{tr("not")}</strong> })}</div>
        {(() => {
          const symbols = shellSymbols; // #1744 — lab elements only
          const numSrc = findNumericSource(numericSymbol, { layers, customLayers: customLayersAll }); // #1741 — a downhole log or a numeric layer field
          const sym = numericSymbol || symbols[0] || numericSources[0]?.key || "";
          const unit = numSrc ? numSrc.unit : (assayElements.find((e) => e.symbol === sym)?.unit || "ppm");
          const canRun = (symbols.length > 0 || numericSources.length > 0) && collars.length > 0 && !numericBusy && Number.isFinite(numericCutoff);
          return (
            <>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ ...miniField }} title={tr("Assay element, downhole log or numeric layer field to model")}>{tr("Element")}<select value={sym} onChange={(e) => {
                    // TASKS.csv #1736 (review #1645, Copley) — a cap and a cutoff belong to their element: Au's 0.078 cap and Cu's 1000 cutoff were kept
                    // across a switch. The cap is cleared; the cutoff is proposed as the new element's P90 of lab assays (pXRF left out).
                    const next = e.target.value;
                    setNumericSymbol(next); setNumericCapValue(NaN); if (!findNumericSource(next, { layers, customLayers: customLayersAll })) rememberElement("gradeShell", next); // #2552
                    const ns = findNumericSource(next, { layers, customLayers: customLayersAll }); // #1741
                    // #2060 (review #2013, Woodjam) — and without the QC inserts unless the pane includes them: Cu proposed 4470 ppm (a CRM's value), the drill samples' P90 is 4120
                    const rowsFor = ns ? sourceAssays(ns, { layers, customLayers: customLayersAll }).assays : (numericIncludeQAQC ? (assays || []).filter((a) => a.source !== "pXRF") : excludeQAQC(assays || []));
                    const v = rowsFor.map((a) => a.values?.[ns ? ns.symbol : next]).filter((x) => Number.isFinite(x) && x > 0).sort((x, y) => x - y);
                    if (v.length) { const p90 = +v[Math.floor(0.9 * (v.length - 1))].toPrecision(3); setNumericCutoff(p90); setShellCutoffAuto({ symbol: next, value: p90, n: v.length }); } // said below: #3025 (6)
                  }} style={{ ...smallSel, width: "100%" }} disabled={!symbols.length && !numericSources.length}>
                    {symbols.length === 0 && numericSources.length === 0 && <option value="">{tr("— no assays —")}</option>}
                    {symbols.map((s) => <option key={s} value={s}>{s} ({gradeUnitLabel(s, assayElements.find((e) => e.symbol === s)?.unit || "ppm")})</option>)}{/* #2218 */}
                    {numericSources.length > 0 && <optgroup label={tr("Downhole logs and numeric layers")}>{numericSources.map((s) => <option key={s.key} value={s.key}>{s.label} ({s.unit})</option>)}</optgroup>}{/* #1741 */}
                  </select>
                </label>
                {/* TASKS.csv #270 (LOW-1) — every geologist and every press release says g/t, never ppm.
                    Numerically identical for a solid, but a cutoff typo of one order of magnitude is a
                    real risk, so show the unit the user actually thinks in and keep ppm in the tooltip. */}
                <label style={{ ...miniField }} title={tr("Iso-value: the shell encloses every interpolated cell at or above this grade.{v}", { v: PRECIOUS_METALS.has(sym) && unit === "ppm" ? tr(" Displayed as g/t; stored as ppm — numerically identical for a solid (1 g/t = 1 ppm).") : "" })}>{tr("Cutoff ({unit})", { unit: PRECIOUS_METALS.has(sym) && unit === "ppm" ? "g/t" : unit })}
                  <input type="number" step="any" value={numericCutoff} onChange={(e) => setNumericCutoff(e.target.value === "" ? NaN : Number(e.target.value))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              {shellCutoffAuto && shellCutoffAuto.symbol === sym && numericCutoff === shellCutoffAuto.value && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("Cutoff {v}: the 90th percentile of the {n} {symbol} values, proposed when {symbol} was chosen. Type your own.", { v: shellCutoffAuto.value, n: shellCutoffAuto.n.toLocaleString(), symbol: sym })}</div>}{/* #3025 (6) */}
              {!numSrc && (() => { const offers = drillThresholdOffers(geochemThresholds, sym, unit).slice(0, 4); return offers.length ? ( /* TASKS.csv #2689 (#2675 part 2) — saved drill thresholds offered as shell levels, never applied */
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", alignItems: "center", marginBottom: 6 }}>
                  <span>{tr("Saved threshold:")}</span>
                  {offers.map((o) => <button key={o.key} type="button" onClick={() => setNumericCutoff(o.value)} style={{ ...smallSel, cursor: "pointer", padding: "1px 6px" }} title={tr("{rule}{pop}, decided {date}. Click to use it as the shell level.", { rule: o.rule, pop: o.population ? ` (${o.population})` : "", date: o.decided })}>{o.population ? `${o.population.split(": ").pop()} ` : ""}{+Number(o.value).toPrecision(4)}</button>)}
                </div>) : null; })()}
              {numSrc && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{numSrc.logScale ? tr("{label}: {n} readings, values as logged. Interpolated as log10 values (a geometric mean between readings); the cutoff is in the same units as the readings.", { label: numSrc.label, n: numSrc.n.toLocaleString() }) : tr("{label}: {n} readings, values as logged; the cutoff is in the same units.", { label: numSrc.label, n: numSrc.n.toLocaleString() })}</div>}{/* #1741 */}
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <label style={{ ...miniField }} title={tr("Interpolation grid cell size (cubic). Smaller = smoother shell but more cells, within the block budget below.")}>{numericCellHeight > 0 && !trendFor("gradeShell") ? tr("Cell E × N (m)") : tr("Cell (m)")}<input type="number" min="0.5" step="any" value={numericCellSize} onChange={(e) => { setNumericCellSize(Math.max(0.5, Number(e.target.value) || 10)); setNumericBudgetHint(null); }} style={{ ...smallSel, width: "100%" }} />
                </label>
                {/* TASKS.csv #292 — "0 = unlimited" actively invited the pathological setting: an
                    unbounded search made every sample a candidate for every cell (measured: 81 s of
                    blocked main thread at 62,500 cells x 5,000 points, 250 s at the block cap). 0 now
                    means "cap at the grid diagonal", which is a no-op mathematically and a real bound
                    computationally. */}
                <label style={{ ...miniField }} title={tr("No sample within this distance of a grid cell leaves it un-estimated (no shell there) rather than extrapolating grade far from real data. 0 = no radius assumption, capped internally at the grid's own diagonal so the run can't hang — but a real radius is both faster and far more defensible.")}>{tr("Search (m)")}<input type="number" min="0" step="any" value={numericSearchRadius} onChange={(e) => setNumericSearchRadius(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
                </label>
                <label style={{ ...miniField }} title={tr("Extends the grid past the outermost sample so the shell can close beyond the last hole")}>{tr("Pad (m)")}<input type="number" min="0" step="any" value={numericPadding} onChange={(e) => setNumericPadding(Math.max(0, Number(e.target.value) || 0))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              {(() => { /* TASKS.csv #3062 — a flat, thin body (a seam, a palaeochannel, a laterite): the cell height on its own and a flat search, as Estimation's (#2418); a structural trend shapes both instead */
                const gt = trendFor("gradeShell"), reach = Number(numericFlatReach), flat = !gt && reach > 0 && numericSearchRadius > 0 && reach < numericSearchRadius;
                return <>
                  <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                    <label style={{ ...miniField }} title={gt ? tr("Under the trend \"{name}\" the cell is a cube in its frame (see below); clear the trend to set a cell height.", { name: gt.name }) : tr("The block height on its own, for a flat, thin body: a seam, a palaeochannel, a laterite. Blank = the same as the cell size (cubic).")}>{tr("Cell height (m)")}<input type="number" min="0.25" step="any" value={gt ? "" : numericCellHeight} disabled={!!gt} placeholder={gt ? tr("trend") : tr("cubic")} onChange={(e) => { const v = Number(e.target.value); setNumericCellHeight(e.target.value === "" || !(v > 0) ? "" : Math.max(0.25, v)); setNumericBudgetHint(null); }} style={{ ...smallSel, width: "100%" }} aria-label={tr("Cell height (m)")} />
                    </label>
                    <label style={{ ...miniField }} title={gt ? tr("The structural trend \"{name}\" shapes the search; clear it in 3D Modelling → Model settings to type a flat search here.", { name: gt.name }) : tr("Flatten the search: the reach up and down from a block, with the search radius across. Blank = a sphere of the search radius.")}>{tr("Vertical reach (m)")}<input type="number" min="0" step="any" value={gt ? "" : numericFlatReach} disabled={!!gt} placeholder={gt ? tr("trend") : tr("sphere")} onChange={(e) => { const v = Number(e.target.value); setNumericFlatReach(e.target.value === "" || !(v > 0) ? "" : v); setNumericBudgetHint(null); }} style={{ ...smallSel, width: "100%" }} aria-label={tr("Vertical reach (m)")} />
                    </label>
                  </div>
                  {!gt && reach > 0 && !flat && <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", marginBottom: 6 }}>{numericSearchRadius > 0 ? tr("Less than the search radius, or it is a sphere.") : tr("A flat search needs a search radius.")}</div>}
                  {flat && <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tr("A flat search: {r} m across and {v} m up and down from each cell.", { r: numericSearchRadius, v: reach })}</div>}
                </>;
              })()}
              {(() => { /* TASKS.csv #2676 / #2551 — the trend chosen for grade shells reshapes this search: say so, as Estimation does */
                const gt = trendFor("gradeShell"); if (!gt) return null;
                const [, v, v2] = searchEllipsoidAxes(gt, numericSearchRadius > 0 ? numericSearchRadius : 100);
                const tc = numericCellSize > 0 ? trendCellM(gt, numericCellSize) : null; // TASKS.csv #3010 — the real cell under the trend
                return <div role="note" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.4 }}>{tc && <div>{tr("Under this trend the grid's cells are about {c} m (along its long, intermediate and short axes): Cell is their size in the trend's volume-keeping frame, so a thinner cell across the trend needs a smaller Cell.", { c: trendCellText(tc) })}</div>}{numericSearchRadius > 0
                  ? tr("Along trend \"{name}\": an ellipsoid of {searchRadius} × {v} × {v2} m ({v3})", { name: gt.name, searchRadius: numericSearchRadius, v: Math.round(v), v2: Math.round(v2), v3: describeTrend(gt) })
                  : tr("Along trend \"{name}\": with no radius the search reaches the grid diagonal along the trend and {v}% and {v2}% of it across ({v3}).", { name: gt.name, v: Math.round(v), v2: Math.round(v2), v3: describeTrend(gt) })}</div>;
              })()}
              <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "flex-end" }}>
                <label style={{ ...miniField }}>{tr("Method")}{/* TASKS.csv #87 — one shared method table (estimation.js) drives this dropdown and
                      GradeEstimationModal's, so the grade shell and the block model can never offer
                      different methods or mean different things by the same method id. */}
                  <select value={numericMethod} onChange={(e) => setNumericMethod(e.target.value)} style={{ ...smallSel, width: "100%" }} title={tr(ESTIMATION_METHODS.find((m) => m.id === numericMethod)?.blurb || "")}>
                    {ESTIMATION_METHODS.map((m) => <option key={m.id} value={m.id}>{tr(m.label)}</option>)}
                  </select>
                </label>
              </div>
              {numericMethod === "ok" && ( /* TASKS.csv #1015 — the block model modal's variogram inputs, here too */
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 6 }} title={tr("The variogram ordinary kriging weights the composites with. Leave nugget, sill and range blank to fit one to the composites at run time (with a trend, the range is along its major axis). The Variogram tool shows the experimental points if you want to choose them yourself.")}>
                  <label style={{ ...miniField }}>{tr("Variogram model")}<select value={numericVariogram.model} onChange={(e) => setNumericVariogram((v) => ({ ...v, model: e.target.value }))} style={{ ...smallSel, width: "100%" }} aria-label={tr("Variogram model")}>
                      <option value="spherical">{tr("Spherical")}</option><option value="exponential">{tr("Exponential")}</option><option value="gaussian">{tr("Gaussian")}</option>
                    </select>
                  </label>
                  {[["nugget", tr("Nugget")], ["sill", tr("Sill (total)")], ["range", tr("Range (m)")]].map(([k, l]) => (
                    <label key={k} style={{ ...miniField, width: 64, flex: "0 0 auto" }}>{l}
                      <input type="number" min="0" step="any" value={numericVariogram[k]} placeholder={tr("fit")} onChange={(e) => setNumericVariogram((v) => ({ ...v, [k]: e.target.value }))} style={{ ...smallSel, width: "100%" }} aria-label={tr("Variogram {l}", { l })} />
                    </label>
                  ))}
                  <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)", flex: "1 1 100%" }}>{tr("Blank = fitted to the composites when you run; with a trend, the range is along its major axis.")}</div>
                </div>
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Regularize raw assay intervals to a fixed length first (recommended — same compositing as Grade estimation)")}>
                <input type="checkbox" checked={numericUseComposites} onChange={(e) => setNumericUseComposites(e.target.checked)} />{tr("Composite first")}{numericUseComposites && (
                  <input type="number" step="any" min="0.1" value={numericCompositeLength} onChange={(e) => setNumericCompositeLength(Math.max(0.1, Number(e.target.value) || 2))} style={{ ...smallSel, width: 50, marginLeft: 4 }} title={tr("Composite length (m)")} />
                )}
                {numericUseComposites && <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>m</span>}
              </label>
              {!findNumericSource(numericSymbol, { layers, customLayers: customLayersAll }) && <GradeShellUnsampled assays={assays} collars={collars} symbol={numericSymbol || assayElements[0]?.symbol} assayElements={assayElements} inArea={modelArea === "checked"} visibleHoles={visibleHoles} includeQAQC={numericIncludeQAQC} selStyle={smallSel}  layers={layers} customLayers={customLayersAll} /* #2721 */ />}{/* TASKS.csv #2417 / #2542 */}
              {numericUseComposites && !numSrc && <GeochemCompositingNote symbol={sym} length={numericCompositeLength} minCoverage={numericMinCoverage} cap={numericCapValue} unitLabel={gradeUnitLabel(sym, unit)} style={{ marginBottom: 4 }}
                onUse={(g) => { setNumericCompositeLength(g.length); setNumericMinCoverage(g.minCoverage); setNumericCapValue(g.cap ?? NaN); }} />}{/* TASKS.csv #2224 */}
              {/* TASKS.csv #262 — minCoverage was hardcoded at 0.5 here with no way to tighten it. */}
              {numericUseComposites && (
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4 }} title={tr("Minimum fraction of a composite interval that must actually be covered by real assay data (vs. missing/lost core) for it to be used. At the 50% default, a half-missing-core composite still counts as a full sample.")}>{tr("Min coverage")}<input type="number" step="1" min="0" max="100" value={Math.round(numericMinCoverage * 100)} onChange={(e) => setNumericMinCoverage(Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100)} style={{ ...smallSel, width: 50 }} />
                  <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>%</span>
                </label>
              )}
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                {/* TASKS.csv #259 — high-grade capping was implemented in compositeDownhole and wired
                    only into CompositingModal; the grade shell composited uncapped, so a single bonanza
                    assay drove IDW² across its whole search neighbourhood. */}
                <label style={{ ...miniField }} title={tr("Cap every RAW assay at this grade before compositing (commonly the 97.5th-99th percentile of the element's distribution). Blank = no cap. For a nuggety, log-normal element like Au, estimating without a cap overstates grade.")}>{tr("High-grade cap ({unit})", { unit: PRECIOUS_METALS.has(sym) && unit === "ppm" ? "g/t" : unit })}
                  <input type="number" min="0" step="any" placeholder={tr("none")} value={Number.isFinite(numericCapValue) ? numericCapValue : ""} onChange={(e) => setNumericCapValue(e.target.value === "" ? NaN : Number(e.target.value))} style={{ ...smallSel, width: "100%" }} />
                </label>
                {/* TASKS.csv #258 — minSamples counts sample POINTS: one hole composited at 2 m supplies
                    ~25 of them inside a 50 m radius, so it can never express "at least two holes must
                    see this cell". This can. */}
                <label style={{ ...miniField }} title={tr("A grid cell is only estimated if samples from at least this many DISTINCT drillholes fall inside its search radius. 1 lets a single hole populate a whole 50m-radius sphere of 'mineralization' with continuity asserted rather than demonstrated; 2 (or 3) is the standard first sanity constraint.")}>{tr("Min holes")}<input type="number" min="1" step="1" value={numericMinHoles} onChange={(e) => setNumericMinHoles(Math.max(1, Math.round(Number(e.target.value) || 1)))} style={{ ...smallSel, width: "100%" }} />
                </label>
              </div>
              <ShellCapNote assays={assays} symbol={sym} unit={unit} assayElements={assayElements} includeQAQC={numericIncludeQAQC} isAssay={!numSrc && symbols.includes(sym)} capValue={numericCapValue} setCapValue={setNumericCapValue} />{/* #2222 */}
              {/* TASKS.csv #266 — QC inserts were excluded from Best Intercepts / Compositing / Grade
                  Statistics but reached the grade shell unfiltered. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("QC samples (standards/blanks/duplicates, detected by hole_id naming) are excluded by default, the same as the Best Intercepts, Compositing and Grade Statistics panels. A field duplicate logged under its parent hole's id would otherwise be double-counted in the estimate.")}>
                <input type="checkbox" checked={numericIncludeQAQC} onChange={(e) => setNumericIncludeQAQC(e.target.checked)} />{tr("Include QC samples (standards/blanks/duplicates)")}</label>
              {/* TASKS.csv #257 — relabelled and now defaulting OFF. With this on, every grid node with
                  no sample in range reads as below cutoff and the shell closes halfway to it: that wall
                  is the SEARCH RADIUS, not a grade boundary, and computeMeshVolume happily calls the
                  result watertight. Volume then scales as R³ while looking converged and stable. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 4, cursor: "pointer" }} title={tr("Off (default): the shell stays open where the data runs out - honest, but there is no enclosed volume to report. On: the shell is sealed at the search-radius boundary so it becomes a watertight solid with a volume and tonnage - but that seal is your search radius, not a grade boundary, so the volume is an assumption you are making, not something measured. Doubling the search radius can multiply the volume by up to eight; less where the shell's top and base are real grade boundaries, as in a flat body.")}>
                <input type="checkbox" checked={numericCloseShell} onChange={(e) => setNumericCloseShell(e.target.checked)} />{tr("Close shell artificially at the search-radius boundary (volume becomes an assumption)")}</label>
              {/* TASKS.csv #803 — the same "Cut at topography" setting as the GemPy pane: the shell closes on the ground */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: terrain ? "var(--color-text-secondary)" : "var(--color-text-faint)", marginBottom: 4, cursor: terrain ? "pointer" : "default" }} title={tr("The shell ends at the terrain surface and stays a closed solid there (the grid is cut below the ground before the shell is drawn). Same setting as \"Cut surfaces at topography\".")}>
                <input type="checkbox" checked={clipToTopo && !!terrain} disabled={!terrain} onChange={(e) => setClipToTopo(e.target.checked)} />{terrain ? tr("End the shell at the terrain surface") : tr("End the shell at the terrain surface (import or fetch a terrain first, under Maps › Terrain)")}</label>
              {numericCloseShell && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "#a5691f", marginBottom: 8, lineHeight: 1.45 }}>{tr("Part of this shell's boundary will not be a grade boundary — it is where the search radius ran out of samples. Its volume will depend on your search radius, not only on the data.")}</div>
              )}
              {/* TASKS.csv #625 — the block budget (grid cells the shell may use). Runs in a background worker with
                  progress and Cancel; measured ~18 s per million blocks on a mid-range laptop. */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)", marginBottom: 6 }}
                title={tr("How many grid cells the grade shell may use. Bigger budgets allow smaller cells over a large area, at the cost of time and memory (the run stays cancellable from the status bar). The grade shell keeps one value per cell, so a million cells take far less memory here than a million blocks in a grade estimate, which keeps a full record for each. Remembered on this computer.")}>
                <span style={{ flexShrink: 0 }}>{tr("Block budget")}</span>
                <select value={numericMaxBlocks} onChange={(e) => { setNumericMaxBlocks(Number(e.target.value)); setNumericBudgetHint(null); }} style={{ ...smallSel, flex: 1, minWidth: 0 }} aria-label={tr("Grade shell block budget")}>
                  {BLOCK_BUDGETS.map((b) => <option key={b} value={b}>{tr("{b} blocks ({v})", { b: b.toLocaleString(), v: tr(gradeShellBudgetNote(b)) })}</option>)}
                </select>
              </label>
              {numericBudgetHint && (
                <div role="status" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 8, lineHeight: 1.45 }}>{tr("At {cell} m cells this extent needs {needed} blocks — over the {budget}-block budget.", { cell: numericBudgetHint.cell, needed: numericBudgetHint.needed.toLocaleString(), budget: numericBudgetHint.budget.toLocaleString() })}<div style={{ display: "flex", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
                    <button type="button" onClick={() => { setNumericCellSize(numericBudgetHint.fit); setNumericBudgetHint(null); }} style={{ ...smallSel, cursor: "pointer" }}>{tr("Use {n} m cells", { n: numericBudgetHint.fit })}</button>
                    {numericBudgetHint.budget < BLOCK_BUDGETS[BLOCK_BUDGETS.length - 1] && (
                      <button type="button" onClick={() => { setNumericMaxBlocks(BLOCK_BUDGETS[BLOCK_BUDGETS.length - 1]); setNumericCellSize(numericBudgetHint.fitMax); setNumericBudgetHint(null); }} style={{ ...smallSel, cursor: "pointer" }}>{tr("Largest budget + {n} m cells", { n: numericBudgetHint.fitMax })}</button>
                    )}
                  </div>
                </div>
              )}
              {/* TASKS.csv #292 — warn before the work, not after (pattern from #209). */}
              {!(numericSearchRadius > 0) && (
                <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-warn-text)", background: "var(--color-warn-bg)", border: "1px solid var(--color-warn-border)", borderRadius: 5, padding: "6px 7px", marginBottom: 8, lineHeight: 1.45 }}>{tr("With no search radius, every grid cell is estimated from the whole dataset — the run can take a minute or more (its progress and Cancel are in the status bar). Set a real search radius unless you specifically want an unbounded first pass.")}</div>
              )}
              <button
                onClick={runNumericModel}
                disabled={!canRun}
                title={symbols.length || numericSources.length ? (collars.length ? tr("Interpolate grades onto a grid and extract the cutoff iso-surface") : tr("Load collars first")) : tr("Import assays first")}
                style={{ ...pBtn, marginBottom: 8, opacity: canRun ? 1 : 0.5, cursor: canRun ? "pointer" : "default" }}
              ><Shapes size={14} /> {numericBusy ? tr("Running…") : (sym ? tr("Generate {el} shell", { el: numSrc ? numSrc.label : sym }) : tr("Generate grade shell"))}</button>
            </>
          );
        })()}

        </>)}
  </>);
}

// TASKS.csv #1686 — no Structure planes, but angles to the core axis in Structural zones or a custom layer: say where they went
function AlphaOnlyHint({ layers, fallback }) {
  const { customLayers = [] } = useStore();
  const z = useMemo(() => zoneAlphaPicks(layers?.structzone).length, [layers?.structzone]);
  const c = useMemo(() => customAlphaPicks(customLayers), [customLayers]);
  if (!z && !c.length) return fallback;
  const where = [z ? tr("{n} from Structural zones", { n: z }) : null, ...[...new Set(c.map((p) => p.source))].map((s) => tr("{n} from {source}", { n: c.filter((p) => p.source === s).length, source: s }))].filter(Boolean).join("; ");
  return <div style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-muted)", lineHeight: 1.45, marginBottom: 8 }}>{tr("No oriented structure picks. Angles to the core axis are used as alpha-only picks ({where}): the Stereonet counts them, the Downhole plot draws them and sections fan them. A plane, and so these tools, needs a dip direction: oriented core (alpha and beta) or a Structure planes import.", { where })}</div>;
}
