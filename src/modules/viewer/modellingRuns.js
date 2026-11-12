// TASKS.csv #697 — the modelling run functions, moved out of useModelling.js so their ~45 kB loads on the first
// model run instead of at startup. Bodies unchanged: each run reads the context snapshot it was started with
// (exactly what the old useCallback closures saw), and mcRef is the hook's live ref (#599).
import * as THREE from "three";
import { layerStamp } from "../../lib/layerStamp.js"; // TASKS.csv #2388
import { rowsByHole } from "../../lib/rowsByHole.js"; // TASKS.csv #2906
import { stackCellCheck } from "../../lib/stackResolution.js"; // TASKS.csv #2905
import { trendRatioText } from "../../lib/trend.js"; // TASKS.csv #2423
import { trendBodyReach } from "../../lib/trendBodyReach.js"; // TASKS.csv #2780
import { buildMeshQuery } from "../../lib/meshQuery.js"; // TASKS.csv #2376
import { modelGround, boxTallerThanDrilling, groundAtInFrame } from "../../lib/modelGround.js"; // TASKS.csv #2470; groundAtInFrame: #2634
import { roundVolume, loggedVolumeCheck } from "../../lib/volumeCheck.js"; // TASKS.csv #2530
import { taskSlot, rampProgress } from "../../lib/taskSlot.js"; // TASKS.csv #2379; rampProgress: #2383
import { stackOrderFromHoles, stackRepeats } from "../../lib/stackOrderFromHoles.js"; // TASKS.csv #2382; repeats: #2532
import { rockWithoutRows, unloggedDrilling } from "../../lib/unloggedGaps.js"; // TASKS.csv #2380
import { stackOrderAtHoles } from "../../lib/stackOrderAtHoles.js"; // TASKS.csv #2376
import { intensityRank, INTENSITY_SCALE } from "../../lib/intensityVocab.js"; // TASKS.csv #2230
import { baselineNotice, oneHoleDipNotice } from "../../lib/modelCheckBaseline.js"; // TASKS.csv #1687
import { desurveyHole } from "../../lib/desurvey.js";
import { missOverHalfCell, restrictRowsToHoles, checkedHoleCount } from "../../lib/modelArea.js"; // TASKS.csv #1546; restrictRowsToHoles, checkedHoleCount: #2059
import { sanitizeMesh } from "../../lib/meshSanitize.js";
import { checkAgainstLogs, unitVolumes, resampleWarpedBlock, capBlockAtGround } from "../../lib/modelCheck.js";
import { pythonImplicitModel } from "../../lib/desktop.js";
import { makeRng, perturbPoints, perturbOrientation, pointsToMeshDistance, spreadSummary, spreadColor, SPREAD_NOT_REPRODUCED } from "../../lib/surfaceSpread.js";
import { colorForLithology, colorForAlteration, colorForStructure, minMax, roleForLithology, groupMcodeRole } from "../../lib/layers.js";
import { computeMeshVolume } from "../../lib/volumetrics.js";
import { MAX_BLOCKS, SUPPORT_COLORS, MAX_BLOCK_BUDGET, gridBlockCount, cellToFit, NUMERIC_CELL_DEFAULT, gradeShellBudgetNote } from "../../lib/estimationMeta.js"; // gradeShellBudgetNote: #2223 // NUMERIC_CELL_DEFAULT: #1416; // budget: #625 // #552 — the estimator itself loads in the run functions
import { compositeDownhole, rawSampleIntervals, capAudit, capAuditText, gradeUnitLabel, resolvedSegments } from "../../lib/geochem.js"; // capAudit: #533; rawSampleIntervals: #571; resolvedSegments: #2634
import { assayIndicatorInGaps } from "../../lib/assayInGaps.js"; // TASKS.csv #2634
import { excludeQAQC } from "../../lib/qaqc.js";
import { errorNotice, notice, appendNotice, infoNotice } from "../../lib/notices.js"; // infoNotice: #2047
import { noCollarsNotice } from "../../lib/noCollars.js"; // TASKS.csv #1841 — what is waiting for collars
import { filterBySearchSupport, anisoWarpPoint, invScales, anisoWarpDirection, medianCollarSpacing, autoHaloParams, autoBodyParams, bodyCellPastRuns, seamCells /* #2384 */, mergedRuns, splitIntervalForSampling, spatialClusters, terrainGroundAt } from "../../lib/viewer/geomath.js";
import { intervalEndIndex, intervalStartIndex, upperContactOf, mergeTouchingIntervals, depthKey } from "../../lib/viewer/intervals.js";
import { codedRuns, topsForCode, codeInfo, withPileOrder, effectiveCode, inTargetUnit, startsBelowNonUnit, startsBelowOverburden, overburdenBases } from "../../lib/modellingCodes.js"; // TASKS.csv #599; #1367; #1684
import { samplesInsideShell } from "../../lib/shellSupport.js"; // TASKS.csv #1735
import { clipMesh } from "../../lib/clipMesh.js";
import { holeCounts } from "../../lib/intervalBox.js"; // TASKS.csv #1337
import { thinStructurePicks } from "../../lib/viewer/orientationThin.js"; // TASKS.csv #765
import { autoReachM, orientationsNearContacts, contactFit, tooFewContacts, octreeCellM } from "../../lib/viewer/contactFit.js"; // TASKS.csv #1170, #1171; octreeCellM: #2624
import { axisResolution, blockCellsM } from "../../lib/modelResolution.js"; // TASKS.csv #2624
import { surfacePackages, unitPackage, contactSurface, contactPackage, movePointsToUnconformities } from "../../lib/viewer/stackPackages.js"; // TASKS.csv #1309
import { makeEnsembleCounter, quantile, gridValuesToCells } from "../../lib/ensembleProbability.js"; // TASKS.csv #757
import { sequentialStops } from "../../lib/inversion.js"; // TASKS.csv #757
import { terrainGrid, unitRaster, mapAgreement } from "../../lib/predictedMap.js"; // TASKS.csv #758 // TASKS.csv #568
import { sectionGrid, pickSections, packUnits, sectionZRange } from "../../lib/modelSection.js"; // TASKS.csv #759
import { smoothClusteredSpec } from "../../lib/contactSmoothing.js"; // TASKS.csv #761
import { pickReport } from "../../lib/pickDiagnostics.js"; // TASKS.csv #762
import { findOnTraceWorld, findOnTrace, interceptId, SOFT_NUGGET, MODEL_EXTENT_PAD_M, guessSurfaceType, pointInDomain } from "../../lib/viewer/modelHelpers.js";
import { t as tr } from "../../lib/i18n.js"; // TASKS.csv #786
import { capFieldAtGround, meanInsideShell } from "../../lib/groundCap.js"; // TASKS.csv #803
import { explicitInterfacePoints } from "../../lib/explicitUnits.js"; // TASKS.csv #867
import { pinchOutPoints } from "../../lib/pinchOut.js"; // TASKS.csv #1030
import { fisherStats } from "../../lib/stereonet.js"; // TASKS.csv #1066
import { captureInputs } from "../../lib/gempyInputs.js"; // TASKS.csv #1101
import { inversionCheck, FOLD_CONTACT_TYPES } from "../../lib/topology.js"; // TASKS.csv #2058 — the fold-back check in the run's own notice
import { shellBudgetAdvice, sharePct } from "../../lib/shellBudget.js"; // TASKS.csv #2223
import { findNumericSource, sourceAssays, logPoints, unlogGrid } from "../../lib/numericSources.js"; // TASKS.csv #1741 — a log or a numeric layer field as the grade-shell source

// TASKS.csv #803 — the interpolated grid intersected with "below the terrain" (lib/groundCap.js), so a grade shell or
// alteration envelope that reaches the surface closes ON the ground instead of in the air. toReal: grid frame ->
// real (east, north, up) when the grid is anisotropy-warped. Returns { values, capped } (values unchanged when off).
// TASKS.csv #2634 — groundAt: (x, y) in the GRID's frame -> the ground in that frame (lib/modelGround.js groundAtInFrame), or null for no cut
function groundCappedGrid(grid, iso, groundAt, toReal = null) {
  if (!groundAt) return { values: grid.values, capped: 0 };
  return capFieldAtGround(grid.values, grid.nx, grid.ny, grid.nz, grid.origin, grid.cellSize, iso, groundAt, { toReal });
}

// TASKS.csv #2782 — the layer an envelope was built from, as saved in its provenance (project data: English)
const SOURCE_NAME = { litho: "Lithology", alt: "Alteration", vein: "Veins", weath: "Weathering" };

export function createModellingRuns(ctx, mcRef) {
  const {
    activeInterceptSetRef,
    alterationCellSize,
    alterationSearchRadius,
    trendWarp, // TASKS.csv #650 — (tool) => { enabled, basis, scales, params } from the trend that model uses
    apiToScene,
    assayElements,
    assays,
    unitLitho, unitField, // TASKS.csv #2378 — the Lithology rows with the unit from the chosen field (all holes), and that field
    customLayers, // TASKS.csv #1739 — a vein's logged angle to core axis may sit on a custom interval layer
    clipToDomainBoundary,
    clipToTopo,
    limitToContacts, // TASKS.csv #1335
    contactReachM,
    collars,
    desurveyMethod,
    domains,
    estimateOrientationFromPoints,
    excludedIntercepts,
    filterRowsByDomain,
    filterRowsBySearchEllipsoid,
    fitBox,
    getProjectToken,
    implicitGroupRef,
    implicitMeshesRef,
    importStateRef,
    includeSectionContacts,
    explicitSurfaces, // TASKS.csv #811
    interceptInActiveSet,
    isSameProject,
    layers,
    modelArea, visibleHoles, // TASKS.csv #2059
    lithoGroups,
    modellingCodes, // TASKS.csv #599
    mapConstraint,
    mapContactWorldPoints,
    modelAbortControllerRef,
    modelDomainId,
    modelResolution,
    numericCapValue,
    numericCellSize,
    numericMaxBlocks, // TASKS.csv #625
    setNumericBudgetHint, // TASKS.csv #625
    setNumericCellSize, // TASKS.csv #1416
    numericCloseShell,
    numericCompositeLength,
    numericCutoff,
    numericIncludeQAQC,
    numericMethod,
    numericVariogram, // TASKS.csv #1015
    numericMinCoverage,
    numericMinHoles,
    numericPadding,
    numericSearchRadius,
    numericSymbol,
    numericUseComposites,
    orientTypes,
    originRef,
    rangeMultiplier,
    thinPicks, thinWindowM, // TASKS.csv #765
    orientationReachM, // TASKS.csv #1170 — 0 = automatic
    smoothClusters, // TASKS.csv #761
    surfaceDetail, // TASKS.csv #766
    addVoxelModel, // TASKS.csv #757
    addRaster, mapLayers, rasters, removeRaster, // TASKS.csv #758
    resolveLithoTarget,
    sceneToApi,
    searchEllipsoid,
    sections,
    setAlterationBusy,
    setImplicitBusy,
    setImplicitSurfaces: setImplicitSurfacesRaw, // #2535 — wrapped below
    setLastLithBlock,
    setNotices,
    setNumericBusy,
    setTaskProgress,
    setVeinBusy,
    softIntercepts,
    stackFaults,
    stackFaultOffsets, // TASKS.csv #1054
    stackRelation,
    stackBreaks, // TASKS.csv #1309
    structureRowsToOrientations,
    surfaceOrientationsNear,
    survey,
    terrainForClipRef,
    tracesRef,
    veinCellSize,
    veinDip,
    veinDipDir,
    veinSearchRadius,
  } = ctx;
  // TASKS.csv #2535 (review #2486) — every surface a run adds records which holes fed it in its Parameters used (the grade shell's did, #2059)
  const areaParam = () => (modelArea === "checked" ? (() => { const a = checkedHoleCount(ctx.collars || [], visibleHoles); return `holes checked in the Holes list (${a.checked} of ${a.all})`; })() : "whole property");
  const setImplicitSurfaces = (u) => setImplicitSurfacesRaw((prev) => { const next = typeof u === "function" ? u(prev) : u; const had = new Set(prev || []); return (next || []).map((sf) => (had.has(sf) || !sf?.params || sf.params.modelArea ? sf : { ...sf, params: { ...sf.params, modelArea: areaParam() } })); });
  const ownTask = (label) => taskSlot(setTaskProgress, label); // TASKS.csv #2379 — a short tool never covers a cancellable run's progress

  const runSurfaceStack = async (rawSpecs, stackOpts = {}) => {
    // TASKS.csv #650 — the trend chosen for geology models; #679 — structural surfaces have their own slot
    const trendTool = stackOpts.trendTool || "implicit";
    const anisotropy = trendWarp(trendTool);
    const trendWord = trendTool === "structural" ? "structural trend" : "geology trend";
    const relation = stackOpts.relation === "onlap" ? "onlap" : "erode";
    const traces = tracesRef.current;
    // TASKS.csv #187 — bug fix: a real user hit "Stratigraphic stack (DACT, VCL, SED) failed:
    // [object Object],[object Object],[object Object]" (fixed the unreadable-error half of this in
    // desktop.js's pythonImplicitModel/pythonInterpolate — FastAPI's 422 `detail` is an array of
    // {loc,msg,type} objects, not a string, and used to be handed straight to a template string).
    // This half addresses the likely CAUSE of a validation error in the first place: any point or
    // orientation carrying a non-finite x/y/z/dip/azimuth (e.g. a bad/blank cell surviving CSV
    // import as a string, or a hole trace gap producing an unexpected value) serializes through
    // JSON.stringify as `null` for that field, which FastAPI's `float` type rejects — one 422 entry
    // per bad field, i.e. exactly the "3 items" shape seen in the report for a 3-unit stack. Rather
    // than letting that reach the sidecar as an inscrutable per-field validation error, filter each
    // spec's points/orientations to finite values here, with a clear notice about what got dropped
    // and why — same "explain, don't silently degrade" pattern used for the search-ellipsoid/domain
    // filters elsewhere in this function's callers.
    const isFiniteNum = (v) => typeof v === "number" ? Number.isFinite(v) : Number.isFinite(Number(v)) && String(v).trim() !== "";
    const specs = [];
    rawSpecs.forEach((spec) => {
      const badPoints = spec.points.length;
      const points = spec.points.filter((p) => isFiniteNum(p.x) && isFiniteNum(p.y) && isFiniteNum(p.z)).map((p) => ({ ...p, x: Number(p.x), y: Number(p.y), z: Number(p.z) }));
      const badOrientations = spec.orientations.length;
      const orientations = spec.orientations.filter((o) => isFiniteNum(o.x) && isFiniteNum(o.y) && isFiniteNum(o.z) && isFiniteNum(o.dip) && isFiniteNum(o.azimuth))
        .map((o) => ({ ...o, x: Number(o.x), y: Number(o.y), z: Number(o.z), dip: Number(o.dip), azimuth: Number(o.azimuth) }));
      const droppedPoints = badPoints - points.length, droppedOrientations = badOrientations - orientations.length;
      if (droppedPoints || droppedOrientations) {
        const parts = [];
        if (droppedPoints) parts.push(tr("{droppedPoints} point(s)", { droppedPoints }));
        if (droppedOrientations) parts.push(tr("{droppedOrientations} orientation(s)", { droppedOrientations }));
        setNotices((p) => [...p, notice("\"{label}\": dropped {parts} with a missing/invalid x, y, z, dip, or azimuth value before sending to the sidecar — check the source CSV for blank or non-numeric cells in those columns.", { label: spec.label, parts: parts.join(" and ") })]);
      }
      if (!points.length) { setNotices((p) => [...p, notice("\"{label}\": no usable points left after removing invalid ones — skipped.", { label: spec.label })]); return; }
      if (!orientations.length) { setNotices((p) => [...p, notice("\"{label}\": no usable orientations left after removing invalid ones — skipped.", { label: spec.label })]); return; }
      specs.push({ ...spec, points, orientations });
    });
    if (!specs.length) { setNotices((p) => [...p, notice("Nothing left to model after removing invalid points/orientations — see notices above for which columns to check.")]); return; }
    // TASKS.csv #762 — the picks themselves, before the solve (GemPy's condition number was measured blind to most of this)
    // TASKS.csv #2539 (review #2486) — an orientation the run estimated itself (no structure pick) is not a pick to 'fix or exclude': worded apart
    const pickIssues = specs.map((sp) => { const r = pickReport(sp, { origin: originRef.current }); return r && { ...r, estimated: !!sp.orientationEstimated }; }).filter(Boolean);
    if (pickIssues.length) {
      const onlyEstimate = pickIssues.every((r) => r.estimated && !r.duplicates && !r.close && !r.conflicts);
      setNotices((p) => [...p, notice(onlyEstimate ? "Pick check before solving — {v} The run goes ahead as it is." : "Pick check before solving — {v} The run goes ahead as it is: fix or exclude these in the Boundary intercepts table if they are wrong.", { v: pickIssues.map((r) => [
        `${r.label}:`,
        r.duplicates ? tr(" {duplicates} pick(s) repeated at the same spot ({duplicateExamples}{v}) — GemPy honours every copy, which only slows and stiffens the solve;", { duplicates: r.duplicates, duplicateExamples: r.duplicateExamples.join(", "), v: r.duplicates > 3 ? "…" : "" }) : "",
        r.close ? tr(" {n} pair(s) of picks less than 0.5 m apart down the hole ({examples}{v}) — separate structures close together (veinlets of one interval) or a near-repeat; GemPy honours each, which stiffens the solve;", { n: r.close, examples: r.closeExamples.join(", "), v: r.close > 3 ? "…" : "" }) : "", // #2048
        r.conflicts ? tr(" {conflicts} pair(s) of picks almost on top of each other but far apart in elevation ({conflictExamples}{v}) — the surface has to stand near-vertical there to honour both: usually a mis-picked or mislabelled contact, the unit repeated by a fold or fault, or stacked sheets of an intrusion (model those as veins / dykes);", { conflicts: r.conflicts, conflictExamples: r.conflictExamples.join("; "), v: r.conflicts > 3 ? "…" : "" }) : "",
        r.orientations && r.estimated ? tr(" the dip estimated from the contacts themselves (no structure pick was used) differs by more than 45° from the plane through the contacts near it ({orientationExamples}): one plane fitted to all of the contacts does not match them there (a fold, a change of dip, or two populations of contacts). It is not a pick to fix; a structural trend from the tops of a unit (Model settings) or real structure picks give the surface a better guide;", { orientationExamples: r.orientationExamples.join(", ") }) /* #2539 */
          : r.orientations ? tr(" {orientations} of {orientationsTotal} orientation(s) differ by more than 45° from the plane through the contacts around them ({orientationExamples}{v}) — GemPy bends the surface between the two;", { orientations: r.orientations, orientationsTotal: r.orientationsTotal, orientationExamples: r.orientationExamples.join(", "), v: r.orientations > 3 ? "…" : "" }) : "",
      ].join("")).join(" ").replace(/;(?=\s|$)/g, ".") })]);
    }
    const clipDomain = clipToDomainBoundary ? domains.find((d) => d.id === modelDomainId) : null;
    const clipTerrain = clipToTopo ? terrainForClipRef.current : null; // #358
    // TASKS.csv #2470 (review #2325, WA uranium) — the ground the surfaces and the block are cut at: the terrain, or with none the collar
    // surface (unless the collars look drilled from underground); every top was drawn above the collars somewhere, Top of QA up to RL 805
    const ground = clipToTopo ? modelGround(clipTerrain, collars, survey, { fallbackZ: stackOpts.groundFallbackZ }) : { ground: null }; // groundFallbackZ: #2410
    const clipGround = ground.ground;
    // TASKS.csv #1335 — each surface's contacts, how far past them it may run, and (below) a model box sized to them
    const reachLib = limitToContacts ? await import("../../lib/contactReach.js") : null;
    const reachOf = new Map();
    if (reachLib) specs.forEach((s) => { if (!s.fault) reachOf.set(s.meshName, reachLib.contactFootprint(s.points, contactReachM)); });
    // Extent spans every hole trace (not just these surfaces' own points) so the modelled surface(s)
    // cover the whole property, with ~15% padding on each side. Computed in API (east/north/up)
    // space to match the points/orientations above. #1335 — unless the surfaces stop near their own contacts: then only
    // their own points count, and the same grid gives cells that much finer.
    const allApiPts = traces.flatMap((t) => t.pts).map(sceneToApi);

    // TASKS.csv #86 — when anisotropy is enabled, EVERY api-space coordinate that crosses the sidecar
    // boundary (extent corners, interface points, orientation positions+directions) gets warped by the
    // same transform before the request, and every returned mesh vertex gets un-warped after — see the
    // anisoWarp*/anisoScales module functions' own comments for why. `center` is the centroid of all
    // hole-trace points (not just this run's own control points) so the warp is anchored consistently
    // across different tools/runs rather than drifting per-request.
    const anisoBasis = anisotropy.enabled ? anisotropy.basis : null;
    const anisoScl = anisotropy.enabled ? anisotropy.scales : null;
    const anisoCenter = anisotropy.enabled && allApiPts.length
      ? { x: allApiPts.reduce((s, p) => s + p.x, 0) / allApiPts.length, y: allApiPts.reduce((s, p) => s + p.y, 0) / allApiPts.length, z: allApiPts.reduce((s, p) => s + p.z, 0) / allApiPts.length }
      : null;
    // TASKS.csv #318 — the extent must also contain this run's own control points and orientations, not
    // only the hole traces. Drillhole-derived ones always lie on a trace so this changes nothing for
    // them, but a mapped surface contact (or a drawn section contact, #98) can run kilometres past the
    // drilling: measured on the Orion map, 129 contact points reached 2.4 km south of a 4-hole extent
    // and every one of the 12 outcrop orientations sat outside it. The anisotropy centre above stays
    // anchored on the traces, as its comment requires.
    const extentApiPts = [...(reachLib ? [] : allApiPts), ...specs.flatMap((s) => [...s.points, ...s.orientations])];
    const warpedApiPts = anisotropy.enabled ? extentApiPts.map((p) => anisoWarpPoint(p, anisoCenter, anisoBasis, anisoScl)) : extentApiPts;

    const xs = warpedApiPts.map((p) => p.x), ys = warpedApiPts.map((p) => p.y), zs = warpedApiPts.map((p) => p.z);
    // Never pads more than MODEL_EXTENT_PAD_M past the actual data on any axis, however large the
    // property's own span is — was previously an uncapped 15% of span, which is what let the modelled
    // extent balloon far past real drillhole data on a widely-spread property (see MODEL_EXTENT_PAD_M's
    // own comment for why that produced self-wrapping surfaces).
    const xr = minMax(xs), yr = minMax(ys), zr = minMax(zs); // not Math.min/max(...) — see layers.js's minMax comment
    // #1335 — the box holds the margin too, in the solve's frame when a trend warps it
    const reachBoxM = reachOf.size ? Math.max(...[...reachOf.values()].map((f) => f.margin)) * (anisotropy.enabled ? Math.max(anisoScl.major, anisoScl.semiMajor, anisoScl.minor) : 1) : 0;
    const longestSpan = Math.max(xr.max - xr.min, yr.max - yr.min, zr.max - zr.min);
    const pad = (lo, hi) => { const span = Math.max(1, hi - lo); const p = reachLib ? reachLib.reachPad(span, longestSpan, reachBoxM, MODEL_EXTENT_PAD_M) : Math.min(span * 0.15, MODEL_EXTENT_PAD_M); return [lo - p, hi + p]; };
    const [xmin, xmax] = pad(xr.min, xr.max);
    const [ymin, ymax] = pad(yr.min, yr.max);
    // TASKS.csv #2377 — z padded from the drilled column, not the lateral span / margin; with a trend (anisotropy warps the axes) or no
    // traces, as before. #2528 — the column of the traces inside this box only (the project's whole column made 1,183 m of box for 20 m holes)
    // #2616 — the column of the Model area's holes only, each trace cut at the hole's logged end (a survey can run past it)
    const lenOf = new Map((collars || []).map((c) => [c.hole_id, Number(c.length)]));
    const colPts = reachLib?.clipTrace ? traces.filter((t) => modelArea !== "checked" || !(visibleHoles && visibleHoles[t.hole_id] === false)).flatMap((t) => reachLib.clipTrace(t.pts.map(sceneToApi), lenOf.get(t.hole_id)).map((p) => ({ ...p, hole: t.hole_id }))) : allApiPts;
    const colHit = reachLib?.drilledColumn ? reachLib.drilledColumn(colPts, { xmin, xmax, ymin, ymax }) : null;
    const colR = colHit || zr, vPad = !anisotropy.enabled && reachLib?.verticalPad ? reachLib.verticalPad(zr.max - zr.min, colR.max - colR.min, MODEL_EXTENT_PAD_M) : null;
    const [zmin, zmax] = vPad != null ? [Math.min(zr.min, colR.min) - vPad, Math.max(zr.max, colR.max) + vPad] : pad(zr.min, zr.max);
    const extent = [xmin, xmax, ymin, ymax, zmin, zmax];
    // TASKS.csv #2229 (review #2174, WA gold) — how far the box actually reaches past the data on each axis (the reach notice gave only the clip
    // distance: '91 m past its contacts' for a box ~297 m past them, 2.48 km2 for a 0.41 km2 footprint)
    const boxPadM = { x: xr.min - xmin, y: yr.min - ymin, z: zr.min - zmin };
    // TASKS.csv #2624 — the lithology block's counts follow the box's shape at the Resolution slider's total (n^3): 96 x 96 x 5 cells of
    // 135 x 135 x 30 m on a 13 x 13 km x 150 m box, where 36 x 36 x 36 gave 361 x 361 x 4 m. The surfaces' mesh (Surface detail) is not changed.
    const resolution = axisResolution(extent, modelResolution);

    // TASKS.csv #52 (a) — a named function now, because the sensitivity realisations below must go
    // through exactly the same warp as the base request (perturbation happens in real metres/degrees
    // BEFORE it, so a stated sigma always means what it says).
    const warpForSidecar = (s) => (anisotropy.enabled
      ? {
          ...s,
          points: s.points.map((p) => anisoWarpPoint(p, anisoCenter, anisoBasis, anisoScl)),
          orientations: s.orientations.map((o) => {
            const pos = anisoWarpPoint(o, anisoCenter, anisoBasis, anisoScl);
            const dir = anisoWarpDirection(o.dip, o.azimuth, anisoBasis, anisoScl);
            return { ...o, x: pos.x, y: pos.y, z: pos.z, dip: dir.dip, azimuth: dir.azimuth };
          }),
        }
      : s);
    // TASKS.csv #761 — Model settings "Smooth clustered contacts": a per-point nugget on the contacts that sit in a cluster
    // (KDE over each surface's points in the solve frame, lib/contactSmoothing.js); faults are left exact. The sensitivity
    // realisations get the same treatment so they vary around the same model.
    const smoothReports = [];
    const smoothForSidecar = (s, report) => {
      if (!smoothClusters || s.fault) return s;
      const r = smoothClusteredSpec(s);
      if (report) smoothReports.push({ label: s.label, meshName: s.meshName, smoothed: r.report.smoothed, total: r.report.total, skipped: r.report.skipped || null });
      return r.spec;
    };
    const sidecarSpecs = specs.map((s) => smoothForSidecar(warpForSidecar(s), true));
    if (smoothReports.length) {
      setNotices((p) => [...p, notice("Smooth clustered contacts (Model settings): {v}. A smoothed point is fitted loosely, so a tight cluster of picks no longer bends the surface; it also loses detail if the cluster was accurate (a drill fan).", { v: smoothReports.map((r) => (r.skipped ? tr("{label}: not applied ({skipped})", { label: r.label, skipped: r.skipped }) : tr("{label}: {smoothed} of {total} contact points smoothed", { label: r.label, smoothed: r.smoothed, total: r.total }))).join("; ") })]);
    }

    // TASKS.csv #1189 — it still runs: the geologist may want the plane; it just must not pass for a modelled contact
    const thinSpecs = specs.filter((s) => !s.fault && tooFewContacts(s.points));
    if (thinSpecs.length) setNotices((p) => [...p, notice("Too few contacts to shape a surface: {list}. Fewer than three, or all in a line, so its shape comes from the structure picks alone.", { list: thinSpecs.map((s) => tr("{label} ({n})", { label: s.label, n: s.points.length })).join(", ") })]);
    const label = specs.length === 1 ? specs[0].label : `Stratigraphic stack (${specs.map((s) => s.meshName).join(", ")})`;
    const totalPoints = specs.reduce((s, x) => s + x.points.length, 0);
    const totalOrientations = specs.reduce((s, x) => s + x.orientations.length, 0);

    setImplicitBusy(true);
    { // #2624 — the box, the block's three cell sizes and the mesh cell, said before the solve
      const cm = blockCellsM(extent, resolution).map((v) => Math.round(v * 10) / 10), lvl = surfaceDetail || 4;
      setNotices((p) => [...p, notice(anisotropy.enabled ? "Model box {bx} x {by} x {bz} (in the structural trend's frame): the lithology block is {nx} x {ny} x {nz} cells of {dx} x {dy} x {dz} (model check fallback, volumes, Add as block model); the surface mesh cells are about {m} ({level})." : "Model box {bx} x {by} x {bz} m: the lithology block is {nx} x {ny} x {nz} cells of {dx} x {dy} x {dz} m (model check fallback, volumes, Add as block model); the surface mesh cells are about {m} m ({level}).", { bx: Math.round(extent[1] - extent[0]), by: Math.round(extent[3] - extent[2]), bz: Math.round(extent[5] - extent[4]), nx: resolution[0], ny: resolution[1], nz: resolution[2], dx: cm[0], dy: cm[1], dz: cm[2], m: Math.round(octreeCellM(extent, lvl)), level: lvl >= 6 ? tr("Very fine") : lvl === 5 ? tr("Fine") : tr("Standard") })]);
      // TASKS.csv #2905 — units thinner than the vertical cell: said before a solve that cannot place them apart
      const thin = specs.length > 1 ? stackCellCheck(specs, cm[2]) : null;
      if (thin) setNotices((p) => [...p, notice("Warning: the units are about {t} m thick (the median drop from one top to the next in a hole), thinner than the model's vertical cell of {dz} m. One field cannot place them apart, so the surfaces may fold back or come out of order. For a flat-lying pile, an Explicit surface per unit from its logged tops follows the picks exactly (3D Modelling > Explicit surface); a smaller vertical cell (Model settings) costs a much longer solve.", { t: thin.thick.toFixed(1), dz: thin.dz })]);
    }
    setNotices((p) => [...p, notice(specs.length > 1 ? "Running {label} ({totalPoints} points, {totalOrientations} orientations across {specs} surfaces){v2}…" : "Running {label} ({totalPoints} points, {totalOrientations} orientations across {specs} surface){v2}…", { label, totalPoints, totalOrientations, specs: specs.length, v2: anisotropy.enabled ? tr(", with the {trendWord} \"{v}\"", { trendWord, v: anisotropy.params?.trend || tr("unnamed") }) : "" })]);
    // The sidecar call is one opaque round-trip with no real progress ticks to report, so this is a
    // "fake but honest" ramp: creeps toward 90% while waiting (never claiming completion it hasn't
    // reached), jumps to 100% on an actual response, and clears shortly after — enough for the
    // status bar to show "something is happening and roughly how far along" for a run that can take
    // several seconds, without pretending to know GemPy's actual internal progress.
    // TASKS.csv #231 — a real cancel button for a run that can take 80s+: an AbortController whose
    // signal threads through to the fetch in desktop.js, wired to a "Cancel" action on the status
    // bar's taskProgress display (App.jsx's StatusBar) via onCancel below.
    const abortController = new AbortController();
    modelAbortControllerRef.current = abortController;
    setTaskProgress?.({ label, pct: 8, onCancel: () => abortController.abort("user-cancelled") });
    // TASKS.csv #2383 (review #2325, WA uranium) — the ramp read 90 % from 18 s into an eleven-minute run. After 10 s it is no longer a
    // guess at a percentage: an indeterminate bar with the time elapsed (rampProgress, lib/taskSlot.js)
    const rampStarted = Date.now();
    const rampTimer = setInterval(() => {
      setTaskProgress?.((cur) => (cur && cur.label === label ? rampProgress(cur, (Date.now() - rampStarted) / 1000) : cur));
    }, 500);
    const solveStartedAt = performance.now(); // TASKS.csv #52 (a) — the measured per-run cost that budgets the sensitivity ensemble
    const projectToken = getProjectToken(); // #466
    // TASKS.csv #756 — every logged litho interval's midpoint, in the frame the model is solved in (warped with a trend),
    // evaluated EXACTLY by GemPy in the same solve: the model check and the modelled-unit layer read these, not the
    // block cell a midpoint falls in (one cell is 50-110 m on a real extent at 36^3)
    const evalRows = [];
    traces.forEach((t) => {
      if (modelArea === "checked" && visibleHoles?.[t.hole_id] === false) return; // TASKS.csv #2535 — the model check scores the Model area's holes
      (unitLitho || importStateRef.current.layers?.litho || []).forEach((r) => { // #2378 — the unit as the tools read it
        if (r.hole_id !== t.hole_id || !Number.isFinite(r.from) || !Number.isFinite(r.to) || r.to <= r.from) return;
        const p = findOnTrace(t.pts, (r.from + r.to) / 2);
        if (!p) return;
        const api0 = sceneToApi(p);
        const api = anisotropy.enabled ? anisoWarpPoint(api0, anisoCenter, anisoBasis, anisoScl) : api0;
        evalRows.push({ row: r, hole_id: t.hole_id, x: api.x, y: api.y, z: api.z });
      });
    });
    // TASKS.csv #758 — the predicted geological map: terrain nodes over the data's own padded footprint (real space),
    // evaluated in the same solve, in the frame the model is solved in
    const mapTerrain = terrainForClipRef.current;
    const o0 = originRef.current;
    const rxMap = minMax(extentApiPts.map((q) => q.x)), ryMap = minMax(extentApiPts.map((q) => q.y));
    const [mx0, mx1] = pad(rxMap.min, rxMap.max), [my0, my1] = pad(ryMap.min, ryMap.max);
    const mapGrid = mapTerrain ? terrainGrid(mapTerrain, [mx0 + o0.x, my0 + o0.y, mx1 + o0.x, my1 + o0.y], { maxPts: 20000, minSpacing: 25 }) : null;
    const mapApi = mapGrid ? mapGrid.nodes.map((n) => { const a = { x: n.x - o0.x, y: n.y - o0.y, z: n.z - o0.z }; return anisotropy.enabled ? anisoWarpPoint(a, anisoCenter, anisoBasis, anisoScl) : a; }) : [];
    // TASKS.csv #759 — the most recent saved cross-sections, a vertical grid each over the depths of the holes near the
    // line (nodes above the ground left out), evaluated in the same solve so the section window can draw the model
    // behind the holes
    const rzSec = minMax(extentApiPts.map((q) => q.z));
    const [sz0, sz1] = pad(rzSec.min, rzSec.max);
    const groundAt = mapTerrain ? (x, y) => terrainGroundAt(mapTerrain, x, y) : null; // TASKS.csv #927
    const secPick = pickSections(sections);
    const tracePts = secPick.sections.length ? traces.flatMap((t) => t.wx.map((x, i) => ({ x, y: t.wy[i], z: t.wz[i] }))) : [];
    const secGrids = secPick.sections.map((sc) => {
      const A = { x: sc.ax, y: sc.ay }, B = { x: sc.bx, y: sc.by };
      const [zl, zh] = sectionZRange(tracePts, A, B, Number(sc.corridor) || 100, sz0 + o0.z, sz1 + o0.z);
      return { sc, grid: sectionGrid(A, B, zl, zh, { maxPts: secPick.perSection, minSpacing: 2, groundAt }) };
    })
      .filter((g) => g.grid?.nodes.length);
    const secApi = secGrids.flatMap(({ grid }) => grid.nodes.map((n) => { const a = { x: n.x - o0.x, y: n.y - o0.y, z: n.z - o0.z }; return anisotropy.enabled ? anisoWarpPoint(a, anisoCenter, anisoBasis, anisoScl) : a; }));
    const evalAll = [...evalRows.map((q) => [q.x, q.y, q.z]), ...mapApi.map((q) => [q.x, q.y, q.z]), ...secApi.map((q) => [q.x, q.y, q.z])];
    const evalPts = evalAll.length && evalAll.length <= 200000 ? evalAll : null;
    const res = await pythonImplicitModel(
      extent,
      sidecarSpecs.filter((s) => !s.fault).map((s) => ({ name: s.meshName, points: s.points, orientations: s.orientations, ...(s.package != null ? { package: s.package } : {}) })),
      // TASKS.csv #271 (relation) / #274 (rangeMultiplier — omitted when 0/Auto, see desktop.js)
      // TASKS.csv #356 — ask for the lithology block (model check + volumes) unless anisotropy warps the
      // model space, where block coordinates no longer match hole positions directly.
      { resolution: resolution, relation, rangeMultiplier: rangeMultiplier || 0, signal: abortController.signal, returnBlock: true, // #679 — with a trend too: the check and volumes work in the warped frame (below)
        faults: sidecarSpecs.filter((s) => s.fault).map((s) => ({ name: s.meshName, points: s.points, orientations: s.orientations, ...(s.offsets ? { offsets: s.offsets } : {}) })), // #360; offsets: #1054
        ...(evalPts ? { evaluateAt: evalPts } : {}), surfaceDetail }, // #756; surfaceDetail: #766
    );
    clearInterval(rampTimer);
    const baseSolveSeconds = (performance.now() - solveStartedAt) / 1000;
    setImplicitBusy(false);
    modelAbortControllerRef.current = null;
    if (!res.ok) {
      setTaskProgress?.(null);
      if (!res.cancelled) setNotices((p) => [...p, errorNotice(tr("{label} failed: {error}", { label, error: res.error }))]);
      return;
    }
    // TASKS.csv #466 — the model came back after a switch to another project (tab change, Open, New). Its
    // surfaces are in the ORIGINAL project's local frame and belong to it; adding them here would put them
    // in the wrong project, at the wrong place. Not added; said plainly.
    if (!isSameProject(projectToken)) {
      setTaskProgress?.(null);
      setNotices((p) => [...p, notice("{label} finished after you switched to another project, so its result was NOT added here (it belongs to the project it was started from, in another frame). Switch back and run it again there.", { label })]);
      return;
    }
    setTaskProgress?.({ label, pct: 100 });
    setTimeout(() => setTaskProgress?.((cur) => (cur && cur.label === label ? null : cur)), 1000);

    const byName = Object.fromEntries((res.surfaces || []).map((s) => [s.name, s]));
    const newMeshes = [];
    const missing = [];
    const unwarpScl = anisotropy.enabled ? invScales(anisoScl) : null;
    const unwarpVerts = (verts) => (anisotropy.enabled
      ? verts.map(([x, y, z]) => { const w = anisoWarpPoint({ x, y, z }, anisoCenter, anisoBasis, unwarpScl); return [w.x, w.y, w.z]; })
      : verts);
    let ensembleBase = null; // TASKS.csv #52 (a)
    const nonFinite = []; // TASKS.csv #314
    const reachNotes = []; // TASKS.csv #1335
    const folds = []; // TASKS.csv #2058 — contact surfaces of this run that fold back over themselves
    const orderSurfs = []; // TASKS.csv #2376 — the stack's surfaces as drawn, youngest first, for the order check below
    const runId = `gempy_${Date.now()}`; // TASKS.csv #1101 — the surfaces of one run (a stack) share it, for "Model inputs"
    specs.forEach((spec, specIndex) => {
      let surf = byName[spec.meshName];
      if (!surf || !surf.vertices?.length) { missing.push(spec.label); return; }
      // TASKS.csv #314 — NaN from GemPy arrives as null with HTTP 200: drop what touches it, and say so.
      const clean = sanitizeMesh(surf.vertices, surf.faces);
      if (clean.badVertices) {
        if (!clean.vertices.length) { missing.push(`${spec.label} (GemPy returned no finite vertices)`); return; }
        nonFinite.push(`${spec.label}: ${clean.badVertices} of ${surf.vertices.length} vertices were not numbers, ${clean.droppedFaces} triangle(s) removed`);
        surf = { ...surf, vertices: clean.vertices, faces: clean.faces };
      }
      const apiVerts = unwarpVerts(surf.vertices);
      let sceneVerts = apiVerts.map(apiToScene);
      // TASKS.csv #88 — boundary constraint: GemPy fit / extrapolated across the whole extent regardless of which
      // control points fed it (#89 only restricted the INPUT, not the output), so the surface is clipped to the domain.
      // TASKS.csv #568 — CUT at the boundary (lib/clipMesh.js), not by dropping every triangle with a vertex outside:
      // that left a stair-stepped edge at the model's cell size that never met the fault.
      let faces = surf.faces;
      if (clipDomain) {
        const c = clipMesh(sceneVerts, faces, (v) => !pointInDomain(v, clipDomain, implicitMeshesRef.current));
        sceneVerts = c.verts; faces = c.faces;
        if (!faces.length) { missing.push(`${spec.label} (entirely clipped by domain "${clipDomain.name}")`); return; }
      }
      // TASKS.csv #1335 — a level set runs to the walls of the box wherever the field crosses it, data or not
      const reach = reachOf.get(spec.meshName);
      if (reach) {
        const c = clipMesh(sceneVerts, faces, (v) => reach.isOutside(sceneToApi(v)));
        sceneVerts = c.verts; faces = c.faces;
        if (!faces.length) { missing.push(`${spec.label} (no part of it lies near its own contacts)`); return; }
        reachNotes.push(tr("{label}: {m} m past its {n} contact point(s)", { label: spec.label, m: Math.round(reach.margin), n: spec.points.length }));
      }
      // TASKS.csv #358 — the model extent's top is the highest control point plus padding, and GemPy
      // extrapolates up to it, so dipping contacts used to stand up into the air above the ground (in 3D,
      // in exports, in any volume). The part above the terrain surface is removed (only inside the terrain's
      // footprint; outside it there is nothing to clip against). #568 — cut at the ground line (was: every
      // triangle whose centroid was above it dropped, leaving a saw-tooth that stopped short of the surface).
      let topoClipped = 0;
      if (clipGround) {
        const o = originRef.current;
        const [txmin, tymin, txmax, tymax] = clipGround.bbox;
        const above = (v) => {
          const wx = v.x + o.x, wy = -v.z + o.y;
          if (wx < txmin || wx > txmax || wy < tymin || wy > tymax) return false;
          const ground = clipGround.at(wx, wy); // TASKS.csv #927 — nothing clipped against the fill; #2470 — or the collar surface
          return Number.isFinite(ground) && v.y + o.z > ground;
        };
        const c = clipMesh(sceneVerts, faces, above);
        sceneVerts = c.verts; faces = c.faces;
        topoClipped = c.removed + c.split;
        if (!faces.length) { missing.push(`${spec.label} (lies entirely above the terrain surface)`); return; }
      }
      // TASKS.csv #1171 — how far the mesh as drawn passes from the contact points it was fitted through. Not when it was clipped to a
      // domain, whose outside contacts it no longer reaches on purpose.
      const fit = clipDomain ? null : contactFit(spec.points.map((p) => apiToScene([p.x, p.y, p.z])).map((q) => [q.x, q.y, q.z]), sceneVerts.map((v) => [v.x, v.y, v.z]), faces);
      if (fit) setNotices((p) => [...p, notice(fit.worst > 10 ? "\"{label}\" misses its {n} contact point(s) by {typical} m typically and {worst} m at worst, with mesh cells of about {cell} m. A finer Surface detail shrinks the cells; Surface query shows it hole by hole.{v}" : "\"{label}\" passes within {worst} m of its {n} contact point(s), with mesh cells of about {cell} m.", { label: spec.label, n: fit.n, typical: Math.round(fit.typical * 10) / 10, worst: Math.round(fit.worst * 10) / 10, cell: Math.round(fit.cell), v: missOverHalfCell(fit) ? tr(" The typical miss is more than half a cell: model a smaller area (Model settings › Model area, the holes of one prospect) before a finer detail.") : "" })]); // v: TASKS.csv #1546
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(sceneVerts.flatMap((v) => [v.x, v.y, v.z]), 3));
      geo.setIndex(faces.flat());
      geo.computeVertexNormals();
      const mat = new THREE.MeshLambertMaterial({ color: spec.color, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData = { tip: `${spec.label}\n${surf.vertices.length} vertices${clipDomain ? ` (clipped to "${clipDomain.name}")` : ""}${topoClipped ? " (cut at topography)" : ""}` };
      implicitGroupRef.current?.add(mesh);
      const id = `impl_${Date.now()}_${spec.meshName}`;
      implicitMeshesRef.current[id] = mesh;
      newMeshes.push(mesh);
      if (specs.length > 1) orderSurfs.push({ label: spec.label, package: spec.package, verts: sceneVerts, faces }); // #2376
      if (stackOpts.ensemble && specs.length === 1) ensembleBase = { spec, mesh, id, sceneVerts, faces };
      // TASKS.csv #83 — `type` starts from each tool's own guess (see guessSurfaceType/the inline
      // guesses at each spec's construction site above); `relationships` starts empty — declared
      // afterward in the Modelling tab's surface list, since a relationship needs another surface to
      // already exist to point at.
      // TASKS.csv #276 — until now only the numeric grade-shell tool attached a `params` block, so every
      // GemPy-generated surface exported to OBJ/DXF/glTF carried the #269 provenance HEADER with no
      // actual parameters in it. These are exactly the settings that change the shape of the surface
      // being exported, including #274's effective potential-field range as GemPy itself reported it.
      const params = {
        tool: specs.length > 1 ? "stratigraphic stack (GemPy)" : "implicit surface (GemPy)",
        surface: spec.meshName, sourcePoints: spec.points.length, orientations: spec.orientations.length,
        relation, resolution, blockCellM: blockCellsM(extent, resolution).map((v) => Math.round(v * 10) / 10), // #2624 — per axis, from the box's shape
        ...(unitField ? { unitsFrom: unitField } : {}), // #2378 — the Lithology field the units were read from
        lithoStamp: layerStamp(layers.litho), // #2388 — the log it read: the surface is marked 'source changed' when the log is replaced or edited
        surfaceDetail: res.surfaceDetail ?? 4, // #766 — GemPy's octree level for the mesh (4 = its floor)
        gempyRange: res.rangeUsed ?? null, gempyRangeDefault: res.rangeDefault ?? null, engineDtype: res.precision ?? "float64", // engineDtype: #767 (an older engine solved in float64)
        gempyRangeMultiplier: rangeMultiplier || null, gempyCO: res.cO ?? null,
        anisotropy: anisotropy.enabled ? anisotropy.params : null,
        searchEllipsoid: searchEllipsoid.enabled ? { ...searchEllipsoid } : null,
        domain: clipDomain ? clipDomain.name : (domains.find((d) => d.id === modelDomainId)?.name || null),
        clippedToDomain: !!clipDomain,
        ...(reach ? { limitedToContacts: { marginM: Math.round(reach.margin), automatic: !(contactReachM > 0) } } : {}), // #1335
        clippedToTopography: clipGround ? { terrain: clipGround.name, trianglesRemoved: topoClipped } : false, // #358; #2470 — "collar surface" with no terrain
        // TASKS.csv #52 (c) — WHICH picks fed this surface, by name. Without it two surfaces modelled
        // from the same logged code (upper vs lower basalt) would carry identical provenance and be
        // indistinguishable a month later.
        interceptSet: activeInterceptSetRef.current ? { name: activeInterceptSetRef.current.name, intercepts: (activeInterceptSetRef.current.ids || []).length } : null,
        extent: extent.map((v) => Math.round(v)),
        extentOrigin: [originRef.current.x, originRef.current.y, originRef.current.z].map((v) => Math.round(v * 1000) / 1000), // #1378 — the extent in project coordinates = extent + this
        // TASKS.csv #318 — a mapped surface contact that fed this run, if any (set by runImplicitModel).
        ...(spec.params?.surfaceMapContact ? { surfaceMapContact: spec.params.surfaceMapContact } : {}),
        ...(spec.params?.orientationsAveraged ? { orientationsAveraged: spec.params.orientationsAveraged } : {}), // #765
        ...(spec.params?.picksNearContacts ? { picksNearContacts: spec.params.picksNearContacts } : {}), // #1170
        ...(spec.package != null ? { package: spec.package } : {}), // #1309
        ...(fit ? { contactFit: { points: fit.n, typicalMissM: +fit.typical.toFixed(2), worstMissM: +fit.worst.toFixed(2), meshCellM: Math.round(fit.cell) } } : {}), // #1171
        ...(smoothReports.find((r) => r.meshName === spec.meshName) ? { clusteredContactsSmoothed: (({ smoothed, total, skipped }) => ({ smoothed, of: total, ...(skipped ? { skipped } : {}), method: "KDE (Scott, in the contacts' plane), nugget on points >= 2x even density and >= 0.5 of the max (von Harten et al. 2021)" }))(smoothReports.find((r) => r.meshName === spec.meshName)) } : {}), // #761
        generatedAt: new Date().toISOString(),
        solveSeconds: Math.round(baseSolveSeconds * 10) / 10, // #2383 — what this run cost, for the next one of its size
        // TASKS.csv #1101 — the points and orientations this run sent for this surface (world, unwarped, with nuggets)
        runId, inputs: captureInputs(spec, sidecarSpecs[specIndex], originRef.current),
        ...(res.faultOffsets ? { faultOffsets: res.faultOffsets } : {}), // #1054 — which units each fault offset in this run
      };
      setImplicitSurfaces((p) => [...p, { id, name: spec.label, visible: true, vertexCount: surf.vertices.length, faceCount: faces.length, type: spec.type || "other", relationships: [], params }]);
      // TASKS.csv #2058 (review #2013) — the same one-elevation-per-location check as Check relationships, said by the run itself: an
      // implicit 'Top of VANSS' folded back at 1 of 16 locations and only Check relationships reported it
      if (FOLD_CONTACT_TYPES.has(spec.type)) {
        const pos = new Float32Array(sceneVerts.length * 3);
        sceneVerts.forEach((v, i) => { pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; });
        const inv = inversionCheck({ positions: pos, indices: Uint32Array.from(faces.flat()) }, { up: "y" });
        if (inv.sampled && inv.fraction > 0.05) folds.push(tr("\"{name}\" folds back over itself at {folded} of {sampled} sampled locations (a contact surface should have one elevation per location): an interpolation artefact, a real overturned fold, or a unit that is not one layer (a steep intrusive or repeated sheets, better modelled as a closed body in Modelling codes).", { name: spec.label, folded: inv.folded, sampled: inv.sampled }));
      }
    });
    if (folds.length) setNotices((p) => [...p, notice("{list} Check relationships lists it again with the other checks.", { list: folds.join(" ") })]); // #2058
    // TASKS.csv #512 — onlap stacks share one scalar field, so the sidecar sends each repeated pick once
    // TASKS.csv #1054 — what each fault offset, as GemPy applied it, and the limit no choice here can lift
    if (res.faultOffsets && Object.keys(res.faultOffsets).length) setNotices((p) => [...p, notice("Faults as solved: {list}. Each fault runs through the whole model box (GemPy here cannot end a fault).", { list: Object.entries(res.faultOffsets).map(([f, u]) => tr("{fault} offsets {units}", { fault: f, units: u.length ? u.join(", ") : tr("nothing") })).join("; ") })]);
    if (res.orientationsDeduplicated > 0) setNotices((p) => [...p, notice("{orientationsDeduplicated} repeated orientation(s) were given to GemPy once rather than once per unit: in an onlap stack every unit shares one field, so the copies added solve time but no information.", { orientationsDeduplicated: res.orientationsDeduplicated })]);
    if (reachNotes.length) setNotices((p) => [...p, appendNotice(notice("Surfaces stop near their own contacts: {list}. For the solver the model box reaches {px} m (east-west), {py} m (north-south) and {pz} m (vertically) past these contacts, so its cells are {cell} m; the surfaces are cut back to the distances above. It was sized to these contacts, not to every hole in the project. Model settings changes the distance or fills the box.", { list: reachNotes.join("; "), px: Math.round(boxPadM.x), py: Math.round(boxPadM.y), pz: Math.round(boxPadM.z), cell: Math.round(Math.max(...blockCellsM(extent, resolution))) /* #2624: the shaped block */ }) /* box pads, cells: #2229 */,
      vPad != null && colHit ? " " + tr("Its height follows the drilling under it ({area}): RL {top} ({topHole}) to RL {bottom} ({bottomHole}), each hole to its logged depth.", { area: modelArea === "checked" ? tr("the holes checked in the Holes list") : tr("every hole in the box"), top: Math.round(colHit.max + (originRef.current?.z || 0)), topHole: colHit.maxHole ?? "?", bottom: Math.round(colHit.min + (originRef.current?.z || 0)), bottomHole: colHit.minHole ?? "?" }) /* project RL: + the scene origin, as extentOrigin (#1378) */ : "") /* #2616 */]);
    if (missing.length) setNotices((p) => [...p, notice("GemPy returned no mesh for: {missing} (try adding more points or a wider spread of orientations for those).", { missing: missing.join(", ") })]);
    // TASKS.csv #2376 (review #2325, WA uranium) — the stack's surfaces cannot cross (one field), but their order is the field's level at
    // each one's own contacts and can come out unlike the order given: said from the surfaces as drawn, at every collar they reach
    if (orderSurfs.length > 1) {
      let yLo = Infinity, yHi = -Infinity;
      const surfaces = orderSurfs.map((o) => {
        const pos = new Float32Array(o.verts.length * 3);
        o.verts.forEach((v, i) => { pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; if (v.y < yLo) yLo = v.y; if (v.y > yHi) yHi = v.y; });
        return { label: o.label, package: o.package, q: buildMeshQuery(pos, Uint32Array.from(o.faces.flat())) };
      });
      const holes = traces.filter((t) => t.pts?.length && (modelArea !== "checked" || visibleHoles?.[t.hole_id] !== false)).map((t) => ({ x: t.pts[0].x, z: t.pts[0].z })); // the Model area's holes: #2905 (293 counted on a 228-hole area)
      const ord = stackOrderAtHoles(surfaces, holes, { yLo: yLo - 10, yHi: yHi + 10 });
      const checked = Math.max(0, ...ord.pairs.map((q) => q.of));
      if (ord.outOfOrder.length) {
        const list = ord.outOfOrder.map((q) => tr("{older} lies above {younger} at {above} of {of} holes (by up to {worst} m)", { older: q.older, younger: q.younger, above: q.above, of: q.of, worst: q.worstM.toFixed(1) })).join("; ");
        setNotices((p) => [...p, notice("Out of order at the collars: {list}. A stack is one field, so its surfaces cannot cross, but each is that field's level at its own contacts, and here they came out in a different order from the one given. A model box too coarse for the units' thickness is a usual cause (the contact fit above says how far each surface misses its picks); one Explicit surface per unit, from its logged tops, follows the picks exactly.", { list })]);
      } else if (checked) setNotices((p) => [...p, infoNotice(tr("In order at the collars: each surface of the stack lies below the one above it at the {n} collars both reach.", { n: checked }))]);
    }
    // TASKS.csv #2470 — with no terrain: the collar surface was used, or why not
    if (ground.kind === "collars") setNotices((p) => [...p, notice("No terrain is loaded, so the surfaces and the block were cut at the collar surface: the ground interpolated between the {n} collars, inside their footprint. A terrain (Maps > Terrain) gives the real ground.", { n: ground.collars })]);
    else if (ground.why === "underground") setNotices((p) => [...p, notice("No terrain is loaded and the collars look drilled from underground, so nothing was cut at the ground: the surfaces may run above it.")]);
    { const tall = boxTallerThanDrilling(extent, traces); if (tall) setNotices((p) => [...p, notice("The model box is {r} times as tall as the drilling in it ({box} m against {drill} m), so most of each unit volume is rock no hole reached.", { r: tall.ratio.toFixed(1), box: Math.round(tall.boxM), drill: Math.round(tall.drillM) })]); }
    if (nonFinite.length) setNotices((p) => [...p, notice("GemPy returned some invalid (NaN) vertices — the surface is shown without the triangles that used them, so it may have holes: {nonFinite}. Usually too few points / orientations for the extent or resolution.", { nonFinite: nonFinite.join("; ") })]); // #314
    // TASKS.csv #356 — model vs logs, and unit volumes, from the lithology block. Every logged interval of a
    // modelled unit (by its code / group codes) is sampled at its midpoint in the model; the report says
    // what share of the logged metres the model puts in the same unit, per unit and the worst holes.
    // Volumes are INSIDE the model extent only (a box around the data), so they are not unit sizes in the
    // ground, and nothing here is a resource.
    // TASKS.csv #593 — the block was asked for but did not come back (an older engine, or the sync fallback before
    // it forwarded the request): say why the model check, volumes and "Add as block model" are missing
    if (!res.block) setNotices((p) => [...p, notice("The Python engine did not return the model's lithology block, so the model check, unit volumes and \"Add as block model\" are not available for this run. Updating GeoStrix (its engine is bundled) brings them back.")]);
    // TASKS.csv #1684 — a "Base of X" run (one overburden_base surface): GemPy's block labels the volume UNDER a surface with
    // that surface's unit, but here the unit lies ABOVE its base and what lies below is not modelled, so the labels are
    // swapped before the model check, the volumes, the sections and "Add as block model" read them
    const baseRun = specs.length === 1 && specs[0].type === "overburden_base";
    if (res.block && baseRun) res.block = { ...res.block, labels: [specs[0].meshName, ...res.block.labels.slice(1).map(() => null)] };
    if (res.block) {
      const codeToUnit = new Map();
      specs.forEach((sp) => { if (!sp.mcode) (sp.codes || [sp.meshName]).forEach((c) => codeToUnit.set(c, sp.meshName)); });
      // TASKS.csv #599 — units modelled from modelling codes are checked interval by interval against each
      // interval's own code (DACT1 / DACT2 both come from logged DACT: the logged code can't tell them apart)
      const mcodeUnits = new Set(specs.filter((sp) => sp.mcode).map((sp) => sp.meshName));
      const unitOfRow = (r) => { if (mcodeUnits.size) { const ec = effectiveCode(r, mcRef.current, mcodeGroupOf); if (mcodeUnits.has(ec)) return ec; } return codeToUnit.get(r.value); };
      // TASKS.csv #756 — the exact unit at each midpoint when the engine evaluated them (same numbering as the block);
      // a midpoint outside the model box keeps no unit, so it counts as "outside the model" as before
      const exact = Array.isArray(res.evaluated) && res.evaluated.length === evalRows.length + mapApi.length + secApi.length;
      if (exact) {
        const [x0, x1, y0, y1, z0, z1] = res.block.extent;
        evalRows.forEach((q, i) => { if (q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1 && q.z >= z0 && q.z <= z1) q.modelled = res.block.labels[res.evaluated[i] - 1] ?? null; });
      }
      // TASKS.csv #679 — with a trend the midpoints are already in the warped frame the block was solved in
      const samples = [];
      evalRows.forEach((q) => {
        const unit = unitOfRow(q.row);
        if (unit == null) return;
        samples.push({ hole_id: q.hole_id, x: q.x, y: q.y, z: q.z, metres: q.row.to - q.row.from, logged: unit, ...("modelled" in q ? { modelled: q.modelled } : {}) });
      });
      const chk = checkAgainstLogs(res.block, samples);
      // TASKS.csv #679 — a warped block's cells are tilted boxes in real space, which a block model (axis-aligned cells)
      // and the modelled-unit layer (which samples the block at real positions) can't use as they are: resample it onto
      // an axis-aligned real-space grid over the data's own padded box first
      let lbBlock = res.block;
      if (anisotropy.enabled) {
        const rx = minMax(extentApiPts.map((q) => q.x)), ry = minMax(extentApiPts.map((q) => q.y)), rz = minMax(extentApiPts.map((q) => q.z));
        const realExtent = [...pad(rx.min, rx.max), ...pad(ry.min, ry.max), ...pad(rz.min, rz.max)];
        lbBlock = resampleWarpedBlock(res.block, realExtent, (q) => anisoWarpPoint(q, anisoCenter, anisoBasis, anisoScl));
      }
      // TASKS.csv #1029 — no rock above the ground: the block model / unit volumes block, and the block the unit volumes
      // are counted on (the solved one: through the unwarp when a trend stretched it), are cut at the terrain, as the
      // surfaces are (#358, the same "clip to topography" choice)
      let volBlock = res.block, airCut = 0;
      if (clipGround) {
        const o = originRef.current;
        const groundOf = clipGround.at; // #2470 — the terrain, or the collar surface
        const real = (q) => ({ x: q.x + o.x, y: q.y + o.y, z: q.z + o.z });
        const unwarp = anisotropy.enabled ? ((u) => (q) => real(anisoWarpPoint(q, anisoCenter, anisoBasis, u)))(invScales(anisoScl)) : real;
        lbBlock = capBlockAtGround(lbBlock, groundOf, real).block;
        const vc = capBlockAtGround(res.block, groundOf, unwarp);
        volBlock = vc.block; airCut = vc.cut;
      }
      // TASKS.csv #817 — the ground above the youngest modelled top. It was labelled after specs[0], which is a FAULT whenever
      // faults are solved with the stack (they come first): "above the top of Fault Thrust Fault 1". Now the first
      // non-fault surface; and a model from the map names it as the youngest map unit itself (stackOpts.aboveUnit), so the
      // predicted map scores it against that unit instead of leaving it grey and unscored (Perk-Rocky: andesite, 23 km2).
      const topSpec = specs.find((sp) => !sp.fault) || specs[0];
      const aboveUnit = stackOpts.aboveUnit || null;
      const aboveText = aboveUnit || (baseRun ? topSpec.meshName : `above the top of ${topSpec.meshName} (not modelled)`); // baseRun: #1684 (the unit is above its base)
      const unitSpecs = specs.filter((sp) => !sp.fault);
      // TASKS.csv #759 — each evaluated section's units (packed), keyed by section id with the line it was evaluated on
      const secResults = {};
      if (exact && secGrids.length) {
        const [bx0, bx1, by0, by1, bz0, bz1] = res.block.extent;
        const aboveSec = aboveText; // #817
        let off = evalRows.length + mapApi.length;
        secGrids.forEach(({ sc, grid }) => {
          const units = grid.nodes.map((_, k) => {
            const q = secApi[off - evalRows.length - mapApi.length + k];
            if (!(q.x >= bx0 && q.x <= bx1 && q.y >= by0 && q.y <= by1 && q.z >= bz0 && q.z <= bz1)) return null;
            const id = res.evaluated[off + k];
            return id <= 1 ? aboveSec : res.block.labels[id - 1] ?? null;
          });
          off += grid.nodes.length;
          secResults[sc.id] = { ax: sc.ax, ay: sc.ay, bx: sc.bx, by: sc.by, grid: { len: grid.len, z0: grid.z0, z1: grid.z1, nx: grid.nx, ny: grid.ny, dl: grid.dl, dz: grid.dz, ij: Int32Array.from(grid.nodes, (n) => n.j * grid.nx + n.i) }, units: packUnits(units) };
        });
        setNotices((p) => [...p, notice(secGrids.length > 1 ? "Modelled units evaluated exactly on {secGrids} saved cross-sections ({v2}; {secApi} points in the same solve): open a section to see them behind the logged holes. Other sections show the model read from its block (coarser)." : "Modelled units evaluated exactly on {secGrids} saved cross-section ({v2}; {secApi} points in the same solve): open a section to see them behind the logged holes. Other sections show the model read from its block (coarser).", { secGrids: secGrids.length, v2: secGrids.map(({ sc, grid }) => `${sc.name} every ${Math.round(grid.dl)} m`).join(", "), secApi: secApi.length.toLocaleString() })]);
      }
      setLastLithBlock({ ...(Object.keys(secResults).length ? { sections: secResults, aboveLabel: aboveText } : {}), ...(exact ? { intervals: evalRows.filter((q) => "modelled" in q).map((q) => ({ hole_id: q.hole_id, from: q.row.from, to: q.row.to, logged: q.row.value, modelled: q.modelled })) } : {}), block: lbBlock, ...(clipTerrain ? { cutAtTerrain: clipTerrain.name || "terrain" } : {}), units: specs.map((sp) => ({ name: sp.meshName, label: sp.meshName, color: sp.color })), origin: { ...originRef.current }, when: new Date().toLocaleTimeString(), title: `${unitSpecs.length > 1 ? `stack ${unitSpecs.map((sp) => sp.meshName).join(" over ")}` : unitSpecs[0]?.label || unitSpecs[0]?.meshName || ""}${unitSpecs.length < specs.length ? `, ${specs.length - unitSpecs.length} fault(s)` : ""}`, structural: trendTool === "structural", /* #1554 — "stack" only for several units; a structure run offers no unit volumes */ matchedPct: chk.total ? Math.round((100 * chk.matched) / chk.total) : null });
      // TASKS.csv #679 — the trend's scales multiply to 1 (trendScales: iso / max * iso / int * iso / min), so a warped
      // cell has the volume of its real-space parallelepiped; dividing by the product keeps that true if it ever isn't
      const warpDet = anisotropy.enabled ? anisoScl.major * anisoScl.semiMajor * anisoScl.minor : 1;
      const loggedMetres = new Map(chk.units.map((u) => [u.unit, u.logged])); // #1189 — no logged metres: no volume to quote
      // #1684 — the overburden above its base reaches the top of the model box unless a terrain caps it: no volume to quote then
      const vols = unitVolumes(volBlock).filter((v) => v.name && !(Math.round(loggedMetres.get(v.name) ?? 1) === 0) && !(baseRun && !clipGround)).map((v) => ({ ...v, volume: v.volume / warpDet })); // #1029 — below the ground
      const pct = (a, b) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
      const fmtVol = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)} km³` : `${(v / 1e6).toFixed(1)} Mm³`);
      const perUnit = chk.units.map((u) => `${u.unit} ${pct(u.matched, u.logged)} of ${Math.round(u.logged)} m${u.mostOftenModelledAs !== undefined && u.matched < u.logged ? ` (otherwise mostly modelled as ${u.mostOftenModelledAs ?? (baseRun ? "below its base" : "above the modelled tops")})` : ""}`).join("; "); // baseRun: #1684
      const worst = chk.holes.filter((h) => h.logged >= 5).slice(0, 3).map((h) => `${h.hole_id} ${pct(h.matched, h.logged)}`).join(", ");
      // TASKS.csv #1190 — a trend tripled a "unit volume" because the padded box of the stretched points is a much bigger volume: say so, so two runs are not compared by it
      if (anisotropy.enabled) {
        // TASKS.csv #2617 (re-test of #2528) — the box the same data get WITHOUT a trend, by the same padding rules as that branch (reachPad
        // across, verticalPad on the drilled column), not the bare data span no run uses ('0.0 km³'); both in Mm³ under 1 km³, with the direction
        const volNT = reachLib?.noTrendBoxVolume ? reachLib.noTrendBoxVolume(extentApiPts, { column: colHit /* real space; colR may be the warped range */, reachM: reachOf.size ? Math.max(...[...reachOf.values()].map((f) => f.margin)) : 0, capM: MODEL_EXTENT_PAD_M })
          : (() => { const r = (k) => { const v = extentApiPts.map((q) => q[k]); return Math.max(1, Math.max(...v) - Math.min(...v)); }; const pp = (sp) => Math.min(sp * 0.15, MODEL_EXTENT_PAD_M); return ["x", "y", "z"].reduce((acc, k) => acc * (r(k) + 2 * pp(r(k))), 1); })(); // no contact reach: the plain 15 % pad
        const volT = ((extent[1] - extent[0]) * (extent[3] - extent[2]) * (extent[5] - extent[4])) / warpDet;
        setNotices((p) => [...p, notice(volT >= volNT ? "With a trend the model box is about {a}, larger than the {b} the same data get without one (the same padding rules), so a unit's volume cannot be compared between the two runs." : "With a trend the model box is about {a}, smaller than the {b} the same data get without one (the same padding rules), so a unit's volume cannot be compared between the two runs.", { a: fmtVol(volT), b: fmtVol(volNT) })]);
      }
      if (chk.total > 0) setNotices((p) => [...p, notice("Model check{v}: the model puts {v2} of {v3} logged metres of the modelled units in the unit they were logged as. By unit: {perUnit}.{v4}{v5} Unit volumes inside the model box ({v6}) are bounded by that box and are not resource figures.{v8}{v7}", { v8: clipGround ? (clipGround.kind === "terrain" ? tr(" They and the lithology block are cut at the terrain ({cells} cells above the ground left out).", { cells: airCut.toLocaleString() }) : tr(" They and the lithology block are cut at the collar surface ({cells} cells above it left out).", { cells: airCut.toLocaleString() })) : "" /* #2470 */, v: exact ? tr(" (each interval's midpoint evaluated exactly)") : tr(" (read from the {modelResolution}³ block)", { modelResolution }), v2: pct(chk.matched, chk.total), v3: Math.round(chk.total), perUnit, v4: worst ? tr(" Least reproduced holes: {worst}.", { worst }) : "", v5: chk.outside ? tr(" {v} m fell outside the model extent.", { v: Math.round(chk.outside) }) : "", v6: vols.length ? vols.map((v) => `${v.name} ${fmtVol(v.volume)}`).join(", ") : baseRun ? tr("none: {unit} lies above its base and nothing caps it without a terrain", { unit: specs[0].meshName }) : tr("none"), v7: anisotropy.enabled ? tr(" With the {trendWord} \"{v}\" the model is solved in a stretched frame: the check and volumes account for it, and \"Add as block model\" gets the model resampled onto a real-space grid.", { trendWord, v: anisotropy.params?.trend || tr("unnamed") }) : "" })]);
      { const bn = baselineNotice(chk); if (bn) setNotices((p) => [...p, bn]); } // #1687 — what a trivial model would score
      // TASKS.csv #758 — the predicted geological map, and how it compares with the mapped geology
      if (mapGrid && exact && addRaster) {
        const [bx0, bx1, by0, by1, bz0, bz1] = res.block.extent;
        const off = evalRows.length;
        // id 1 (label null) is the ground ABOVE the youngest modelled top: younger rock this model does not include -
        // real ground, drawn in grey and named, not left blank (found live on Harry: 56% of the nodes looked empty)
        const aboveLabel = aboveText; // #817
        let outsideBox = 0;
        const mapUnits = mapApi.map((q, k) => {
          if (!(q.x >= bx0 && q.x <= bx1 && q.y >= by0 && q.y <= by1 && q.z >= bz0 && q.z <= bz1)) { outsideBox++; return null; }
          const id = res.evaluated[off + k];
          return id <= 1 ? aboveLabel : res.block.labels[id - 1] ?? null;
        });
        const colorOfUnit = new Map([...specs.map((sp) => [sp.meshName, sp.color || colorForLithology(sp.meshName)]), [aboveLabel, aboveUnit ? colorForLithology(aboveUnit) : "#d4d4d4"]]);
        const px = unitRaster(mapGrid, mapUnits, (u) => colorOfUnit.get(u) || colorForLithology(u));
        const cv = document.createElement("canvas");
        cv.width = mapGrid.nx; cv.height = mapGrid.ny;
        cv.getContext("2d").putImageData(new ImageData(px, mapGrid.nx, mapGrid.ny), 0, 0);
        const covered = mapUnits.filter((u) => u != null && (aboveUnit || u !== aboveLabel)).length;
        const aboveN = mapUnits.filter((u) => u === aboveLabel).length;
        const agreements = (mapLayers || []).filter((l) => l.styleField && l.geomType !== "line" && l.geomType !== "polyline" && l.geomType !== "point") // #817: the importer names line layers "polyline"
          .map((l) => mapAgreement(mapGrid, mapUnits, l, [...unitSpecs.map((sp) => sp.meshName), ...(aboveUnit ? [aboveUnit] : [])])).filter((a) => a && a.mappedNodes); // #817: faults are not map units
        const cellM = Math.round((mapGrid.dx + mapGrid.dy) / 2);
        const mapName = `Predicted geology (${[...(aboveUnit ? [aboveUnit] : []), ...unitSpecs.map((sp) => sp.meshName)].join(" over ")})`; // #817: units only
        (rasters || []).filter((r) => r.name === mapName && r.provenance?.tool?.includes("#758")).forEach((r) => removeRaster?.(r.id)); // a rerun replaces it
        addRaster({
          name: mapName, bbox: mapGrid.bbox, dataUrl: cv.toDataURL("image/png"), drapeMode: "terrain", opacity: 0.8,
          provenance: { tool: "GemPy implicit model evaluated on the terrain" /* TASKS.csv #758 */, cellM, nodes: mapGrid.nodes.length, nodesWithAUnit: covered, nodesAboveYoungestTop: aboveN, nodesOutsideModel: outsideBox, units: specs.map((sp) => sp.meshName), terrain: mapTerrain.name || "terrain",
            note: tr("the model's unit at the ground surface, evaluated exactly at each node in the same solve; grey where the ground is above the youngest modelled top; blank outside the model box"), agreement: agreements.map((a) => ({ layer: a.layer, field: a.field, overall: a.overall, units: a.units.map((u) => ({ unit: u.unit, pct: u.pct, nodes: u.nodes })) })) },
        });
        const pctTxt = (v) => (v == null ? "—" : `${Math.round(100 * v)}%`);
        const agreeTxt = agreements.length
          ? agreements.map((a) => ` Against the mapped geology "${a.layer}" (field ${a.field}): the model agrees on ${pctTxt(a.overall)} of the mapped ground where it has a unit of the same name — ${a.units.filter((u) => u.inModel).slice(0, 6).map((u) => `${u.unit} ${pctTxt(u.pct)}${u.pct != null && u.pct < 0.5 && u.modelledAs[0] ? ` (mostly modelled as ${u.modelledAs[0].unit})` : ""}`).join(", ") || "no mapped unit shares a name with a model unit"}.${a.unmatchedMapUnits.length ? ` Mapped units with no model unit of that name (not scored): ${a.unmatchedMapUnits.slice(0, 6).join(", ")}${a.unmatchedMapUnits.length > 6 ? "…" : ""}.` : ""}`).join("")
          : " No mapped geology polygons with a unit field are loaded, so there is nothing to compare it with.";
        setNotices((p) => [...p, aboveUnit
          ? notice("Predicted geological map added to Maps / rasters (draped on the terrain): the model's unit at the ground surface, every {cellM} m over {nodes} terrain nodes: {covered} in a modelled unit ({aboveN} of them in {unit}, the youngest, above the top of {meshName}){v}.{agreeTxt}", { cellM, nodes: mapGrid.nodes.length.toLocaleString(), covered: covered.toLocaleString(), aboveN: aboveN.toLocaleString(), unit: aboveUnit, meshName: topSpec.meshName, v: outsideBox ? tr(", {outsideBox} outside the model box (blank)", { outsideBox: outsideBox.toLocaleString() }) : "", agreeTxt })
          : notice("Predicted geological map added to Maps / rasters (draped on the terrain): the model's unit at the ground surface, every {cellM} m over {nodes} terrain nodes: {covered} in a modelled unit, {aboveN} above the top of {meshName} (younger rock this model does not include, grey){v}.{agreeTxt} A model can match every hole and still contradict the outcrop — this is the check for that.", { cellM, nodes: mapGrid.nodes.length.toLocaleString(), covered: covered.toLocaleString(), aboveN: aboveN.toLocaleString(), meshName: topSpec.meshName, v: outsideBox ? tr(", {outsideBox} outside the model box (blank)", { outsideBox: outsideBox.toLocaleString() }) : "", agreeTxt })]);
      } else if (!mapTerrain && exact) {
        setNotices((p) => [...p, notice("No terrain is loaded, so no predicted geological map was made (it needs the ground surface to evaluate the model on).")]);
      }
    }
    if (newMeshes.length) {
      // TASKS.csv #274 — the effective potential-field range is now part of what a run reports. Without
      // it, two runs of the same job that came back looking different had no visible reason why.
      const rangeNote = res.rangeUsed != null
        ? tr(" Interpolation: {v}, potential-field range {rangeUsed}{v2}.", { v: specs.length > 1 ? (stackOpts.packages > 1 ? tr("{n} conformable packages, each truncating the ones below", { n: stackOpts.packages }) : relation === "erode" ? tr("erosional (each unit truncates those below)") : tr("conformable (one shared field: units keep a thickness everywhere)")) : tr("single surface"), rangeUsed: res.rangeUsed.toFixed(3), v2: res.rangeDefault != null && Math.abs(res.rangeUsed - res.rangeDefault) > 1e-9 ? tr(" (GemPy's own default {rangeDefault} x {rangeMultiplier})", { rangeDefault: res.rangeDefault.toFixed(3), rangeMultiplier }) : tr(" (GemPy's own default)") })
        : "";
      // TASKS.csv #1337 — which holes a code's contacts come from, so a hole nobody meant to include is seen. Here, not where the
      // points are gathered: only the last few notices are on screen once a run ends.
      specs.filter((s) => s.contactHoles?.length).forEach((s) => setNotices((p) => [...p, notice("{unitName}: contacts come from these holes: {list}.", { unitName: s.meshName, list: [...s.contactHoles.slice(0, 30).map(([h, n]) => `${h} (${n})`), ...(s.contactHoles.length > 30 ? [tr("+{n} more", { n: s.contactHoles.length - 30 })] : [])].join(", ") })]));
      setNotices((p) => [...p, notice(newMeshes.length > 1 ? "Added {newMeshes} surfaces: {v2}.{rangeNote}" : "Added {newMeshes} surface: {v2}.{rangeNote}", { newMeshes: newMeshes.length, v2: specs.filter((s) => byName[s.meshName]?.vertices?.length).map((s) => `"${s.label}"`).join(", "), rangeNote })]);
      // Fit the camera to all newly-created meshes together (not just one) — without this, a
      // successful run can be visually indistinguishable from a silent failure: the mesh is added to
      // the scene but the camera doesn't move, so unless it happens to land inside the current view
      // the user sees nothing change and assumes the button did nothing.
      const box = new THREE.Box3();
      newMeshes.forEach((m) => box.expandByObject(m));
      fitBox(box);
    }
    // ---------- TASKS.csv #52 (a) — spread across N realisations ----------
    // Re-runs the SAME model (same extent, resolution, range, relation, anisotropy) with its interface
    // points and orientations perturbed by the sigmas the user typed, and measures, for every vertex of
    // the base surface, how far each realisation's surface lies from it. See lib/surfaceSpread.js's
    // header for why this is a sensitivity spread and not a "confidence": no posterior, no invented prior.
    // Budgeted by the MEASURED cost of the base run just made, not by an assumption — #52's first gate.
    if (stackOpts.ensemble && ensembleBase) {
      const ens = stackOpts.ensemble;
      const { spec: bSpec, sceneVerts: bVerts } = ensembleBase;
      // ADAPTIVE, not a cap computed up front. The first version divided the budget by the base run's
      // time, but the base run is the COLD one: measured on the Harry sample (DACT, 88 points, 317
      // orientations, 36^3) it took 120.6 s against 92.7 s for each warm realisation after it, so an
      // up-front cap under-ran the budget by ~25%. Now each realisation starts only if the average so far
      // (the base run's time until there is one) says it will finish inside the budget.
      const n = Math.max(1, Math.floor(ens.n));
      const estPerRun = Math.max(0.2, baseSolveSeconds);
      if (ens.budgetS < 3 * estPerRun * 0.7) {
        setNotices((p) => [...p, notice("Sensitivity not run: the base run took {estPerRun} s, so a {budgetS} s budget cannot fit even 3 realizations, and a spread from 1-2 runs means nothing. Raise the time budget, or lower the model resolution.", { estPerRun: estPerRun.toFixed(1), budgetS: ens.budgetS })]);
        return;
      }
      setNotices((p) => [...p, notice("Sensitivity: running up to {n} realizations of \"{label}\" within {budgetS} s (the base run took {estPerRun} s; the first run is usually the slowest).", { n, label: ensembleBase.spec.label, budgetS: ens.budgetS, estPerRun: estPerRun.toFixed(1) })]);
      const seed = Number.isFinite(ens.seed) ? ens.seed : (Date.now() % 2147483647);
      const rng = makeRng(seed);
      const ac = new AbortController();
      modelAbortControllerRef.current = ac;
      setImplicitBusy(true);
      // Only vertices that belong to at least one triangle are ON the surface. GemPy's vertex list also
      // carries orphans no face references (and domain clipping leaves more), and a distance measured
      // from an orphan is meaningless. That was a real bug, found by a control run: with both sigmas
      // at 1e-9 (inputs identical to far below float precision) the median and p90 spread were 0.0 m,
      // but the MAX was 85 m. Traced to Harry DACT's vertex 4 — zero incident faces, identical in every
      // realisation, 85 m from the surface in all of them. Excluded, the control run is clean.
      const onSurface = new Uint8Array(bVerts.length);
      ensembleBase.faces.forEach((f) => { onSurface[f[0]] = 1; onSurface[f[1]] = 1; onSurface[f[2]] = 1; });
      const measured = [];
      for (let v = 0; v < bVerts.length; v++) if (onSurface[v]) measured.push(v);
      const basePts = measured.map((v) => [bVerts[v].x, bVerts[v].y, bVerts[v].z]);
      const ext = extent;
      const maxDist = Math.hypot(ext[1] - ext[0], ext[3] - ext[2], ext[5] - ext[4]) * 0.25;
      const distances = [];
      let failed = 0;
      let counter = null, blockMeta = null, airCells = null; // TASKS.csv #757 (airCells: #1029) — each realisation's lithology block, counted per cell
      const tStart = performance.now();
      let budgetStopped = false;
      for (let i = 0; i < n; i++) {
        if (ac.signal.aborted) break;
        const spent = (performance.now() - tStart) / 1000;
        const avg = i ? spent / i : estPerRun;
        if (spent + avg > ens.budgetS) { budgetStopped = true; break; }
        setTaskProgress?.({ label: `Sensitivity ${i + 1}/${n}: ${bSpec.label}`, pct: Math.round(4 + (92 * i) / n), onCancel: () => ac.abort("user-cancelled") });
        const perturbed = {
          ...bSpec,
          points: perturbPoints(bSpec.points, ens.sigmaPos, rng),
          orientations: bSpec.orientations.map((o) => perturbOrientation(o, ens.sigmaDeg, rng)),
        };
        const w = smoothForSidecar(warpForSidecar(perturbed)); // #761
        const r = await pythonImplicitModel(
          ext,
          [{ name: bSpec.meshName, points: w.points, orientations: w.orientations }],
          { resolution: resolution, relation, rangeMultiplier: rangeMultiplier || 0, signal: ac.signal, returnBlock: true, surfaceDetail }, // returnBlock: #757; surfaceDetail: #1055 — the base mesh's triangulation, or the spread mixes in mesh-level difference
        );
        if (!r.ok) { if (r.cancelled) break; failed++; continue; }
        if (r.block?.ids?.length) { // #757
          if (!counter) {
            counter = makeEnsembleCounter(r.block.ids.length, r.block.labels.length); blockMeta = r.block;
            // TASKS.csv #1029 — the cells above the ground (same box every realisation), left out of P(), entropy and the volumes
            if (clipGround) { // #2470
              const o = originRef.current, real = (q) => ({ x: q.x + o.x, y: q.y + o.y, z: q.z + o.z });
              const toWorld = anisotropy.enabled ? ((u) => (q) => real(anisoWarpPoint(q, anisoCenter, anisoBasis, u)))(invScales(anisoScl)) : real;
              const cap = capBlockAtGround({ ...r.block, ids: new Int32Array(r.block.ids.length).fill(1) }, clipGround.at, toWorld);
              airCells = [];
              cap.block.ids.forEach((id, i) => { if (id === 0) airCells.push(i); });
            }
          }
          let ids = r.block.ids;
          if (airCells?.length) { ids = Int32Array.from(ids); for (const i of airCells) ids[i] = 0; }
          counter.add(ids);
        }
        const out = (r.surfaces || []).find((x) => x.name === bSpec.meshName);
        if (!out?.vertices?.length) { distances.push(basePts.map(() => Infinity)); continue; }
        const rVerts = unwarpVerts(out.vertices).map(apiToScene).map((v) => [v.x, v.y, v.z]);
        distances.push(pointsToMeshDistance(basePts, rVerts, out.faces, { maxDist }));
      }
      const cancelled = ac.signal.aborted;
      setImplicitBusy(false);
      modelAbortControllerRef.current = null;
      setTaskProgress?.(null);
      const elapsed = (performance.now() - tStart) / 1000;
      if (distances.length < 3) {
        setNotices((p) => [...p, notice("Sensitivity for \"{label}\" {v} after {distances} usable realization(s){v2} — at least 3 are needed, so no spread was produced.", { label: bSpec.label, v: cancelled ? tr("cancelled") : tr("stopped"), distances: distances.length, v2: failed ? tr(" ({failed} failed in GemPy)", { failed }) : "" })]);
        return;
      }
      const summary = spreadSummary(distances); // over the ON-SURFACE vertices only (see `measured`)
      const { stats } = summary;
      // Scatter back onto the full vertex buffer so it stays aligned with the mesh; orphans get null.
      const rms = new Array(bVerts.length).fill(null);
      const missing = new Uint16Array(bVerts.length);
      measured.forEach((v, k) => { rms[v] = summary.rms[k]; missing[v] = summary.missing[k]; });
      // Colour scale runs to the 90th percentile so one extreme corner doesn't wash out the rest — but
      // never below the position sigma itself (or 0.1 m): a control run with sigma ~0 has a p90 of ~0,
      // and a scale that tops out at 0 m painted every vertex that moved at all as "moves a lot".
      const scaleMax = Math.max(stats.p90 || 0, ens.sigmaPos || 0, 0.1);
      // The share of the surface that moved further than the contacts themselves were moved — i.e. where
      // the model AMPLIFIES the stated input uncertainty rather than damping it. Typically far from data.
      const ampThreshold = Math.max(ens.sigmaPos || 0, 0.01);
      let amplified = 0, counted = 0;
      for (let v = 0; v < rms.length; v++) { if (rms[v] == null || missing[v]) continue; counted++; if (rms[v] > ampThreshold) amplified++; }
      const amplifiedPct = counted ? (100 * amplified) / counted : 0;
      const geo = ensembleBase.mesh.geometry.clone();
      const colors = new Float32Array(rms.length * 3);
      for (let v = 0; v < rms.length; v++) {
        const c = rms[v] == null ? [1, 1, 1] : missing[v] ? SPREAD_NOT_REPRODUCED : spreadColor(rms[v] / scaleMax);
        colors[v * 3] = c[0]; colors[v * 3 + 1] = c[1]; colors[v * 3 + 2] = c[2];
      }
      geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
      const smesh = new THREE.Mesh(geo, mat);
      const fmt = (v) => (v == null ? "n/a" : v < 10 ? v.toFixed(1) : Math.round(v).toString());
      const perPick = bSpec.points.filter((q) => Number.isFinite(q.sigma)).length;
      const name = `Spread: ${bSpec.label} (${distances.length} realizations)`;
      smesh.userData = { tip: `${name}\nRMS distance each realization's surface lies from this one, under the input sigmas you entered\nmedian ${fmt(stats.median)} m, 90th pct ${fmt(stats.p90)} m` };
      implicitGroupRef.current?.add(smesh);
      ensembleBase.mesh.visible = false; // the spread copy sits exactly on it; showing both z-fights
      const sid = `impl_${Date.now()}_spread`;
      implicitMeshesRef.current[sid] = smesh;
      setImplicitSurfaces((p) => [
        ...p.map((x) => (x.id === ensembleBase.id ? { ...x, visible: false } : x)),
        {
          id: sid, name, visible: true, vertexCount: rms.length, faceCount: ensembleBase.faces.length,
          type: "sensitivity", relationships: [],
          // Per-vertex RMS spread (0.1 m), aligned with the mesh's vertex order — stored beside the mesh so
          // the colouring survives a save/reload (the hydrate effect rebuilds it from this).
          spread: rms.map((v, k) => (v == null || missing[k] ? null : Math.round(v * 10) / 10)),
          spreadScaleMax: scaleMax,
          params: {
            tool: "sensitivity spread (GemPy realizations)",
            of: bSpec.label, realisations: distances.length, realisationsRequested: ens.n, failedRealisations: failed, cancelled, stoppedByTimeBudget: budgetStopped, timeBudgetS: ens.budgetS, baseRunSeconds: +baseSolveSeconds.toFixed(1),
            pointSigmaM: ens.sigmaPos, orientationSigmaDeg: ens.sigmaDeg, perPickSigmas: perPick,
            seed, secondsPerRealisation: +(elapsed / Math.max(1, distances.length + failed)).toFixed(2),
            spreadMedianM: stats.median, spreadP90M: stats.p90, spreadMaxM: stats.max, verticesNotReproduced: stats.verticesNotReproduced,
            pctMovedMoreThanPositionSigma: +amplifiedPct.toFixed(1),
            measure: "per-vertex RMS of the distance from this surface to each realization's surface",
            generatedAt: new Date().toISOString(),
          },
        },
      ]);
      setNotices((p) => [...p, notice("Spread for \"{label}\": {distances} realizations{v}{v2}, {v3} s each. With the contacts moved by ±{sigmaPos} m{v4} and orientations by ±{sigmaDeg}°, the surface moved a median {v5} m, 90th percentile {v6} m, max {v7} m; {v8}% of it moved further than the contacts themselves were moved ({ampThreshold} m). Colour: pale = barely moves, dark = moves {v9} m or more{v10}. This is the spread under the uncertainty you entered — not a probability, and only as meaningful as those sigmas.", { label: bSpec.label, distances: distances.length, v: cancelled ? tr(" (cancelled early)") : budgetStopped ? tr(" (time budget reached before {n})", { n }) : "", v2: failed ? tr(", {failed} failed in GemPy", { failed }) : "", v3: (elapsed / Math.max(1, distances.length)).toFixed(1), sigmaPos: ens.sigmaPos, v4: perPick ? tr(" ({perPick} pick(s) using their own uncertainty_m)", { perPick }) : "", sigmaDeg: ens.sigmaDeg, v5: fmt(stats.median), v6: fmt(stats.p90), v7: fmt(stats.max), v8: amplifiedPct < 0.05 && amplified > 0 ? "<0.1" : amplifiedPct.toFixed(1), ampThreshold, v9: fmt(scaleMax), v10: stats.verticesNotReproduced ? tr("; grey = {verticesNotReproduced} vertices where at least one realization produced no surface nearby", { verticesNotReproduced: stats.verticesNotReproduced }) : "" })]);

      // ---------- TASKS.csv #757 — where the GEOLOGY is uncertain: share of realisations with the unit per cell, and the
      // information entropy (0 = every realisation agrees), as block models; plus the unit's volume in every realisation
      if (counter && counter.runs >= 3 && addVoxelModel) {
        const er = counter.result();
        const [bx0, bx1, by0, by1, bz0, bz1] = blockMeta.extent;
        const [bnx, bny, bnz] = blockMeta.resolution;
        const cellVol = ((bx1 - bx0) / bnx) * ((by1 - by0) / bny) * ((bz1 - bz0) / bnz);
        const warpDetE = anisotropy.enabled ? anisoScl.major * anisoScl.semiMajor * anisoScl.minor : 1;
        // With a trend the blocks are in the warped frame: read them at the centres of an axis-aligned real-space grid
        // (the same resampling #679 uses for the block model), through an index map, so every value keeps its cell
        let outExtent = blockMeta.extent, outRes = blockMeta.resolution, map = null;
        if (anisotropy.enabled) {
          const rx = minMax(extentApiPts.map((q) => q.x)), ry = minMax(extentApiPts.map((q) => q.y)), rz = minMax(extentApiPts.map((q) => q.z));
          const realExtent = [...pad(rx.min, rx.max), ...pad(ry.min, ry.max), ...pad(rz.min, rz.max)];
          const idx = Int32Array.from({ length: blockMeta.ids.length }, (_, i) => i + 1);
          const rs = resampleWarpedBlock({ ...blockMeta, ids: idx }, realExtent, (q) => anisoWarpPoint(q, anisoCenter, anisoBasis, anisoScl));
          outExtent = rs.extent; outRes = rs.resolution; map = rs.ids;
        }
        const o = originRef.current;
        const hMax = Math.log2(Math.max(2, blockMeta.labels.length));
        const common = { tool: "sensitivity ensemble (GemPy realizations), #757", of: bSpec.label, realisations: er.runs, pointSigmaM: ens.sigmaPos, orientationSigmaDeg: ens.sigmaDeg, seed,
          note: tr("Shares of realizations under the sigmas entered: a sensitivity ensemble, not a posterior probability."), generatedAt: new Date().toISOString() };
        const volLines = [];
        blockMeta.labels.forEach((label, k) => {
          if (label == null) return;
          const cells = gridValuesToCells(outExtent, outRes, er.prob[k], o, (v) => v > 0, map);
          if (cells.length) addVoxelModel({ name: `P(${label}): share of ${er.runs} realizations`, source: "gempy-ensemble", cells, min: 0, max: 1, colorMode: "continuous", stops: sequentialStops(0, 1), params: { ...common, value: `share of realizations in which the cell is ${label} (0-1)` } });
          const vols = er.volumesCells.map((per) => (per[k] * cellVol) / warpDetE);
          const q = (x) => quantile(vols, x);
          const fmtV = (v) => (!Number.isFinite(v) ? "n/a" /* #1114 — the quantile is NaN when empty */ : v >= 1e9 ? `${(v / 1e9).toFixed(2)} km³` : `${(v / 1e6).toFixed(1)} Mm³`);
          volLines.push(`${label} P10 ${fmtV(q(0.1))}, P50 ${fmtV(q(0.5))}, P90 ${fmtV(q(0.9))}`);
        });
        const hCells = gridValuesToCells(outExtent, outRes, er.entropy, o, (v) => v > 0, map);
        if (hCells.length) addVoxelModel({ name: `Entropy (bits): ${bSpec.label}, ${er.runs} realizations`, source: "gempy-ensemble", cells: hCells, min: 0, max: hMax, colorMode: "continuous", stops: sequentialStops(0, hMax), params: { ...common, value: `information entropy of the unit across realizations (0 = all agree, ${hMax.toFixed(2)} = maximal disagreement)` } });
        const uncertainShare = er.entropy.reduce((n, v) => n + (v > 0 ? 1 : 0), 0) / er.entropy.length;
        setNotices((p) => [...p, notice("Where the geology is uncertain ({runs} realizations): added \"P(...)\" (share of realizations with the unit, per cell) and \"Entropy\" block models; {v}% of the model box changes unit between realizations. Unit volume inside the box across realizations: {volLines}. Shares of realizations under the sigmas you entered, not probabilities in the strict sense.", { runs: er.runs, v: (100 * uncertainShare).toFixed(1), volLines: volLines.join("; ") })]);
      }
    }
  };

  // Thin single-surface wrapper for the three single-unit tools below.
  const runSurfaceModel = (spec, opts) => runSurfaceStack([spec], opts);

  // Shared by the single-unit litho tool and the stratigraphic stack tool below: gathers a unit's
  // interface points (litho interval tops across every hole) and an orientation (real structure
  // picks if available, an estimate from the points' own shape otherwise). Returns null (with a
  // notice) if there's nothing to model — callers decide whether that aborts the whole run (single
  // tool) or just skips that one unit (stack tool, which shouldn't fail the whole stack because one
  // unit had no data).
  // TASKS.csv #84 — builds the inspectable "boundary intercepts" table for the modal: every litho/alt
  // interval top, resolved to a real 3D position along its hole's desurveyed trace (same findOnTrace
  // used everywhere else — never a straight-hole assumption). Read-only/derived, not its own stored
  // list — see interceptId's comment for why.

  // TASKS.csv #176 — `target` is either a raw litho code string (original behavior, unchanged for
  // that case) or a lithology-group object {id, name, color, codes} from store.lithoGroups. Matt:
  // "sometimes a basalt can be logged as andesite in one hole, or a siltstone can be logged as
  // greywacke" — matching by exact string (`r.value === unitName`, the old code) meant two logging
  // conventions for one real unit produced two separate, incomplete surfaces. A group matches any
  // interval (and any drawn section contact) whose code is IN its code set, so every convention's
  // intervals feed ONE surface, named/colored by the group itself.
  // TASKS.csv #599 — a modelling-code target ({kind: "mcode", name}) takes its contacts from the coded runs:
  // only where the code starts directly below a younger stratigraphic unit (lib/modellingCodes.js), never at
  // a hole start, below an unlogged gap, below casing / overburden or below an intrusion / cross-cutting body
  // (#495). Roles default from the code (#496's old four-code table) and are set in the code list.
  const mcodeDefaultRole = (name) => groupMcodeRole(name, lithoGroups); // #1369: veins cross-cut, no recovery is ignored; #2052: a group from its codes
  const mcodeGroupOf = (v) => (lithoGroups || []).find((g) => (g.codes || []).includes(v))?.name || null;
  // TASKS.csv #1684 — a stack unit's role, whatever kind of target names it (the same rule the surface type uses below)
  const unitRoleOf = (target) => {
    if (!target) return null;
    if (typeof target === "object" && target.kind === "mcode") return codeInfo(modellingCodes, target.name, mcodeDefaultRole).role;
    if (typeof target === "object") { const roles = new Set((target.codes || []).map(roleForLithology)); return roles.size === 1 ? [...roles][0] : "stratigraphic"; }
    return roleForLithology(target);
  };
  // TASKS.csv #1684 (review #1645, Copley) — an overburden unit is modelled from its logged BASES (where it ends on a logged unit:
  // the one contact every hole shares), as "Base of OVB", not from its collars. `underOverburden`: in a stack, the unit directly
  // below the overburden takes the contacts under it as its tops (that contact IS the base of overburden); `extraBases` are the
  // overburden bases resting on OTHER units, added to that same top so it is the whole erosional surface.
  const gatherLithoSurfaceSpec = (target, traces, { silent = false, mapConstraint: mapC = null, pileOrder = null, underOverburden = false, extraBases = null } = {}) => {
    const isMcode = typeof target === "object" && target !== null && target.kind === "mcode";
    const isGroup = typeof target === "object" && target !== null && !isMcode;
    const unitName = isGroup || isMcode ? target.name : target;
    const codes = new Set(isGroup ? (target.codes || []) : [unitName]); // for an mcode: the code itself (drawn section contacts are tagged with it)
    // TASKS.csv #810 — a drawn section contact may be tagged with the group's own name as well as a member code
    const sectionTags = new Set([...codes, unitName]);
    // TASKS.csv #810 — Matt: "picking contacts in the 3d view and assinging a modelling code but also implicit modelling is
    // not following them". A raw-code or group target read only the logged code, so an interval re-coded in the
    // Modelling codes pane was ignored. Now an interval's OVERRIDE (only an explicit assignment, never the default
    // group mapping) decides: re-coded INTO this unit it counts, re-coded AWAY from it it does not. Without
    // assignments nothing changes.
    const assign = modellingCodes?.assign || {};
    const hasAssign = !isMcode && Object.keys(assign).length > 0;
    let assignedIn = 0, assignedOut = 0;
    const inUnit = (r) => (hasAssign ? inTargetUnit(r, codes, unitName, assign) : codes.has(r.value));
    const domain = domains.find((d) => d.id === modelDomainId);
    const points = [];
    let mcodeInfo = null, mcodeLogged = null;
    // TASKS.csv #354 — only real tops: a row whose interval above (same hole) is also one of `codes`
    // continues the unit. For a lithology GROUP that also drops the internal AND/BAS boundaries between
    // member codes, which are not contacts of the grouped unit either.
    // #810 — with assignments, "the row above is the same unit" must use the same rule, so index in / out tokens
    const IN = "\u0000in", idxRows = hasAssign ? (layers.litho || []).map((r) => ({ hole_id: r.hole_id, from: r.from, to: r.to, value: inUnit(r) ? IN : "" })) : layers.litho;
    const contCodes = hasAssign ? new Set([IN]) : codes;
    const litEnds = intervalEndIndex(idxRows);
    const litStarts = intervalStartIndex(idxRows); // #569 — for up-holes
    let splitsSkipped = 0, upHolePicks = 0, belowRoleSkipped = 0, underOvbSkipped = 0; // underOvbSkipped: #1684
    // TASKS.csv #2527 (review #2486, WA lithium) — a raw code's interval with nothing logged above it is no contact: at the hole's first logged
    // depth it is the collar (bench holes collared in pegmatite: 180 of 254 'Top of P'), after an unlogged start or a gap it is unknown. The
    // Modelling-codes branch (topsForCode) and the Explicit surface tool already left them out; this branch took every start.
    let holeStartSkipped = 0, gapSkipped = 0;
    const firstFrom = new Map();
    for (const r of layers.litho || []) { const f = Number(r.from); if (r.hole_id != null && Number.isFinite(f) && !(firstFrom.get(r.hole_id) <= f)) firstFrom.set(r.hole_id, f); }
    const isOverburdenUnit = unitRoleOf(target) === "overburden"; // #1684
    // #1367 — the logged codes around each depth, for the roles of what sits right above an interval (raw values, not IN tokens)
    const rawEnds = isMcode ? null : intervalEndIndex(layers.litho), rawStarts = isMcode ? null : intervalStartIndex(layers.litho);
    const pushBase = (b, byHole) => { // #1684 — one overburden base as an interface point
      const t = byHole.get(b.hole_id);
      if (!t || excludedIntercepts.includes(interceptId("litho", b.row)) || !interceptInActiveSet(interceptId("litho", b.row))) return false;
      const p = findOnTrace(t.pts, b.md);
      if (!p || (domain && !pointInDomain(p, domain, implicitMeshesRef.current))) return false;
      const api = sceneToApi(p);
      if (softIntercepts.includes(interceptId("litho", b.row))) api.nugget = SOFT_NUGGET;
      api.srcCode = b.row.value; api.hole_id = t.hole_id; api.contactMd = b.md;
      points.push(api);
      return true;
    };
    if (isOverburdenUnit) {
      // #1684 — the base of the overburden: where it ends on a logged unit, in every hole
      const runs = codedRuns(layers.litho, modellingCodes, mcodeGroupOf);
      const mine = (run) => run.code === unitName || codes.has(run.code) || run.rows.every((r) => inUnit(r));
      const { bases, skipped: bs } = overburdenBases(runs, modellingCodes, mcodeDefaultRole, mine);
      const byHole = new Map(traces.map((t) => [t.hole_id, t]));
      let used = 0;
      bases.forEach((b) => { if (pushBase(b, byHole)) used++; });
      if (isMcode) { mcodeInfo = codeInfo(withPileOrder(modellingCodes, pileOrder), unitName, mcodeDefaultRole); mcodeLogged = new Set(runs.filter(mine).flatMap((x) => x.rows.map((r) => r.value))); }
      if (!silent || bs.holeEnd) setNotices((p) => [...p, notice("Base of {unitName}: {n} contact(s) where it ends on a logged unit ({below}). Its top is the ground at the collars and is not modelled.{v}", { unitName, n: used, below: [...new Set(bases.map((b) => b.below))].join(", ") || "—", v: bs.holeEnd ? tr(" {k} hole(s) end inside it or have an unlogged gap under it: no base there.", { k: bs.holeEnd }) : "" })]);
    }
    if (isMcode && !isOverburdenUnit) {
      // a stack's own order is the pile order for codes the code list hasn't placed
      const mc = withPileOrder(modellingCodes, pileOrder); // roles of every code kept (the first version dropped unplaced codes' roles)
      const runs = codedRuns(layers.litho, mc, mcodeGroupOf);
      const { tops, skipped } = topsForCode(runs, unitName, mc, mcodeDefaultRole, { underOverburden }); // underOverburden: #1684
      mcodeInfo = codeInfo(mc, unitName, mcodeDefaultRole);
      mcodeLogged = new Set(runs.filter((x) => x.code === unitName).flatMap((x) => x.rows.map((r) => r.value)));
      const byHole = new Map(traces.map((t) => [t.hole_id, t]));
      tops.forEach((run) => {
        const r = run.rows[0], t = byHole.get(run.hole_id);
        if (!t || excludedIntercepts.includes(interceptId("litho", r)) || !interceptInActiveSet(interceptId("litho", r))) return;
        const p = findOnTrace(t.pts, run.from);
        if (!p || (domain && !pointInDomain(p, domain, implicitMeshesRef.current))) return;
        const api = sceneToApi(p);
        if (softIntercepts.includes(interceptId("litho", r))) api.nugget = SOFT_NUGGET;
        api.srcCode = r.value;
        api.hole_id = t.hole_id; // #762 — named in the pick check
        api.contactMd = run.from; // #1684 — so a #1309 unconformity can take the contact
        const pickSigma = r.uncertainty_m == null || r.uncertainty_m === "" ? NaN : Number(r.uncertainty_m);
        if (Number.isFinite(pickSigma) && pickSigma >= 0) api.sigma = pickSigma;
        points.push(api);
      });
      const why = [skipped.belowRole ? `${skipped.belowRole} below casing or an intrusion / cross-cutting unit` : null, skipped.holeStart ? `${skipped.holeStart} at a hole start` : null,
        skipped.gap ? `${skipped.gap} below an unlogged gap` : null, skipped.olderAbove ? `${skipped.olderAbove} below an OLDER unit (overturned, repeated or up-hole)` : null].filter(Boolean);
      underOvbSkipped = skipped.underOverburden; // #1684: said below, with the route to that surface
      if (!silent || why.length) setNotices((p) => [...p, notice("{unitName}: {tops} contact(s) where it starts below a younger stratigraphic unit.{v}", { unitName, tops: tops.length, v: why.length ? tr(" Not used as contacts: {why}.", { why: why.join("; ") }) : "" })]);
    }
    if (!isMcode && !isOverburdenUnit) traces.forEach((t) => {
      const zAt = (md) => findOnTrace(t.pts, md)?.y; // scene y = elevation
      (rowsByHole(layers.litho).get(t.hole_id) || []).filter((r) => !isNaN(r.from)).forEach((r) => { // #2906 — the hole's rows, not a scan of the whole log per hole
        const isIn = inUnit(r);
        if (hasAssign && isIn !== codes.has(r.value)) { if (isIn) assignedIn++; else assignedOut++; }
        if (!isIn) return;
        // TASKS.csv #569 — the upper contact is at `to` in a rising (up-hole) interval
        const top = upperContactOf(r, zAt, { startIndex: litStarts, endIndex: litEnds, codes: contCodes });
        if (top.continues) { splitsSkipped++; return; }
        // #1367 — under a fault, breccia, vein, dyke, no recovery or casing the start is not a top (the roles of Modelling codes)
        const aboveVals = top.upHole ? rawStarts.get(depthKey(r.hole_id, r.to)) : rawEnds.get(depthKey(r.hole_id, r.from));
        if (!top.upHole && !(aboveVals && aboveVals.length)) { if (Number(r.from) <= (firstFrom.get(r.hole_id) ?? Infinity) + 1e-6) holeStartSkipped++; else gapSkipped++; return; } // #2527
        if (startsBelowNonUnit(aboveVals, modellingCodes, mcodeGroupOf, mcodeDefaultRole, { underOverburden })) { if (startsBelowOverburden(aboveVals, modellingCodes, mcodeGroupOf, mcodeDefaultRole)) underOvbSkipped++; else belowRoleSkipped++; return; } // #1684
        // TASKS.csv #84 — a boundary intercept the user has explicitly reviewed and excluded (via the
        // Boundary intercepts table) never feeds a modelling run, same as if the row didn't exist.
        if (excludedIntercepts.includes(interceptId("litho", r))) return;
        // TASKS.csv #52 (c) — and, when a named intercept set is active, only the picks IN it. This is
        // what lets one repeated unit be modelled as the several surfaces it really is (#61): the upper
        // basalt and the lower basalt are the same logged code, so without this every pick of that code
        // across the property is forced onto one surface no matter how many times the unit repeats.
        if (!interceptInActiveSet(interceptId("litho", r))) return;
        const p = findOnTrace(t.pts, top.md);
        if (p && (!domain || pointInDomain(p, domain, implicitMeshesRef.current))) {
          if (top.upHole) upHolePicks++;
          const api = sceneToApi(p);
          if (softIntercepts.includes(interceptId("litho", r))) api.nugget = SOFT_NUGGET;
          // TASKS.csv #275 — which logged code this point came from, so the group coherence check below
          // can say WHICH codes make up each spatial cluster. Rides along on the point object the same
          // way #88's nugget does; the sidecar's pydantic models ignore fields they don't declare.
          api.srcCode = r.value;
          api.hole_id = t.hole_id; // #762 — named in the pick check
          if (!top.upHole) api.contactMd = top.md; // #1030 — for the pinch-out rule (the sidecar ignores it)
          // TASKS.csv #52 (a) — a per-pick uncertainty the geologist recorded (an `uncertainty_m` column
          // mapped as an extra number field on import) overrides the run's global sigma for this pick in
          // a sensitivity run. Rides along like srcCode; the sidecar ignores fields it doesn't declare.
          const pickSigma = r.uncertainty_m == null || r.uncertainty_m === "" ? NaN : Number(r.uncertainty_m);
          if (Number.isFinite(pickSigma) && pickSigma >= 0) api.sigma = pickSigma;
          points.push(api);
        }
      });
    });
    // TASKS.csv #98 — drawn cross-section contacts as extra interface points. Each contact point
    // carries real-world x/y/z (store.jsx's `sections` comment); gatherLithoSurfaceSpec's own `points`
    // are origin-relative api coords (see sceneToApi above), so each contact point is converted the
    // same way here (subtract originRef.current) before joining the same array — from GemPy's side
    // these are indistinguishable from a litho-interval-derived point, which is exactly the point: a
    // contact tagged with the same unit name + "this is its upper contact" IS an interface point for
    // that surface, no separate matching step. Domain-filtered the same way litho points are, so a
    // contact drawn outside the active modelling domain doesn't leak into a run scoped to exclude it.
    if (holeStartSkipped || gapSkipped) setNotices((p) => [...p, notice("{unitName}: {a} interval start(s) at a hole start and {b} below an unlogged gap were not used as contacts: a top needs a logged unit above it.", { unitName, a: holeStartSkipped, b: gapSkipped })]); // #2527
    if (splitsSkipped && !silent) setNotices((p) => [...p, notice("{unitName}: {splitsSkipped} interval start(s) inside the unit (the row above in the same hole is the same {v}) were not used as contacts.", { unitName, splitsSkipped, v: isGroup ? tr("group") : tr("unit") })]);
    // TASKS.csv #1371 (review #1352) — one surface forced through several tops of the same hole (SSZ24-PAD34-001 gave 6, a 199 m
    // worst miss): the holes are named, inside a stack too, with what splits them
    { const per = new Map(); points.forEach((p) => { if (p.hole_id != null) per.set(p.hole_id, (per.get(p.hole_id) || 0) + 1); });
      const multi = [...per].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
      if (multi.length) setNotices((p) => [...p, notice("{unitName}: {n} hole(s) give more than one top of this one surface ({list}), so it is forced through all of them. A repeated unit is several surfaces: split it with Modelling codes (Auto-number or Connect) or an intercept set.", { unitName, n: multi.length, list: multi.slice(0, 6).map(([h, k]) => `${h} ${k}`).join(", ") + (multi.length > 6 ? ", …" : "") })]);
      // TASKS.csv #2234 (review #2174, WA gold) — a unit repeated in most of its holes (a steep monzonite: 57 holes, 75 near-vertical pick pairs) is
      // not a layer: one 'top of' surface folds back over itself; the closed-body and vein tools model it as a body
      if (per.size >= 4 && multi.length / per.size >= 0.25) setNotices((p) => [...p, notice("{unitName} repeats in {p} % of the holes that log it: it behaves like a steep body or a set of sheets, not one layer. A closed body (Modelling codes › Closed body) or Veins / dykes models it as a body.", { unitName, p: Math.round((100 * multi.length) / per.size) })]); }
    // #1367 — said inside a stack too: it changes which picks the surface follows
    if (belowRoleSkipped) setNotices((p) => [...p, notice("{unitName}: {n} interval start(s) right under a fault, breccia, vein, dyke, no-recovery or casing interval were not used as tops (roles in Modelling codes).", { unitName, n: belowRoleSkipped })]);
    // #1684 — the contact under overburden is the base of overburden, an erosional surface: not this unit's top on its own
    if (underOvbSkipped) setNotices((p) => [...p, notice("{unitName}: {n} interval start(s) directly under overburden were not used as its top: that contact is the base of overburden. Model the overburden unit itself for \"Base of …\", or put both in a Strat. stack, where the unit under the overburden takes it as its top.", { unitName, n: underOvbSkipped })]);
    if (extraBases?.length) { // #1684 — the stack: this unit's top is the base of overburden, wherever the overburden rests on another unit too
      const byHole = new Map(traces.map((t) => [t.hole_id, t]));
      let used = 0;
      extraBases.forEach((b) => { if (pushBase(b, byHole)) used++; });
      setNotices((p) => [...p, notice("Top of {unitName} is the base of {ovb} in this stack: {n} contact(s) where {ovb} rests on {others} were added to it, so it is the whole erosional surface.", { unitName, ovb: extraBases[0].above, n: used, others: [...new Set(extraBases.map((b) => b.below))].join(", ") })]);
    }
    if (upHolePicks && !silent) setNotices((p) => [...p, notice("{unitName}: {upHolePicks} contact(s) are in holes drilled upward there — the unit's top was taken at the interval's deeper end (to), which is the higher one.", { unitName, upHolePicks })]); // #569
    // #810 — always said, even inside a stack (silent): it changes which picks the surface follows
    if (assignedIn || assignedOut) setNotices((p) => [...p, notice("{unitName}: modelling-code assignments followed: {assignedIn} interval(s) re-coded into it used, {assignedOut} logged as it but re-coded to another code left out.", { unitName, assignedIn, assignedOut })]);
    let sectionContactCount = 0;
    // TASKS.csv #810 — drawn contacts left out because the option is off are counted and said, not dropped silently
    if (!includeSectionContacts) {
      const n = (sections || []).reduce((k, s) => k + (s.contacts || []).filter((c) => c.isUpperContact && c.target !== "explicit" && sectionTags.has(c.unit)).length, 0);
      if (n) setNotices((p) => [...p, notice("{unitName}: {n} drawn cross-section contact(s) were NOT used — tick \"Include drawn cross-section contacts\" to add them.", { unitName, n })]);
    }
    if (includeSectionContacts) {
      const o = originRef.current;
      (sections || []).forEach((s) => {
        (s.contacts || []).forEach((c) => {
          if (!sectionTags.has(c.unit) || !c.isUpperContact || c.target === "explicit") return; // target: #1193;  #176 — any member code's contact feeds the group (#810: or the group's name)
          (c.points || []).forEach((cp) => {
            const api = { x: cp.x - o.x, y: cp.y - o.y, z: cp.z - o.z, srcCode: c.unit }; // srcCode: TASKS.csv #275
            const scenePt = { x: api.x, y: api.z, z: -api.y }; // inverse of sceneToApi, for the domain check
            if (domain && !pointInDomain(scenePt, domain, implicitMeshesRef.current)) return;
            points.push(api);
            sectionContactCount++;
          });
        });
      });
      if (sectionContactCount) { // #810 — said inside a stack too
        setNotices((p) => [...p, notice("Included {sectionContactCount} drawn cross-section contact point(s) for \"{unitName}\" as extra interface points.", { sectionContactCount, unitName })]);
      }
    }

    // TASKS.csv #867 — Matt: an explicit surface whose Unit matches the unit being modelled "feeds it automatically": its
    // picks, its section lines and its lines drawn on section images are interface points of this unit's top. Only an
    // UPPER contact is this unit's top; a lower contact (the unit's base) is the top of whatever lies below, so it is
    // left out and said. Same api conversion and domain filter as the section contacts above.
    {
      const o = originRef.current;
      const { used, lower } = explicitInterfacePoints(explicitSurfaces || [], sections || [], sectionTags, { sectionLinesTaken: includeSectionContacts });
      const near = (a) => points.some((b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5 && Math.abs(a.z - b.z) < 0.5); // a pick on a logged top the run already has: coincident interface points can make the solve singular
      let outOfArea = 0; // #2535
      for (const u of used) {
        let n = 0;
        for (const wp of u.points) {
          if (modelArea === "checked" && wp.hole_id && visibleHoles?.[wp.hole_id] === false) { outOfArea++; continue; } // #2535 — a pick seeded on a hole outside the Model area
          const api = { x: wp.x - o.x, y: wp.y - o.y, z: wp.z - o.z, srcCode: `explicit:${u.name}` };
          if (domain && !pointInDomain({ x: api.x, y: api.z, z: -api.y }, domain, implicitMeshesRef.current)) continue;
          if (near(api)) continue;
          points.push(api); n++;
        }
        if (n) setNotices((p) => [...p, notice("Included {n} point(s) of the explicit surface \"{name}\" (its picks and lines) as interface points of \"{unitName}\".", { n, name: u.name, unitName })]);
      }
      for (const name of lower) setNotices((p) => [...p, notice("The explicit surface \"{name}\" is the LOWER contact of \"{unitName}\", so it was not used as its top.", { name, unitName })]);
      if (outOfArea) setNotices((p) => [...p, notice("Left out {n} explicit-surface pick(s) on holes outside the Model area (the holes checked in the Holes list).", { n: outOfArea })]);
    }

    // TASKS.csv #318 — a mapped surface contact as extra interface points: the contact trace draped on
    // the terrain, thinned to one point per ~25 m so a long, densely digitized trace doesn't outvote the
    // drillholes by sheer count. Same api-coordinate conversion and domain filter as the section
    // contacts above. The orientations that go with it are added further down.
    const mapPts = mapC ? mapContactWorldPoints(mapC, 25) : [];
    if (mapPts.length) {
      const o = originRef.current;
      let used = 0;
      mapPts.forEach(([x, y, z]) => {
        const api = { x: x - o.x, y: y - o.y, z: z - o.z, srcCode: "surface map" };
        if (domain && !pointInDomain({ x: api.x, y: api.z, z: -api.y }, domain, implicitMeshesRef.current)) return;
        points.push(api);
        used++;
      });
      if (!silent) setNotices((p) => [...p, notice("Included {used} point(s) along the mapped {units} contact as extra interface points for \"{unitName}\".", { used, units: mapC.units.join(" | "), unitName })]);
    }

    if (!points.length) {
      if (!silent) setNotices((p) => [...p, domain ? notice("No lithology intervals for \"{unitName}\" fall inside domain \"{name}\" — nothing to model.", { unitName, name: domain.name }) : notice("No lithology intervals found for \"{unitName}\" — nothing to model.", { unitName })]);
      return null;
    }
    // TASKS.csv #85 — drop control points too isolated (along the declared structural trend) to trust.
    const supportedPoints = filterBySearchSupport(points, searchEllipsoid);
    if (searchEllipsoid.enabled && supportedPoints.length < points.length && !silent) {
      setNotices((p) => [...p, notice("Search ellipsoid: excluded {v} of {points} \"{unitName}\" point(s) with fewer than {minSamples} neighbour(s) inside the ellipsoid.", { v: points.length - supportedPoints.length, points: points.length, unitName, minSamples: searchEllipsoid.minSamples })]);
    }
    if (!supportedPoints.length) {
      if (!silent) setNotices((p) => [...p, notice("All \"{unitName}\" points were excluded by the search ellipsoid — widen its ranges or lower the minimum neighbour count.", { unitName })]);
      return null;
    }
    points.length = 0; points.push(...supportedPoints);

    // TASKS.csv #275 — spatial-coherence check on a GROUP's merged codes (raw single codes are exempt:
    // one code modelled on its own producing two clusters is a genuine geological statement — the unit
    // crops out in two places — not a possible data-entry mistake). Link distance is 2.5x the median
    // collar spacing, i.e. "points in neighbouring holes count as connected": below the real hole
    // spacing everything is disconnected, far above it nothing ever is. Warn, never block — a merge
    // spanning two clusters can be perfectly correct, and only the geologist can say. What the notice
    // has to do is make sure the choice was actually SEEN.
    // The rule is deliberately NOT "the group's points form more than one cluster". That was the first
    // version and it was useless: measured against the real 37-hole Harry dataset, a SINGLE code's own
    // top picks (DACT, 88 points) already form 5 clusters at any sane link distance, because drilling
    // happens in fans and sections, not in a continuous blanket. Every group would have warned.
    // What actually distinguishes a mistaken merge is SEGREGATION: two of the group's codes that never
    // once turn up in the same cluster. On the same real data, every genuine code pair tested
    // (DACT+VCL, DACT+SED, CAS+MINT, FINT+VCL, DACT+VCL+FINT, CAS+BSL) has zero segregated pairs at both
    // 2.5x and 4x hole spacing, while a synthetic merge of DACT with a body 3 km away is caught with the
    // separation reported. Zero false positives on the real dataset was the bar this had to clear to be
    // worth showing at all.
    if (isGroup && points.length > 2) {
      const codeCounts = {};
      points.forEach((p) => { if (p.srcCode) codeCounts[p.srcCode] = (codeCounts[p.srcCode] || 0) + 1; });
      // A code contributing one or two intervals is noise (a single mis-logged run), not a second body.
      const liveCodes = Object.keys(codeCounts).filter((c) => codeCounts[c] >= 3);
      if (liveCodes.length > 1) {
        const linkDist = Math.max(25, (medianCollarSpacing(collars) || 60) * 2.5);
        const clusters = spatialClusters(points, linkDist);
        const weightedCentroid = (cs) => {
          const n = cs.reduce((s, c) => s + c.size, 0) || 1;
          return { x: cs.reduce((s, c) => s + c.centroid.x * c.size, 0) / n, y: cs.reduce((s, c) => s + c.centroid.y * c.size, 0) / n, z: cs.reduce((s, c) => s + c.centroid.z * c.size, 0) / n };
        };
        const segregated = [];
        for (let i = 0; i < liveCodes.length; i++) {
          for (let j = i + 1; j < liveCodes.length; j++) {
            const a = liveCodes[i], b = liveCodes[j];
            if (clusters.some((c) => c.codes.includes(a) && c.codes.includes(b))) continue; // they do occur together somewhere
            const ca = weightedCentroid(clusters.filter((c) => c.codes.includes(a)));
            const cb = weightedCentroid(clusters.filter((c) => c.codes.includes(b)));
            segregated.push({ a, b, sep: Math.round(Math.sqrt((ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2 + (ca.z - cb.z) ** 2)) });
          }
        }
        // Deliberately NOT gated on `silent`: that flag exists to keep the stack tool from repeating
        // routine per-unit information, but this is a correctness warning about the surface the user is
        // about to get, and a stack run is exactly where a bad group would otherwise slip past unseen.
        if (segregated.length) {
          const pairs = segregated.slice(0, 3).map((s) => `${s.a} vs ${s.b} (~${s.sep} m apart)`).join(", ");
          setNotices((p) => [...p, notice("Group \"{unitName}\" may merge unrelated bodies: {v} appear near each other anywhere in the data — {pairs}{v2}. One surface will still be fitted across the gap. Check the group's code list; if they really are one unit in two places, ignore this.", { unitName, v: segregated.length === 1 ? tr("these codes never") : tr("some of its codes never"), pairs, v2: segregated.length > 3 ? tr(", and others") : "" })]);
        }
      }
    }

    // TASKS.csv #231 (Leapfrog-specialist audit finding: "every structure pick with ANY dip/azimuth in
    // the whole project gets fed as an orientation constraint to whatever surface is being modelled" --
    // confirmed live, 317 orientations fed into one 88-point run, dominated by unrelated picks) --
    // filterRowsBySearchEllipsoid already existed and was already used by the Structural tool below,
    // but was never applied here or in the alteration tool's identical block, so with no domain built
    // (the default "Whole property" case) every CON-type pick anywhere on the property fed every single
    // surface's orientations regardless of distance. Same spatial-relevance filter the interface points
    // just above already get, now applied to orientations too.
    // TASKS.csv #361 — only the chosen structure types (see orientTypes), never a silent fall-back to all.
    const useTypes = new Set(orientTypes);
    let structRows = (layers.structure || []).filter((s) => useTypes.has(String(s.value)) && s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    const picksAtStart = structRows.length; // captured: the updater below can run after the thinning replaces structRows
    if (!silent && structRows.length) setNotices((p) => [...p, notice("Orientations for \"{unitName}\" from structure type(s) {v} ({structRows} pick(s) before spatial filtering). Change which types count as contacts under Contact orientations.", { unitName, v: [...useTypes].join(", "), structRows: picksAtStart })]);
    structRows = filterRowsByDomain(structRows, traces, (s) => s.depth);
    const preSearchCount = structRows.length;
    structRows = filterRowsBySearchEllipsoid(structRows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && structRows.length < preSearchCount && !silent) {
      setNotices((p) => [...p, notice("Search ellipsoid: excluded {v} of {preSearchCount} structure orientation(s) with fewer than {minSamples} neighbour(s) inside the ellipsoid.", { v: preSearchCount - structRows.length, preSearchCount, minSamples: searchEllipsoid.minSamples })]);
    }
    // TASKS.csv #765 — picks averaged per hole in depth windows (lib/viewer/orientationThin.js): far fewer gradient
    // constraints for GemPy (its time grows ~linearly with them) and the oriented-core scatter averaged out
    let thinNote = null;
    if (thinPicks && structRows.length > 1) {
      const t = thinStructurePicks(structRows, { windowM: thinWindowM || 50 });
      if (t.after < t.before) { thinNote = { picks: t.before, orientations: t.after, windowM: thinWindowM || 50 }; structRows = t.rows; }
    }
    if (thinNote && !silent) setNotices((p) => [...p, notice("\"{unitName}\": {picks} structure picks averaged into {orientations} orientations (per hole, {windowM} m windows; Model settings > Contact orientations from picks).", { unitName, picks: thinNote.picks, orientations: thinNote.orientations, windowM: thinNote.windowM })]);
    let orientations = structureRowsToOrientations(structRows, traces);
    // TASKS.csv #1170 — only the picks near this unit's own contacts steer its surface
    const reachM = orientationReachM > 0 ? orientationReachM : autoReachM(medianCollarSpacing(collars));
    const nearPicks = orientationsNearContacts(orientations, points, reachM);
    orientations = nearPicks.kept;
    if (nearPicks.total && !silent) setNotices((p) => [...p, notice("\"{unitName}\": {kept} of {total} structure pick(s) lie within {reachM} m of its contacts and steer this surface (Model settings > Contact orientations from picks).", { unitName, kept: nearPicks.kept.length, total: nearPicks.total, reachM })]);
    // TASKS.csv #318 — outcrop measurements of the chosen types within the search radius of the mapped
    // contact, as orientations at their own (terrain) position. Only when a map contact is in play: a
    // bedding reading 3 km from anything being modelled has no business steering this surface.
    if (mapC && mapPts.length) {
      const o = originRef.current;
      const near = surfaceOrientationsNear(mapPts, mapC);
      near.forEach((m) => orientations.push({ x: m.x - o.x, y: m.y - o.y, z: m.z - o.z, dip: m.dip, azimuth: m.dipDir }));
      if (!silent) setNotices((p) => [...p, near.length ? notice("Added {near} outcrop measurement(s) ({classes}) within {radius} m of the mapped contact as orientations.", { near: near.length, classes: mapC.classes.join(", "), radius: mapC.radius }) : notice("No outcrop measurements of the chosen types lie within {radius} m of the mapped contact — none added as orientations.", { radius: mapC.radius })]);
    }
    let orientationEstimated = false; // TASKS.csv #2539 — the orientation below is the run's own estimate, not a pick
    if (!orientations.length) {
      // No structure/contact data to draw an orientation from — estimate one from the shape of the
      // litho points themselves instead of blocking the run. Less accurate than a real structure
      // pick, but lets the tool interpolate a surface from contacts alone, which is the point.
      const est = estimateOrientationFromPoints(points);
      orientations = [est];
      orientationEstimated = true;
      { const oh = !silent && oneHoleDipNotice(points, unitName); if (oh) setNotices((p) => [...p, oh]); } // #1687
      if (!silent && nearPicks.total) setNotices((p) => [...p, notice("No structure pick within {reachM} m of the \"{unitName}\" contacts: its dip was estimated from the contact points (~{dip}°/~{azimuth}°).", { reachM, unitName, dip: Math.round(est.dip), azimuth: Math.round(est.azimuth) })]);
      // TASKS.csv #2233 (review #2174) — picks loaded but no type chosen under Contact orientations is not "no structure picks found"
      else if (!silent && !picksAtStart && (layers.structure || []).some((r) => r.dip != null && r.azimuth != null)) { const loaded = (layers.structure || []).filter((r) => r.dip != null && r.azimuth != null); setNotices((p) => [...p, notice("No structure type is chosen as a contact orientation ({n} oriented pick(s) of {t} type(s) are loaded): the dip of \"{unitName}\" was estimated from its contact points (~{dip}°/~{azimuth}°). Tick a type under Model settings > Contact orientations to use the picks.", { n: loaded.length, t: new Set(loaded.map((r) => String(r.value))).size, unitName, dip: est.dip.toFixed(0), azimuth: est.azimuth.toFixed(0) })]); }
      else if (!silent) setNotices((p) => [...p, notice("No structure picks found — estimated a single dip/azimuth (~{dip}°/~{azimuth}°) from the shape of the \"{unitName}\" contact points. Import a structure CSV for a more accurate result.", { dip: est.dip.toFixed(0), azimuth: est.azimuth.toFixed(0), unitName })]);
    }
    // TASKS.csv #241 — the surface's type now comes from the source litho unit's own role
    // (roleForLithology, src/lib/layers.js) instead of always being hardcoded "stratigraphic_contact",
    // so a surface generated from e.g. "FLT" or a dyke code is correctly tagged fault/dyke rather than
    // silently mislabeled as an ordinary stratigraphic top.
    // TASKS.csv #176 — for a group, the role is the members' shared role when they all agree; if they
    // disagree it falls back to "stratigraphic" (the same default an unlisted raw code already gets)
    // rather than guessing from one member.
    let role;
    if (isMcode) role = mcodeInfo.role === "overburden" ? "overburden" : mcodeInfo.role === "stratigraphic" ? "stratigraphic" : "dyke"; // #599: intrusion / cross-cutting -> a cross-cutting surface type
    else if (isGroup) { const roles = new Set([...codes].map(roleForLithology)); role = roles.size === 1 ? [...roles][0] : "stratigraphic"; }
    else role = roleForLithology(unitName);
    const type = role === "overburden" ? "overburden_base" : role === "fault" ? "fault" : role === "dyke" || role === "vein" ? "dyke" : role === "breccia" ? "breccia_body" : "stratigraphic_contact"; // vein: #1369, a tabular cross-cutting body
    // A group's own assignable color drives its surface/legend; falls back to the first member's
    // per-code color if none set. Raw intervals in the 3D log keep their individual code colors.
    const color = isMcode ? (mcodeInfo.color || colorForLithology([...(mcodeLogged || [])][0] || unitName)) : isGroup ? (target.color || colorForLithology([...codes][0])) : colorForLithology(unitName);
    return { label: isOverburdenUnit ? `Base of ${unitName}` : `Top of ${unitName}` /* #1684 */, meshName: unitName, ...(orientationEstimated ? { orientationEstimated: true } : {}) /* #2539 */, ...(isMcode ? { contactHoles: holeCounts(points) } : {}), /* #1337 */ points, orientations, color, type, codes: isMcode ? [...mcodeLogged] : [...codes], sectionTags: [...sectionTags] /* #810 */, ...(isMcode ? { mcode: true } : {}), params: { ...(thinNote ? { orientationsAveraged: thinNote } : {}), ...(nearPicks.total ? { picksNearContacts: { kept: nearPicks.kept.length, of: nearPicks.total, withinM: reachM, automatic: !(orientationReachM > 0) } } : {}) } }; // codes: #356 model check (logged codes); mcode: #599
  };

  // TASKS.csv #810 — drawn upper contacts whose unit tag matches no unit of this run: name them, so a contact tagged
  // with the logged code while the run models a modelling code (or the reverse) is not ignored without a word
  const noteUnmatchedDrawnContacts = (specs) => {
    if (!includeSectionContacts) return;
    const tags = new Set([...specs.flatMap((s) => s.sectionTags || []), ...(explicitSurfaces || []).map((d) => d.name)]); // #811: an explicit surface's lines are its own
    const other = new Map();
    for (const s of sections || []) for (const c of s.contacts || []) if (c.isUpperContact && !tags.has(c.unit)) other.set(c.unit, (other.get(c.unit) || 0) + 1);
    if (other.size) setNotices((p) => [...p, notice("Drawn cross-section contacts not used by this run (their unit matches none of its units): {v}. Re-tag them in the section window, or add that unit to the run.", { v: [...other].map(([u, n]) => `${u} ×${n}`).join(", ") })]);
  };
  const runImplicitModel = async (unitName, runOpts = {}) => { // runOpts.ensemble — TASKS.csv #52 (a)
    if (!unitName) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, noCollarsNotice(tr("the implicit model"), layers, assays)]); return; }
    // TASKS.csv #176 — a `group:<id>` pick resolves to its group object here; the raw-code path is untouched.
    const target = resolveLithoTarget(unitName);
    if (!target) { setNotices((p) => [...p, notice("That lithology group no longer exists — pick another unit.")]); return; }
    const spec = gatherLithoSurfaceSpec(target, traces, { mapConstraint });
    if (!spec) return;
    noteUnmatchedDrawnContacts([spec]);
    if (mapConstraint) spec.params = { ...(spec.params || {}), surfaceMapContact: { units: mapConstraint.units, classes: mapConstraint.classes, radiusM: mapConstraint.radius } };
    // TASKS.csv #1191 / #1684 — an overburden unit's surface is its BASE (gatherLithoSurfaceSpec), typed overburden_base; the #1191
    // route through a stack did not work (the unit below never took the contact under overburden as its top)
    await runSurfaceModel(spec, runOpts.ensemble ? { ensemble: runOpts.ensemble } : undefined);
  };

  // Stratigraphic stack tool (TASKS.csv #52 follow-up): models several lithology units' top contacts
  // in ONE sidecar request instead of one at a time. This isn't just a convenience batch — sending
  // multiple surfaces together puts them in a single GemPy StructuralGroup, which fits them as
  // ordered iso-surfaces of one shared scalar field, guaranteeing the resulting surfaces don't cross
  // each other (the "hard rule" a stratigraphic pile has to obey). `unitNames` order matters: GemPy
  // treats the first entry as youngest and works down, so this expects the user's list to already be
  // arranged youngest (shallowest) to oldest (deepest) — the stack panel's UI enforces that ordering.
  // Deliberately litho-only, not structure/vein/dyke picks: cross-cutting features violate the very
  // non-crossing assumption this tool exists to enforce, so they're excluded from this tool by scope
  // (model them with the Structural tool instead, which has no such constraint) rather than trying to
  // half-support fault-cuts-through-stack modelling as a first pass — noted as a real follow-up (#52).
  const runStackModel = async (unitNames) => {
    if (!unitNames || unitNames.length < 2) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, noCollarsNotice(tr("the stratigraphic stack"), layers, assays)]); return; }

    const specs = [];
    const skipped = [];
    // TASKS.csv #599 — the stack's own top-to-bottom order is the pile order for its modelling codes
    const pileOrder = unitNames.filter((u) => typeof u === "string" && u.startsWith("mcode:")).map((u) => u.slice(6));
    const specKey = new Map(); // TASKS.csv #1054 — stack unit key -> its spec, for a fault's "offsets units from ... down"
    const breakAt = new Set(); // TASKS.csv #1309 — index of the last gathered spec above each marked unconformity
    // TASKS.csv #1684 — overburden in a stack: not a surface of its own (its base would coincide with the next unit's top in one
    // field); the unit directly below it takes every contact under the overburden as its top, the base of overburden
    const targets = unitNames.map((u) => resolveLithoTarget(u));
    const ovbAt = targets.findIndex((t) => unitRoleOf(t) === "overburden");
    let ovbBases = null;
    if (ovbAt >= 0) {
      const ovb = targets[ovbAt], ovbName = typeof ovb === "object" ? ovb.name : ovb, ovbCodes = new Set(typeof ovb === "object" && !ovb.kind ? ovb.codes || [] : [ovbName]);
      const runs = codedRuns(layers.litho, modellingCodes, mcodeGroupOf);
      ovbBases = overburdenBases(runs, modellingCodes, mcodeDefaultRole, (run) => run.code === ovbName || ovbCodes.has(run.code) || run.rows.every((r) => ovbCodes.has(r.value))).bases;
      const next = targets[ovbAt + 1], nextName = next ? (typeof next === "object" ? next.name : next) : null;
      setNotices((p) => [...p, nextName
        ? notice("{ovb}: not a surface of its own in the stack. Its base is the top of {next}, the unit under it: the contact every hole shares.", { ovb: ovbName, next: nextName })
        : notice("{ovb}: nothing in the stack below it, so its base is not modelled here. Model {ovb} on its own with the Implicit tool for \"Base of {ovb}\".", { ovb: ovbName })]);
    }
    unitNames.forEach((u, i) => {
      // TASKS.csv #176 — stackUnits carries `group:<id>` keys verbatim; resolve to the group object
      // only here, at the point the spec is actually gathered.
      const target = targets[i];
      if (i === ovbAt) return; // #1684
      const under = ovbAt >= 0 && i === ovbAt + 1; // #1684
      const myCodes = under ? new Set(typeof target === "object" && !target.kind ? target.codes || [] : [typeof target === "object" ? target.name : target]) : null;
      const extraBases = under ? ovbBases.filter((b) => !myCodes.has(b.below) && !myCodes.has(b.row.value) && !(typeof target === "object" && !target.kind && mcodeGroupOf(b.row.value) === target.name)) : null;
      const spec = target ? gatherLithoSurfaceSpec(target, traces, { silent: true, pileOrder, underOverburden: under, extraBases }) : null;
      if (spec) { specs.push(spec); specKey.set(u, spec); } else skipped.push(target && typeof target === "object" ? target.name : target || "(deleted group)");
      if (stackBreaks?.includes(u) && specs.length) breakAt.add(specs.length - 1);
    });
    breakAt.delete(specs.length - 1); // nothing below it
    // TASKS.csv #2381 (review #2325, WA uranium) — a break above the LAST unit: that unit's top is the unconformity and follows the upper
    // package's field (#1309), so no package starts below it. The run said "1 conformable package(s)" and then ran erosional. Left out, said.
    const noPackageBelow = [...breakAt].filter((b) => b >= specs.length - 2);
    if (noPackageBelow.length) {
      noPackageBelow.forEach((b) => breakAt.delete(b));
      const lastUnit = specs[specs.length - 1]?.meshName;
      setNotices((p) => [...p, notice("The unconformity marked above the last unit ({unit}) was left out: the top of the unit under an unconformity follows the units above it, so with nothing under {unit} no package starts there. To fit the top of {unit} on its own, model it with the Implicit surface tool or as an Explicit surface from its logged tops.", { unit: lastUnit })]);
    }
    // TASKS.csv #1370 (review #1352, Silvertip) — the youngest unit of a stack needs no top of its own: on Silvertip the Earn clastics
    // start under overburden or at a hole start in every hole, and the stack's model is the top of McDame (Earn's base) down.
    // Skipped, it is said as such; the rest are still the ones the run cannot use.
    const youngestAt = unitNames.findIndex((_, i) => i !== ovbAt);
    const youngestName = youngestAt >= 0 ? (targets[youngestAt] && typeof targets[youngestAt] === "object" ? targets[youngestAt].name : targets[youngestAt]) : null;
    const youngestSkipped = youngestAt >= 0 && !specKey.has(unitNames[youngestAt]) && !!targets[youngestAt];
    const otherSkipped = youngestSkipped ? skipped.slice(1) : skipped; // overburden is never in skipped, so the youngest is first
    if (youngestSkipped) setNotices((p) => [...p, notice("{unit}: no top contacts it can use (the notes above say why). As the youngest unit of the stack it needs none: the stack is modelled from the top of the unit below it down.", { unit: youngestName })]);
    if (otherSkipped.length) setNotices((p) => [...p, notice("Skipping from the stack (no top contacts it can use — no intervals, or every start is at a hole start or under casing, overburden, a cross-cutting or an older unit; the notes above say which): {skipped}.", { skipped: otherSkipped.join(", ") }) /* #1370 */]);
    // one surface left because the youngest unit needs no top, or because overburden's base is folded into the unit under it (#1684):
    // that contact is still a model — a stack of one is the same solve (runSurfaceModel is runSurfaceStack([spec]))
    const oneContactOk = specs.length === 1 && (youngestSkipped || ovbAt >= 0);
    if (oneContactOk) setNotices((p) => [...p, notice("One contact to model: {surface}. The stack has no second surface to keep it from crossing, so it is solved on its own.", { surface: ovbAt >= 0 && targets[ovbAt + 1] ? tr("{surface} (the base of {ovb})", { surface: specs[0].label, ovb: typeof targets[ovbAt] === "object" ? targets[ovbAt].name : targets[ovbAt] }) : youngestSkipped ? tr("{surface} (the base of {unit})", { surface: specs[0].label, unit: youngestName }) : specs[0].label })]);
    if (specs.length < 2 && !oneContactOk) { setNotices((p) => [...p, notice("Need at least 2 units with data to model a stack — add more units or check your lithology import.")]); return; }
    noteUnmatchedDrawnContacts(specs);
    let packages = 0; // TASKS.csv #1309
    if (breakAt.size) {
      const moved = movePointsToUnconformities(specs, layers.litho || [], breakAt);
      const pk = surfacePackages(specs.length, breakAt);
      specs.forEach((s, k) => { s.package = pk[k]; });
      packages = new Set(pk).size;
      const list = moved.flatMap((n, k) => (n ? [tr("{n} to the top of {unit}", { n, unit: specs[k].meshName })] : [])).join(", ");
      setNotices((p) => [...p, notice("{packages} conformable package(s): {list}. Each is one field and truncates those below; the top of the unit under each unconformity is the unconformity. {moved}", { packages, list: pk.map((_, k) => k).filter((k) => k === 0 || pk[k] !== pk[k - 1]).map((k) => pk.flatMap((q, j) => (q === pk[k] ? [specs[j].meshName] : [])).join(" + ")).join(" | "), moved: list ? tr("Contacts moved onto it, where a younger unit lies directly on an older one: {list}.", { list }) : "" })]);
    }
    // TASKS.csv #1030 — a unit absent between its neighbours in a hole: in an erosional stack the contact between them is
    // also the missing unit's top, so it pinches out there; a conformable stack (one shared field) cannot do that
    if (!breakAt.size && specs.length >= 3) {
      const po = pinchOutPoints(specs, layers.litho || []);
      if (po.absent.length) {
        const list = po.absent.map((a) => tr("{unit} absent in {n} hole(s)", { unit: a.unit, n: a.holes })).join(", ");
        if (stackRelation === "erode") {
          po.add.forEach((pts, k) => { if (pts.length) specs[k].points.push(...pts); });
          setNotices((p) => [...p, notice("Pinch-outs: {list}. Where a younger unit lies directly on an older one with these missing, that contact was also given to their tops, so they thin to nothing there.", { list })]);
        } else setNotices((p) => [...p, notice("{list}, between their neighbours. A conformable stack is one shared field: every unit keeps a thickness everywhere, so these cannot pinch out and are modelled where the logs have none. Choose Erode to let them pinch out.", { list })]);
      }
    }
    // TASKS.csv #360 — faults that offset the stack, solved in the same GemPy run (FAULT groups)
    const faultSpecs = [], faultKey = new Map(), faultWarnings = [], randomFaults = []; // randomFaults: #1543
    stackFaults.forEach((key) => {
      const f = gatherFaultSpec(key, traces);
      if (f.spec) { faultSpecs.push(f.spec); faultKey.set(key, f.spec); } else setNotices((p) => [...p, notice("Fault \"{v}\" left out: {why}", { v: key.replace("|", " — "), why: f.why })]);
      faultWarnings.push(...(f.warnings || [])); // #1372 — said after the run: the run's own messages pushed them out of the last six
      if (f.spec && f.random) randomFaults.push(f.random);
    });
    if (faultSpecs.length) setNotices((p) => [...p, notice("The stack is offset by {faultSpecs} fault(s) solved in the same model: {v}.", { faultSpecs: faultSpecs.length, v: faultSpecs.map((f) => f.meshName).join(", ") })]);

    // TASKS.csv #1054 — what each fault offsets: every unit (GemPy's default) or the units from a chosen one down, and the
    // faults listed after it that it also displaces. Sent as names; the sidecar maps them to GemPy's fault relations.
    stackFaults.forEach((key, i) => {
      const cfg = (stackFaultOffsets || {})[key], spec = faultKey.get(key);
      if (!spec || !cfg || (!cfg.from && !(cfg.faults || []).length)) return;
      const from = cfg.from && specKey.has(cfg.from) ? specs.indexOf(specKey.get(cfg.from)) : 0;
      const later = stackFaults.slice(i + 1);
      spec.offsets = [...specs.slice(Math.max(0, from)).map((s) => s.meshName), ...(cfg.faults || []).filter((k) => later.includes(k) && faultKey.has(k)).map((k) => faultKey.get(k).meshName)];
    });
    // TASKS.csv #1543 (review #1497, Lawyers) — what the picks say about a fault is known now: said before the solve too (it came 173 s
    // later), and a fault whose picks are no more aligned than random planes is asked about once, so minutes of GemPy can be saved
    if (faultWarnings.length) setNotices((p) => [...p, ...faultWarnings]);
    if (randomFaults.length && !window.confirm(tr("{list}: the picks show no preferred orientation (at the level of random planes), so the fault surface made from them is not a real plane. Run the stack anyway?", { list: randomFaults.map((r) => `\"${r.name}\" (k = ${Number(r.k).toFixed(1)})`).join(", ") }))) {
      setNotices((p) => [...p, notice("Stack run cancelled before solving: check the fault picks on the Stereonet, or give each structure its own name / ID.")]);
      return;
    }
    // TASKS.csv #2382 (review #2325, WA uranium) — the order typed here, checked against the holes before a run of minutes: a pair the holes
    // log the other way up (in 2/3 of the 3+ holes that have both) is said, with the order the holes give, and the run asks to go ahead
    {
      const kOf = new Map();
      specs.forEach((s, k) => (s.codes || [s.meshName]).forEach((c) => { if (!kOf.has(c)) kOf.set(c, k); }));
      const ord = stackOrderFromHoles(layers.litho || [], kOf, specs.length);
      if (ord.conflicts.length) {
        const list = ord.conflicts.slice(0, 4).map((q) => tr("{older} is logged above {younger} in {against} of {of} holes that have both", { older: specs[q.older].meshName, younger: specs[q.younger].meshName, against: q.against, of: q.of })).join("; ");
        const holesOrder = ord.order.map((k) => specs[k].meshName).join(", ");
        if (!window.confirm(tr("The stack's order does not match the holes: {list}. Down the holes the order is {order} (youngest first). Run in the order given anyway?", { list, order: holesOrder }))) {
          setNotices((p) => [...p, notice("Stack run cancelled before solving: the holes give the order {order} (youngest first). Reorder the units with the arrows and run again.", { order: holesOrder })]);
          return;
        }
        setNotices((p) => [...p, notice("Run in the order given, although the holes give {order} (youngest first): {list}.", { order: holesOrder, list })]);
      }
      // TASKS.csv #2532 — units that come back down the holes are not layers: said before the run, which asks to go ahead
      const rep = stackRepeats(layers.litho || [], kOf, specs.length);
      if (rep.holes >= 3 && rep.repeating >= rep.holes / 2) {
        const units = rep.byUnit.map((c, k) => [c, k]).filter(([c]) => c > 0).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([c, k]) => tr("{unit} in {n}", { unit: specs[k].meshName, n: c })).join(", ");
        if (!window.confirm(tr("In {r} of the {h} holes that log two or more of these units, a unit comes back after another (up to {m} times in one hole: {units}). Alternating units are not the layers of a stack, so the surfaces will cut through them; the Vein / dyke tool or a closed body (Modelling codes) models them. Run the stack anyway?", { r: rep.repeating, h: rep.holes, m: rep.maxRuns, units }))) {
          setNotices((p) => [...p, notice("Stack run cancelled before solving: in {r} of {h} holes a unit comes back after another ({units}).", { r: rep.repeating, h: rep.holes, units })]);
          return;
        }
      }
    }
    await runSurfaceStack([...faultSpecs, ...specs], { relation: breakAt.size ? "erode" : stackRelation, packages }); // TASKS.csv #271; #1309
    if (faultWarnings.length) setNotices((p) => [...p, ...faultWarnings]);
  };

  // TASKS.csv #817 — a stratigraphic model from the surface geology ALONE (no drillholes needed). Matt: "I wanna have a
  // way to import surface geology (maps and structural measuments) and build a 3d model out of it". `p`:
  //   layer / field: the geology map (polygons) and its unit attribute; order: the stratigraphic units, youngest first
  //   (suggested by lib/pileOrder.js, edited by the geologist); bedding / planes: orientations in world coordinates
  //   ({ x, y, dip, dipDir } - outcrop measurements and contact dips fitted from the draped traces); faults: [{ name,
  //   line: [[x, y]], dip, dipDir }]; relation: "onlap" | "erode".
  // Every contact between two units of the order is draped on the terrain (a point every 25 m) and becomes interface
  // points of the top of the OLDER unit. TASKS.csv #1030 — with units of the order missing between the two (A on C, no
  // B): in an erosional stack the points also go to the tops of the missing units, which then pinch out there; in a
  // conformable one (one shared field) they cannot, and only the older unit's top gets them. (It used to give them to
  // the unit directly below the younger one only - B, which is not there - and say that B pinched out.) The youngest unit's top is the ground: no surface. Units not in the order (intrusions,
  // breccias, hornfels...) are left out of the stack and named. Then the ordinary stack run: same solve, model check,
  // predicted geological map scored against the loaded map (#758).
  const runMapModel = async (p) => {
    const terrain = terrainForClipRef.current;
    if (!terrain) { setNotices((q) => [...q, notice("A model from the map needs a terrain: the contacts and measurements are placed on the ground surface. Fetch or import one first (Maps > Terrain).")]); return; }
    const order = (p.order || []).filter(Boolean);
    if (order.length < 2) { setNotices((q) => [...q, notice("Put at least two stratigraphic units in the order to model.")]); return; }
    const o = originRef.current;
    // TASKS.csv #927 — on the ground; #2410 — where the terrain has no data, at the map layer's own elevation (its Elev.), counted, not skipped
    const planZ = Number.isFinite(Number(p.layer?.elevation)) ? Number(p.layer.elevation) : null;
    let onPlan = 0;
    const ground = (x, y) => { const g = terrainGroundAt(terrain, x, y); if (Number.isFinite(g) || planZ == null) return g; onPlan++; return planZ; };
    const api = (x, y, z) => ({ x: x - o.x, y: y - o.y, z: z - o.z });
    const thin = (line, step) => {
      const out = [line[0]];
      let acc = 0;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        let t = step - acc;
        while (t <= L) { out.push([a[0] + ((b[0] - a[0]) * t) / L, a[1] + ((b[1] - a[1]) * t) / L]); t += step; }
        acc = L - (t - step);
      }
      return out;
    };
    const { extractMapContacts, pointInRings, featureCategoryValue } = await import("../../lib/mapLayers.js");
    const { contacts } = extractMapContacts(p.layer, p.field);
    const rank = new Map(order.map((u, i) => [u, i]));
    const pointsOf = new Map(order.map((u) => [u, []]));
    const mapRelation = p.relation || stackRelation, pinched = new Set(), unpinched = new Set(); // #1030
    // TASKS.csv #1309 — unconformities the geologist marked, as indices into the order; the last unit has nothing below it
    const breaks = new Set((p.breaks || []).map((u) => rank.get(u)).filter((i) => i !== undefined && i < order.length - 1));
    let offTerrain = 0, unused = 0;
    for (const c of contacts) {
      const [a, b] = c.units;
      if (!rank.has(a) || !rank.has(b)) { unused++; continue; }
      const ry = Math.min(rank.get(a), rank.get(b)), ro = Math.max(rank.get(a), rank.get(b));
      const tops = breaks.size ? [order[contactSurface(ry, ro, breaks)]] : mapRelation === "erode" ? order.slice(ry + 1, ro + 1) : [order[ro]]; // #1030; #1309
      if (!breaks.size && ro > ry + 1) tops.slice(0, -1).forEach((u) => pinched.add(u));
      if (!breaks.size && ro > ry + 1 && mapRelation !== "erode") order.slice(ry + 1, ro).forEach((u) => unpinched.add(u));
      for (const line of c.lines) for (const [x, y] of thin(line, 25)) {
        const z = ground(x, y);
        if (!Number.isFinite(z)) { offTerrain++; continue; }
        for (const surface of tops) pointsOf.get(surface).push({ ...api(x, y, z), srcCode: `${a}|${b}` });
      }
    }
    // TASKS.csv #1718 — the drillholes' logged contacts: the same tops as a map contact between those two units, at the contact's
    // depth on the hole's trace; an intercept excluded in the Boundary intercepts table stays out
    let holeN = 0, holeHoles = 0, holeGaps = 0, holeNoTrace = 0, holeExcluded = 0;
    if (p.holeCodes && Object.values(p.holeCodes).some(Boolean)) {
      const { holeContacts } = await import("../../lib/holeMapContacts.js");
      const hc = holeContacts(layers.litho || [], p.holeCodes, (u) => rank.has(u));
      const traces = tracesRef.current || [];
      const used = new Set();
      for (const c of hc.contacts) {
        if (excludedIntercepts.includes(interceptId("litho", c.row))) { holeExcluded++; continue; }
        const t = traces.find((tc) => tc.hole_id === c.hole_id);
        const q = t?.pts?.length ? findOnTrace(t.pts, c.depth) : null;
        if (!q) { holeNoTrace++; continue; }
        const ry = Math.min(rank.get(c.upper), rank.get(c.lower)), ro = Math.max(rank.get(c.upper), rank.get(c.lower));
        const tops = breaks.size ? [order[contactSurface(ry, ro, breaks)]] : mapRelation === "erode" ? order.slice(ry + 1, ro + 1) : [order[ro]];
        for (const surface of tops) pointsOf.get(surface).push({ ...sceneToApi(q), srcCode: `${c.upper}|${c.lower}`, hole_id: c.hole_id, depth: c.depth });
        holeN++; used.add(c.hole_id);
      }
      holeHoles = used.size; holeGaps = hc.gaps;
    }
    // TASKS.csv #1309 — a measurement steers the package its rock is in: a fitted contact dip by its contact, bedding by the map unit under it
    const mapOrientationPackage = (m) => {
      if (m.younger != null && rank.has(m.younger) && rank.has(m.older)) return contactPackage(Math.min(rank.get(m.younger), rank.get(m.older)), Math.max(rank.get(m.younger), rank.get(m.older)), breaks); // the order may have been changed since the dip was fitted
      const f = (p.layer.features || []).find((q) => pointInRings([m.x, m.y], q.parts || [q.geometry]));
      const u = f ? featureCategoryValue(f, p.field) : null;
      return rank.has(u) ? unitPackage(rank.get(u), breaks) : -1;
    };
    const orientations = [...(p.bedding || []), ...(p.planes || [])].map((m) => ({ m, z: ground(m.x, m.y) })).filter(({ m, z }) => Number.isFinite(z) && [m.dip, m.dipDir].every(Number.isFinite))
      .map(({ m, z }) => ({ ...api(m.x, m.y, z), dip: m.dip, azimuth: m.dipDir, ...(breaks.size ? { pkg: mapOrientationPackage(m) } : {}) }));
    // TASKS.csv #2409 (review #2325, WA uranium) — a buried, flat deposit has no outcrop measurement: with logged contacts in use, each top gets
    // an orientation fitted from its own contact points (a least-squares plane), instead of the run refusing
    if (!orientations.length && holeN < 3) { setNotices((q) => [...q, notice("No orientations on the terrain: import outcrop measurements (bedding) or fetch a terrain that covers the map so contact dips can be fitted.")]); return; }
    const fittedTops = [];
    const specs = [], empty = [];
    const surfPkg = new Map(surfacePackages(order.length, breaks).map((k, i) => [order[i], k])), estimatedIn = new Set(); // #1309
    const oriFor = (u, pts) => { // #1309 — this package's measurements; none: a dip from its own contact points, and the run says so
      if (!orientations.length) { const e = estimateOrientationFromPoints(pts); fittedTops.push({ u, n: pts.length, dip: e.dip, az: e.azimuth }); return [e]; } // #2409
      if (!breaks.size) return orientations;
      const k = surfPkg.get(u), own = orientations.filter((q) => q.pkg === k);
      if (own.length) return own;
      estimatedIn.add(u);
      return [estimateOrientationFromPoints(pts)];
    };
    order.slice(1).forEach((u) => {
      const pts = pointsOf.get(u);
      if (!pts.length) { empty.push(u); return; }
      specs.push({ label: `Top of ${u}`, meshName: u, points: pts, orientations: oriFor(u, pts), ...(breaks.size ? { package: surfPkg.get(u) } : {}), color: colorForLithology(u), type: "stratigraphic_contact", codes: [u], params: { mapModel: { layer: p.layer.name, field: p.field, order, contactPoints: pts.length } } });
    });
    if (specs.length < 1) { setNotices((q) => [...q, notice("None of the units below the youngest one shares a contact with a unit above it on the map, so there is nothing to model. Check the order.")]); return; }
    if (fittedTops.length) setNotices((q) => [...q, notice("No outcrop orientation: {n} orientation(s) fitted from the logged contacts, a least-squares plane through each top's contact points ({list}). A buried deposit with no bedding builds this way; outcrop measurements replace them.", { n: fittedTops.length, list: fittedTops.map((f) => `${f.u}: ${f.n} points, dip ${f.dip.toFixed(1)}° toward ${Math.round(f.az)}°`).join("; ") })]); // #2409
    const faultSpecs = (p.faults || []).map((f) => {
      const pts = thin(f.line, 25).map(([x, y]) => ({ x, y, z: ground(x, y) })).filter((q) => Number.isFinite(q.z));
      if (pts.length < 2 || !Number.isFinite(f.dip) || !Number.isFinite(f.dipDir)) return null;
      const or = pts.filter((_, i) => i % 8 === 0).map((q) => ({ ...api(q.x, q.y, q.z), dip: f.dip, azimuth: f.dipDir }));
      return { label: `Fault: ${f.name}`, meshName: `Fault ${f.name}`, points: pts.map((q) => api(q.x, q.y, q.z)), orientations: or, color: colorForStructure("FLT"), type: "fault", fault: true };
    }).filter(Boolean);
    const left = (p.leftOut || []).filter(Boolean);
    setNotices((q) => [...q, appendNotice(notice("Model from the map: {v} surface(s) from {n} contact point(s) and {m} orientation(s){f}.{e}{l}", {
      v: specs.length, n: specs.reduce((s, x) => s + x.points.length, 0).toLocaleString(), m: orientations.length,
      f: faultSpecs.length ? tr(", with {k} fault(s)", { k: faultSpecs.length }) : "",
      e: empty.length ? tr(" No map contact reaches the top of: {u} (they are not modelled).", { u: empty.join(", ") }) : "",
      l: left.length ? tr(" Left out of the stack (not stratigraphic): {u}.", { u: left.join(", ") }) : "",
    }), (pinched.size ? tr(" Pinched out where the map shows them missing between their neighbours: {u}.", { u: [...pinched].join(", ") }) : "")
      + (unpinched.size ? tr(" Missing between their neighbours in places, but a conformable stack cannot pinch them out (choose Erosional for that): {u}.", { u: [...unpinched].join(", ") }) : "")
      + (estimatedIn.size ? tr(" No measurement in the package of: {u}. Their dip was estimated from their contact points.", { u: [...estimatedIn].join(", ") }) : "") // #1309
      + (holeN ? tr(" {h} of the contact points are logged contacts in {k} drillhole(s).", { h: holeN, k: holeHoles }) : p.holeCodes ? tr(" No logged contact between two units of the order was found in the drillholes.") : "") // #1718
      + (holeGaps ? tr(" {g} logged contact(s) left out: over {m} m unlogged or not used between the two units.", { g: holeGaps, m: 10 }) : "")
      + (holeExcluded ? tr(" {g} logged contact(s) excluded in the Boundary intercepts table.", { g: holeExcluded }) : "")
      + (holeNoTrace ? tr(" {g} logged contact(s) on holes with no trace were skipped.", { g: holeNoTrace }) : "")
      + (offTerrain ? tr(" {k} contact point(s) beyond the terrain were skipped.", { k: offTerrain }) : "") + (onPlan ? tr(" {k} contact point(s) and measurement(s) where the terrain has no data were placed at the map layer's elevation (RL {z}); the surfaces are cut there at that elevation too.", { k: onPlan, z: Math.round(planZ) }) : "") /* #2410 */ + (unused ? tr(" {k} contact(s) involve units outside the order.", { k: unused }) : ""))]); // appendNotice: #821
    await runSurfaceStack([...faultSpecs, ...specs], { relation: breaks.size ? "erode" : p.relation || stackRelation, aboveUnit: order[0], packages: new Set(specs.map((s) => s.package)).size, ...(planZ != null ? { groundFallbackZ: planZ } : {}) }); // #2410 // #1309
  };

  const gatherFaultSpec = (key, traces) => {
    const [type, id] = key.split("|");
    const rows = (layers.structure || []).filter((s) => String(s.value) === type && (s.structure_id || "") === id && Number.isFinite(s.dip) && Number.isFinite(s.azimuth));
    const points = [];
    rows.forEach((s) => {
      const t = traces.find((tc) => tc.hole_id === s.hole_id);
      const p = t ? findOnTrace(t.pts, s.depth) : null;
      if (p) points.push({ ...sceneToApi(p), hole_id: s.hole_id, depth: s.depth }); // #1225 — so the pick check names them; the sidecar ignores fields it doesn't declare
    });
    const orientations = structureRowsToOrientations(rows, traces);
    if (!points.length || !orientations.length) return { why: "its picks could not be placed on the hole traces." };
    // TASKS.csv #1372 (review #1352, Silvertip) — five unrelated "Fault" picks in three pads were solved as one fault plane in silence
    // (the Structures tool warns on the same picks), and the fault was named "Fault Fault". The same checks as runStructuralModel:
    // picks no more aligned than random planes (#1066), and picks of several holes with no ID. "<type> (all picks)" without an ID.
    const name = id ? `${type} — ${id}` : tr("{type} (all picks)", { type });
    const warnings = [], fs = rows.length >= 4 ? fisherStats(rows) : null, holes = new Set(rows.map((s) => s.hole_id)).size;
    if (fs?.noPreferred) warnings.push(notice("Warning: the {n} \"{name}\" picks show no preferred orientation (k = {k}, at the level of random planes), so their dips do not define one surface. Check them on the Stereonet, or give each structure its own name/ID.", { n: rows.length, name, k: fs.k.toFixed(1) }));
    if (!id && holes > 1) warnings.push(notice("All {rows} \"{structType}\" picks ({holes} holes) are modelled as ONE surface. If they belong to different {v}, map a structure name/ID column when importing the structure file and each will be modelled on its own.", { rows: rows.length, structType: type, holes, v: tr("faults") }));
    return { warnings, random: fs?.noPreferred ? { name, k: fs.k } : null, spec: { label: `Fault: ${name}`, meshName: /fault|flt|shear/i.test(type) ? name : `Fault ${name}`, points, orientations, color: colorForStructure(type), type: "fault", fault: true } }; // random: #1543
  };

  // Structural modelling tool: models a surface from one structure-plane type (e.g. a fault or shear
  // pick's "value"), self-referentially — each pick's own position feeds the interface point AND its
  // own dip/azimuth feeds the orientation at that point. Unlike the litho/alteration tools, this
  // doesn't need a separate structure-layer lookup, since the structure picks ARE the thing being
  // modelled here.
  const runStructuralModel = async (structType) => {
    if (!structType) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, noCollarsNotice(tr("the structural model"), layers, assays)]); return; }

    let rows = (layers.structure || []).filter((s) => String(s.value).toUpperCase() === String(structType).toUpperCase() && s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    if (!rows.length) { setNotices((p) => [...p, notice("No \"{structType}\" structure picks with dip/azimuth found — nothing to model.", { structType })]); return; }
    const domain = domains.find((d) => d.id === modelDomainId);
    rows = filterRowsByDomain(rows, traces, (s) => s.depth);
    if (!rows.length) { setNotices((p) => [...p, notice("No \"{structType}\" picks fall inside domain \"{v}\" — nothing to model.", { structType, v: domain?.name })]); return; }
    const preEllipsoid = rows.length;
    rows = filterRowsBySearchEllipsoid(rows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && rows.length < preEllipsoid) {
      setNotices((p) => [...p, notice("Search ellipsoid: excluded {v} of {preEllipsoid} \"{structType}\" pick(s) with fewer than {minSamples} neighbour(s) inside the ellipsoid.", { v: preEllipsoid - rows.length, preEllipsoid, structType, minSamples: searchEllipsoid.minSamples })]);
    }
    if (!rows.length) { setNotices((p) => [...p, notice("All \"{structType}\" picks were excluded by the search ellipsoid — widen its ranges or lower the minimum neighbour count.", { structType })]); return; }

    // TASKS.csv #362 — one surface per named structure. Picks carrying a structure_id are modelled per ID;
    // picks without one form their own group. Without any IDs, all picks of the type are still one surface
    // (the only thing possible), but the notice now says so instead of implying it is one fault.
    const byId = new Map();
    rows.forEach((s) => { const k = s.structure_id || ""; if (!byId.has(k)) byId.set(k, []); byId.get(k).push(s); });
    const named = [...byId.keys()].filter(Boolean);
    if (!named.length) {
      const holes = new Set(rows.map((s) => s.hole_id)).size;
      if (holes > 1) setNotices((p) => [...p, notice("All {rows} \"{structType}\" picks ({holes} holes) are modelled as ONE surface. If they belong to different {v}, map a structure name/ID column when importing the structure file and each will be modelled on its own.", { rows: rows.length, structType, holes, v: /flt|fault|shear/i.test(structType) ? tr("faults") : tr("structures") })]);
    } else {
      setNotices((p) => [...p, notice("Modelling {named} named \"{structType}\" structure(s) separately: {named2}{v}.", { named: named.length, structType, named2: named.join(", "), v: byId.has("") ? tr(", plus {n} pick(s) with no name as one more surface", { n: byId.get("").length }) : "" })]);
    }
    // TASKS.csv #2048 (review #2013, 3D Modelling) — Woodjam's 47 VEIN_Uniq stockwork picks (2 holes, k = 3.4) were solved as ONE GemPy
    // surface for 15 s with the 'no preferred orientation' warning only afterwards; the stack has asked first since #1543. A group whose
    // picks are as scattered as random planes, or that a hole cuts more than 2.5 times (a vein set), is asked about before the solve.
    const setLike = [...byId].map(([id, group]) => {
      const fs = group.length >= 4 ? fisherStats(group) : null, holes = new Set(group.map((s) => s.hole_id)).size, perHole = group.length / Math.max(1, holes);
      const why = [fs?.noPreferred ? tr("no preferred orientation (k = {k})", { k: Number(fs.k).toFixed(1) }) : null, group.length >= 4 && perHole > 2.5 ? tr("{n} picks per hole", { n: perHole.toFixed(1) }) : null].filter(Boolean);
      return why.length ? `"${id ? `${structType} — ${id}` : structType}" (${group.length} picks, ${why.join(", ")})` : null;
    }).filter(Boolean);
    if (setLike.length && !window.confirm(tr("{list}: these picks behave like a vein set or a fabric, not one surface. A surface solved through them is not a structure they define. Model them anyway?", { list: setLike.join("; ") }))) {
      setNotices((p) => [...p, notice("Structure model cancelled before solving. For a vein set, its mean plane can be a structural trend (Stereonet > Add as structural trend), or give each structure its own name / ID.")]);
      return;
    }
    // TASKS.csv #83 — a "structure" layer covers contacts, faults, shear zones, foliation, veins all
    // under one layer type (see sample_data's structure.csv), so this tool's own picked structType
    // string is the best available signal for a starting-guess surface type — refined further by
    // guessSurfaceType's regex, overridable by the user afterward regardless.
    for (const [id, group] of byId) {
      const name = id ? `${structType} — ${id}` : named.length ? `${structType} — unnamed` : structType;
      const points = [];
      group.forEach((s) => {
        const t = traces.find((tc) => tc.hole_id === s.hole_id);
        if (!t) return;
        const p = findOnTrace(t.pts, s.depth);
        if (p) points.push({ ...sceneToApi(p), hole_id: s.hole_id, depth: s.depth }); // #1548 — the pick check names the hole and depth, as for faults (#1225)
      });
      const orientations = structureRowsToOrientations(group, traces);
      if (!points.length || !orientations.length) { setNotices((p) => [...p, notice("Couldn't locate \"{name}\" picks along the hole traces.", { name })]); continue; }
      // TASKS.csv #1066 — the same orientation check as the Stereonet: picks no more aligned than random planes still
      // run (the user asked for them), but the result is not presented as a structure the picks define
      const fs = group.length >= 4 ? fisherStats(group) : null;
      if (fs?.noPreferred) setNotices((p) => [...p, notice("Warning: the {n} \"{name}\" picks show no preferred orientation (k = {k}, at the level of random planes), so their dips do not define one surface. Check them on the Stereonet, or give each structure its own name/ID.", { n: group.length, name, k: fs.k.toFixed(1) })]);
      await runSurfaceModel({ label: `Structure: ${name}`, meshName: name, points, orientations, color: colorForStructure(structType), type: guessSurfaceType(`Structure: ${structType}`, structType) }, { trendTool: "structural" }); // #679 — its own trend slot
    }
  };

  // Alteration modelling tool. TASKS.csv #272 — REWRITTEN (Leapfrog-specialist review).
  //
  // What this used to do, and why it was wrong: it gathered the alteration intervals' TOP contacts and
  // pushed them through runSurfaceModel — i.e. the same directed, single-polarity, one-sided-contact
  // GemPy machinery the stratigraphic/structural tools use. That machinery models a surface with a
  // coherent "younger above, older below" polarity, fitted through top picks only. An alteration halo
  // has no such polarity: it's a closed 3D envelope around a mineralising conduit whose base is as much
  // part of the body as its top, and it can wrap around, pinch and swell in any direction. The old code
  // did return *a* surface (so nothing looked broken), but it was a draped contact through the tops of
  // the altered intervals, not a halo — a geologist comparing it to the same data in Leapfrog would not
  // recognise the result.
  //
  // What it does now: treats "is this rock altered with this assemblage?" as a 0/1 INDICATOR sampled
  // along every hole that has any alteration logging (1 inside a target-assemblage interval, 0 inside
  // any other logged alteration interval), interpolates that indicator onto a regular grid with the same
  // estimateDenseGrid used by the numeric grade-shell tool, and extracts the 0.5 iso-surface with
  // marching cubes. That produces a genuinely closed envelope with no assumed up-direction — the
  // standard implicit construction for this kind of body, and the fix direction #272 asked for. No
  // GemPy/sidecar involvement any more, so it also runs offline and in a few hundred ms.
  //
  // Deliberate consequences worth knowing: (a) the structure layer no longer feeds this tool, because a
  // dip/azimuth constraint is meaningless for a closed envelope; (b) the search ellipsoid's
  // minimum-neighbour filter no longer applies (it exists to drop under-supported CONTACT picks), but
  // the anisotropy trend IS honoured, by warping into the same normalized space runSurfaceStack uses;
  // (c) the model domain still restricts which sample points are used.
  // TASKS.csv #1333 — the same envelope for a modelling code ("mcode:NAME"): 1 inside the intervals with that code, 0 in every
  // other logged lithology interval, so several intervals per hole make one closed unit, which a surface through tops cannot.
  // bodyOpts: a modelling code's own settings, TASKS.csv #1340 — { iso, largest, search, cell }; a code is a rock unit, so it follows the geology trend
  // TASKS.csv #1574 (review #1497, Lawyers) — source: { layer: "alt" | "custom:<id>", field, min }: the halo can be built from a
  // categorical custom layer (Lawyers' Silicification log, 2,753 intervals) and only from the intervals whose numeric field
  // (intensity 1-3) is at or above a value; null = the Alteration layer as before
  const runAlterationModel = (target, bodyOpts = {}, source = null) => {
    if (!target) return;
    const isCode = String(target).startsWith("mcode:");
    const customSrc = !isCode && source?.layer?.startsWith("custom:") ? (customLayers || []).find((c) => String(c.id) === source.layer.slice(7)) || null : null;
    const minField = !isCode && source?.field && Number.isFinite(Number(source.min)) ? { field: source.field, min: Number(source.min), vocab: !!source.vocab, label: source.minLabel || null } : null; // vocab, label: #2230
    const anisotropy = trendWarp(isCode ? "implicit" : "alteration"); // TASKS.csv #650
    const searchSetting = isCode ? bodyOpts.search || 0 : alterationSearchRadius, cellSetting = isCode ? bodyOpts.cell || 0 : alterationCellSize;
    let altValue = isCode ? String(target).slice(6) : target, sourceKey = isCode ? "litho" : source?.layer === "vein" ? "vein" : source?.layer === "litho" ? "litho" : "alt"; // vein: #2050; litho: #2226
    if (!isCode && source?.layer === "weath") sourceKey = "weath"; // TASKS.csv #2529 — the Weathering layer as an envelope (top of fresh rock, oxide zone)
    const isTargetRow = (r) => (isCode ? effectiveCode(r, modellingCodes, mcodeGroupOf) === altValue : String(r.value) === String(altValue) && (!minField || (minField.vocab ? (intensityRank(r[minField.field]) ?? -1) : Number(r[minField.field])) >= minField.min)); // minField: #1574; vocab (letters ranked): #2230
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, noCollarsNotice(isCode ? tr("the unit body") : tr("the alteration model"), layers, assays)]); return; }

    const domain = domains.find((d) => d.id === modelDomainId);
    const o = originRef.current;
    // TASKS.csv #2782 (split from #2540) — one name for the body of a code whatever the route: 'Envelope: P' from Lithology, a custom layer,
    // Weathering (#2529) or Modelling codes (it was 'Unit body: P' and 'Alteration halo: Rock2 P'); an Alteration code stays a halo, a vein set
    // its envelope. The intensity floor stays in the name (it defines the body); the source layer is a setting (params.sourceLayer), and
    // repeats are told apart by the settings that differ (lib/viewer/surfaceLabels.js).
    const head = sourceKey === "vein" ? "Vein set envelope" : sourceKey === "alt" && !customSrc ? "Alteration halo" : "Envelope";
    const label = `${head}: ${altValue}${minField ? ` (${minField.field} ≥ ${minField.vocab ? (minField.label || minField.min) : minField.min})` : ""}`; // #1574; vein: #2050
    setAlterationBusy(true);
    ownTask(label).set(20); // #2379
    // Deferred exactly like runNumericModel (see its comment) so the busy state paints before the
    // synchronous grid pass — a timer, not rAF, because rAF never fires in a hidden window.
    setTimeout(async () => {
      try {
        const { marchingCubes } = await import("../../lib/marchingCubes.js"); // #476 — loaded on first use
        const { samplePointsFromIntervals } = await import("../../lib/estimation.js"); // #552 — on demand
        const { runEstimation } = await import("../../lib/estimationClient.js"); // #520 — the grid runs in a worker
        const altRows = ((customSrc ? (modelArea === "checked" ? restrictRowsToHoles(customSrc.rows || [], visibleHoles) /* #2535 — a custom layer is not in the area-restricted layers */ : customSrc.rows) : layers[sourceKey]) || []).filter((r) => r.hole_id != null && r.from != null && r.to != null && !isNaN(r.from) && !isNaN(r.to) && Number(r.to) > Number(r.from)); // customSrc: #1574
        // TASKS.csv #52 (c) — an active intercept set restricts the TARGET picks only. The zeros (every
        // other logged alteration interval) are what close the envelope (#272), so filtering those by a
        // set the user built to describe the target would open the halo up instead of narrowing it.
        const targetRows = altRows.filter((r) => isTargetRow(r) && !excludedIntercepts.includes(interceptId(sourceKey, r)) && interceptInActiveSet(interceptId(sourceKey, r)));
        if (!targetRows.length) throw new Error(isCode ? tr("No intervals have the code \"{altValue}\" — nothing to model.", { altValue }) : tr("No alteration intervals found for \"{altValue}\" — nothing to model.", { altValue }));

        // Auto parameters come from the spacing of the holes that actually carry alteration logging,
        // not every collar in the project — a regional hole 5 km away shouldn't set the halo's scale.
        const loggedHoles = new Set(altRows.map((r) => r.hole_id));
        const auto = autoHaloParams(collars.filter((c) => loggedHoles.has(c.hole_id)), tracesRef.current || null); // traces: #2228 — fans share a collar
        if (auto.fromTraces && !(searchSetting > 0 && cellSetting > 0)) setNotices((p) => [...p, notice("Auto cell and search from the hole spacing along the traces ({t} m at depth): the collars of these holes cluster ({c} m apart: fans drilled from shared sites), so their spacing says nothing about the rock between the holes.", { t: Math.round(auto.spacing), c: auto.collarSpacing != null ? auto.collarSpacing.toFixed(2) : "?" })]);
        // TASKS.csv #1683 — a unit body's auto cell and search come from the code's own logged runs (an alteration halo keeps the
        // hole-spacing rule: it is a halo around the holes, not a logged body)
        // TASKS.csv #2530 (review #2486, WA lithium) — a Lithology or Weathering code set as an envelope is a logged body too: the same rule as
        // Closed body of a unit (15 m search there), not the halo's hole-spacing rule (60 m), which gave the same pegmatite 4.85 Mm³ against 0.53
        const loggedBody = isCode || sourceKey === "litho" || sourceKey === "weath";
        const codeRuns = loggedBody ? mergedRuns(targetRows) : [];
        const autoB = loggedBody ? autoBodyParams(codeRuns.map((r) => r.to - r.from), auto) : auto;
        let radius = searchSetting > 0 ? searchSetting : autoB.radius, radiusRaisedFrom = null;
        const cs = cellSetting > 0 ? cellSetting : autoB.cell;

        // Indicator intervals: 1 inside the target assemblage, 0 inside any other logged alteration.
        // The zeros are what CLOSE the envelope — without a "definitely not altered" sample between two
        // altered holes, an indicator interpolation has nothing pulling it back below 0.5.
        const subLen = Math.max(0.5, cs / 2);
        const intervals = [];
        altRows.forEach((r) => {
          const isTarget = isTargetRow(r);
          if (isTarget && excludedIntercepts.includes(interceptId(sourceKey, r))) return; // #84 — reviewed-out intercepts never model
          if (isTarget && !interceptInActiveSet(interceptId(sourceKey, r))) return; // #52 (c) — target picks outside the active set
          splitIntervalForSampling(Number(r.from), Number(r.to), subLen).forEach((seg) => {
            intervals.push({ hole_id: r.hole_id, from: seg.from, to: seg.to, avgGrade: isTarget ? 1 : 0 });
          });
        });
        // TASKS.csv #2380 (review #2325, WA uranium) — logged rock with no alteration row: unknown (as before) or, when asked, unaltered (a 0).
        // Said either way, with the metres, so a halo that grew through such gaps (SIL: 715 Mm³ from 2 m silcrete rows) is explained.
        const gaps = !isCode && sourceKey === "alt" && !customSrc ? rockWithoutRows(layers.litho || [], altRows) : null;
        if (gaps && gaps.metres > 0) {
          if (bodyOpts.unloggedZero) gaps.rows.forEach((r) => splitIntervalForSampling(r.from, r.to, subLen).forEach((seg) => intervals.push({ hole_id: r.hole_id, from: seg.from, to: seg.to, avgGrade: 0 })));
          setNotices((p) => [...p, bodyOpts.unloggedZero
            ? notice("{m} m of logged rock in {n} hole(s) with no alteration row counted as unaltered (0), so the halo closes there.", { m: Math.round(gaps.metres).toLocaleString(), n: gaps.holes })
            : notice("{m} m of logged rock in {n} hole(s) has no alteration row and counted as unknown, not unaltered, so nothing pulls the halo in there. If this log records alteration only where seen, tick \"Count logged rock with no alteration row as unaltered\".", { m: Math.round(gaps.metres).toLocaleString(), n: gaps.holes })]);
        }
        // TASKS.csv #2531 (review #2486) — a unit body: the drilled metres with no rock code are unknown (as before) or, when asked, outside the
        // unit (a 0), so selectively logged grade-control holes close the body; said either way, with the share of the drilling
        if (isCode && !customSrc) {
          // TASKS.csv #2920 (WA iron review) — the Model area's holes only: every hole outside it was counted as a hole with no log (6,165 of them)
          const holesHere = new Set((tracesRef.current || []).filter((t) => modelArea !== "checked" || visibleHoles?.[t.hole_id] !== false).map((t) => t.hole_id));
          const un = unloggedDrilling(collars.filter((c) => !holesHere.size || holesHere.has(c.hole_id)), altRows, () => true); // any lithology row covers its metres: a blank-code row is already an outside (0) sample above
          if (un.metres > 0.5) {
            // TASKS.csv #2634 — where the log is blank and the hole is assayed for the chosen element, the assay decides: at or above the typed
            // cut-off inside the unit, below it outside (lab grades, QC inserts out); the blank metres no assay covers keep the #2531 rule
            const aSym = bodyOpts.assaySymbol, aCut = Number(bodyOpts.assayCutoff);
            const aUnit = (assayElements.find((e) => e.symbol === aSym) || {}).unit || "ppm";
            const ai = aSym && aCut > 0 ? assayIndicatorInGaps(un.rows, resolvedSegments(excludeQAQC(assays), aSym, aUnit, Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]))), aCut) : null;
            if (ai) {
              ai.inside.forEach((r) => splitIntervalForSampling(r.from, r.to, subLen).forEach((seg) => intervals.push({ hole_id: r.hole_id, from: seg.from, to: seg.to, avgGrade: 1 })));
              ai.outside.forEach((r) => splitIntervalForSampling(r.from, r.to, subLen).forEach((seg) => intervals.push({ hole_id: r.hole_id, from: seg.from, to: seg.to, avgGrade: 0 })));
              setNotices((p) => [...p, notice("Where the log is blank, {sym} decided: {a} m at or above {cut} {unit} counted as inside {code}, {b} m below it as outside, in {n} hole(s).", { sym: aSym, a: Math.round(ai.insideM).toLocaleString(), cut: aCut, unit: gradeUnitLabel(aSym, aUnit), code: altValue, b: Math.round(ai.outsideM).toLocaleString(), n: ai.holes })]);
            }
            if (bodyOpts.unloggedOutside) (ai ? ai.rest : un.rows).forEach((r) => splitIntervalForSampling(r.from, r.to, subLen).forEach((seg) => intervals.push({ hole_id: r.hole_id, from: seg.from, to: seg.to, avgGrade: 0 })));
            setNotices((p) => [...p, bodyOpts.unloggedOutside
              ? notice("{m} of {d} m drilled in {n} hole(s) have no rock code ({nl} hole(s) with no log at all): counted as outside {code}, so the body closes there.", { m: Math.round(ai ? Math.max(0, un.metres - ai.insideM - ai.outsideM) : un.metres).toLocaleString() /* #2634: less the assay-decided metres */, d: Math.round(un.drilled).toLocaleString(), n: un.holes, nl: un.noLog, code: altValue })
              : notice("{m} of {d} m drilled in {n} hole(s) have no rock code ({nl} hole(s) with no log at all): counted as unknown, not outside {code}, so nothing stops the body there. If these holes were logged only where the unit is (grade-control drilling), tick \"Treat unlogged metres as outside\".", { m: Math.round(ai ? Math.max(0, un.metres - ai.insideM - ai.outsideM) : un.metres).toLocaleString() /* #2634: less the assay-decided metres */, d: Math.round(un.drilled).toLocaleString(), n: un.holes, nl: un.noLog, code: altValue })]);
          }
        }
        const { points: worldPts, dropped } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        if (!worldPts.length) throw new Error(isCode ? tr("No sample points could be placed in 3D — check that the logged holes have collars.") : tr("No alteration sample points could be placed in 3D — check that the logged holes have collars."));

        // World -> api (east, north, up, origin-relative) — the space every spatial control in this
        // module (domain test, anisotropy warp) already speaks.
        let pts = worldPts.map((p) => ({ ...p, x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }));
        if (domain) {
          const before = pts.length;
          pts = pts.filter((p) => pointInDomain(apiToScene([p.x, p.y, p.z]), domain, implicitMeshesRef.current));
          if (pts.length < before) setNotices((q) => [...q, notice(isCode ? "Domain \"{name}\": excluded {v} of {before} sample point(s) outside the domain." : "Domain \"{name}\": excluded {v} of {before} alteration sample point(s) outside the domain.", { name: domain.name, v: before - pts.length, before })]);
        }
        const insideCount = pts.filter((p) => p.value >= 0.5).length;
        if (!insideCount) throw new Error(domain
          ? tr("No \"{altValue}\" intervals fall inside domain \"{name}\" — nothing to model.", { altValue, name: domain.name })
          : tr("No \"{altValue}\" sample points could be placed — nothing to model.", { altValue }));

        // TASKS.csv #86 — same normalized-space trick runSurfaceStack uses: warp every point into the
        // space where the declared anisotropy ellipsoid is a sphere, grid/isosurface there with an
        // isotropic search, then un-warp the resulting mesh vertices. An isotropic interpolator in
        // warped space IS an anisotropic one in real space.
        const basis = anisotropy.enabled ? anisotropy.basis : null;
        const scl = anisotropy.enabled ? anisotropy.scales : null;
        // TASKS.csv #2780 (DECISION 2026-11-12) — under a trend, the runs' automatic reach is the reach ACROSS the layer, times the trend's ratio
        // along it (at least the hole spacing); said, with the old reach, since a saved body differs from a rebuilt one
        if (anisotropy.enabled && isCode && autoB.fromRuns && !(searchSetting > 0)) {
          const tr2780 = trendBodyReach(autoB.radius, scl, autoB.spacing);
          if (tr2780) {
            radius = tr2780.alongM;
            const m1 = (v) => +v.toFixed(1);
            setNotices((p) => [...p, notice(tr2780.bySpacing ? "\"{label}\": under the trend \"{trend}\" ({ratio}) the automatic search now reaches {along} m along the layer (the {s} m hole spacing, so a node between two holes reaches one) and {across} m across it (by the trend's ratio; the logged runs of {code} alone give {runs} m). Before, the runs' reach was the long axis: {oldAlong} m along and {oldAcross} m across. A body of {code} saved earlier was built with the old reach and differs from one built now." : "\"{label}\": under the trend \"{trend}\" ({ratio}) the automatic search now reaches {across} m across the layer (from the logged runs of {code}) and {along} m along it (that times the trend's ratio). Before, the runs' reach was the long axis: {oldAlong} m along and {oldAcross} m across. A body of {code} saved earlier was built with the old reach and differs from one built now.", { runs: m1(tr2780.runsAcrossM), label, trend: anisotropy.params?.trend || "", ratio: trendRatioText(anisotropy.params), code: altValue, across: m1(tr2780.acrossM), along: m1(tr2780.alongM), s: m1(autoB.spacing || 0), oldAlong: m1(tr2780.oldAlongM), oldAcross: m1(tr2780.oldAcrossM) })]);
          }
        }
        const center = anisotropy.enabled
          ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length }
          : null;
        const gridPts = anisotropy.enabled ? pts.map((p) => anisoWarpPoint(p, center, basis, scl)) : pts;

        // Grid extent: the ALTERED points' own box (the zeros only need to be inside the search radius
        // of it, not inside it), padded by the search radius so the envelope has room to close outside
        // the outermost altered sample instead of being cut flat at it.
        const inside = gridPts.filter((p) => p.value >= 0.5);
        const xr = minMax(inside.map((p) => p.x)), yr = minMax(inside.map((p) => p.y)), zr = minMax(inside.map((p) => p.z));
        const pad = anisotropy.enabled ? radius * scl.major : radius; // #656 — the search reach, in the warped grid's units
        const bounds = { xmin: xr.min - pad, xmax: xr.max + pad, ymin: yr.min - pad, ymax: yr.max + pad, zmin: zr.min - pad, zmax: zr.max + pad };
        // Keep the grid under estimation.js's MAX_BLOCKS by coarsening rather than throwing: the auto
        // cell size is derived from hole spacing, which says nothing about how BIG the padded box is.
        let cell = cs;
        const cellsAt = (c) => Math.max(1, Math.round((bounds.xmax - bounds.xmin) / c)) * Math.max(1, Math.round((bounds.ymax - bounds.ymin) / c)) * Math.max(1, Math.round((bounds.zmax - bounds.zmin) / c));
        let coarsened = false;
        while (cellsAt(cell) > MAX_BLOCKS * 0.75) { cell *= 1.5; coarsened = true; }
        // TASKS.csv #2384 (Matt's decision 2026-11-11) — a thin, wide unit whose cubic cell would pass its thickest run gets a cell height of its
        // own (from the median logged run) and a plan cell from the hole spacing, counted on that grid; not under a geology trend (its warped frame)
        const cellsAt3 = (c, cz) => Math.max(1, Math.round((bounds.xmax - bounds.xmin) / c)) * Math.max(1, Math.round((bounds.ymax - bounds.ymin) / c)) * Math.max(1, Math.round((bounds.zmax - bounds.zmin) / cz));
        const seam = isCode && !anisotropy.enabled && !(cellSetting > 0) ? seamCells(cell, autoB, cellsAt3, MAX_BLOCKS * 0.75) : null;
        const cubicWouldBe = cell;
        let cellZ = cell;
        if (seam) { cell = seam.dxy; cellZ = seam.dz; coarsened = seam.coarsened; }
        const cellText = cellZ !== cell ? `${cell} × ${cell} × ${cellZ}` : cell; // what every message and the parameters say
        if (radius < 1.5 * cell) { radiusRaisedFrom = radius; radius = 1.5 * cell; } // #1683 — a search under a cell and a half finds nothing at most nodes
        // TASKS.csv #2047 — say it before the run, not after two minutes: the coarsened cell is thicker than any logged run of the code
        const past = isCode && !seam ? bodyCellPastRuns(cell, autoB, coarsened) : null;
        if (seam) { const km = (a) => +((a.max - a.min) / 1000).toFixed(1); setNotices((p) => [...p, notice("\"{label}\": {code} is logged in thin runs (median {med} m, {max} m at most) over {w} × {h} km, so one cubic cell would be {cube} m, thicker than any run. The grid uses {dx} × {dx} × {dz} m cells instead: the height from the logged runs, the plan from the {s} m hole spacing. Between holes the search is still a sphere. To flatten it along the layer: Model settings › Structural trends › New trend; in 'Set the plane from…' pick 'Tops of a logged unit (best-fit plane)' › {code}; then under 'Used by' choose that trend for 'Geology models (implicit surfaces, stacks)' (the GemPy implicit and stack runs follow it too). A seam may fit better as paired hangingwall / footwall surfaces: Veins / dykes.", { label, code: altValue, /* #2749: the steps named */ med: +autoB.medianRunM.toFixed(1), max: +autoB.maxRunM.toFixed(1), w: km(xr), h: km(yr), cube: +cubicWouldBe.toFixed(1), dx: seam.dxy, dz: seam.dz, s: Math.round(autoB.spacing) })]); } // #2384 — said before the run
        if (past) {
          const km = (a) => +((a.max - a.min) / 1000).toFixed(1);
          const msg = tr("\"{label}\": to stay under the grid limit the {cs} m cells would be coarsened to {cell} m, larger than the thickest logged run of {code} ({max} m). A body cannot be thinner than a cell, so it cannot follow the logged runs: after a long run it will most likely not appear, or appear where {code} was not logged. The {code} runs span {w} × {h} km: model a smaller area first (Model settings › Model area with the holes of one cluster checked, a domain, or an intercept set).", { label, cs: +cs.toFixed(1), cell: cellZ !== cell ? cellText : +cell.toFixed(1) /* #2384 */, code: altValue, max: +past.maxRunM.toFixed(1), w: km(xr), h: km(yr) });
          if (!window.confirm(`${msg}

${tr("OK runs it anyway; Cancel stops here.")}`)) { const stop = new Error(msg); stop.stopped = true; throw stop; }
        }
        if (isCode && autoB.fromRuns && !(searchSetting > 0) && !(cellSetting > 0)) setNotices((p) => [...p, notice("\"{label}\": auto settings from the {n} logged run(s) of {code} (median {med} m, {max} m at most): {cs} m cells and a {r} m search{v}. The body follows the logged intervals; a larger search joins holes, but what it puts between them is an assumption.", { label, n: autoB.runs, code: altValue, med: +autoB.medianRunM.toFixed(1), max: +autoB.maxRunM.toFixed(1), cs: +cs.toFixed(1), r: Math.round(autoB.radius), v: coarsened ? tr(" (coarsened to {cell} m cells to stay under the grid limit, the search raised to {r2} m)", { cell: cellZ !== cell ? cellText : +cell.toFixed(1) /* #2384 */, r2: Math.round(radius) }) : "" })]);

        // TASKS.csv #520 — the grid runs in a worker: progress + Cancel on the status bar, the window keeps painting
        const ac = new AbortController();
        const grid = await runEstimation("dense", gridPts, {
          bounds, cellSize: { dx: cell, dy: cell, dz: cellZ /* #2384 */ }, method: "idw2",
          searchRadius: anisotropy.enabled ? radius * scl.major : radius, minSamples: 1, maxSamples: 16, minHoles: 1, // #656 — major semi-axis = radius
        }, { signal: ac.signal, onProgress: (f) => ownTask(label).set(20 + 60 * f, () => ac.abort()) });
        if (!grid.estimated) throw new Error(isCode ? tr("No grid cell had a sample within the search radius — increase the search radius.") : tr("No grid cell had an alteration sample within the search radius — increase the search radius."));
        // noData: "outside" — a no-data cell reads as "not altered", which is what lets the envelope
        // close against the edge of the informed region instead of leaving an open shell.
        // TASKS.csv #803 — closed at the terrain surface when "Cut at topography" is on
        const altUnwarp = anisotropy.enabled ? invScales(scl) : null;
        const iso = isCode && bodyOpts.iso > 0 && bodyOpts.iso < 1 ? bodyOpts.iso : 0.5; // #1339
        // TASKS.csv #2634 — this grid is origin-relative: the ground is looked up in its frame (it was looked up at origin-relative x, y, so a
        // body or halo was never cut); with no terrain, the collar surface (as the GemPy cut, #2470), unless the collars look drilled from underground
        const altG = clipToTopo ? modelGround(terrainForClipRef.current, collars, survey) : null, altGround = altG?.ground || null;
        const altCap = groundCappedGrid(grid, iso, groundAtInFrame(altGround, o), anisotropy.enabled ? (q) => anisoWarpPoint(q, center, basis, altUnwarp) : null);
        // TASKS.csv #2711 (split from #2634) — the cut closes within a cell of the ground: 37-43 m cells on Harry kept up to a cell of air
        if (altCap.capped && cellZ >= 10) setNotices((p) => [...p, notice("\"{label}\" is cut at the ground on {z} m tall cells, so its top follows the ground only to within about a cell: up to {z} m of air kept, or of rock lost, where it meets the surface. A smaller cell height follows the ground closer.", { label, z: +(+cellZ).toFixed(1) })]);
        if (altCap.capped && altGround?.kind === "collars") setNotices((p) => [...p, notice("No terrain is loaded, so \"{label}\" was cut at the collar surface: the ground interpolated between the {n} collars, inside their footprint. A terrain (Maps > Terrain) gives the real ground.", { label, n: altG.collars })]); // #2634
        const mc = marchingCubes(altCap.values, grid.nx, grid.ny, grid.nz, iso, {
          origin: grid.origin, spacing: grid.cellSize, noData: "outside",
        });
        if (!mc.faces.length) throw new Error(isCode ? tr("The interpolated \"{altValue}\" indicator never reaches {iso} — no body to extract (try a lower Inside at or a smaller cell size).", { altValue, iso }) + (autoB.maxRunM && cell > autoB.maxRunM ? " " + tr("The {cell} m cells are larger than the thickest logged run of {code} ({max} m): a body cannot be thinner than a cell. A smaller cell over fewer holes (a domain, or an intercept set) keeps the grid within its limit.", { cell: cellZ !== cell ? cellText : +cell.toFixed(1) /* #2384 */, code: altValue, max: +autoB.maxRunM.toFixed(1) }) : "") : tr("The interpolated \"{altValue}\" indicator never crosses 0.5 — no envelope to extract (try a larger search radius or a smaller cell size).", { altValue }) + ((() => { const m = targetRows.reduce((t, r) => t + (Number(r.to) - Number(r.from)), 0); return m < cell ? " " + tr("\"{altValue}\" is logged over only {m} m ({n} interval(s)), less than one {cell} m cell: too little of it for any cell to be half altered. A smaller cell size, or a code logged over more length, makes a halo.", { altValue, m: +m.toFixed(1), n: targetRows.length, cell: cellZ !== cell ? cellText : +cell.toFixed(1) /* #2384 */ }) : ""; })())); // #1421 — POT: one 0.5 m interval in 21 m cells
        // TASKS.csv #1683 — does the body contain the sample points of the code it was built from? (the nearest grid node of each
        // inside point against the indicator field the body is the iso-surface of). Fewer than half inside: it is not the unit,
        // and its volume is withheld.
        const contain = samplesInsideShell(gridPts, grid, altCap.values, iso); // #1740 — halos too (unit bodies since #1683)
        const withheld = !!(isCode && contain && contain.above > 0 && contain.inside < contain.above / 2);
        const haloMisses = !isCode && contain && contain.above > 0 && contain.inside < contain.above / 2;
        // #1339 — said on every run: separate bodies from one unit are a finding, and a dropped body is data left out
        const { meshBodies, keepLargestBody } = await import("../../lib/meshBodies.js"); // on demand: the startup budget
        const bodies = isCode ? meshBodies(mc.faces) : { count: 1 };
        if (bodyOpts.largest && bodies.count > 1) { const k = keepLargestBody(mc.vertices, mc.faces); mc.vertices = k.vertices; mc.faces = k.faces; }

        // api (un-warp if needed) -> scene, the same apiToScene every other surface in this module uses.
        const unwarp = anisotropy.enabled ? invScales(scl) : null;
        const pos = new Float32Array(mc.vertices.length * 3);
        mc.vertices.forEach(([ax, ay, az], i) => {
          const a = anisotropy.enabled ? anisoWarpPoint({ x: ax, y: ay, z: az }, center, basis, unwarp) : { x: ax, y: ay, z: az };
          const s = apiToScene([a.x, a.y, a.z]);
          pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z;
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setIndex(mc.faces.flat());
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: isCode ? (codeInfo(modellingCodes, altValue).color || colorForLithology(altValue)) : colorForAlteration(altValue), side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
        const vol = computeMeshVolume(geo);
        // TASKS.csv #1740 — the share of the envelope farther than 50 m (or a cell) from every sample point: search, not logs
        const { farFromSamples } = await import("../../lib/haloSupport.js");
        const farLogs = farFromSamples(altCap.values, grid.nx, grid.ny, grid.nz, grid.origin, grid.cellSize, iso, pts, Math.max(50, cell), { toReal: anisotropy.enabled ? (q) => anisoWarpPoint(q, center, basis, altUnwarp) : null });
        // TASKS.csv #2757 (from #2384) — the share more than ONE HOLE SPACING from every logged interval: beyond the drilling. #1740's
        // distance is the larger of 50 m and the cell, and a coarse plan cell (180.7 m on WA uranium's LIG, holes 76 m apart) hid that
        // 7.6 of the body's 14.1 Mm³ lay beyond the drilling
        const beyondSp = auto.spacing > 0 ? farFromSamples(altCap.values, grid.nx, grid.ny, grid.nz, grid.origin, grid.cellSize, iso, pts, auto.spacing, { toReal: anisotropy.enabled ? (q) => anisoWarpPoint(q, center, basis, altUnwarp) : null }) : null;
        // Same honesty rule as the grade shell (#257): if part of the boundary is the search-radius
        // wall rather than a real 0/1 alteration boundary, the enclosed volume is a parameter choice.
        const closure = mc.closingVertices > 0 ? "artificial" : "natural";
        // TASKS.csv #276 — provenance for this surface, so the panel and every export can stamp it.
        const params = {
          tool: isCode ? "unit body (indicator envelope)" : "alteration halo (indicator envelope)", target: altValue, isoLevel: iso,
          sourceLayer: customSrc ? customSrc.name : isCode ? "Modelling codes" : SOURCE_NAME[sourceKey] || sourceKey, // #2782
          ...(minField ? { intensityFloor: { field: minField.field, atLeast: minField.vocab ? (minField.label || minField.min) : minField.min, ...(minField.vocab ? { rank: minField.min, scale: INTENSITY_SCALE } : {}) } } : {}), // #2230 ...(bodies.count > 1 ? { bodies: bodies.count, keptLargestOnly: !!bodyOpts.largest } : {}), // #1339
          method: "idw2", searchRadiusM: radius, searchRadiusAuto: !(searchSetting > 0),
          ...(anisotropy.enabled ? { searchEllipsoidM: [1, scl.major / scl.semiMajor, scl.major / scl.minor].map((f) => Math.round(radius * f * 10) / 10) } : {}), // #656
          cellSizeM: cellText, ...(seam ? { cellHeightM: cellZ, cellHeightFrom: "the median logged run (#2384)" } : {}), cellSizeAuto: !(cellSetting > 0), cellSizeCoarsened: coarsened,
          paddingM: pad, closure, holeSpacingM: auto.spacing, cutAtTopography: altCap.capped ? `${altGround?.name || "terrain"}: ${altCap.capped} grid node(s) capped (#803)` : false,
          anisotropy: anisotropy.enabled ? anisotropy.params : null,
          domain: domain ? domain.name : null,
          interceptSet: activeInterceptSetRef.current ? { name: activeInterceptSetRef.current.name, intercepts: (activeInterceptSetRef.current.ids || []).length } : null, // TASKS.csv #52 (c)
          samplePoints: pts.length, alteredSamplePoints: insideCount, cellsEstimated: grid.estimated,
          farFromLogs: { share: +farLogs.share.toFixed(3), beyondM: farLogs.dist }, // #1740
          ...(beyondSp ? { beyondDrilling: { share: +beyondSp.share.toFixed(3), holeSpacingM: Math.round(auto.spacing) } } : {}), // #2757
          ...(contain ? { samplesInside: { inside: contain.inside, of: contain.above }, volumeWithheld: withheld } : {}), // #1683
          ...(isCode && autoB.fromRuns ? { loggedRuns: { n: autoB.runs, medianM: +autoB.medianRunM.toFixed(2), maxM: +autoB.maxRunM.toFixed(2) } } : {}),
          ...(radiusRaisedFrom != null ? { searchRaisedFromM: Math.round(radiusRaisedFrom * 10) / 10 } : {}),
          generatedAt: new Date().toISOString(),
        };
        mesh.userData = { tip: `${label}\n${mc.vertices.length} vertices, ${mc.faces.length} faces\nindicator envelope, ${cellZ !== cell ? cellText : cell.toFixed(1)} m cells, ${Math.round(radius)} m search${vol.watertight ? `\n${roundVolume(vol.volumeM3).toLocaleString()} m³ enclosed (about)` : "\n(open envelope)"}` };
        implicitGroupRef.current?.add(mesh);
        const id = `impl_${Date.now()}_alt_${altValue}`;
        implicitMeshesRef.current[id] = mesh;
        setImplicitSurfaces((p) => [...p, { id, name: label, visible: true, vertexCount: mc.vertices.length, faceCount: mc.faces.length, type: isCode ? "unit_body" : "alteration_envelope", /* #1340 */ relationships: [], closure, params }]);
        setNotices((p) => [...p, notice(isCode ? "Added \"{label}\": {insideCount} of {pts} sample point(s) inside the code{v} → {nx}×{ny}×{nz} grid ({cell} m cells{v2}, {v3} m search{v4}) → {vertices} vertices / {faces} faces{v5}. Closed indicator envelope, not a draped contact." : "Added \"{label}\": {insideCount} altered of {pts} indicator sample point(s){v} → {nx}×{ny}×{nz} grid ({cell} m cells{v2}, {v3} m search{v4}) → {vertices} vertices / {faces} faces{v5}. Closed indicator envelope, not a draped contact.", { label, insideCount, pts: pts.length, v: dropped ? tr(", {dropped} unplaceable", { dropped }) : "", nx: grid.nx, ny: grid.ny, nz: grid.nz, cell: cellZ !== cell ? cellText : cell.toFixed(1) /* #2384 */, v2: coarsened ? tr(", coarsened to stay under the grid limit") : "", v3: Math.round(radius), v4: anisotropy.enabled ? tr(", anisotropy applied") : "", vertices: mc.vertices.length.toLocaleString(), faces: mc.faces.length.toLocaleString(), v5: vol.watertight ? tr(", closed (about {volumeM3} m³)", { volumeM3: roundVolume(vol.volumeM3).toLocaleString() }) : tr(", open") })]); // about: #2530, two significant figures
        // TASKS.csv #2530 — a check on the order of the volume, by hand: the code's logged length times the area each hole stands for
        { const hc = vol.watertight && loggedBody ? loggedVolumeCheck(codeRuns, auto.spacing) : null; if (hc) setNotices((p) => [...p, notice("A hand check on \"{label}\": {m} m of it logged in {n} hole(s), times the {s} m hole spacing squared, is about {v} m³ (logged lengths, not true thicknesses). The envelope's {e} m³ follows its {cell} m cells and {r} m search.", { label, m: Math.round(hc.metres).toLocaleString(), n: hc.holes, s: Math.round(hc.spacingM), v: roundVolume(hc.m3).toLocaleString(), e: roundVolume(vol.volumeM3).toLocaleString(), cell: cellZ !== cell ? cellText : cell.toFixed(1) /* #2384 */, r: Math.round(radius) })]); }
        const sayBeyond = !!(beyondSp && beyondSp.inside && beyondSp.share >= 0.05); // #2757
        if (sayBeyond) setNotices((p) => [...p, (beyondSp.share >= 0.5 ? errorNotice : notice)(tr("\"{label}\": {p}% of its volume lies more than one hole spacing ({s} m) from any logged interval: beyond the drilling, where its shape comes from the {r} m search and the cells, not from logged rock.", { label, p: Math.round(beyondSp.share * 100), s: Math.round(auto.spacing), r: Math.round(radius) }))]);
        // #1740's line too when its distance is shorter than the spacing (it then also counts the gaps between holes)
        if (farLogs.inside && (!sayBeyond || farLogs.dist < 0.9 * auto.spacing)) { // #1740 — half or more of it far from the logs: a warning, not a grey note
          const farText = tr("\"{label}\": {p}% of its volume lies farther than {d} m from any logged interval: that part is the {r} m search reaching between holes, not logged rock.", { label, p: Math.round(farLogs.share * 100), d: Math.round(farLogs.dist), r: Math.round(radius) });
          setNotices((p) => [...p, farLogs.share >= 0.5 ? errorNotice(farText) : notice(farText)]);
        }
        if (haloMisses) setNotices((p) => [...p, errorNotice(tr("\"{label}\" contains only {n} of the {m} sample points of {code} it was built from: the indicator reached {iso} away from the logged intervals, so this envelope is mostly not where {code} was logged.", { label, n: contain.inside, m: contain.above, code: altValue, iso }))]); // #1740
        else if (contain) setNotices((p) => [...p, withheld
          ? errorNotice(tr("\"{label}\" contains only {n} of the {m} sample points of {code} it was built from, so it is NOT that unit: the indicator reached {iso} away from the logged intervals ({cell} m cells, {r} m search). Its volume and tonnage are withheld. A smaller cell and a search near the intervals follow the logs; a larger search joins holes but invents rock between them.", { label, n: contain.inside, m: contain.above, code: altValue, iso, cell: cellZ !== cell ? cellText : +cell.toFixed(1) /* #2384 */, r: Math.round(radius) }))
          : notice("\"{label}\" contains {n} of the {m} sample points of {code} it was built from{v}.", { label, n: contain.inside, m: contain.above, code: altValue, v: contain.inside < contain.above ? tr(" ({k} outside: logged intervals the body does not reach)", { k: contain.above - contain.inside }) : "" })]); // #1683
        if (bodies.count > 1) setNotices((p) => [...p, bodyOpts.largest
          ? notice("\"{label}\": threshold {iso}. Kept the largest of {n} separate bodies, {p} % of the triangles; the other {m} were left out.", { label, iso, n: bodies.count, p: Math.round(bodies.largestShare * 100), m: bodies.count - 1 })
          : notice(anisotropy.enabled /* TASKS.csv #2538 (review #2486): with a trend on, 'a geology trend can join them' was wrong (23 bodies with it, 16 without) */
            ? "\"{label}\": threshold {iso} gives {n} separate bodies under the structural trend; the largest has {p} % of the triangles. The trend's ratios shorten the search across its plane, which can split a body: compare a run without the trend. A lower \"Inside at\" can join them, but can also add small separate bodies around isolated holes (Modelling codes)."
            : "\"{label}\": threshold {iso} gives {n} separate bodies; the largest has {p} % of the triangles. A lower \"Inside at\" or a geology trend can join them, but a lower threshold can also add small separate bodies around isolated holes (Modelling codes).", { label, iso, n: bodies.count, p: Math.round(bodies.largestShare * 100) })]);
        if (closure === "artificial") setNotices((p) => [...p, notice(isCode ? "\"{label}\" closes partly against the search-radius boundary rather than a logged interval of another code, so its extent there reflects the {v} m search radius, not the data." : "\"{label}\" closes partly against the search-radius boundary rather than a logged alteration boundary, so its extent there reflects the {v} m search radius, not the data.", { label, v: Math.round(radius) })]);
        fitBox(new THREE.Box3().setFromObject(mesh));
      } catch (e) {
        setNotices((p) => [...p, e?.cancelled ? notice(isCode ? "Unit body cancelled." : "Alteration halo cancelled.") : e?.stopped ? infoNotice(tr("Unit body not built: {v}", { v: e.message })) /* #2047 */ : errorNotice(isCode ? tr("Unit body failed: {v}", { v: e.message || e }) : tr("Alteration halo failed: {v}", { v: e.message || e }))]);
      }
      ownTask(label).clear(); // #2379 — only this tool's entry
      setAlterationBusy(false);
    }, 40);
  };

  // TASKS.csv #144 — vein/dyke hangingwall–footwall modelling.
  //
  // Why this is its own tool and not a call into the stack/structural machinery: a vein intercept gives
  // TWO contacts of ONE structure (the from-depth and the to-depth of the logged interval) plus a true
  // thickness between them. The stack tool refuses cross-cutting bodies by design, and the structural
  // tool fits a single self-referential surface, so neither can express "these two surfaces belong
  // together and must stay a consistent thickness apart". The construction — one midplane plus a
  // thickness field, offset by ±t/2 to get the pair — lives in src/lib/vein.js, which documents in full
  // why it was chosen over fitting the two contacts independently (short version: with a positive
  // thickness field the two surfaces CANNOT cross, so negative thickness is impossible by construction
  // rather than something to detect afterwards).
  //
  // Like the alteration halo (#272) this runs entirely in-app — no GemPy/sidecar. GemPy's stratigraphic
  // machinery models a scalar field with an assumed polarity and would have to be run twice, once per
  // contact, with nothing tying the two runs together — exactly the failure mode this row exists to
  // avoid.
  const runVeinModel = (veinPick) => {
    if (!veinPick) return;
    // TASKS.csv #2226 — 'litho:<code>': a vein logged as a lithology code
    // TASKS.csv #2533 — 'mcode:<name>': a single sheet split out in Modelling codes (cross-cutting), its rows by their effective code
    const isMcodeVein = String(veinPick).startsWith("mcode:");
    const veinLayer = String(veinPick).startsWith("litho:") || isMcodeVein ? "litho" : "vein", veinValue = veinLayer === "litho" ? String(veinPick).slice(6) : veinPick;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, noCollarsNotice(tr("the vein model"), layers, assays)]); return; }
    const o = originRef.current;
    const domain = domains.find((d) => d.id === modelDomainId);
    const label = tr("Vein: {v}", { v: veinValue }); // #1974
    setVeinBusy(true);
    ownTask(label).set(20); // #2379
    setTimeout(async () => {
      let logged = null; // #1415 — read by the catch below
      try {
        const { buildVeinModel } = await import("../../lib/vein.js"); // #144; loaded on first use (#476)
        const traceOf = new Map(traces.map((t) => [t.hole_id, t]));
        const rows = (layers[veinLayer] || []).filter((r) => (isMcodeVein ? effectiveCode(r, modellingCodes, mcodeGroupOf) === veinValue : r.value === veinValue) && r.hole_id != null
          && r.from != null && r.to != null && !isNaN(r.from) && !isNaN(r.to) && Number(r.to) > Number(r.from)
          && !excludedIntercepts.includes(interceptId(veinLayer, r)) // #84 — reviewed-out intercepts never model
          && interceptInActiveSet(interceptId(veinLayer, r))); // #52 (c) — restricted to the active intercept set, if any
        if (!rows.length) throw new Error(tr("No \"{veinValue}\" intervals found — nothing to model.", { veinValue }));
        // TASKS.csv #354 — back-to-back rows of this vein in one hole are one intercept (HW of the first,
        // FW of the last), not several thin ones that the midplane/thickness fit would read as separate veins.
        const mergedRows = mergeTouchingIntervals(rows);
        if (mergedRows.length < rows.length) setNotices((q) => [...q, notice("Vein \"{veinValue}\": {v} back-to-back row split(s) merged into single intercepts.", { veinValue, v: rows.length - mergedRows.length })]);

        // Both contacts of every intercept, in world ENU (east, north, elevation) — the frame vein.js,
        // trueWidth.js and stereonet.js all speak, so no conversion happens inside the maths.
        const intercepts = [];
        let unplaceable = 0;
        mergedRows.forEach((r) => {
          const t = traceOf.get(r.hole_id);
          if (!t) { unplaceable++; return; }
          const a = findOnTraceWorld(t, Number(r.from));
          const b = findOnTraceWorld(t, Number(r.to));
          if (!a || !b) { unplaceable++; return; }
          intercepts.push({ holeId: r.hole_id, from: Number(r.from), to: Number(r.to),
            hw: { x: a[0], y: a[1], z: a[2] }, fw: { x: b[0], y: b[1], z: b[2] } });
        });
        if (!intercepts.length) throw new Error(tr("No vein intercepts could be located in 3D — check that the logged holes have collars and survey."));

        let used = intercepts;
        if (domain) {
          const inDomain = (p) => pointInDomain(apiToScene([p.x - o.x, p.y - o.y, p.z - o.z]), domain, implicitMeshesRef.current);
          used = intercepts.filter((i) => inDomain(i.hw) || inDomain(i.fw));
          if (used.length < intercepts.length) setNotices((q) => [...q, notice("Domain \"{name}\": excluded {v} of {intercepts} vein intercept(s) outside the domain.", { name: domain.name, v: intercepts.length - used.length, intercepts: intercepts.length })]);
          if (!used.length) throw new Error(tr("No \"{veinValue}\" intercepts fall inside domain \"{name}\" — nothing to model.", { veinValue, name: domain.name }));
        }

        const dip = veinDip === "" ? null : Number(veinDip);
        const dipDir = veinDipDir === "" ? null : Number(veinDipDir);
        const typed = Number.isFinite(dip) && Number.isFinite(dipDir);
        // TASKS.csv #1415 — the oriented-core vein measurements at the intercepts: the attitude when the midpoints cannot fix
        // one, a check beside the fitted plane when they can
        const { loggedVeinAttitude } = await import("../../lib/veinOrientations.js");
        logged = typed ? null : loggedVeinAttitude(used, layers.structure, { veinValue });
        const fromLogs = logged?.n ? `mean of ${logged.n} oriented-core vein measurement(s) at the intercepts` : null;
        let model = buildVeinModel(used, {
          cellSize: veinCellSize > 0 ? veinCellSize : 0,
          searchRadius: veinSearchRadius > 0 ? veinSearchRadius : 0,
          ...(typed ? { dip, dipDir } : {}),
          ...(fromLogs ? { fallbackAttitude: { dip: logged.meanDip, dipDir: logged.meanDipDir, source: fromLogs } } : {}),
        });
        // TASKS.csv #1575 (review #1497, Lawyers) — a well-defined core attitude more than 30° from the midpoint plane wins: the
        // walls are rebuilt on it and the notice says so (Vn1a: 81° / 228° from 109 measurements against a 1.7° / 255.5° midplane)
        const { coreAttitudeWins } = await import("../../lib/veinOrientations.js");
        const fitted0 = model.plane ? { dip: model.plane.dip, dipDir: model.plane.dipDir } : null;
        const coreWins = !typed && model.plane?.attitudeSource === "fitted to intercept midpoints" ? coreAttitudeWins(fitted0, logged) : null;
        if (coreWins) model = buildVeinModel(used, { cellSize: veinCellSize > 0 ? veinCellSize : 0, searchRadius: veinSearchRadius > 0 ? veinSearchRadius : 0, dip: coreWins.dip, dipDir: coreWins.dipDir });

        const toScene = (p) => apiToScene([p.x - o.x, p.y - o.y, p.z - o.z]);
        const makeMesh = (part, color, opacity) => {
          const pos = new Float32Array(part.positions.length * 3);
          part.positions.forEach((p, i) => { const s = toScene(p); pos[i * 3] = s.x; pos[i * 3 + 1] = s.y; pos[i * 3 + 2] = s.z; });
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
          geo.setIndex(part.faces.flat());
          geo.computeVertexNormals();
          return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity }));
        };

        const th = model.thickness, ck = model.checks, pl = model.plane;
        const { coreAngleThickness } = await import("../../lib/veinCoreAngle.js"); // #1739
        const tca = coreAngleThickness(used, veinValue, [{ name: tr("Vein / dyke"), rows: layers.vein }, ...(customLayers || []).map((c) => ({ name: c.name, rows: c.rows }))]);
        const base = {
          tool: "vein/dyke (midplane + thickness field)", target: veinValue,
          construction: "one midplane surface plus an interpolated TRUE-thickness field, offset by ±t/2 along the reference pole — the hangingwall and footwall are the same structure, so they cannot cross",
          attitudeSource: pl.attitudeSource, dip: pl.dip, dipDir: pl.dipDir,
          rmsOffReferencePlaneM: pl.rmsOffPlane, planarityRatio: pl.planarity,
          intercepts: model.intercepts.length,
          trueThicknessMinM: th.trueMin, trueThicknessMaxM: th.trueMax, trueThicknessMeanM: th.trueMean,
          downholeThicknessMeanM: th.downholeMean, thicknessRefinedToLocalNormal: th.refined,
          trueThicknessFromCoreAngle: tca ? { column: tca.column, layer: tca.layer, intercepts: tca.n, minM: tca.min, maxM: tca.max, meanM: tca.mean } : null, // #1739
          cellSizeM: model.grid.cellSize, cellSizeAuto: !(veinCellSize > 0),
          searchRadiusM: model.grid.searchRadius, searchRadiusAuto: !(veinSearchRadius > 0),
          gridCoarsened: model.grid.coarsened, informedNodes: model.grid.informedNodes,
          contactResidualRmsM: ck.contactResidualRms, contactResidualMaxM: ck.contactResidualMax,
          midplaneLooRmsM: ck.midplaneLooRms, midplaneLooMaxM: ck.midplaneLooMax, incoherentSheet: ck.incoherentSheet,
          minSeparationM: ck.minSeparation, nonCrossingByConstruction: true, pinchOut: ck.pinchOut,
          nominalHwFwLabels: ck.nominalLabels,
          domain: domain ? domain.name : null,
          interceptSet: activeInterceptSetRef.current ? { name: activeInterceptSetRef.current.name, intercepts: (activeInterceptSetRef.current.ids || []).length } : null, // TASKS.csv #52 (c)
          generatedAt: new Date().toISOString(),
        };
        const stamp = (part, suffix, color, opacity, type, relationships = []) => {
          const mesh = makeMesh(part, color, opacity);
          const vol = computeMeshVolume(mesh.geometry);
          mesh.userData = { tip: `${label} — ${suffix}\n${part.positions.length} vertices, ${part.faces.length} faces` };
          implicitGroupRef.current?.add(mesh);
          const id = `impl_${Date.now()}_vein_${suffix}_${Math.random().toString(36).slice(2, 7)}`;
          implicitMeshesRef.current[id] = mesh;
          setImplicitSurfaces((p) => [...p, { id, name: `${label} — ${suffix}`, visible: true,
            vertexCount: part.positions.length, faceCount: part.faces.length, type,
            relationships, params: { ...base, part: suffix } }]);
          return { id, vol };
        };
        // Footwall first, so the hangingwall can be created already declaring "is above" it — the
        // relationship #90's topology checker reads. The construction makes that true by definition;
        // declaring it means the checker can independently confirm it rather than take it on trust.
        // TASKS.csv #2050 (review #2013, 3D Modelling) — #1414 kept the walls of a 'vein' that is a vein set and left out only its solid:
        // Woodjam's qtz (75 intercepts in 7 holes, 10.7 per hole, midpoints 87.8 m RMS off one plane for a 0.13 m vein) still added a flat
        // 1.6° midplane pair across clusters 3-5 km apart, two meaningless surfaces in the project. Such a code now adds nothing.
        const setPerHole = used.length / Math.max(1, new Set(used.map((i) => i.holeId)).size);
        if ((pl.rmsOffPlane != null && pl.rmsOffPlane > 10 * Math.max(th.trueMean || 0, 0.5)) || setPerHole > 2.5) {
          setNotices((p) => [...p, notice("\"{label}\": no surface, solid or volume was made: the intercepts do not behave like one vein (midpoints {v} m RMS off one plane for a {v2} m mean thickness, {v3} intercepts in {holes} hole(s), {v4} per hole). This code is a vein SET or stockwork: split it into single veins (Modelling codes: number it or connect intervals between holes, set the new codes cross-cutting, then model each here) or model the set as an envelope of where it occurs ({route}).", { route: veinLayer === "litho" ? tr("Alteration > Layer: Lithology, or Modelling codes > Build a closed body") : tr("Alteration > Layer: Veins, with its density as the floor when logged"), /* #2533 — a route that works for the layer the code is in */ label, v: pl.rmsOffPlane != null ? Number(pl.rmsOffPlane).toFixed(1) : "?", v2: Number(th.trueMean || 0).toFixed(2), v3: used.length, holes: new Set(used.map((i) => i.holeId)).size, v4: setPerHole.toFixed(1) })]);
          return;
        }
        const fwSurf = stamp(model.footwall, "footwall", 0x3d8ecf, 0.75, "vein_footwall");
        // Only declared for a vein flat enough for "above" to mean something VERTICALLY, which is how
        // topology.js's sidedness check reads it. On a near-vertical vein the two walls barely overlap
        // in plan and "above" would be a meaningless (and possibly falsely violated) claim.
        const aboveRel = pl.dip <= 75 ? [{ relation: "above", targetId: fwSurf.id }] : [];
        stamp(model.hangingwall, "hangingwall", 0xe08a3c, 0.75, "vein_hangingwall", aboveRel);
        // TASKS.csv #1414 (review #1352) — a 'vein' that is a vein set makes no solid (its volume would mean nothing); since #2050 it stops
        // before the walls too (the check above), so what reaches here is one vein.
        const solidVol = stamp(model.solid, "solid", 0xb5477e, 0.45, "vein_solid").vol;

        const fmt = (n, d = 2) => Number(n).toFixed(d);
        setNotices((p) => [...p, notice("Added \"{label}\": {intercepts} paired intercept(s){v} → midplane {v2}° / {v3}° ({attitudeSource}), TRUE thickness {v4}–{v5} m (mean {v6} m; mean DOWNHOLE length {v7} m){v8} → {nu}×{nv} grid, {informedNodes} informed nodes, {v9} m cells, {v10} m search{v11}{v12}.", { label, intercepts: model.intercepts.length, v: unplaceable ? tr(", {unplaceable} unplaceable", { unplaceable }) : "", v2: fmt(pl.dip, 1), v3: fmt(pl.dipDir, 1), attitudeSource: pl.attitudeSource, v4: fmt(th.trueMin), v5: fmt(th.trueMax), v6: fmt(th.trueMean), v7: fmt(th.downholeMean), v8: th.refined ? tr(", thickness corrected against the local modelled normal") : "", nu: model.grid.nu, nv: model.grid.nv, informedNodes: model.grid.informedNodes.toLocaleString(), v9: fmt(model.grid.cellSize, 1), v10: fmt(model.grid.searchRadius, 0), v11: model.grid.coarsened ? tr(" (coarsened to stay under the grid limit)") : "", v12: solidVol?.watertight ? tr(". Solid {volumeM3} m³", { volumeM3: solidVol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 }) }) : "" })]);
        setNotices((p) => [...p, notice("\"{label}\": hangingwall and footwall are offset ±half the interpolated thickness from one shared midplane, so they cannot cross — minimum modelled thickness {v} m{v2}. Modelled contacts sit {v3} m RMS (max {v4} m) from the logged ones — measured AT the intercepts, where an inverse-distance field nearly reproduces its own data, so a small number here says the pair honours the logging, not that the shape between holes is right.{v5}", { label, v: fmt(ck.minSeparation, 3), v2: ck.pinchOut ? tr(" (the vein pinches out to zero somewhere in the model)") : "", v3: fmt(ck.contactResidualRms, 2), v4: fmt(ck.contactResidualMax, 2), v5: pl.rmsOffPlane != null ? tr(" The intercept midpoints scatter {v} m RMS off a single plane, so the {v2}°/{v3}° figure is a reference attitude, not a measurement of one continuous surface.", { v: fmt(pl.rmsOffPlane, 1), v2: fmt(pl.dip, 0), v3: fmt(pl.dipDir, 0) }) : "" })]);
        // TASKS.csv #2534 — intercepts open at the collar or at the end of the hole: their thickness is a minimum, their wall there no contact
        {
          const { openIntercepts } = await import("../../lib/vein.js");
          const lenOf = (h) => { const c = collars.find((x) => x.hole_id === h); const t = traceOf.get(h); return Number(c?.length) > 0 ? Number(c.length) : t?.pts?.length ? t.pts[t.pts.length - 1].md : NaN; };
          const oi = openIntercepts(used, lenOf);
          if (oi.open) setNotices((p) => [...p, notice("\"{label}\": {open} of {of} intercept(s) start at the collar or end at the end of the hole ({c} at the collar, {e} at the end, {w} the whole hole): there the wall is the collar or the bit, not a contact, and the thickness is a minimum.{v}", { label, open: oi.open, of: oi.of, c: oi.atCollar, e: oi.atEnd, w: oi.whole, v: oi.open > oi.of / 2 ? tr(" Most intercepts are open, so the walls and the solid's volume are minimums, not the sheet's.") : "" })]);
        }
        setNotices((p) => [...p, notice("A vein fitted from {intercepts} intercept(s) is an interpretation, not a measurement: away from the holes its shape, its thickness and its extent are the interpolation's, not the data's. Thickness between holes is interpolated, so a pinch-out or a swell that no hole cut will not appear.", { intercepts: model.intercepts.length })]);
        if (pl.attitudeSource === "fitted to intercept midpoints" && pl.planarity != null && pl.planarity > 0.15) setNotices((p) => [...p, notice("\"{label}\": the intercept midpoints are not very planar (out-of-plane spread is {v}% of their in-plane spread), so the fitted {v2}°/{v3}° reference attitude is a weak average — consider entering the vein's dip and dip direction instead.", { label, v: Math.round(pl.planarity * 100), v2: fmt(pl.dip, 0), v3: fmt(pl.dipDir, 0) })]);
        // A hole that logs one vein logs it ONCE. Many intercepts per hole means this code is a vein
        // SET (sheeted veinlets, a stockwork), and a single hangingwall/footwall pair is then the
        // envelope of the set at best — worth saying out loud, because the result still looks like a
        // confident single structure on screen.
        if (ck.midplaneLooRms != null) setNotices((p) => [...p, notice("\"{label}\": leave-one-out cross-validation — dropping each intercept and predicting it from the others misses by {v} m RMS (worst {v2} m) against a {v3} m search radius.{v4}", { label, v: fmt(ck.midplaneLooRms, 1), v2: fmt(ck.midplaneLooMax, 1), v3: fmt(model.grid.searchRadius, 0), v4: ck.incoherentSheet ? tr(" That is no better than guessing at this hole spacing: these intercepts are NOT behaving like one continuous sheet, and a single hangingwall/footwall pair is the wrong picture for them.") : "" })]);
        const holeCount = new Set(used.map((i) => i.holeId)).size;
        if (holeCount && used.length / holeCount > 2.5) setNotices((p) => [...p, notice("\"{label}\": {used} intercepts in {holeCount} hole(s) — about {v} per hole. A single vein is cut once per hole, so this code is behaving like a vein SET or stockwork; the pair below is the average envelope of all of them, not one vein. To model one vein, log or filter it as its own code.", { label, used: used.length, holeCount, v: (used.length / holeCount).toFixed(1) })]);
        if (ck.nominalLabels) setNotices((p) => [...p, notice("\"{label}\" is near-vertical ({v}° dip), so \"hangingwall\" and \"footwall\" are nominal labels here — the two surfaces are simply the two walls of the structure.", { label, v: fmt(pl.dip, 0) })]);
        if (tca) setNotices((p) => [...p, notice("\"{label}\": the logged angle to core axis ({column} in {layer}) on {n} of {of} intercept(s) gives a TRUE thickness of {a}–{b} m (mean {c} m), against a modelled mean of {d} m.", { label, column: tca.column, layer: tca.layer, n: tca.n, of: tca.of, a: fmt(tca.min), b: fmt(tca.max), c: fmt(tca.mean), d: fmt(th.trueMean) })]); // #1739
        // TASKS.csv #1575 — said last: the attitude the walls stand on, and the way to model one prospect's vein
        if (coreWins) setNotices((p) => [...p, notice("\"{label}\": built on the oriented-core attitude {dip}° / {dipDir}° ({n} measurement(s) at the intercepts, α95 = {a}°), which is {angle}° from the plane fitted to the intercept midpoints ({fdip}° / {fdir}°). Midpoints spread across {holes} hole(s) do not define one vein; to model one prospect's vein, restrict the tool under Model settings › Domain.", { label, dip: fmt(coreWins.dip, 0), dipDir: fmt(coreWins.dipDir, 0), n: coreWins.n, a: fmt(coreWins.alpha95, 0), angle: fmt(coreWins.angle, 0), fdip: fmt(fitted0.dip, 0), fdir: fmt(fitted0.dipDir, 0), holes: new Set(used.map((i) => i.holeId)).size })]);
        // #1415 — last, so they are among the messages the sidebar keeps
        if (logged?.n && !coreWins) {
          const spread = logged.k != null ? tr(", k = {k}, α95 = {a}°", { k: logged.k.toFixed(1), a: logged.alpha95.toFixed(0) }) : tr(", one measurement only");
          if (pl.attitudeSource === fromLogs) setNotices((p) => [...p, notice("\"{label}\": attitude {dip}° / {dipDir}° from {n} oriented-core measurement(s) at the intercepts ({types}; {holes} hole(s); within {tol} m){spread}. The intercept midpoints alone could not fix it.", { label, dip: fmt(pl.dip, 0), dipDir: fmt(pl.dipDir, 0), n: logged.n, types: logged.types.join(", "), holes: logged.holes, tol: logged.tolM, spread })]);
          else if (pl.attitudeSource === "fitted to intercept midpoints") {
            const toN = (d, dd) => { const a = (d * Math.PI) / 180, b = (dd * Math.PI) / 180; return [Math.sin(b) * Math.sin(a), Math.cos(b) * Math.sin(a), Math.cos(a)]; };
            const [n1, n2] = [toN(pl.dip, pl.dipDir), toN(logged.meanDip, logged.meanDipDir)];
            const angle = (Math.acos(Math.min(1, Math.abs(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]))) * 180) / Math.PI;
            setNotices((p) => [...p, notice("\"{label}\": the {n} oriented-core vein measurement(s) at the intercepts average {dip}° / {dipDir}°{spread}, {angle}° from the plane fitted to the midpoints.", { label, n: logged.n, dip: fmt(logged.meanDip, 0), dipDir: fmt(logged.meanDipDir, 0), spread, angle: fmt(angle, 0) })]);
          }
          if (logged.noPreferred) setNotices((p) => [...p, notice("Warning: the {n} \"{name}\" picks show no preferred orientation (k = {k}, at the level of random planes), so their dips do not define one surface. Check them on the Stereonet, or give each structure its own name/ID.", { n: logged.n, name: logged.types.join(", "), k: logged.k.toFixed(1) })]);
        }
        const meshes = Object.values(implicitMeshesRef.current);
        if (meshes.length) fitBox(new THREE.Box3().setFromObject(meshes[meshes.length - 1]));
      } catch (e) {
        // #1415 — when the attitude was the problem, say whether the core had any vein measurements to offer
        const none = e?.attitude && logged && !logged.n ? ` ${tr("No oriented-core vein measurements lie within {tol} m of these intercepts.", { tol: logged.tolM })}` : "";
        setNotices((p) => [...p, errorNotice(tr("Vein model failed: {v}", { v: e.message || e }) + none)]);
      } finally { // #2050 — also after the early stop below
        ownTask(label).clear(); // #2379 — only this tool's entry
        setVeinBusy(false);
      }
    }, 40);
  };

  // TASKS.csv #142 — numeric (continuous-variable) implicit model: a grade-shell wireframe built
  // DIRECTLY from assay values, no GemPy/sidecar involved. Every other tool above keys off categorical
  // litho/alt/structure codes; this is the "Au > 1 g/t envelope" Leapfrog users expect. Pipeline, all
  // client-side and synchronous: (1) composite (optional, same compositeDownhole call as
  // GradeEstimationModal) -> (2) samplePointsFromIntervals desurveys every interval midpoint into world
  // space -> (3) estimateDenseGrid IDW/NN-interpolates a regular lattice (NaN where no sample is in
  // range) -> (4) marchingCubes extracts the cutoff iso-surface -> (5) world->scene via originRef.current
  // (scene x = east offset, y = elevation offset, z = -(north offset) — same map every other geometry in
  // this file uses) -> (6) registered into implicitMeshesRef/implicitSurfaces exactly like a GemPy
  // surface, so volume/tonnage (#140), OBJ/DXF/glTF export (#143), relationships and domain clipping all
  // work on it with no separate code path. Deferred via a short setTimeout so the busy state paints
  // before the (potentially few-hundred-ms) main-thread loop — same idea as GradeEstimationModal's
  // requestAnimationFrame deferral, but a timer rather than rAF because rAF never fires while the
  // window/tab is hidden (caught during #142's own live verification: the run sat on "Running…"
  // forever in a background preview tab), which would silently strand a run started right before
  // the user alt-tabs away.
  const runNumericModel = () => {
    const anisotropy = trendWarp("gradeShell"); // TASKS.csv #650
    // TASKS.csv #1741 / #1708 — numericSymbol may name a downhole log or a numeric layer field ("log:magsusc", "custom:<id>:<field>"):
    // its rows stand in for the assays under one element, values as logged
    const numSrc = findNumericSource(numericSymbol, { layers, customLayers });
    const srcData = numSrc ? sourceAssays(numSrc, { layers, customLayers }) : null;
    const symbol = numSrc ? numSrc.symbol : (numericSymbol || assayElements[0]?.symbol);
    if (!symbol) { setNotices((p) => [...p, notice("No assay elements loaded — import assays before running the numeric model.")]); return; }
    if (!collars.length) { setNotices((p) => [...p, noCollarsNotice(tr("the numeric model"), layers, assays)]); return; }
    if (!Number.isFinite(numericCutoff)) { setNotices((p) => [...p, notice("Enter a numeric cutoff grade.")]); return; }
    const elementUnits = Object.fromEntries((numSrc ? srcData.assayElements : assayElements).map((e) => [e.symbol, e.unit]));
    const unit = elementUnits[symbol] || "ppm";
    const unitL = gradeUnitLabel(symbol, unit); // TASKS.csv #2218 — what a person reads: 'Au > 1 g/t shell' (#1680); unit stays the stored one
    // TASKS.csv #2551 (review #2486) — and from the checked holes only (Model area), as Estimation's names say since #2069
    const shellArea = modelArea === "checked" ? checkedHoleCount(collars, visibleHoles) : null;
    const shellTags = [anisotropy.enabled && trendRatioText(anisotropy.params) ? `trend ${trendRatioText(anisotropy.params)}` : "", shellArea && shellArea.checked < shellArea.all ? `${shellArea.checked} checked holes` : ""].filter(Boolean);
    const label = `${symbol} > ${numericCutoff} ${unitL} shell${shellTags.length ? ` (${shellTags.join(", ")})` : ""}`; // #2423 — shells under different trends are told apart
    setNumericBusy(true);
    ownTask(label).set(20); // #2379
    setTimeout(async () => {
      try {
        const { marchingCubes } = await import("../../lib/marchingCubes.js"); // #476 — loaded on first use
        const { samplePointsFromIntervals, summarizeSupport, supportBeyondReach } = await import("../../lib/estimation.js"); // #552 — on demand
        const { runEstimation } = await import("../../lib/estimationClient.js"); // #520 — the grid runs in a worker
        // TASKS.csv #266 — QC inserts (standards/blanks/duplicates) are excluded by default here, the
        // same as Best Intercepts / Compositing / Grade Statistics already do. They used to reach the
        // grade shell unfiltered; most got dropped downstream only because their synthetic hole_id has
        // no collar, which is luck rather than design — a field duplicate logged under its PARENT
        // hole's id was genuinely double-counted.
        // #2059 (review #2013, Woodjam) — Model area: the checked holes only, as the other modelling tools (#1546) read them. The
        // shell composited all 8 assayed holes and gridded the 5 x 4 km property (cell refitted from 10 to 40.5 m) for 3 checked holes.
        const inArea = modelArea === "checked";
        const area = inArea ? checkedHoleCount(collars, visibleHoles) : null;
        const srcRows = inArea ? restrictRowsToHoles(numSrc ? srcData.assays : assays, visibleHoles) : (numSrc ? srcData.assays : assays); // #1741
        if (inArea && !srcRows.some((r) => r?.hole_id != null)) throw new Error(tr("None of the {n} hole(s) checked in the Holes list has {symbol} values (Model settings › Model area). Check the holes that hold them, or set Model area to Whole property.", { n: area.checked, symbol }));
        const srcAssays = numericIncludeQAQC ? srcRows : excludeQAQC(srcRows);
        // TASKS.csv #2417 / #2542 — the unsampled metres inside the sampled holes: not known (left out) or barren at a typed value; under
        // 60 % sampled the panel asks. Assay elements only (a downhole log or a layer field is read as logged).
        let unsFill = null, unsParams = null;
        if (!numSrc) {
          const { resolveUnsampled } = await import("../../components/UnsampledChoice.jsx");
          const u = resolveUnsampled("gradeShell", { assays: srcAssays, collars, symbol, unit, elementUnits, logCtx: { layers, customLayers } }); // logCtx: a picked log, #2721
          if (!u.ready) throw new Error(tr("Choose how the unsampled metres inside the sampled holes are read (and, for barren, type their value) before running."));
          unsFill = u.apply(srcAssays); unsParams = u.params(unsFill);
          if (unsFill.filledM > 0 && u.mode === "log") setNotices((q) => [...q, notice("Unsampled metres read from the log \"{log}\" × {f} ({lu} to {u}, the factor you gave): {m} m in {n} hole(s) filled from its readings; {r} m had no reading and stay not known.", { log: unsParams.unsampledLog, f: unsParams.unsampledLogFactor, lu: unsParams.unsampledLogUnit, u: unsParams.unsampledUnit, m: unsParams.unsampledLogFilledM.toLocaleString(), n: unsParams.unsampledHolesFilled, r: unsParams.unsampledLogNoReadingM.toLocaleString() })]); // #2721
          else if (unsFill.filledM > 0) setNotices((q) => [...q, notice("Unsampled metres read as barren: {m} m in {n} hole(s) filled at the value typed ({v}).", { m: unsParams.unsampledFilledM.toLocaleString(), n: unsParams.unsampledHolesFilled, v: `${unsParams.unsampledValue} ${unit}` })]);
        }
        const runAssays = unsFill ? unsFill.assays : srcAssays;
        let intervals, rawStats = null;
        if (numericUseComposites) {
          // TASKS.csv #259 — high-grade capping. compositeDownhole has always accepted capValue and
          // applied it per RAW sample before length-weighted averaging (the correct order), but only
          // CompositingModal ever passed it: the grade shell composited uncapped, so one bonanza Au
          // assay drove IDW² across its whole search neighbourhood.
          intervals = compositeDownhole(runAssays, symbol, unit, elementUnits, {
            length: numericCompositeLength, minCoverage: numericMinCoverage, // TASKS.csv #262 — was hardcoded 0.5
            capValue: Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null,
          });
        } else {
          const cap = Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null;
          // TASKS.csv #571 — duplicates / overlaps resolved, values in `unit`, as in compositing
          const raw = rawSampleIntervals(runAssays, symbol, unit, elementUnits, { capValue: cap });
          intervals = raw.intervals;
          rawStats = raw.stats;
        }
        const { points: rawPoints, dropped, clamped, beyondTrace } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        if (!rawPoints.length) throw new Error(tr("No sample points could be placed in 3D — check that holes have collars and (ideally) survey data."));
        // TASKS.csv #273 — this tool used to ignore the model domain and the anisotropy trend entirely,
        // so a user who had set up either for the categorical tools silently got neither here. The
        // domain now restricts which samples inform the shell (same rule the categorical tools apply to
        // their control points), and the anisotropy trend is honoured by the same warp-grid-unwarp trick
        // runSurfaceStack/the alteration halo use. The search ellipsoid's minimum-neighbour filter is
        // still deliberately NOT applied: it exists to drop under-supported CONTACT picks, and dropping
        // isolated assay samples would quietly delete grade from a shell rather than improve it.
        const gradeDomain = domains.find((d) => d.id === modelDomainId);
        let points = rawPoints;
        if (gradeDomain) {
          const o0 = originRef.current;
          points = rawPoints.filter((p) => pointInDomain({ x: p.x - o0.x, y: p.z - o0.z, z: -(p.y - o0.y) }, gradeDomain, implicitMeshesRef.current));
          if (!points.length) throw new Error(tr("No assay sample points fall inside domain \"{name}\" — nothing to model.", { name: gradeDomain.name }));
          if (points.length < rawPoints.length) setNotices((q) => [...q, notice("Domain \"{name}\": excluded {v} of {rawPoints} assay sample point(s) outside the domain.", { name: gradeDomain.name, v: rawPoints.length - points.length, rawPoints: rawPoints.length })]);
        }
        const above = points.filter((p) => p.value >= numericCutoff).length;
        if (!above) throw new Error(tr("None of the {points} sample points reach the {numericCutoff} {unit} cutoff — nothing to enclose. Lower the cutoff.", { points: points.length, numericCutoff, unit: unitL }));

        // TASKS.csv #273/#86 — anisotropy: warp every sample into the space where the declared ellipsoid
        // is a sphere, grid and iso-surface there with the isotropic search this tool already does, then
        // un-warp the mesh vertices. World coordinates are (east, north, up), the same axis order
        // searchEllipsoidBasis/anisoWarpPoint are defined in, and the warp is centred on the samples'
        // own centroid, so it can be applied to world coordinates directly with no api round-trip.
        const gsBasis = anisotropy.enabled ? anisotropy.basis : null;
        const gsScl = anisotropy.enabled ? anisotropy.scales : null;
        const gsCenter = anisotropy.enabled
          ? { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length, z: points.reduce((s, p) => s + p.z, 0) / points.length }
          : null;
        const gridPoints = anisotropy.enabled ? points.map((p) => anisoWarpPoint(p, gsCenter, gsBasis, gsScl)) : points;
        const holesOfPoints = new Set(points.map((p) => p.hole_id)); // #2757 — the hole spacing of the holes that carry the samples
        const logInfo = numSrc?.logScale ? logPoints(gridPoints) : null; // #1741 — susceptibility is interpolated as log10 values (a geometric mean)
        const estPoints = logInfo ? logInfo.points : gridPoints;

        // Grid extent: the sample points' own bounding box plus padding (not the collar box — assays
        // define where a grade shell can exist, and padding lets the shell close beyond the last hole).
        const xr = minMax(gridPoints.map((p) => p.x)), yr = minMax(gridPoints.map((p) => p.y)), zr = minMax(gridPoints.map((p) => p.z));
        const pad = Math.max(0, numericPadding);
        const bounds = { xmin: xr.min - pad, xmax: xr.max + pad, ymin: yr.min - pad, ymax: yr.max + pad, zmin: zr.min - pad, zmax: zr.max + pad };
        let cs = Math.max(0.5, numericCellSize); // let: #1416
        let cellRefit = false; // #2063 — the budget chose the cell: a smaller one is not on offer
        let neededAtDefault = null; // #2223 — the blocks the default cell would have needed
        // TASKS.csv #292 — the search radius is never allowed to be unbounded any more. An unlimited
        // search made every sample a candidate for every cell: measured at 62,500 cells x 5,000 points
        // that is 81 s of blocked main thread (250 s at the MAX_BLOCKS cap), versus 0.2 s with a real
        // radius and the new spatial index. "Unlimited" is capped to the grid's own diagonal, which is
        // a mathematical no-op (no cell can be further than the diagonal from any in-grid sample) for
        // small projects and a genuine bound for large ones.
        const gridDiagonal = Math.sqrt(
          (bounds.xmax - bounds.xmin) ** 2 + (bounds.ymax - bounds.ymin) ** 2 + (bounds.zmax - bounds.zmin) ** 2
        );
        const effectiveRadius = numericSearchRadius > 0 ? numericSearchRadius : gridDiagonal;
        // TASKS.csv #656 — the samples sit in the volume-keeping warp, where 1 m along the major axis is
        // scales.major m. Searching a sphere of R there reached R / scales.major (248 m for R 150 at 3:2:1) along
        // the trend; searching R * scales.major makes the major semi-axis R and the ellipsoid R x R*int/max x
        // R*min/max — the block model's (estimation.js withTrend), so the two tools search the same neighbourhood.
        const searchInGrid = numericSearchRadius > 0 && anisotropy.enabled ? numericSearchRadius * gsScl.major : effectiveRadius;
        const shellEllipsoidM = numericSearchRadius > 0 && anisotropy.enabled
          ? [1, gsScl.major / gsScl.semiMajor, gsScl.major / gsScl.minor].map((f) => Math.round(numericSearchRadius * f * 10) / 10)
          : null;
        // TASKS.csv #625 — the block budget is the user's (200,000 by default, up to 5 million); checked here, before
        // the worker starts, so an over-budget run says which cell size WOULD fit (the pane offers it as a button)
        const blockBudget = Math.min(MAX_BLOCK_BUDGET, Math.max(MAX_BLOCKS, Number(numericMaxBlocks) || MAX_BLOCKS));
        let blocksNeeded = gridBlockCount(bounds, cs);
        // TASKS.csv #1416 (review #1352, Silvertip) — the untouched default (10 m) failed on Silvertip's three pads (2,152,305 blocks): as
        // Grade estimation does, it now runs at the cell size that fits the budget and says so; a cell size the user chose still stops here
        if (blocksNeeded > blockBudget && numericCellSize === NUMERIC_CELL_DEFAULT) {
          const fit = cellToFit(bounds, blockBudget, cs);
          // built here, not inside the updater: that runs later, after cs and blocksNeeded are reassigned below
          const fitNotice = { ...notice("Cell size set to {fit} m: at the default {cs} m this extent needs {n} blocks, over the {budget}-block budget. A finer cell needs a larger block budget in the Grade shell pane.", { fit, cs, n: blocksNeeded.toLocaleString(), budget: blockBudget.toLocaleString() }), level: "info" };
          setNotices((p) => [...p, fitNotice]);
          setNumericCellSize?.(fit);
          neededAtDefault = blocksNeeded; // #2223
          cs = fit; blocksNeeded = gridBlockCount(bounds, cs); cellRefit = true;
        }
        if (blocksNeeded > blockBudget) {
          const fit = cellToFit(bounds, blockBudget, cs);
          const fitMax = cellToFit(bounds, MAX_BLOCK_BUDGET, cs);
          setNumericBudgetHint?.({ needed: blocksNeeded, budget: blockBudget, cell: cs, fit, fitMax });
          throw new Error(tr("At {cs} m cells this extent needs {blocksNeeded} blocks — over the {blockBudget}-block budget. {fit} m cells fit this budget{v}. Change the cell size or the block budget in the Grade shell pane.", { cs, blocksNeeded: blocksNeeded.toLocaleString(), blockBudget: blockBudget.toLocaleString(), fit, v: blockBudget < MAX_BLOCK_BUDGET ? tr("; with the largest budget ({MAX_BLOCK_BUDGET}) {fitMax} m cells fit", { MAX_BLOCK_BUDGET: MAX_BLOCK_BUDGET.toLocaleString(), fitMax }) : "" }));
        }
        setNumericBudgetHint?.(null);
        const ac = new AbortController(); // TASKS.csv #520 — worker + status-bar progress and Cancel
        const grid = await runEstimation("dense", estPoints, {
          bounds, cellSize: { dx: cs, dy: cs, dz: cs }, method: numericMethod,
          searchRadius: searchInGrid, minSamples: 1, maxSamples: 16, // #656
          minHoles: Math.max(1, numericMinHoles), // TASKS.csv #258
          support: true, // TASKS.csv #91/#92 — classify every grid node so the shell can be coloured by it
          maxBlocks: blockBudget, // TASKS.csv #625
          // TASKS.csv #1015 — an entered variogram (all three numbers), else fitted at run time. The range is entered in metres
          // along the trend's major axis, as reported (#935); the samples sit in the volume-keeping warp, where that is
          // range x scales.major
          ...(numericMethod === "ok" && numericVariogram && ["nugget", "sill", "range"].every((k) => numericVariogram[k] !== "" && Number.isFinite(Number(numericVariogram[k])))
            ? { variogram: { model: numericVariogram.model || "spherical", nugget: Number(numericVariogram.nugget), sill: Number(numericVariogram.sill), range: Number(numericVariogram.range) * (anisotropy.enabled ? gsScl.major : 1) } }
            : numericMethod === "ok" ? { variogram: { model: numericVariogram?.model || "spherical" } } : {}),
        }, { signal: ac.signal, onProgress: (f) => ownTask(label).set(20 + 60 * f, () => ac.abort()) });
        if (logInfo) unlogGrid(grid); // #1741 — back to data units: the iso-surface at the cutoff is unchanged, each node a geometric mean
        // TASKS.csv #935 — kriging with a trend runs in the volume-keeping warp, so the variogram is fitted (and its range
        // read) in units where 1 m along the major axis is scales.major m: a 115 m range along the trend printed as "70 m"
        // at 3:2:1. The warp is a uniform rescaling of the block model's (trendSearchScales: major = 1), so the weights are
        // the block model's; only the reported range was in the wrong unit. It is reported, and saved, in metres along
        // the trend's major axis, as the block model reports it.
        const gsVariogram = grid.variogram && anisotropy.enabled ? { ...grid.variogram, range: grid.variogram.range / gsScl.major, rangeAlong: "the trend's major axis (m)" } : grid.variogram;
        if (!grid.estimated) throw new Error(numericMinHoles > 1
          ? tr("No grid cell had samples from at least {numericMinHoles} distinct holes within the search radius — widen the search, or lower \"Min holes\".", { numericMinHoles })
          : tr("No grid cell had a sample within the search radius — widen it."));
        // TASKS.csv #803 — Matt: "I can't get my grade shell block model to end at surface, it's going above surface".
        // The grid is padded around the samples, so near the surface it reached into the air; with "Cut at topography"
        // on, the field is intersected with "below the terrain" and the shell closes on the ground (still watertight).
        const gsRealOf = anisotropy.enabled ? ((u) => (q) => anisoWarpPoint(q, gsCenter, gsBasis, u))(invScales(gsScl)) : null;
        const gsG = clipToTopo ? modelGround(terrainForClipRef.current, collars, survey) : null, gsGround = gsG?.ground || null; // #2634: or the collar surface
        const gsCap = groundCappedGrid(grid, numericCutoff, groundAtInFrame(gsGround), gsRealOf); // this grid is in world coordinates
        if (gsCap.capped && gsGround?.kind === "collars") setNotices((p) => [...p, notice("No terrain is loaded, so \"{label}\" was cut at the collar surface: the ground interpolated between the {n} collars, inside their footprint. A terrain (Maps > Terrain) gives the real ground.", { label, n: gsG.collars })]); // #2634
        const mc = marchingCubes(gsCap.values, grid.nx, grid.ny, grid.nz, numericCutoff, {
          origin: grid.origin, spacing: grid.cellSize, noData: numericCloseShell ? "outside" : "skip",
        });
        // TASKS.csv #2063 (review #2013, Woodjam) — say what the run found and what removed it: with Min holes 2 at a 50 m search on holes
        // 67-360 m apart no block round the 132 composites above 3000 ppm saw two holes, and the message blamed the cutoff, the radius and
        // a cell size the block budget had just chosen
        if (!mc.faces.length) {
          let hi = -Infinity; for (const v of grid.values) if (Number.isFinite(v) && v > hi) hi = v;
          const mh = Math.max(1, numericMinHoles), r = Math.round(effectiveRadius);
          const facts = " " + tr("{above} composite(s) are at or above the cutoff; {e} grid cell(s) were estimated, the highest at {hi} {unit}.", { above, e: grid.estimated.toLocaleString(), hi: Number.isFinite(hi) ? +hi.toPrecision(3) : "—", unit: unitL });
          // #2063 — cells above the cutoff with no estimated neighbour: the surface has nothing to close against (Woodjam: 36 cells, the highest 8,330 ppm)
          const isolated = hi >= numericCutoff && !numericCloseShell;
          const advice = " " + (isolated ? tr("The cells at or above the cutoff have no estimated neighbours to close a surface against: tick \"Close shell artificially at the search-radius boundary\" (its volume is then an assumption), widen the search{v}.", { v: mh > 1 ? tr(", or lower Min holes from {k} to 1", { k: mh }) : "" })
            : mh > 1
            ? tr("With Min holes {k} a cell needs samples from {k} holes within {r} m, so the blocks around the high composites of widely spaced holes are not estimated: try Min holes 1 (one hole's grade, said in the result) or a wider search.", { k: mh, r })
            : cellRefit ? tr("Try a lower cutoff or a larger search radius.") : tr("Try a lower cutoff, a larger search radius, or a smaller cell size."));
          throw new Error((isolated ? tr("No {symbol} shell at {numericCutoff} {unit}: the grid has no surface to extract.", { symbol, numericCutoff, unit: unitL }) : tr("The interpolated {symbol} grid never crosses {numericCutoff} {unit} — no shell to extract.", { symbol, numericCutoff, unit: unitL })) + facts + advice);
        }
        // TASKS.csv #1735 (review #1645, Copley) — are the composites at/above the cutoff INSIDE the shell built to show them? With
        // Min holes 2 on holes 100-1,350 m apart, the blocks round the only Cu intercept had one hole and were not estimated, so
        // the "Cu > 1000 ppm" shell closed where two holes converge, 90-110 m away, and held no composite at all.
        const inShell = samplesInsideShell(gridPoints, grid, gsCap.values, numericCutoff);
        // TASKS.csv #2757 — the shell's share more than one hole spacing from every sample (real frame), as the unit body says it
        const gsSpacing = autoHaloParams(collars.filter((c) => holesOfPoints.has(c.hole_id)), tracesRef.current || null).spacing;
        const gsBeyond = gsSpacing > 0 ? (await import("../../lib/haloSupport.js")).farFromSamples(gsCap.values, grid.nx, grid.ny, grid.nz, grid.origin, grid.cellSize, numericCutoff, points, gsSpacing, { toReal: anisotropy.enabled ? (q) => anisoWarpPoint(q, gsCenter, gsBasis, invScales(gsScl)) : null }) : null;

        const o = originRef.current;
        const pos = new Float32Array(mc.vertices.length * 3);
        const gsUnwarp = anisotropy.enabled ? invScales(gsScl) : null; // TASKS.csv #273 — undo the warp above
        mc.vertices.forEach((v, i) => {
          const [wx, wy, wz] = anisotropy.enabled
            ? (() => { const u = anisoWarpPoint({ x: v[0], y: v[1], z: v[2] }, gsCenter, gsBasis, gsUnwarp); return [u.x, u.y, u.z]; })()
            : v;
          pos[i * 3] = wx - o.x; pos[i * 3 + 1] = wz - o.z; pos[i * 3 + 2] = -(wy - o.y);
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setIndex(mc.faces.flat());
        geo.computeVertexNormals();
        // TASKS.csv #91 — per-vertex data-support colour, computed here and cached on the geometry as a
        // standard "color" attribute so the sidebar toggle is a one-line material flip rather than a
        // second interpolation pass. Every marching-cubes vertex lies on a grid EDGE, so it is looked up
        // at the nearest grid node — the same lattice the value it sits on came from, in the same
        // (possibly anisotropy-warped) space, since this runs on the pre-unwarp vertex `v`.
        // Green = interpolated (bracketed by composites from >= 2 holes), amber = extrapolated (a real
        // estimate, but all the informing data lies to one side), red = unsupported.
        const supColors = new Float32Array(mc.vertices.length * 3);
        const surfCounts = { interpolated: 0, extrapolated: 0, unsupported: 0 };
        if (grid.supportCode) {
          const rgb = {};
          Object.entries(SUPPORT_COLORS).forEach(([k, hex]) => { const c = new THREE.Color(hex); rgb[k] = [c.r, c.g, c.b]; });
          const clampI = (n, hi) => (n < 0 ? 0 : n > hi ? hi : n);
          const NAMES = ["unsupported", "extrapolated", "interpolated"];
          mc.vertices.forEach((v, i) => {
            const gx = clampI(Math.round((v[0] - grid.origin.x) / grid.cellSize.dx), grid.nx - 1);
            const gy = clampI(Math.round((v[1] - grid.origin.y) / grid.cellSize.dy), grid.ny - 1);
            const gz = clampI(Math.round((v[2] - grid.origin.z) / grid.cellSize.dz), grid.nz - 1);
            const name = NAMES[grid.supportCode[gx + grid.nx * (gy + grid.ny * gz)]] || "unsupported";
            surfCounts[name]++;
            const c = rgb[name];
            supColors[i * 3] = c[0]; supColors[i * 3 + 1] = c[1]; supColors[i * 3 + 2] = c[2];
          });
          geo.setAttribute("color", new THREE.BufferAttribute(supColors, 3));
        }
        const mat = new THREE.MeshLambertMaterial({ color: 0xe2a63c, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
        const mesh = new THREE.Mesh(geo, mat);
        const vol = computeMeshVolume(geo);
        // TASKS.csv #257 - record HOW this shell closed. "artificial" means part of its boundary is the
        // search-radius wall (marching cubes placed vertices on no-data edges), not a grade boundary:
        // the enclosed volume is then a function of the search radius, not only of the data (volume
        // scales roughly as R^3 - 25 m radius gave 67,750 m3 on one sample point, 100 m gave 4,188,833).
        // The UI must not report that as a measured volume, and the old !watertight-only caution never
        // fired for it because an artificially closed shell IS watertight.
        const closure = numericCloseShell && mc.closingVertices > 0 ? "artificial" : "natural";
        // TASKS.csv #270 (LOW-2) - mean interpolated grade of the cells the shell encloses. Without it
        // the only grade a user has to pair with the tonnage is the CUTOFF, which is exactly how
        // "X tonnes at Y g/t" gets quoted wrong. Cells are equal volume, so a plain mean over the
        // at/above-cutoff cells IS the volume-weighted mean.
        // TASKS.csv #1100 — with "cut at topography" the shell is drawn from the capped copy (#803): a node counts only when
        // it is inside the shell after the cap too (nodes in the air left out), at its own interpolated grade
        const capV = gsCap.values;
        const meanGradeInShell = meanInsideShell(grid.values, capV, numericCutoff);
        // TASKS.csv #270 (LOW-3) / #269 - the parameter block that produced this surface, kept ON the
        // surface so the panel can show it and every export can stamp it. A tonnage with no record of
        // the cutoff/method/radius/cell size/closure mode behind it can't be reproduced or audited.
        const params = {
          tool: "numeric grade shell", element: symbol, unit, cutoff: numericCutoff,
          method: numericMethod, searchRadiusM: effectiveRadius,
          searchRadiusWasUnlimited: !(numericSearchRadius > 0),
          ...(shellEllipsoidM ? { searchEllipsoidM: shellEllipsoidM } : {}), // #656 — semi-axes along the trend's axes
          cellSizeM: cs, paddingM: pad, closure, cutAtTopography: gsCap.capped ? `${gsGround?.name || "terrain"}: ${gsCap.capped} grid node(s) above or just below the ground capped (#803)` : false,
          composited: numericUseComposites, compositeLengthM: numericUseComposites ? numericCompositeLength : null,
          minCoverage: numericUseComposites ? numericMinCoverage : null, // TASKS.csv #262
          capValue: Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null,
          minHoles: Math.max(1, numericMinHoles), includeQAQC: numericIncludeQAQC, ...(unsParams || {}), // #2417
          // TASKS.csv #273 — the shared controls this tool now honours, recorded like every other param.
          anisotropy: anisotropy.enabled ? anisotropy.params : null,
          domain: gradeDomain ? gradeDomain.name : null,
          modelArea: inArea ? `holes checked in the Holes list (${area.checked} of ${area.all})` : "whole property", // #2059
          samplePoints: points.length, cellsEstimated: grid.estimated, ...(gsVariogram ? { variogram: gsVariogram } : {}), // #709; #935 — range in m along the trend
          singleHoleCells: grid.singleHoleCells, meanGradeInShell,
          compositesInShell: inShell, // #1735 — { above, inside, outside, noData }: the at/above-cutoff composites against the shell
          ...(gsBeyond ? { beyondDrilling: { share: +gsBeyond.share.toFixed(3), holeSpacingM: Math.round(gsSpacing) } } : {}), // #2757
          // TASKS.csv #91/#92 — grid-wide classification, and the same classification restricted to the
          // shell's own surface. The second is the one that matters for a reported volume: it says what
          // fraction of the BOUNDARY is bracketed by data rather than carried out beyond it.
          supportCounts: grid.supportCounts, surfaceSupportCounts: surfCounts,
          generatedAt: new Date().toISOString(),
        };
        mesh.userData = { tip: `${label}\n${mc.vertices.length} vertices, ${mc.faces.length} faces\n${numericMethod.toUpperCase()} on ${points.length} points, ${cs} m cells${vol.watertight ? `\n${vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³ enclosed${closure === "artificial" ? " (artificially closed — see panel)" : ""}` : "\n(open shell)"}` };
        implicitGroupRef.current?.add(mesh);
        const id = `impl_${Date.now()}_numeric_${symbol}`;
        implicitMeshesRef.current[id] = mesh;
        setImplicitSurfaces((p) => [...p, { id, name: label, visible: true, vertexCount: mc.vertices.length, faceCount: mc.faces.length, type: "mineralization_envelope", relationships: [], closure, params, surfaceSupportCounts: surfCounts, supportColored: false }]); // surfaceSupportCounts/supportColored: TASKS.csv #91
        setNotices((p) => [...p, notice("Added \"{label}\": {points} ({intervals}{v4}, {dropped} dropped{v5}, {above} at/above cutoff{v6}) → {nx}×{ny}×{nz} grid ({estimated} cells estimated, {skipped} outside the search radius{v7}{v8}) → {vertices} vertices / {faces} faces{v9}. Exploration target volume only — not a Mineral Resource.", { label, points: tr(points.length === 1 ? "{n} sample point" : "{n} sample points", { n: points.length }) /* #1116 */,
          intervals: numericUseComposites ? tr(intervals.length === 1 ? "{n} {len} m composite" : "{n} {len} m composites", { n: intervals.length, len: numericCompositeLength }) : tr(intervals.length === 1 ? "{n} raw interval" : "{n} raw intervals", { n: intervals.length }), v4: rawStats && (rawStats.duplicatesSkipped || rawStats.overlappingRows) ? tr(" after {duplicatesSkipped} exact duplicate(s) left out and {overlappingRows} overlapping row(s) resolved", { duplicatesSkipped: rawStats.duplicatesSkipped, overlappingRows: rawStats.overlappingRows }) : "", dropped, v5: beyondTrace ? tr(" ({beyondTrace} deeper than the hole's trace)", { beyondTrace }) : "", above, v6: clamped ? tr(clamped === 1 ? ", {clamped} negative grade clamped to zero" : ", {clamped} negative grades clamped to zero", { clamped }) : "", nx: grid.nx, ny: grid.ny, nz: grid.nz, estimated: grid.estimated.toLocaleString(), skipped: grid.skipped.toLocaleString(), v7: grid.singleHoleCells ? tr(", {singleHoleCells} informed by only ONE hole", { singleHoleCells: grid.singleHoleCells.toLocaleString() }) : "", v8: gsVariogram ? tr("; kriged with a {model} variogram {v}: nugget {v2}, sill {v3}, range {v4} m", { model: gsVariogram.model, v: gsVariogram.fitted ? tr("fitted to the samples") : tr("as entered"), v2: +gsVariogram.nugget.toPrecision(3), v3: +gsVariogram.sill.toPrecision(3), v4: Math.round(gsVariogram.range) }) + (anisotropy.enabled ? tr(" (along the trend \"{name}\")", { name: anisotropy.trend?.name || "" }) : "") : "" /* #935 */, vertices: mc.vertices.length.toLocaleString(), faces: mc.faces.length.toLocaleString(), v9: vol.watertight ? tr(", closed ({volumeM3} m³)", { volumeM3: vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 }) }) : tr(", open ({openEdgeCount} open edges — shell reaches the edge of the estimated region)", { openEdgeCount: vol.openEdgeCount }) })]);
        // TASKS.csv #2223 — the refit above counted the whole box; say how little of it the search reaches, and the budget that keeps the
        // default cell (marching cubes needs every node, so the shell cannot budget on reachable blocks as Estimation does)
        const budgetAdvice = shellBudgetAdvice({ refit: cellRefit, neededAtDefault, estimated: grid.estimated, skipped: grid.skipped, budget: blockBudget });
        if (budgetAdvice) setNotices((p) => [...p, { ...notice(budgetAdvice.budget
          ? "Only {p}% of the grid lies within the search radius of a sample, but the iso-surface needs every node of the box, so the block budget counts the empty part too (Estimation counts only reachable blocks). A {b}-block budget ({cost}) keeps the default {cs} m cells here."
          : "Only {p}% of the grid lies within the search radius of a sample, but the iso-surface needs every node of the box, so the block budget counts the empty part too (Estimation counts only reachable blocks). The default {cs} m cells need {n} blocks here, over the largest budget.",
        { p: sharePct(budgetAdvice.pct), b: budgetAdvice.budget?.toLocaleString(), cost: budgetAdvice.budget ? tr(gradeShellBudgetNote(budgetAdvice.budget)) : "", cs: NUMERIC_CELL_DEFAULT, n: budgetAdvice.needed.toLocaleString() }), level: "info" }]);
        if (gsBeyond && gsBeyond.inside && gsBeyond.share >= 0.05) setNotices((p) => [...p, (gsBeyond.share >= 0.5 ? errorNotice : notice)(tr("\"{label}\": {p}% of its volume lies more than one hole spacing ({s} m) from any sample: beyond the drilling, where its shape comes from the search and the cells, not from assayed rock.", { label, p: Math.round(gsBeyond.share * 100), s: Math.round(gsSpacing) }))]); // #2757
        // #2059 — which holes it was modelled from, when not all of them
        if (inArea && area.checked < area.all) setNotices((p) => [...p, notice("\"{label}\" was modelled from the {n} hole(s) checked in the Holes list (Model settings › Model area); the other {m} were left out.", { label, n: area.checked, m: area.all - area.checked })]);
        // TASKS.csv #1735 — said after the result, in numbers: a shell that holds none of its own composites is not where the grade is
        if (inShell.above && inShell.inside < inShell.above) {
          const mh = Math.max(1, numericMinHoles);
          setNotices((p) => [...p, notice(inShell.inside === 0
            ? (mh > 1 ? "\"{label}\" contains NONE of the {above} composite(s) at/above {cutoff} {unit}: with Min holes {minHoles} the blocks around them had too few holes and were not estimated, so the shell closed where {minHoles} holes converge, away from the samples. Its volume is not the mineralization. Run with Min holes 1 (its blocks are flagged as informed by one hole) or a wider search to see where the grade was drilled."
              : "\"{label}\" contains NONE of the {above} composite(s) at/above {cutoff} {unit}: no block around them was estimated (the search radius), so the shell is not where the grade was drilled.")
            : "\"{label}\" leaves {outside} of its {above} composite(s) at/above {cutoff} {unit} outside the shell ({noData} of them on blocks that were not estimated): the Min holes rule ({minHoles}) or the search radius removed the blocks around them, so the shell is smaller than the drilled grade.",
            { label, above: inShell.above, outside: inShell.outside + inShell.noData, noData: inShell.noData, cutoff: numericCutoff, unit: unitL, minHoles: mh })]);
        }
        // TASKS.csv #533 — say what the cap did: samples cut and share of metal removed (on the same QC-excluded raw samples)
        if (Number.isFinite(numericCapValue) && numericCapValue > 0) setNotices((p) => [...p, `"${label}" ${capAuditText(capAudit(srcAssays, symbol, unit, elementUnits, numericCapValue), unitL)}.`]);
        // TASKS.csv #91/#92 — say what the model is actually supported by, for the whole grid and for
        // the shell surface itself, and point at the sidebar toggle that draws it.
        if (grid.supportCounts) setNotices((p) => [...p, { ...notice("\"{label}\" data support — grid: {v}. Shell surface vertices: {v2}. Only \"interpolated\" means the composites that produced that part of the shell bracket it on all three axes from at least two holes; everything else is grade carried outward from the data. Expand the surface in the list and use \"Colour by data support\" to see where. This is a geometric data-support measure, NOT a statistical confidence or a kriging variance.", { label, v: summarizeSupport(grid.supportCounts, { tool: "shell", beyond: supportBeyondReach(grid) /* #2066 */ } /* #2071 */).replace(/\.$/, ""), v2: summarizeSupport(surfCounts, { tool: "shell" }).replace(/\.$/, "") /* #1423 */ }), level: "info" /* #1418: the counts name "unsupported" cells, which read as an error */ }]);
        if (closure === "artificial") setNotices((p) => [...p, notice(!(numericSearchRadius > 0) ? "\"{label}\" was closed ARTIFICIALLY at the edge of the grid ({closingVertices} of its vertices sit on that wall, not on a grade boundary). With no search radius its volume depends on how far the grid reaches past the drilling, not only on the data. Treat it as a visualization of where grades might extend, not a measured volume." /* #1423 — no radius: the wall is the grid edge */ : "\"{label}\" was closed ARTIFICIALLY at the search-radius boundary ({closingVertices} of its vertices sit on that wall, not on a grade boundary). Its volume depends on your search radius, not only on the data — doubling the radius can multiply the volume by up to eight (less where the shell's top and base are real grade boundaries, as in a flat body). Treat it as a visualization of where grades might extend, not a measured volume.", { label, closingVertices: mc.closingVertices.toLocaleString() })]);
        fitBox(new THREE.Box3().setFromObject(mesh));
      } catch (e) {
        setNotices((p) => [...p, e?.cancelled ? notice("Numeric model cancelled.") : errorNotice(tr("Numeric model failed: {v}", { v: e.message || e }))]);
      }
      ownTask(label).clear(); // #2379 — only this tool's entry
      setNumericBusy(false);
    }, 40);
  }; // anisotropy/domains/modelDomainId: TASKS.csv #273

  return { runAlterationModel, runImplicitModel, runNumericModel, runStackModel, runMapModel, runStructuralModel, runVeinModel };
}
