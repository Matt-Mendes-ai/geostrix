// TASKS.csv #697 — the modelling run functions, moved out of useModelling.js so their ~45 kB loads on the first
// model run instead of at startup. Bodies unchanged: each run reads the context snapshot it was started with
// (exactly what the old useCallback closures saw), and mcRef is the hook's live ref (#599).
import * as THREE from "three";
import { desurveyHole } from "../../lib/desurvey.js";
import { sanitizeMesh } from "../../lib/meshSanitize.js";
import { checkAgainstLogs, unitVolumes, resampleWarpedBlock } from "../../lib/modelCheck.js";
import { pythonImplicitModel } from "../../lib/desktop.js";
import { makeRng, perturbPoints, perturbOrientation, pointsToMeshDistance, spreadSummary, spreadColor, SPREAD_NOT_REPRODUCED } from "../../lib/surfaceSpread.js";
import { colorForLithology, colorForAlteration, colorForStructure, minMax, roleForLithology } from "../../lib/layers.js";
import { computeMeshVolume } from "../../lib/volumetrics.js";
import { MAX_BLOCKS, SUPPORT_COLORS, MAX_BLOCK_BUDGET, gridBlockCount, cellToFit } from "../../lib/estimationMeta.js"; // budget: #625 // #552 — the estimator itself loads in the run functions
import { compositeDownhole, rawSampleIntervals, capAudit, capAuditText } from "../../lib/geochem.js"; // capAudit: #533; rawSampleIntervals: #571
import { excludeQAQC } from "../../lib/qaqc.js";
import { errorNotice, notice, appendNotice } from "../../lib/notices.js";
import { filterBySearchSupport, anisoWarpPoint, invScales, anisoWarpDirection, medianCollarSpacing, autoHaloParams, splitIntervalForSampling, spatialClusters, sampleTerrainElevation } from "../../lib/viewer/geomath.js";
import { intervalEndIndex, intervalStartIndex, upperContactOf, mergeTouchingIntervals } from "../../lib/viewer/intervals.js";
import { codedRuns, topsForCode, codeInfo, withPileOrder, effectiveCode, inTargetUnit } from "../../lib/modellingCodes.js"; // TASKS.csv #599
import { clipMesh } from "../../lib/clipMesh.js";
import { thinStructurePicks } from "../../lib/viewer/orientationThin.js"; // TASKS.csv #765
import { makeEnsembleCounter, quantile, gridValuesToCells } from "../../lib/ensembleProbability.js"; // TASKS.csv #757
import { sequentialStops } from "../../lib/inversion.js"; // TASKS.csv #757
import { terrainGrid, unitRaster, mapAgreement } from "../../lib/predictedMap.js"; // TASKS.csv #758 // TASKS.csv #568
import { sectionGrid, pickSections, packUnits, sectionZRange } from "../../lib/modelSection.js"; // TASKS.csv #759
import { smoothClusteredSpec } from "../../lib/contactSmoothing.js"; // TASKS.csv #761
import { pickReport } from "../../lib/pickDiagnostics.js"; // TASKS.csv #762
import { findOnTraceWorld, findOnTrace, interceptId, SOFT_NUGGET, MODEL_EXTENT_PAD_M, guessSurfaceType, pointInDomain } from "../../lib/viewer/modelHelpers.js";
import { t as tr } from "../../lib/i18n.js"; // TASKS.csv #786
import { capFieldAtGround } from "../../lib/groundCap.js"; // TASKS.csv #803

// TASKS.csv #803 — the interpolated grid intersected with "below the terrain" (lib/groundCap.js), so a grade shell or
// alteration envelope that reaches the surface closes ON the ground instead of in the air. toReal: grid frame ->
// real (east, north, up) when the grid is anisotropy-warped. Returns { values, capped } (values unchanged when off).
function groundCappedGrid(grid, iso, terrain, toReal = null) {
  if (!terrain) return { values: grid.values, capped: 0 };
  const [tx0, ty0, tx1, ty1] = terrain.bbox;
  const groundAt = (x, y) => (x >= tx0 && x <= tx1 && y >= ty0 && y <= ty1 ? sampleTerrainElevation(terrain, x, y) : NaN);
  return capFieldAtGround(grid.values, grid.nx, grid.ny, grid.nz, grid.origin, grid.cellSize, iso, groundAt, { toReal });
}

export function createModellingRuns(ctx, mcRef) {
  const {
    activeInterceptSetRef,
    alterationCellSize,
    alterationSearchRadius,
    trendWarp, // TASKS.csv #650 — (tool) => { enabled, basis, scales, params } from the trend that model uses
    apiToScene,
    assayElements,
    assays,
    clipToDomainBoundary,
    clipToTopo,
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
    numericCloseShell,
    numericCompositeLength,
    numericCutoff,
    numericIncludeQAQC,
    numericMethod,
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
    setImplicitSurfaces,
    setLastLithBlock,
    setNotices,
    setNumericBusy,
    setTaskProgress,
    setVeinBusy,
    softIntercepts,
    stackFaults,
    stackRelation,
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
    const pickIssues = specs.map((sp) => pickReport(sp, { origin: originRef.current })).filter(Boolean);
    if (pickIssues.length) {
      setNotices((p) => [...p, notice("Pick check before solving — {v} The run goes ahead as it is: fix or exclude these in the Boundary intercepts table if they are wrong.", { v: pickIssues.map((r) => [
        `${r.label}:`,
        r.duplicates ? tr(" {duplicates} pick(s) repeated at the same spot ({duplicateExamples}{v}) — GemPy honours every copy, which only slows and stiffens the solve;", { duplicates: r.duplicates, duplicateExamples: r.duplicateExamples.join(", "), v: r.duplicates > 3 ? "…" : "" }) : "",
        r.conflicts ? tr(" {conflicts} pair(s) of picks almost on top of each other but far apart in elevation ({conflictExamples}{v}) — the surface has to stand near-vertical there to honour both: usually a mis-picked or mislabelled contact, or the unit repeated by a fold or fault;", { conflicts: r.conflicts, conflictExamples: r.conflictExamples.join("; "), v: r.conflicts > 3 ? "…" : "" }) : "",
        r.orientations ? tr(" {orientations} of {orientationsTotal} orientation(s) differ by more than 45° from the plane through the contacts around them ({orientationExamples}{v}) — GemPy bends the surface between the two;", { orientations: r.orientations, orientationsTotal: r.orientationsTotal, orientationExamples: r.orientationExamples.join(", "), v: r.orientations > 3 ? "…" : "" }) : "",
      ].join("")).join(" ").replace(/;(?=\s|$)/g, ".") })]);
    }
    const clipDomain = clipToDomainBoundary ? domains.find((d) => d.id === modelDomainId) : null;
    const clipTerrain = clipToTopo ? terrainForClipRef.current : null; // #358
    // Extent spans every hole trace (not just these surfaces' own points) so the modelled surface(s)
    // cover the whole property, with ~15% padding on each side. Computed in API (east/north/up)
    // space to match the points/orientations above.
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
    const extentApiPts = [...allApiPts, ...specs.flatMap((s) => [...s.points, ...s.orientations])];
    const warpedApiPts = anisotropy.enabled ? extentApiPts.map((p) => anisoWarpPoint(p, anisoCenter, anisoBasis, anisoScl)) : extentApiPts;

    const xs = warpedApiPts.map((p) => p.x), ys = warpedApiPts.map((p) => p.y), zs = warpedApiPts.map((p) => p.z);
    // Never pads more than MODEL_EXTENT_PAD_M past the actual data on any axis, however large the
    // property's own span is — was previously an uncapped 15% of span, which is what let the modelled
    // extent balloon far past real drillhole data on a widely-spread property (see MODEL_EXTENT_PAD_M's
    // own comment for why that produced self-wrapping surfaces).
    const pad = (lo, hi) => { const span = Math.max(1, hi - lo); const p = Math.min(span * 0.15, MODEL_EXTENT_PAD_M); return [lo - p, hi + p]; };
    const xr = minMax(xs), yr = minMax(ys), zr = minMax(zs); // not Math.min/max(...) — see layers.js's minMax comment
    const [xmin, xmax] = pad(xr.min, xr.max);
    const [ymin, ymax] = pad(yr.min, yr.max);
    const [zmin, zmax] = pad(zr.min, zr.max);
    const extent = [xmin, xmax, ymin, ymax, zmin, zmax];

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

    const label = specs.length === 1 ? specs[0].label : `Stratigraphic stack (${specs.map((s) => s.meshName).join(", ")})`;
    const totalPoints = specs.reduce((s, x) => s + x.points.length, 0);
    const totalOrientations = specs.reduce((s, x) => s + x.orientations.length, 0);

    setImplicitBusy(true);
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
    const rampTimer = setInterval(() => {
      setTaskProgress?.((cur) => (cur && cur.label === label ? { ...cur, pct: Math.min(90, cur.pct + 6 + Math.random() * 8) } : cur));
    }, 500);
    const solveStartedAt = performance.now(); // TASKS.csv #52 (a) — the measured per-run cost that budgets the sensitivity ensemble
    const projectToken = getProjectToken(); // #466
    // TASKS.csv #756 — every logged litho interval's midpoint, in the frame the model is solved in (warped with a trend),
    // evaluated EXACTLY by GemPy in the same solve: the model check and the modelled-unit layer read these, not the
    // block cell a midpoint falls in (one cell is 50-110 m on a real extent at 36^3)
    const evalRows = [];
    traces.forEach((t) => {
      (importStateRef.current.layers?.litho || []).forEach((r) => {
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
    const groundAt = mapTerrain ? (x, y) => {
      const [tx0, ty0, tx1, ty1] = mapTerrain.bbox;
      return x >= tx0 && x <= tx1 && y >= ty0 && y <= ty1 ? sampleTerrainElevation(mapTerrain, x, y) : NaN;
    } : null;
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
      sidecarSpecs.filter((s) => !s.fault).map((s) => ({ name: s.meshName, points: s.points, orientations: s.orientations })),
      // TASKS.csv #271 (relation) / #274 (rangeMultiplier — omitted when 0/Auto, see desktop.js)
      // TASKS.csv #356 — ask for the lithology block (model check + volumes) unless anisotropy warps the
      // model space, where block coordinates no longer match hole positions directly.
      { resolution: [modelResolution, modelResolution, modelResolution], relation, rangeMultiplier: rangeMultiplier || 0, signal: abortController.signal, returnBlock: true, // #679 — with a trend too: the check and volumes work in the warped frame (below)
        faults: sidecarSpecs.filter((s) => s.fault).map((s) => ({ name: s.meshName, points: s.points, orientations: s.orientations })), // #360
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
    specs.forEach((spec) => {
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
      // TASKS.csv #358 — the model extent's top is the highest control point plus padding, and GemPy
      // extrapolates up to it, so dipping contacts used to stand up into the air above the ground (in 3D,
      // in exports, in any volume). The part above the terrain surface is removed (only inside the terrain's
      // footprint; outside it there is nothing to clip against). #568 — cut at the ground line (was: every
      // triangle whose centroid was above it dropped, leaving a saw-tooth that stopped short of the surface).
      let topoClipped = 0;
      if (clipTerrain) {
        const o = originRef.current;
        const [txmin, tymin, txmax, tymax] = clipTerrain.bbox;
        const above = (v) => {
          const wx = v.x + o.x, wy = -v.z + o.y;
          if (wx < txmin || wx > txmax || wy < tymin || wy > tymax) return false;
          const ground = sampleTerrainElevation(clipTerrain, wx, wy);
          return Number.isFinite(ground) && v.y + o.z > ground;
        };
        const c = clipMesh(sceneVerts, faces, above);
        sceneVerts = c.verts; faces = c.faces;
        topoClipped = c.removed + c.split;
        if (!faces.length) { missing.push(`${spec.label} (lies entirely above the terrain surface)`); return; }
      }
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
        relation, resolution: [modelResolution, modelResolution, modelResolution],
        surfaceDetail: res.surfaceDetail ?? 4, // #766 — GemPy's octree level for the mesh (4 = its floor)
        gempyRange: res.rangeUsed ?? null, gempyRangeDefault: res.rangeDefault ?? null, engineDtype: res.precision ?? "float64", // engineDtype: #767 (an older engine solved in float64)
        gempyRangeMultiplier: rangeMultiplier || null, gempyCO: res.cO ?? null,
        anisotropy: anisotropy.enabled ? anisotropy.params : null,
        searchEllipsoid: searchEllipsoid.enabled ? { ...searchEllipsoid } : null,
        domain: clipDomain ? clipDomain.name : (domains.find((d) => d.id === modelDomainId)?.name || null),
        clippedToDomain: !!clipDomain,
        clippedToTopography: clipTerrain ? { terrain: clipTerrain.name || "terrain", trianglesRemoved: topoClipped } : false, // #358
        // TASKS.csv #52 (c) — WHICH picks fed this surface, by name. Without it two surfaces modelled
        // from the same logged code (upper vs lower basalt) would carry identical provenance and be
        // indistinguishable a month later.
        interceptSet: activeInterceptSetRef.current ? { name: activeInterceptSetRef.current.name, intercepts: (activeInterceptSetRef.current.ids || []).length } : null,
        extent: extent.map((v) => Math.round(v)),
        // TASKS.csv #318 — a mapped surface contact that fed this run, if any (set by runImplicitModel).
        ...(spec.params?.surfaceMapContact ? { surfaceMapContact: spec.params.surfaceMapContact } : {}),
        ...(spec.params?.orientationsAveraged ? { orientationsAveraged: spec.params.orientationsAveraged } : {}), // #765
        ...(smoothReports.find((r) => r.meshName === spec.meshName) ? { clusteredContactsSmoothed: (({ smoothed, total, skipped }) => ({ smoothed, of: total, ...(skipped ? { skipped } : {}), method: "KDE (Scott, in the contacts' plane), nugget on points >= 2x even density and >= 0.5 of the max (von Harten et al. 2021)" }))(smoothReports.find((r) => r.meshName === spec.meshName)) } : {}), // #761
        generatedAt: new Date().toISOString(),
      };
      setImplicitSurfaces((p) => [...p, { id, name: spec.label, visible: true, vertexCount: surf.vertices.length, faceCount: faces.length, type: spec.type || "other", relationships: [], params }]);
    });
    // TASKS.csv #512 — onlap stacks share one scalar field, so the sidecar sends each repeated pick once
    if (res.orientationsDeduplicated > 0) setNotices((p) => [...p, notice("{orientationsDeduplicated} repeated orientation(s) were given to GemPy once rather than once per unit: in an onlap stack every unit shares one field, so the copies added solve time but no information.", { orientationsDeduplicated: res.orientationsDeduplicated })]);
    if (missing.length) setNotices((p) => [...p, notice("GemPy returned no mesh for: {missing} (try adding more points or a wider spread of orientations for those).", { missing: missing.join(", ") })]);
    if (nonFinite.length) setNotices((p) => [...p, notice("GemPy returned some invalid (NaN) vertices — the surface is shown without the triangles that used them, so it may have holes: {nonFinite}. Usually too few points / orientations for the extent or resolution.", { nonFinite: nonFinite.join("; ") })]); // #314
    // TASKS.csv #356 — model vs logs, and unit volumes, from the lithology block. Every logged interval of a
    // modelled unit (by its code / group codes) is sampled at its midpoint in the model; the report says
    // what share of the logged metres the model puts in the same unit, per unit and the worst holes.
    // Volumes are INSIDE the model extent only (a box around the data), so they are not unit sizes in the
    // ground, and nothing here is a resource.
    // TASKS.csv #593 — the block was asked for but did not come back (an older engine, or the sync fallback before
    // it forwarded the request): say why the model check, volumes and "Add as block model" are missing
    if (!res.block) setNotices((p) => [...p, notice("The Python engine did not return the model's lithology block, so the model check, unit volumes and \"Add as block model\" are not available for this run. Updating GeoStrix (its engine is bundled) brings them back.")]);
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
      // TASKS.csv #817 — the ground above the youngest modelled top. It was labelled after specs[0], which is a FAULT whenever
      // faults are solved with the stack (they come first): "above the top of Fault Thrust Fault 1". Now the first
      // non-fault surface; and a model from the map names it as the youngest map unit itself (stackOpts.aboveUnit), so the
      // predicted map scores it against that unit instead of leaving it grey and unscored (Perk-Rocky: andesite, 23 km2).
      const topSpec = specs.find((sp) => !sp.fault) || specs[0];
      const aboveUnit = stackOpts.aboveUnit || null;
      const aboveText = aboveUnit || `above the top of ${topSpec.meshName} (not modelled)`;
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
      setLastLithBlock({ ...(Object.keys(secResults).length ? { sections: secResults, aboveLabel: aboveText } : {}), ...(exact ? { intervals: evalRows.filter((q) => "modelled" in q).map((q) => ({ hole_id: q.hole_id, from: q.row.from, to: q.row.to, logged: q.row.value, modelled: q.modelled })) } : {}), block: lbBlock, units: specs.map((sp) => ({ name: sp.meshName, label: sp.meshName, color: sp.color })), origin: { ...originRef.current }, when: new Date().toLocaleTimeString(), title: `stack ${unitSpecs.map((sp) => sp.meshName).join(" over ")}${unitSpecs.length < specs.length ? `, ${specs.length - unitSpecs.length} fault(s)` : ""}`, matchedPct: chk.total ? Math.round((100 * chk.matched) / chk.total) : null });
      // TASKS.csv #679 — the trend's scales multiply to 1 (trendScales: iso / max * iso / int * iso / min), so a warped
      // cell has the volume of its real-space parallelepiped; dividing by the product keeps that true if it ever isn't
      const warpDet = anisotropy.enabled ? anisoScl.major * anisoScl.semiMajor * anisoScl.minor : 1;
      const vols = unitVolumes(res.block).filter((v) => v.name).map((v) => ({ ...v, volume: v.volume / warpDet }));
      const pct = (a, b) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
      const fmtVol = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)} km³` : `${(v / 1e6).toFixed(1)} Mm³`);
      const perUnit = chk.units.map((u) => `${u.unit} ${pct(u.matched, u.logged)} of ${Math.round(u.logged)} m${u.mostOftenModelledAs !== undefined && u.matched < u.logged ? ` (otherwise mostly modelled as ${u.mostOftenModelledAs ?? "above the modelled tops"})` : ""}`).join("; ");
      const worst = chk.holes.filter((h) => h.logged >= 5).slice(0, 3).map((h) => `${h.hole_id} ${pct(h.matched, h.logged)}`).join(", ");
      if (chk.total > 0) setNotices((p) => [...p, notice("Model check{v}: the model puts {v2} of {v3} logged metres of the modelled units in the unit they were logged as. By unit: {perUnit}.{v4}{v5} Unit volumes inside the model box ({v6}) are bounded by that box and are not resource figures.{v7}", { v: exact ? tr(" (each interval's midpoint evaluated exactly)") : tr(" (read from the {modelResolution}³ block)", { modelResolution }), v2: pct(chk.matched, chk.total), v3: Math.round(chk.total), perUnit, v4: worst ? tr(" Least reproduced holes: {worst}.", { worst }) : "", v5: chk.outside ? tr(" {v} m fell outside the model extent.", { v: Math.round(chk.outside) }) : "", v6: vols.length ? vols.map((v) => `${v.name} ${fmtVol(v.volume)}`).join(", ") : tr("none"), v7: anisotropy.enabled ? tr(" With the {trendWord} \"{v}\" the model is solved in a stretched frame: the check and volumes account for it, and \"Add as block model\" gets the model resampled onto a real-space grid.", { trendWord, v: anisotropy.params?.trend || tr("unnamed") }) : "" })]);
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
        ? tr(" Interpolation: {v}, potential-field range {rangeUsed}{v2}.", { v: specs.length > 1 ? (relation === "erode" ? tr("erosional (each unit truncates those below)") : tr("conformable (units onlap)")) : tr("single surface"), rangeUsed: res.rangeUsed.toFixed(3), v2: res.rangeDefault != null && Math.abs(res.rangeUsed - res.rangeDefault) > 1e-9 ? tr(" (GemPy's own default {rangeDefault} x {rangeMultiplier})", { rangeDefault: res.rangeDefault.toFixed(3), rangeMultiplier }) : tr(" (GemPy's own default)") })
        : "";
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
      let counter = null, blockMeta = null; // TASKS.csv #757 — each realisation's lithology block, counted per cell
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
          { resolution: [modelResolution, modelResolution, modelResolution], relation, rangeMultiplier: rangeMultiplier || 0, signal: ac.signal, returnBlock: true }, // returnBlock: #757
        );
        if (!r.ok) { if (r.cancelled) break; failed++; continue; }
        if (r.block?.ids?.length) { // #757
          if (!counter) { counter = makeEnsembleCounter(r.block.ids.length, r.block.labels.length); blockMeta = r.block; }
          counter.add(r.block.ids);
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
          const fmtV = (v) => (v == null ? "n/a" : v >= 1e9 ? `${(v / 1e9).toFixed(2)} km³` : `${(v / 1e6).toFixed(1)} Mm³`);
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
  const mcodeDefaultRole = (name) => { const r = roleForLithology(name); return r === "overburden" ? "overburden" : (r === "fault" || r === "dyke" || r === "breccia") ? "cross-cutting" : "stratigraphic"; };
  const mcodeGroupOf = (v) => (lithoGroups || []).find((g) => (g.codes || []).includes(v))?.name || null;
  const gatherLithoSurfaceSpec = (target, traces, { silent = false, mapConstraint: mapC = null, pileOrder = null } = {}) => {
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
    let splitsSkipped = 0, upHolePicks = 0;
    if (isMcode) {
      // a stack's own order is the pile order for codes the code list hasn't placed
      const mc = withPileOrder(modellingCodes, pileOrder); // roles of every code kept (the first version dropped unplaced codes' roles)
      const runs = codedRuns(layers.litho, mc, mcodeGroupOf);
      const { tops, skipped } = topsForCode(runs, unitName, mc, mcodeDefaultRole);
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
        const pickSigma = r.uncertainty_m == null || r.uncertainty_m === "" ? NaN : Number(r.uncertainty_m);
        if (Number.isFinite(pickSigma) && pickSigma >= 0) api.sigma = pickSigma;
        points.push(api);
      });
      const why = [skipped.belowRole ? `${skipped.belowRole} below casing / overburden or an intrusion / cross-cutting unit` : null, skipped.holeStart ? `${skipped.holeStart} at a hole start` : null,
        skipped.gap ? `${skipped.gap} below an unlogged gap` : null, skipped.olderAbove ? `${skipped.olderAbove} below an OLDER unit (overturned, repeated or up-hole)` : null].filter(Boolean);
      if (!silent || why.length) setNotices((p) => [...p, notice("{unitName}: {tops} contact(s) where it starts below a younger stratigraphic unit.{v}", { unitName, tops: tops.length, v: why.length ? tr(" Not used as contacts: {why}.", { why: why.join("; ") }) : "" })]);
    }
    if (!isMcode) traces.forEach((t) => {
      const zAt = (md) => findOnTrace(t.pts, md)?.y; // scene y = elevation
      (layers.litho || []).filter((r) => r.hole_id === t.hole_id && !isNaN(r.from)).forEach((r) => {
        const isIn = inUnit(r);
        if (hasAssign && isIn !== codes.has(r.value)) { if (isIn) assignedIn++; else assignedOut++; }
        if (!isIn) return;
        // TASKS.csv #569 — the upper contact is at `to` in a rising (up-hole) interval
        const top = upperContactOf(r, zAt, { startIndex: litStarts, endIndex: litEnds, codes: contCodes });
        if (top.continues) { splitsSkipped++; return; }
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
    if (splitsSkipped && !silent) setNotices((p) => [...p, notice("{unitName}: {splitsSkipped} interval start(s) inside the unit (the row above in the same hole is the same {v}) were not used as contacts.", { unitName, splitsSkipped, v: isGroup ? tr("group") : tr("unit") })]);
    if (upHolePicks && !silent) setNotices((p) => [...p, notice("{unitName}: {upHolePicks} contact(s) are in holes drilled upward there — the unit's top was taken at the interval's deeper end (to), which is the higher one.", { unitName, upHolePicks })]); // #569
    // #810 — always said, even inside a stack (silent): it changes which picks the surface follows
    if (assignedIn || assignedOut) setNotices((p) => [...p, notice("{unitName}: modelling-code assignments followed: {assignedIn} interval(s) re-coded into it used, {assignedOut} logged as it but re-coded to another code left out.", { unitName, assignedIn, assignedOut })]);
    let sectionContactCount = 0;
    // TASKS.csv #810 — drawn contacts left out because the option is off are counted and said, not dropped silently
    if (!includeSectionContacts) {
      const n = (sections || []).reduce((k, s) => k + (s.contacts || []).filter((c) => c.isUpperContact && sectionTags.has(c.unit)).length, 0);
      if (n) setNotices((p) => [...p, notice("{unitName}: {n} drawn cross-section contact(s) were NOT used — tick \"Include drawn cross-section contacts\" to add them.", { unitName, n })]);
    }
    if (includeSectionContacts) {
      const o = originRef.current;
      (sections || []).forEach((s) => {
        (s.contacts || []).forEach((c) => {
          if (!sectionTags.has(c.unit) || !c.isUpperContact) return; // #176 — any member code's contact feeds the group (#810: or the group's name)
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
      setNotices((p) => [...p, notice("Search ellipsoid: excluded {v} of {points} \"{unitName}\" point(s) with fewer than {minSamples} neighbour(s) along the declared trend.", { v: points.length - supportedPoints.length, points: points.length, unitName, minSamples: searchEllipsoid.minSamples })]);
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
    if (!silent && structRows.length) setNotices((p) => [...p, notice("Orientations for \"{unitName}\" from structure type(s) {v} ({structRows} pick(s) before spatial filtering). Change which types count as contacts under Contact orientations.", { unitName, v: [...useTypes].join(", "), structRows: structRows.length })]);
    structRows = filterRowsByDomain(structRows, traces, (s) => s.depth);
    const preSearchCount = structRows.length;
    structRows = filterRowsBySearchEllipsoid(structRows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && structRows.length < preSearchCount && !silent) {
      setNotices((p) => [...p, notice("Search ellipsoid: excluded {v} of {preSearchCount} structure orientation(s) with fewer than {minSamples} neighbour(s) along the declared trend.", { v: preSearchCount - structRows.length, preSearchCount, minSamples: searchEllipsoid.minSamples })]);
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
    // TASKS.csv #318 — outcrop measurements of the chosen types within the search radius of the mapped
    // contact, as orientations at their own (terrain) position. Only when a map contact is in play: a
    // bedding reading 3 km from anything being modelled has no business steering this surface.
    if (mapC && mapPts.length) {
      const o = originRef.current;
      const near = surfaceOrientationsNear(mapPts, mapC);
      near.forEach((m) => orientations.push({ x: m.x - o.x, y: m.y - o.y, z: m.z - o.z, dip: m.dip, azimuth: m.dipDir }));
      if (!silent) setNotices((p) => [...p, near.length ? notice("Added {near} outcrop measurement(s) ({classes}) within {radius} m of the mapped contact as orientations.", { near: near.length, classes: mapC.classes.join(", "), radius: mapC.radius }) : notice("No outcrop measurements of the chosen types lie within {radius} m of the mapped contact — none added as orientations.", { radius: mapC.radius })]);
    }
    if (!orientations.length) {
      // No structure/contact data to draw an orientation from — estimate one from the shape of the
      // litho points themselves instead of blocking the run. Less accurate than a real structure
      // pick, but lets the tool interpolate a surface from contacts alone, which is the point.
      const est = estimateOrientationFromPoints(points);
      orientations = [est];
      if (!silent) setNotices((p) => [...p, notice("No structure picks found — estimated a single dip/azimuth (~{dip}°/~{azimuth}°) from the shape of the \"{unitName}\" contact points. Import a structure CSV for a more accurate result.", { dip: est.dip.toFixed(0), azimuth: est.azimuth.toFixed(0), unitName })]);
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
    const type = role === "overburden" ? "overburden_base" : role === "fault" ? "fault" : role === "dyke" ? "dyke" : role === "breccia" ? "breccia_body" : "stratigraphic_contact";
    // A group's own assignable color drives its surface/legend; falls back to the first member's
    // per-code color if none set. Raw intervals in the 3D log keep their individual code colors.
    const color = isMcode ? (mcodeInfo.color || colorForLithology([...(mcodeLogged || [])][0] || unitName)) : isGroup ? (target.color || colorForLithology([...codes][0])) : colorForLithology(unitName);
    return { label: `Top of ${unitName}`, meshName: unitName, points, orientations, color, type, codes: isMcode ? [...mcodeLogged] : [...codes], sectionTags: [...sectionTags] /* #810 */, ...(isMcode ? { mcode: true } : {}), ...(thinNote ? { params: { orientationsAveraged: thinNote } } : {}) }; // codes: #356 model check (logged codes); mcode: #599
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
    if (!traces.length) { setNotices((p) => [...p, notice("Load collars/survey data before running the implicit model.")]); return; }
    // TASKS.csv #176 — a `group:<id>` pick resolves to its group object here; the raw-code path is untouched.
    const target = resolveLithoTarget(unitName);
    if (!target) { setNotices((p) => [...p, notice("That lithology group no longer exists — pick another unit.")]); return; }
    const spec = gatherLithoSurfaceSpec(target, traces, { mapConstraint });
    if (!spec) return;
    noteUnmatchedDrawnContacts([spec]);
    if (mapConstraint) spec.params = { ...(spec.params || {}), surfaceMapContact: { units: mapConstraint.units, classes: mapConstraint.classes, radiusM: mapConstraint.radius } };
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
    if (!traces.length) { setNotices((p) => [...p, notice("Load collars/survey data before running the stratigraphic stack.")]); return; }

    const specs = [];
    const skipped = [];
    // TASKS.csv #599 — the stack's own top-to-bottom order is the pile order for its modelling codes
    const pileOrder = unitNames.filter((u) => typeof u === "string" && u.startsWith("mcode:")).map((u) => u.slice(6));
    unitNames.forEach((u) => {
      // TASKS.csv #176 — stackUnits carries `group:<id>` keys verbatim; resolve to the group object
      // only here, at the point the spec is actually gathered.
      const target = resolveLithoTarget(u);
      const spec = target ? gatherLithoSurfaceSpec(target, traces, { silent: true, pileOrder }) : null;
      if (spec) specs.push(spec); else skipped.push(target && typeof target === "object" ? target.name : target || "(deleted group)");
    });
    if (skipped.length) setNotices((p) => [...p, notice("Skipping from the stack (no lithology intervals found): {skipped}.", { skipped: skipped.join(", ") })]);
    if (specs.length < 2) { setNotices((p) => [...p, notice("Need at least 2 units with data to model a stack — add more units or check your lithology import.")]); return; }
    noteUnmatchedDrawnContacts(specs);
    // TASKS.csv #360 — faults that offset the stack, solved in the same GemPy run (FAULT groups)
    const faultSpecs = [];
    stackFaults.forEach((key) => {
      const f = gatherFaultSpec(key, traces);
      if (f.spec) faultSpecs.push(f.spec); else setNotices((p) => [...p, notice("Fault \"{v}\" left out: {why}", { v: key.replace("|", " — "), why: f.why })]);
    });
    if (faultSpecs.length) setNotices((p) => [...p, notice("The stack is offset by {faultSpecs} fault(s) solved in the same model: {v}.", { faultSpecs: faultSpecs.length, v: faultSpecs.map((f) => f.meshName).join(", ") })]);

    await runSurfaceStack([...faultSpecs, ...specs], { relation: stackRelation }); // TASKS.csv #271
  };

  // TASKS.csv #817 — a stratigraphic model from the surface geology ALONE (no drillholes needed). Matt: "I wanna have a
  // way to import surface geology (maps and structural measuments) and build a 3d model out of it". `p`:
  //   layer / field: the geology map (polygons) and its unit attribute; order: the stratigraphic units, youngest first
  //   (suggested by lib/pileOrder.js, edited by the geologist); bedding / planes: orientations in world coordinates
  //   ({ x, y, dip, dipDir } - outcrop measurements and contact dips fitted from the draped traces); faults: [{ name,
  //   line: [[x, y]], dip, dipDir }]; relation: "onlap" | "erode".
  // Every contact between two units of the order is draped on the terrain (a point every 25 m) and becomes interface
  // points of the BASE of the younger unit = the top of the unit directly below it in the order (a unit missing in
  // between pinches out there). The youngest unit's top is the ground: no surface. Units not in the order (intrusions,
  // breccias, hornfels...) are left out of the stack and named. Then the ordinary stack run: same solve, model check,
  // predicted geological map scored against the loaded map (#758).
  const runMapModel = async (p) => {
    const terrain = terrainForClipRef.current;
    if (!terrain) { setNotices((q) => [...q, notice("A model from the map needs a terrain: the contacts and measurements are placed on the ground surface. Fetch or import one first (Geophysics > Terrain).")]); return; }
    const order = (p.order || []).filter(Boolean);
    if (order.length < 2) { setNotices((q) => [...q, notice("Put at least two stratigraphic units in the order to model.")]); return; }
    const o = originRef.current;
    const [tx0, ty0, tx1, ty1] = terrain.bbox;
    const ground = (x, y) => (x < tx0 || x > tx1 || y < ty0 || y > ty1 ? NaN : sampleTerrainElevation(terrain, x, y));
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
    const { extractMapContacts } = await import("../../lib/mapLayers.js");
    const { contacts } = extractMapContacts(p.layer, p.field);
    const rank = new Map(order.map((u, i) => [u, i]));
    const pointsOf = new Map(order.map((u) => [u, []]));
    let offTerrain = 0, unused = 0;
    for (const c of contacts) {
      const [a, b] = c.units;
      if (!rank.has(a) || !rank.has(b)) { unused++; continue; }
      const younger = rank.get(a) < rank.get(b) ? a : b;
      const surface = order[rank.get(younger) + 1]; // the top of the unit directly below the younger one
      for (const line of c.lines) for (const [x, y] of thin(line, 25)) {
        const z = ground(x, y);
        if (!Number.isFinite(z)) { offTerrain++; continue; }
        pointsOf.get(surface).push({ ...api(x, y, z), srcCode: `${a}|${b}` });
      }
    }
    const orientations = [...(p.bedding || []), ...(p.planes || [])].map((m) => ({ m, z: ground(m.x, m.y) })).filter(({ m, z }) => Number.isFinite(z) && [m.dip, m.dipDir].every(Number.isFinite))
      .map(({ m, z }) => ({ ...api(m.x, m.y, z), dip: m.dip, azimuth: m.dipDir }));
    if (!orientations.length) { setNotices((q) => [...q, notice("No orientations on the terrain: import outcrop measurements (bedding) or fetch a terrain that covers the map so contact dips can be fitted.")]); return; }
    const specs = [], empty = [];
    order.slice(1).forEach((u) => {
      const pts = pointsOf.get(u);
      if (!pts.length) { empty.push(u); return; }
      specs.push({ label: `Top of ${u}`, meshName: u, points: pts, orientations, color: colorForLithology(u), type: "stratigraphic_contact", codes: [u], params: { mapModel: { layer: p.layer.name, field: p.field, order, contactPoints: pts.length } } });
    });
    if (specs.length < 1) { setNotices((q) => [...q, notice("None of the units below the youngest one shares a contact with a unit above it on the map, so there is nothing to model. Check the order.")]); return; }
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
    }), (offTerrain ? tr(" {k} contact point(s) beyond the terrain were skipped.", { k: offTerrain }) : "") + (unused ? tr(" {k} contact(s) involve units outside the order.", { k: unused }) : ""))]); // appendNotice: #821
    await runSurfaceStack([...faultSpecs, ...specs], { relation: p.relation || stackRelation, aboveUnit: order[0] });
  };

  const gatherFaultSpec = (key, traces) => {
    const [type, id] = key.split("|");
    const rows = (layers.structure || []).filter((s) => String(s.value) === type && (s.structure_id || "") === id && Number.isFinite(s.dip) && Number.isFinite(s.azimuth));
    const points = [];
    rows.forEach((s) => {
      const t = traces.find((tc) => tc.hole_id === s.hole_id);
      const p = t ? findOnTrace(t.pts, s.depth) : null;
      if (p) points.push(sceneToApi(p));
    });
    const orientations = structureRowsToOrientations(rows, traces);
    if (!points.length || !orientations.length) return { why: "its picks could not be placed on the hole traces." };
    const name = id ? `${type} — ${id}` : type;
    return { spec: { label: `Fault: ${name}`, meshName: `Fault ${name}`, points, orientations, color: colorForStructure(type), type: "fault", fault: true } };
  };

  // Structural modelling tool: models a surface from one structure-plane type (e.g. a fault or shear
  // pick's "value"), self-referentially — each pick's own position feeds the interface point AND its
  // own dip/azimuth feeds the orientation at that point. Unlike the litho/alteration tools, this
  // doesn't need a separate structure-layer lookup, since the structure picks ARE the thing being
  // modelled here.
  const runStructuralModel = async (structType) => {
    if (!structType) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, notice("Load collars/survey data before running the structural model.")]); return; }

    let rows = (layers.structure || []).filter((s) => String(s.value).toUpperCase() === String(structType).toUpperCase() && s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    if (!rows.length) { setNotices((p) => [...p, notice("No \"{structType}\" structure picks with dip/azimuth found — nothing to model.", { structType })]); return; }
    const domain = domains.find((d) => d.id === modelDomainId);
    rows = filterRowsByDomain(rows, traces, (s) => s.depth);
    if (!rows.length) { setNotices((p) => [...p, notice("No \"{structType}\" picks fall inside domain \"{v}\" — nothing to model.", { structType, v: domain?.name })]); return; }
    const preEllipsoid = rows.length;
    rows = filterRowsBySearchEllipsoid(rows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && rows.length < preEllipsoid) {
      setNotices((p) => [...p, notice("Search ellipsoid: excluded {v} of {preEllipsoid} \"{structType}\" pick(s) with fewer than {minSamples} neighbour(s) along the declared trend.", { v: preEllipsoid - rows.length, preEllipsoid, structType, minSamples: searchEllipsoid.minSamples })]);
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
        if (p) points.push(sceneToApi(p));
      });
      const orientations = structureRowsToOrientations(group, traces);
      if (!points.length || !orientations.length) { setNotices((p) => [...p, notice("Couldn't locate \"{name}\" picks along the hole traces.", { name })]); continue; }
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
  const runAlterationModel = (altValue) => {
    const anisotropy = trendWarp("alteration"); // TASKS.csv #650
    if (!altValue) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, notice("Load collars/survey data before running the alteration model.")]); return; }

    const domain = domains.find((d) => d.id === modelDomainId);
    const o = originRef.current;
    const label = `Alteration halo: ${altValue}`;
    setAlterationBusy(true);
    setTaskProgress?.({ label, pct: 20 });
    // Deferred exactly like runNumericModel (see its comment) so the busy state paints before the
    // synchronous grid pass — a timer, not rAF, because rAF never fires in a hidden window.
    setTimeout(async () => {
      try {
        const { marchingCubes } = await import("../../lib/marchingCubes.js"); // #476 — loaded on first use
        const { samplePointsFromIntervals } = await import("../../lib/estimation.js"); // #552 — on demand
        const { runEstimation } = await import("../../lib/estimationClient.js"); // #520 — the grid runs in a worker
        const altRows = (layers.alt || []).filter((r) => r.hole_id != null && r.from != null && r.to != null && !isNaN(r.from) && !isNaN(r.to) && Number(r.to) > Number(r.from));
        // TASKS.csv #52 (c) — an active intercept set restricts the TARGET picks only. The zeros (every
        // other logged alteration interval) are what close the envelope (#272), so filtering those by a
        // set the user built to describe the target would open the halo up instead of narrowing it.
        const targetRows = altRows.filter((r) => r.value === altValue && !excludedIntercepts.includes(interceptId("alt", r)) && interceptInActiveSet(interceptId("alt", r)));
        if (!targetRows.length) throw new Error(tr("No alteration intervals found for \"{altValue}\" — nothing to model.", { altValue }));

        // Auto parameters come from the spacing of the holes that actually carry alteration logging,
        // not every collar in the project — a regional hole 5 km away shouldn't set the halo's scale.
        const loggedHoles = new Set(altRows.map((r) => r.hole_id));
        const auto = autoHaloParams(collars.filter((c) => loggedHoles.has(c.hole_id)));
        const radius = alterationSearchRadius > 0 ? alterationSearchRadius : auto.radius;
        const cs = alterationCellSize > 0 ? alterationCellSize : auto.cell;

        // Indicator intervals: 1 inside the target assemblage, 0 inside any other logged alteration.
        // The zeros are what CLOSE the envelope — without a "definitely not altered" sample between two
        // altered holes, an indicator interpolation has nothing pulling it back below 0.5.
        const subLen = Math.max(0.5, cs / 2);
        const intervals = [];
        altRows.forEach((r) => {
          const isTarget = r.value === altValue;
          if (isTarget && excludedIntercepts.includes(interceptId("alt", r))) return; // #84 — reviewed-out intercepts never model
          if (isTarget && !interceptInActiveSet(interceptId("alt", r))) return; // #52 (c) — target picks outside the active set
          splitIntervalForSampling(Number(r.from), Number(r.to), subLen).forEach((seg) => {
            intervals.push({ hole_id: r.hole_id, from: seg.from, to: seg.to, avgGrade: isTarget ? 1 : 0 });
          });
        });
        const { points: worldPts, dropped } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        if (!worldPts.length) throw new Error(tr("No alteration sample points could be placed in 3D — check that the logged holes have collars."));

        // World -> api (east, north, up, origin-relative) — the space every spatial control in this
        // module (domain test, anisotropy warp) already speaks.
        let pts = worldPts.map((p) => ({ ...p, x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }));
        if (domain) {
          const before = pts.length;
          pts = pts.filter((p) => pointInDomain(apiToScene([p.x, p.y, p.z]), domain, implicitMeshesRef.current));
          if (pts.length < before) setNotices((q) => [...q, notice("Domain \"{name}\": excluded {v} of {before} alteration sample point(s) outside the domain.", { name: domain.name, v: before - pts.length, before })]);
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

        // TASKS.csv #520 — the grid runs in a worker: progress + Cancel on the status bar, the window keeps painting
        const ac = new AbortController();
        const grid = await runEstimation("dense", gridPts, {
          bounds, cellSize: { dx: cell, dy: cell, dz: cell }, method: "idw2",
          searchRadius: anisotropy.enabled ? radius * scl.major : radius, minSamples: 1, maxSamples: 16, minHoles: 1, // #656 — major semi-axis = radius
        }, { signal: ac.signal, onProgress: (f) => setTaskProgress?.({ label, pct: 20 + 60 * f, onCancel: () => ac.abort() }) });
        if (!grid.estimated) throw new Error(tr("No grid cell had an alteration sample within the search radius — increase the search radius."));
        // noData: "outside" — a no-data cell reads as "not altered", which is what lets the envelope
        // close against the edge of the informed region instead of leaving an open shell.
        // TASKS.csv #803 — closed at the terrain surface when "Cut at topography" is on
        const altUnwarp = anisotropy.enabled ? invScales(scl) : null;
        const altCap = groundCappedGrid(grid, 0.5, clipToTopo ? terrainForClipRef.current : null, anisotropy.enabled ? (q) => anisoWarpPoint(q, center, basis, altUnwarp) : null);
        const mc = marchingCubes(altCap.values, grid.nx, grid.ny, grid.nz, 0.5, {
          origin: grid.origin, spacing: grid.cellSize, noData: "outside",
        });
        if (!mc.faces.length) throw new Error(tr("The interpolated \"{altValue}\" indicator never crosses 0.5 — no envelope to extract (try a larger search radius or a smaller cell size).", { altValue }));

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
        const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: colorForAlteration(altValue), side: THREE.DoubleSide, transparent: true, opacity: 0.6 }));
        const vol = computeMeshVolume(geo);
        // Same honesty rule as the grade shell (#257): if part of the boundary is the search-radius
        // wall rather than a real 0/1 alteration boundary, the enclosed volume is a parameter choice.
        const closure = mc.closingVertices > 0 ? "artificial" : "natural";
        // TASKS.csv #276 — provenance for this surface, so the panel and every export can stamp it.
        const params = {
          tool: "alteration halo (indicator envelope)", target: altValue, isoLevel: 0.5,
          method: "idw2", searchRadiusM: radius, searchRadiusAuto: !(alterationSearchRadius > 0),
          ...(anisotropy.enabled ? { searchEllipsoidM: [1, scl.major / scl.semiMajor, scl.major / scl.minor].map((f) => Math.round(radius * f * 10) / 10) } : {}), // #656
          cellSizeM: cell, cellSizeAuto: !(alterationCellSize > 0), cellSizeCoarsened: coarsened,
          paddingM: pad, closure, holeSpacingM: auto.spacing, cutAtTopography: altCap.capped ? `${(terrainForClipRef.current?.name) || "terrain"}: ${altCap.capped} grid node(s) capped (#803)` : false,
          anisotropy: anisotropy.enabled ? anisotropy.params : null,
          domain: domain ? domain.name : null,
          interceptSet: activeInterceptSetRef.current ? { name: activeInterceptSetRef.current.name, intercepts: (activeInterceptSetRef.current.ids || []).length } : null, // TASKS.csv #52 (c)
          samplePoints: pts.length, alteredSamplePoints: insideCount, cellsEstimated: grid.estimated,
          generatedAt: new Date().toISOString(),
        };
        mesh.userData = { tip: `${label}\n${mc.vertices.length} vertices, ${mc.faces.length} faces\nindicator envelope, ${cell.toFixed(1)} m cells, ${Math.round(radius)} m search${vol.watertight ? `\n${vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³ enclosed` : "\n(open envelope)"}` };
        implicitGroupRef.current?.add(mesh);
        const id = `impl_${Date.now()}_alt_${altValue}`;
        implicitMeshesRef.current[id] = mesh;
        setImplicitSurfaces((p) => [...p, { id, name: label, visible: true, vertexCount: mc.vertices.length, faceCount: mc.faces.length, type: "alteration_envelope", relationships: [], closure, params }]);
        setNotices((p) => [...p, notice("Added \"{label}\": {insideCount} altered of {pts} indicator sample point(s){v} → {nx}×{ny}×{nz} grid ({cell} m cells{v2}, {v3} m search{v4}) → {vertices} vertices / {faces} faces{v5}. Closed indicator envelope, not a draped contact.", { label, insideCount, pts: pts.length, v: dropped ? tr(", {dropped} unplaceable", { dropped }) : "", nx: grid.nx, ny: grid.ny, nz: grid.nz, cell: cell.toFixed(1), v2: coarsened ? tr(", coarsened to stay under the grid limit") : "", v3: Math.round(radius), v4: anisotropy.enabled ? tr(", anisotropy applied") : "", vertices: mc.vertices.length.toLocaleString(), faces: mc.faces.length.toLocaleString(), v5: vol.watertight ? tr(", closed ({volumeM3} m³)", { volumeM3: vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 }) }) : tr(", open") })]);
        if (closure === "artificial") setNotices((p) => [...p, notice("\"{label}\" closes partly against the search-radius boundary rather than a logged alteration boundary, so its extent there reflects the {v} m search radius, not the data.", { label, v: Math.round(radius) })]);
        fitBox(new THREE.Box3().setFromObject(mesh));
      } catch (e) {
        setNotices((p) => [...p, e?.cancelled ? notice("Alteration halo cancelled.") : errorNotice(tr("Alteration halo failed: {v}", { v: e.message || e }))]);
      }
      setTaskProgress?.(null);
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
  const runVeinModel = (veinValue) => {
    if (!veinValue) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, notice("Load collars/survey data before running the vein model.")]); return; }
    const o = originRef.current;
    const domain = domains.find((d) => d.id === modelDomainId);
    const label = `Vein: ${veinValue}`;
    setVeinBusy(true);
    setTaskProgress?.({ label, pct: 20 });
    setTimeout(async () => {
      try {
        const { buildVeinModel } = await import("../../lib/vein.js"); // #144; loaded on first use (#476)
        const traceOf = new Map(traces.map((t) => [t.hole_id, t]));
        const rows = (layers.vein || []).filter((r) => r.value === veinValue && r.hole_id != null
          && r.from != null && r.to != null && !isNaN(r.from) && !isNaN(r.to) && Number(r.to) > Number(r.from)
          && !excludedIntercepts.includes(interceptId("vein", r)) // #84 — reviewed-out intercepts never model
          && interceptInActiveSet(interceptId("vein", r))); // #52 (c) — restricted to the active intercept set, if any
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
        const model = buildVeinModel(used, {
          cellSize: veinCellSize > 0 ? veinCellSize : 0,
          searchRadius: veinSearchRadius > 0 ? veinSearchRadius : 0,
          ...(Number.isFinite(dip) && Number.isFinite(dipDir) ? { dip, dipDir } : {}),
        });

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
        const base = {
          tool: "vein/dyke (midplane + thickness field)", target: veinValue,
          construction: "one midplane surface plus an interpolated TRUE-thickness field, offset by ±t/2 along the reference pole — the hangingwall and footwall are the same structure, so they cannot cross",
          attitudeSource: pl.attitudeSource, dip: pl.dip, dipDir: pl.dipDir,
          rmsOffReferencePlaneM: pl.rmsOffPlane, planarityRatio: pl.planarity,
          intercepts: model.intercepts.length,
          trueThicknessMinM: th.trueMin, trueThicknessMaxM: th.trueMax, trueThicknessMeanM: th.trueMean,
          downholeThicknessMeanM: th.downholeMean, thicknessRefinedToLocalNormal: th.refined,
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
        const fwSurf = stamp(model.footwall, "footwall", 0x3d8ecf, 0.75, "vein_footwall");
        // Only declared for a vein flat enough for "above" to mean something VERTICALLY, which is how
        // topology.js's sidedness check reads it. On a near-vertical vein the two walls barely overlap
        // in plan and "above" would be a meaningless (and possibly falsely violated) claim.
        const aboveRel = pl.dip <= 75 ? [{ relation: "above", targetId: fwSurf.id }] : [];
        stamp(model.hangingwall, "hangingwall", 0xe08a3c, 0.75, "vein_hangingwall", aboveRel);
        const solidVol = stamp(model.solid, "solid", 0xb5477e, 0.45, "vein_solid").vol;

        const fmt = (n, d = 2) => Number(n).toFixed(d);
        setNotices((p) => [...p, notice("Added \"{label}\": {intercepts} paired intercept(s){v} → midplane {v2}° / {v3}° ({attitudeSource}), TRUE thickness {v4}–{v5} m (mean {v6} m; mean DOWNHOLE length {v7} m){v8} → {nu}×{nv} grid, {informedNodes} informed nodes, {v9} m cells, {v10} m search{v11}{v12}.", { label, intercepts: model.intercepts.length, v: unplaceable ? tr(", {unplaceable} unplaceable", { unplaceable }) : "", v2: fmt(pl.dip, 1), v3: fmt(pl.dipDir, 1), attitudeSource: pl.attitudeSource, v4: fmt(th.trueMin), v5: fmt(th.trueMax), v6: fmt(th.trueMean), v7: fmt(th.downholeMean), v8: th.refined ? tr(", thickness corrected against the local modelled normal") : "", nu: model.grid.nu, nv: model.grid.nv, informedNodes: model.grid.informedNodes.toLocaleString(), v9: fmt(model.grid.cellSize, 1), v10: fmt(model.grid.searchRadius, 0), v11: model.grid.coarsened ? tr(" (coarsened to stay under the grid limit)") : "", v12: solidVol?.watertight ? tr(". Solid {volumeM3} m³", { volumeM3: solidVol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 }) }) : "" })]);
        setNotices((p) => [...p, notice("\"{label}\": hangingwall and footwall are offset ±half the interpolated thickness from one shared midplane, so they cannot cross — minimum modelled thickness {v} m{v2}. Modelled contacts sit {v3} m RMS (max {v4} m) from the logged ones — measured AT the intercepts, where an inverse-distance field nearly reproduces its own data, so a small number here says the pair honours the logging, not that the shape between holes is right.{v5}", { label, v: fmt(ck.minSeparation, 3), v2: ck.pinchOut ? tr(" (the vein pinches out to zero somewhere in the model)") : "", v3: fmt(ck.contactResidualRms, 2), v4: fmt(ck.contactResidualMax, 2), v5: pl.rmsOffPlane != null ? tr(" The intercept midpoints scatter {v} m RMS off a single plane, so the {v2}°/{v3}° figure is a reference attitude, not a measurement of one continuous surface.", { v: fmt(pl.rmsOffPlane, 1), v2: fmt(pl.dip, 0), v3: fmt(pl.dipDir, 0) }) : "" })]);
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
        const meshes = Object.values(implicitMeshesRef.current);
        if (meshes.length) fitBox(new THREE.Box3().setFromObject(meshes[meshes.length - 1]));
      } catch (e) {
        setNotices((p) => [...p, errorNotice(tr("Vein model failed: {v}", { v: e.message || e }))]);
      }
      setTaskProgress?.(null);
      setVeinBusy(false);
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
    const symbol = numericSymbol || assayElements[0]?.symbol;
    if (!symbol) { setNotices((p) => [...p, notice("No assay elements loaded — import assays before running the numeric model.")]); return; }
    if (!collars.length) { setNotices((p) => [...p, notice("Load collars/survey data before running the numeric model.")]); return; }
    if (!Number.isFinite(numericCutoff)) { setNotices((p) => [...p, notice("Enter a numeric cutoff grade.")]); return; }
    const elementUnits = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));
    const unit = elementUnits[symbol] || "ppm";
    const label = `${symbol} > ${numericCutoff} ${unit} shell`;
    setNumericBusy(true);
    setTaskProgress?.({ label, pct: 20 });
    setTimeout(async () => {
      try {
        const { marchingCubes } = await import("../../lib/marchingCubes.js"); // #476 — loaded on first use
        const { samplePointsFromIntervals, summarizeSupport } = await import("../../lib/estimation.js"); // #552 — on demand
        const { runEstimation } = await import("../../lib/estimationClient.js"); // #520 — the grid runs in a worker
        // TASKS.csv #266 — QC inserts (standards/blanks/duplicates) are excluded by default here, the
        // same as Best Intercepts / Compositing / Grade Statistics already do. They used to reach the
        // grade shell unfiltered; most got dropped downstream only because their synthetic hole_id has
        // no collar, which is luck rather than design — a field duplicate logged under its PARENT
        // hole's id was genuinely double-counted.
        const srcAssays = numericIncludeQAQC ? assays : excludeQAQC(assays);
        let intervals, rawStats = null;
        if (numericUseComposites) {
          // TASKS.csv #259 — high-grade capping. compositeDownhole has always accepted capValue and
          // applied it per RAW sample before length-weighted averaging (the correct order), but only
          // CompositingModal ever passed it: the grade shell composited uncapped, so one bonanza Au
          // assay drove IDW² across its whole search neighbourhood.
          intervals = compositeDownhole(srcAssays, symbol, unit, elementUnits, {
            length: numericCompositeLength, minCoverage: numericMinCoverage, // TASKS.csv #262 — was hardcoded 0.5
            capValue: Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null,
          });
        } else {
          const cap = Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null;
          // TASKS.csv #571 — duplicates / overlaps resolved, values in `unit`, as in compositing
          const raw = rawSampleIntervals(srcAssays, symbol, unit, elementUnits, { capValue: cap });
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
        if (!above) throw new Error(tr("None of the {points} sample points reach the {numericCutoff} {unit} cutoff — nothing to enclose. Lower the cutoff.", { points: points.length, numericCutoff, unit }));

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

        // Grid extent: the sample points' own bounding box plus padding (not the collar box — assays
        // define where a grade shell can exist, and padding lets the shell close beyond the last hole).
        const xr = minMax(gridPoints.map((p) => p.x)), yr = minMax(gridPoints.map((p) => p.y)), zr = minMax(gridPoints.map((p) => p.z));
        const pad = Math.max(0, numericPadding);
        const bounds = { xmin: xr.min - pad, xmax: xr.max + pad, ymin: yr.min - pad, ymax: yr.max + pad, zmin: zr.min - pad, zmax: zr.max + pad };
        const cs = Math.max(0.5, numericCellSize);
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
        const blocksNeeded = gridBlockCount(bounds, cs);
        if (blocksNeeded > blockBudget) {
          const fit = cellToFit(bounds, blockBudget, cs);
          const fitMax = cellToFit(bounds, MAX_BLOCK_BUDGET, cs);
          setNumericBudgetHint?.({ needed: blocksNeeded, budget: blockBudget, cell: cs, fit, fitMax });
          throw new Error(tr("At {cs} m cells this extent needs {blocksNeeded} blocks — over the {blockBudget}-block budget. {fit} m cells fit this budget{v}. Change the cell size or the block budget in the Grade shell pane.", { cs, blocksNeeded: blocksNeeded.toLocaleString(), blockBudget: blockBudget.toLocaleString(), fit, v: blockBudget < MAX_BLOCK_BUDGET ? tr("; with the largest budget ({MAX_BLOCK_BUDGET}) {fitMax} m cells fit", { MAX_BLOCK_BUDGET: MAX_BLOCK_BUDGET.toLocaleString(), fitMax }) : "" }));
        }
        setNumericBudgetHint?.(null);
        const ac = new AbortController(); // TASKS.csv #520 — worker + status-bar progress and Cancel
        const grid = await runEstimation("dense", gridPoints, {
          bounds, cellSize: { dx: cs, dy: cs, dz: cs }, method: numericMethod,
          searchRadius: searchInGrid, minSamples: 1, maxSamples: 16, // #656
          minHoles: Math.max(1, numericMinHoles), // TASKS.csv #258
          support: true, // TASKS.csv #91/#92 — classify every grid node so the shell can be coloured by it
          maxBlocks: blockBudget, // TASKS.csv #625
        }, { signal: ac.signal, onProgress: (f) => setTaskProgress?.({ label, pct: 20 + 60 * f, onCancel: () => ac.abort() }) });
        if (!grid.estimated) throw new Error(numericMinHoles > 1
          ? tr("No grid cell had samples from at least {numericMinHoles} distinct holes within the search radius — widen the search, or lower \"Min holes\".", { numericMinHoles })
          : tr("No grid cell had a sample within the search radius — widen it."));
        // TASKS.csv #803 — Matt: "I can't get my grade shell block model to end at surface, it's going above surface".
        // The grid is padded around the samples, so near the surface it reached into the air; with "Cut at topography"
        // on, the field is intersected with "below the terrain" and the shell closes on the ground (still watertight).
        const gsRealOf = anisotropy.enabled ? ((u) => (q) => anisoWarpPoint(q, gsCenter, gsBasis, u))(invScales(gsScl)) : null;
        const gsCap = groundCappedGrid(grid, numericCutoff, clipToTopo ? terrainForClipRef.current : null, gsRealOf);
        const mc = marchingCubes(gsCap.values, grid.nx, grid.ny, grid.nz, numericCutoff, {
          origin: grid.origin, spacing: grid.cellSize, noData: numericCloseShell ? "outside" : "skip",
        });
        if (!mc.faces.length) throw new Error(tr("The interpolated {symbol} grid never crosses {numericCutoff} {unit} — no shell to extract (try a lower cutoff, a larger search radius, or a smaller cell size).", { symbol, numericCutoff, unit }));

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
        let gradeSum = 0, gradeCells = 0;
        for (let i = 0; i < grid.values.length; i++) {
          const gv = grid.values[i];
          if (Number.isFinite(gv) && gv >= numericCutoff) { gradeSum += gv; gradeCells++; }
        }
        const meanGradeInShell = gradeCells > 0 ? gradeSum / gradeCells : null;
        // TASKS.csv #270 (LOW-3) / #269 - the parameter block that produced this surface, kept ON the
        // surface so the panel can show it and every export can stamp it. A tonnage with no record of
        // the cutoff/method/radius/cell size/closure mode behind it can't be reproduced or audited.
        const params = {
          tool: "numeric grade shell", element: symbol, unit, cutoff: numericCutoff,
          method: numericMethod, searchRadiusM: effectiveRadius,
          searchRadiusWasUnlimited: !(numericSearchRadius > 0),
          ...(shellEllipsoidM ? { searchEllipsoidM: shellEllipsoidM } : {}), // #656 — semi-axes along the trend's axes
          cellSizeM: cs, paddingM: pad, closure, cutAtTopography: gsCap.capped ? `${(terrainForClipRef.current?.name) || "terrain"}: ${gsCap.capped} grid node(s) above or just below the ground capped (#803)` : false,
          composited: numericUseComposites, compositeLengthM: numericUseComposites ? numericCompositeLength : null,
          minCoverage: numericUseComposites ? numericMinCoverage : null, // TASKS.csv #262
          capValue: Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null,
          minHoles: Math.max(1, numericMinHoles), includeQAQC: numericIncludeQAQC,
          // TASKS.csv #273 — the shared controls this tool now honours, recorded like every other param.
          anisotropy: anisotropy.enabled ? anisotropy.params : null,
          domain: gradeDomain ? gradeDomain.name : null,
          samplePoints: points.length, cellsEstimated: grid.estimated, ...(grid.variogram ? { variogram: grid.variogram } : {}), // #709
          singleHoleCells: grid.singleHoleCells, meanGradeInShell,
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
        setNotices((p) => [...p, notice("Added \"{label}\": {points} sample point{v} ({intervals} {v2}{v3}{v4}, {dropped} dropped{v5}, {above} at/above cutoff{v6}) → {nx}×{ny}×{nz} grid ({estimated} cells estimated, {skipped} outside the search radius{v7}{v8}) → {vertices} vertices / {faces} faces{v9}. Exploration target volume only — not a Mineral Resource.", { label, points: points.length, v: points.length === 1 ? "" : "s", intervals: intervals.length, v2: numericUseComposites ? tr("{numericCompositeLength} m composite", { numericCompositeLength }) : tr("raw interval"), v3: intervals.length === 1 ? "" : "s", v4: rawStats && (rawStats.duplicatesSkipped || rawStats.overlappingRows) ? tr(" after {duplicatesSkipped} exact duplicate(s) left out and {overlappingRows} overlapping row(s) resolved", { duplicatesSkipped: rawStats.duplicatesSkipped, overlappingRows: rawStats.overlappingRows }) : "", dropped, v5: beyondTrace ? tr(" ({beyondTrace} deeper than the hole's trace)", { beyondTrace }) : "", above, v6: clamped ? tr(clamped === 1 ? ", {clamped} negative grade clamped to zero" : ", {clamped} negative grades clamped to zero", { clamped }) : "", nx: grid.nx, ny: grid.ny, nz: grid.nz, estimated: grid.estimated.toLocaleString(), skipped: grid.skipped.toLocaleString(), v7: grid.singleHoleCells ? tr(", {singleHoleCells} informed by only ONE hole", { singleHoleCells: grid.singleHoleCells.toLocaleString() }) : "", v8: grid.variogram ? tr("; kriged with a {model} variogram {v}: nugget {v2}, sill {v3}, range {v4} m", { model: grid.variogram.model, v: grid.variogram.fitted ? tr("fitted to the samples") : tr("as entered"), v2: +grid.variogram.nugget.toPrecision(3), v3: +grid.variogram.sill.toPrecision(3), v4: Math.round(grid.variogram.range) }) : "", vertices: mc.vertices.length.toLocaleString(), faces: mc.faces.length.toLocaleString(), v9: vol.watertight ? tr(", closed ({volumeM3} m³)", { volumeM3: vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 }) }) : tr(", open ({openEdgeCount} open edges — shell reaches the edge of the estimated region)", { openEdgeCount: vol.openEdgeCount }) })]);
        // TASKS.csv #533 — say what the cap did: samples cut and share of metal removed (on the same QC-excluded raw samples)
        if (Number.isFinite(numericCapValue) && numericCapValue > 0) setNotices((p) => [...p, `"${label}" ${capAuditText(capAudit(srcAssays, symbol, unit, elementUnits, numericCapValue), unit)}.`]);
        // TASKS.csv #91/#92 — say what the model is actually supported by, for the whole grid and for
        // the shell surface itself, and point at the sidebar toggle that draws it.
        if (grid.supportCounts) setNotices((p) => [...p, notice("\"{label}\" data support — grid: {v}. Shell surface vertices: {v2}. Only \"interpolated\" means the composites that produced that part of the shell bracket it on all three axes from at least two holes; everything else is grade carried outward from the data. Expand the surface in the list and use \"Colour by data support\" to see where. This is a geometric data-support measure, NOT a statistical confidence or a kriging variance.", { label, v: summarizeSupport(grid.supportCounts), v2: summarizeSupport(surfCounts) })]);
        if (closure === "artificial") setNotices((p) => [...p, notice("\"{label}\" was closed ARTIFICIALLY at the search-radius boundary ({closingVertices} of its vertices sit on that wall, not on a grade boundary). Its volume depends on your search radius, not only on the data — doubling the radius roughly multiplies the volume by eight. Treat it as a visualization of where grades might extend, not a measured volume.", { label, closingVertices: mc.closingVertices.toLocaleString() })]);
        fitBox(new THREE.Box3().setFromObject(mesh));
      } catch (e) {
        setNotices((p) => [...p, e?.cancelled ? notice("Numeric model cancelled.") : errorNotice(tr("Numeric model failed: {v}", { v: e.message || e }))]);
      }
      setTaskProgress?.(null);
      setNumericBusy(false);
    }, 40);
  }; // anisotropy/domains/modelDomainId: TASKS.csv #273

  return { runAlterationModel, runImplicitModel, runNumericModel, runStackModel, runMapModel, runStructuralModel, runVeinModel };
}
