// TASKS.csv #445 step 2 — the modelling runs (implicit / stacked / structural surfaces via GemPy, alteration and
// vein halos, numeric grade shells, boundary intercepts, the stratigraphic-stack editor), moved out of
// ViewerModule.jsx VERBATIM: the code between the destructuring and the return is exactly what sat in the
// component (by script, not retyped), so every TASKS.csv comment inside still applies where it stands.
// ViewerModule calls this hook at the same point in its body as the code used to run, so React's hook order,
// every useCallback / useMemo dependency array and every closure see exactly the same values as before.
// `ctx` carries what the code reads from the component (store values, state + setters, refs, helpers) —
// the list was produced by a scope analysis (eslint-scope), not by hand; the return is what the rest of
// ViewerModule uses.
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";
import { desurveyHole } from "../../lib/desurvey.js";
import { sanitizeMesh } from "../../lib/meshSanitize.js";
import { checkAgainstLogs, unitVolumes } from "../../lib/modelCheck.js";
import { pythonImplicitModel } from "../../lib/desktop.js";
import { makeRng, perturbPoints, perturbOrientation, pointsToMeshDistance, spreadSummary, spreadColor, SPREAD_NOT_REPRODUCED } from "../../lib/surfaceSpread.js";
import { colorForLithology, colorForAlteration, colorForStructure, minMax, roleForLithology } from "../../lib/layers.js";
import { computeMeshVolume } from "../../lib/volumetrics.js";
import { MAX_BLOCKS, SUPPORT_COLORS } from "../../lib/estimationMeta.js"; // #552 — the estimator itself loads in the run functions
import { compositeDownhole } from "../../lib/geochem.js";
import { excludeQAQC } from "../../lib/qaqc.js";
import { errorNotice } from "../../lib/notices.js";
import { searchEllipsoidBasis, filterBySearchSupport, anisoScales, anisoWarpPoint, invScales, anisoWarpDirection, medianCollarSpacing, autoHaloParams, splitIntervalForSampling, spatialClusters, sampleTerrainElevation } from "../../lib/viewer/geomath.js";
import { intervalEndIndex, continuesUnitAbove, mergeTouchingIntervals } from "../../lib/viewer/intervals.js";
import { codedRuns, topsForCode, codeInfo, withPileOrder, effectiveCode } from "../../lib/modellingCodes.js"; // TASKS.csv #599
import { findOnTraceWorld, findOnTrace, interceptId, SOFT_NUGGET, MODEL_EXTENT_PAD_M, guessSurfaceType, pointInDomain } from "../../lib/viewer/modelHelpers.js";

export function useModelling(ctx) {
  const {
    activeInterceptSetRef,
    alterationCellSize,
    alterationSearchRadius,
    anisotropy,
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
    interceptInActiveSet,
    isSameProject,
    layers,
    lithoGroups,
    modellingCodes, // TASKS.csv #599
    mapConstraint,
    mapContactWorldPoints,
    mapLayers,
    modelAbortControllerRef,
    modelDomainId,
    modelResolution,
    numericCapValue,
    numericCellSize,
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
    setStackUnits,
    setTaskProgress,
    setVeinBusy,
    softIntercepts,
    stackFaults,
    stackRelation,
    stackUnits,
    structureRowsToOrientations,
    surfaceOrientationsNear,
    surfaceStructures,
    survey,
    terrain,
    terrainForClipRef,
    tracesRef,
    veinCellSize,
    veinDip,
    veinDipDir,
    veinSearchRadius,
  } = ctx;

  const runSurfaceStack = useCallback(async (rawSpecs, stackOpts = {}) => {
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
        if (droppedPoints) parts.push(`${droppedPoints} point(s)`);
        if (droppedOrientations) parts.push(`${droppedOrientations} orientation(s)`);
        setNotices((p) => [...p, `"${spec.label}": dropped ${parts.join(" and ")} with a missing/invalid x, y, z, dip, or azimuth value before sending to the sidecar — check the source CSV for blank or non-numeric cells in those columns.`]);
      }
      if (!points.length) { setNotices((p) => [...p, `"${spec.label}": no usable points left after removing invalid ones — skipped.`]); return; }
      if (!orientations.length) { setNotices((p) => [...p, `"${spec.label}": no usable orientations left after removing invalid ones — skipped.`]); return; }
      specs.push({ ...spec, points, orientations });
    });
    if (!specs.length) { setNotices((p) => [...p, "Nothing left to model after removing invalid points/orientations — see notices above for which columns to check."]); return; }
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
    const anisoBasis = anisotropy.enabled ? searchEllipsoidBasis(anisotropy.azimuth, anisotropy.dip) : null;
    const anisoScl = anisotropy.enabled ? anisoScales(anisotropy) : null;
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
    const sidecarSpecs = specs.map(warpForSidecar);

    const label = specs.length === 1 ? specs[0].label : `Stratigraphic stack (${specs.map((s) => s.meshName).join(", ")})`;
    const totalPoints = specs.reduce((s, x) => s + x.points.length, 0);
    const totalOrientations = specs.reduce((s, x) => s + x.orientations.length, 0);

    setImplicitBusy(true);
    setNotices((p) => [...p, `Running ${label} (${totalPoints} points, ${totalOrientations} orientations across ${specs.length} surface${specs.length > 1 ? "s" : ""})${anisotropy.enabled ? ", with anisotropy" : ""}…`]);
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
    const res = await pythonImplicitModel(
      extent,
      sidecarSpecs.filter((s) => !s.fault).map((s) => ({ name: s.meshName, points: s.points, orientations: s.orientations })),
      // TASKS.csv #271 (relation) / #274 (rangeMultiplier — omitted when 0/Auto, see desktop.js)
      // TASKS.csv #356 — ask for the lithology block (model check + volumes) unless anisotropy warps the
      // model space, where block coordinates no longer match hole positions directly.
      { resolution: [modelResolution, modelResolution, modelResolution], relation, rangeMultiplier: rangeMultiplier || 0, signal: abortController.signal, returnBlock: !anisotropy.enabled,
        faults: sidecarSpecs.filter((s) => s.fault).map((s) => ({ name: s.meshName, points: s.points, orientations: s.orientations })) }, // #360
    );
    clearInterval(rampTimer);
    const baseSolveSeconds = (performance.now() - solveStartedAt) / 1000;
    setImplicitBusy(false);
    modelAbortControllerRef.current = null;
    if (!res.ok) {
      setTaskProgress?.(null);
      if (!res.cancelled) setNotices((p) => [...p, errorNotice(`${label} failed: ${res.error}`)]);
      return;
    }
    // TASKS.csv #466 — the model came back after a switch to another project (tab change, Open, New). Its
    // surfaces are in the ORIGINAL project's local frame and belong to it; adding them here would put them
    // in the wrong project, at the wrong place. Not added; said plainly.
    if (!isSameProject(projectToken)) {
      setTaskProgress?.(null);
      setNotices((p) => [...p, `${label} finished after you switched to another project, so its result was NOT added here (it belongs to the project it was started from, in another frame). Switch back and run it again there.`]);
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
      const sceneVerts = apiVerts.map(apiToScene);
      // TASKS.csv #88 — boundary constraint: drop any triangle with a vertex outside the selected
      // domain, since GemPy fit/extrapolated across the whole extent regardless of which control points
      // fed it (#89 only restricted the INPUT, not the output). Leaves the vertex buffer itself alone
      // (unused vertices just go unreferenced) — simpler than compacting, and three.js doesn't care.
      let faces = surf.faces;
      if (clipDomain) {
        const vertexIn = sceneVerts.map((v) => pointInDomain(v, clipDomain, implicitMeshesRef.current));
        faces = faces.filter((f) => f.every((idx) => vertexIn[idx]));
        if (!faces.length) { missing.push(`${spec.label} (entirely clipped by domain "${clipDomain.name}")`); return; }
      }
      // TASKS.csv #358 — the model extent's top is the highest control point plus padding, and GemPy
      // extrapolates up to it, so dipping contacts used to stand up into the air above the ground (in 3D,
      // in exports, in any volume). Drop every triangle whose centroid is above the terrain surface (only
      // inside the terrain's footprint; outside it there is nothing to clip against).
      let topoClipped = 0;
      if (clipTerrain) {
        const o = originRef.current;
        const [txmin, tymin, txmax, tymax] = clipTerrain.bbox;
        const before = faces.length;
        faces = faces.filter((f) => {
          const cx = (sceneVerts[f[0]].x + sceneVerts[f[1]].x + sceneVerts[f[2]].x) / 3;
          const cy = (sceneVerts[f[0]].y + sceneVerts[f[1]].y + sceneVerts[f[2]].y) / 3;
          const cz = (sceneVerts[f[0]].z + sceneVerts[f[1]].z + sceneVerts[f[2]].z) / 3;
          const wx = cx + o.x, wy = -cz + o.y;
          if (wx < txmin || wx > txmax || wy < tymin || wy > tymax) return true;
          const ground = sampleTerrainElevation(clipTerrain, wx, wy);
          return !Number.isFinite(ground) || cy + o.z <= ground;
        });
        topoClipped = before - faces.length;
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
      // afterward in the Modeling tab's surface list, since a relationship needs another surface to
      // already exist to point at.
      // TASKS.csv #276 — until now only the numeric grade-shell tool attached a `params` block, so every
      // GemPy-generated surface exported to OBJ/DXF/glTF carried the #269 provenance HEADER with no
      // actual parameters in it. These are exactly the settings that change the shape of the surface
      // being exported, including #274's effective potential-field range as GemPy itself reported it.
      const params = {
        tool: specs.length > 1 ? "stratigraphic stack (GemPy)" : "implicit surface (GemPy)",
        surface: spec.meshName, sourcePoints: spec.points.length, orientations: spec.orientations.length,
        relation, resolution: [modelResolution, modelResolution, modelResolution],
        gempyRange: res.rangeUsed ?? null, gempyRangeDefault: res.rangeDefault ?? null,
        gempyRangeMultiplier: rangeMultiplier || null, gempyCO: res.cO ?? null,
        anisotropy: anisotropy.enabled ? { azimuth: anisotropy.azimuth, dip: anisotropy.dip, major: anisotropy.major, semiMajor: anisotropy.semiMajor, minor: anisotropy.minor } : null,
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
        generatedAt: new Date().toISOString(),
      };
      setImplicitSurfaces((p) => [...p, { id, name: spec.label, visible: true, vertexCount: surf.vertices.length, faceCount: faces.length, type: spec.type || "other", relationships: [], params }]);
    });
    // TASKS.csv #512 — onlap stacks share one scalar field, so the sidecar sends each repeated pick once
    if (res.orientationsDeduplicated > 0) setNotices((p) => [...p, `${res.orientationsDeduplicated} repeated orientation(s) were given to GemPy once rather than once per unit: in an onlap stack every unit shares one field, so the copies added solve time but no information.`]);
    if (missing.length) setNotices((p) => [...p, `GemPy returned no mesh for: ${missing.join(", ")} (try adding more points or a wider spread of orientations for those).`]);
    if (nonFinite.length) setNotices((p) => [...p, `GemPy returned some invalid (NaN) vertices — the surface is shown without the triangles that used them, so it may have holes: ${nonFinite.join("; ")}. Usually too few points / orientations for the extent or resolution.`]); // #314
    // TASKS.csv #356 — model vs logs, and unit volumes, from the lithology block. Every logged interval of a
    // modelled unit (by its code / group codes) is sampled at its midpoint in the model; the report says
    // what share of the logged metres the model puts in the same unit, per unit and the worst holes.
    // Volumes are INSIDE the model extent only (a box around the data), so they are not unit sizes in the
    // ground, and nothing here is a resource.
    if (res.block) {
      const codeToUnit = new Map();
      specs.forEach((sp) => { if (!sp.mcode) (sp.codes || [sp.meshName]).forEach((c) => codeToUnit.set(c, sp.meshName)); });
      // TASKS.csv #599 — units modelled from modelling codes are checked interval by interval against each
      // interval's own code (DACT1 / DACT2 both come from logged DACT: the logged code can't tell them apart)
      const mcodeUnits = new Set(specs.filter((sp) => sp.mcode).map((sp) => sp.meshName));
      const unitOfRow = (r) => { if (mcodeUnits.size) { const ec = effectiveCode(r, mcRef.current, mcodeGroupOf); if (mcodeUnits.has(ec)) return ec; } return codeToUnit.get(r.value); };
      const samples = [];
      traces.forEach((t) => {
        // latest store rows via the ref: this useCallback's closure can hold stale `layers`
        (importStateRef.current.layers?.litho || []).forEach((r) => {
          const unit = unitOfRow(r);
          if (r.hole_id !== t.hole_id || unit == null || !Number.isFinite(r.from) || !Number.isFinite(r.to) || r.to <= r.from) return;
          const p = findOnTrace(t.pts, (r.from + r.to) / 2);
          if (!p) return;
          const api = sceneToApi(p);
          samples.push({ hole_id: t.hole_id, x: api.x, y: api.y, z: api.z, metres: r.to - r.from, logged: unit });
        });
      });
      const chk = checkAgainstLogs(res.block, samples);
      setLastLithBlock({ block: res.block, units: specs.map((sp) => ({ name: sp.meshName, label: sp.meshName, color: sp.color })), origin: { ...originRef.current }, when: new Date().toLocaleTimeString(), title: `stack ${specs.map((sp) => sp.meshName).join(" over ")}`, matchedPct: chk.total ? Math.round((100 * chk.matched) / chk.total) : null });
      const vols = unitVolumes(res.block).filter((v) => v.name);
      const pct = (a, b) => (b > 0 ? `${Math.round((100 * a) / b)}%` : "—");
      const fmtVol = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)} km³` : `${(v / 1e6).toFixed(1)} Mm³`);
      const perUnit = chk.units.map((u) => `${u.unit} ${pct(u.matched, u.logged)} of ${Math.round(u.logged)} m${u.mostOftenModelledAs !== undefined && u.matched < u.logged ? ` (otherwise mostly modelled as ${u.mostOftenModelledAs ?? "above the modelled tops"})` : ""}`).join("; ");
      const worst = chk.holes.filter((h) => h.logged >= 5).slice(0, 3).map((h) => `${h.hole_id} ${pct(h.matched, h.logged)}`).join(", ");
      setNotices((p) => [...p, `Model check: the model puts ${pct(chk.matched, chk.total)} of ${Math.round(chk.total)} logged metres of the modelled units in the unit they were logged as. By unit: ${perUnit}.${worst ? ` Least reproduced holes: ${worst}.` : ""}${chk.outside ? ` ${Math.round(chk.outside)} m fell outside the model extent.` : ""} Unit volumes inside the model box (${vols.length ? vols.map((v) => `${v.name} ${fmtVol(v.volume)}`).join(", ") : "none"}) are bounded by that box and are not resource figures.`]);
    } else if (anisotropy.enabled) {
      setNotices((p) => [...p, "Model check vs logs isn't available with anisotropy on (the model is solved in a stretched space)."]);
    }
    if (newMeshes.length) {
      // TASKS.csv #274 — the effective potential-field range is now part of what a run reports. Without
      // it, two runs of the same job that came back looking different had no visible reason why.
      const rangeNote = res.rangeUsed != null
        ? ` Interpolation: ${specs.length > 1 ? (relation === "erode" ? "erosional (each unit truncates those below)" : "conformable (units onlap)") : "single surface"}, potential-field range ${res.rangeUsed.toFixed(3)}${res.rangeDefault != null && Math.abs(res.rangeUsed - res.rangeDefault) > 1e-9 ? ` (GemPy's own default ${res.rangeDefault.toFixed(3)} x ${rangeMultiplier})` : " (GemPy's own default)"}.`
        : "";
      setNotices((p) => [...p, `Added ${newMeshes.length} surface${newMeshes.length > 1 ? "s" : ""}: ${specs.filter((s) => byName[s.meshName]?.vertices?.length).map((s) => `"${s.label}"`).join(", ")}.${rangeNote}`]);
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
        setNotices((p) => [...p, `Sensitivity not run: the base run took ${estPerRun.toFixed(1)} s, so a ${ens.budgetS} s budget cannot fit even 3 realisations, and a spread from 1-2 runs means nothing. Raise the time budget, or lower the model resolution.`]);
        return;
      }
      setNotices((p) => [...p, `Sensitivity: running up to ${n} realisations of "${ensembleBase.spec.label}" within ${ens.budgetS} s (the base run took ${estPerRun.toFixed(1)} s; the first run is usually the slowest).`]);
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
        const w = warpForSidecar(perturbed);
        const r = await pythonImplicitModel(
          ext,
          [{ name: bSpec.meshName, points: w.points, orientations: w.orientations }],
          { resolution: [modelResolution, modelResolution, modelResolution], relation, rangeMultiplier: rangeMultiplier || 0, signal: ac.signal },
        );
        if (!r.ok) { if (r.cancelled) break; failed++; continue; }
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
        setNotices((p) => [...p, `Sensitivity for "${bSpec.label}" ${cancelled ? "cancelled" : "stopped"} after ${distances.length} usable realisation(s)${failed ? ` (${failed} failed in GemPy)` : ""} — at least 3 are needed, so no spread was produced.`]);
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
      const name = `Spread: ${bSpec.label} (${distances.length} realisations)`;
      smesh.userData = { tip: `${name}\nRMS distance each realisation's surface lies from this one, under the input sigmas you entered\nmedian ${fmt(stats.median)} m, 90th pct ${fmt(stats.p90)} m` };
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
            tool: "sensitivity spread (GemPy realisations)",
            of: bSpec.label, realisations: distances.length, realisationsRequested: ens.n, failedRealisations: failed, cancelled, stoppedByTimeBudget: budgetStopped, timeBudgetS: ens.budgetS, baseRunSeconds: +baseSolveSeconds.toFixed(1),
            pointSigmaM: ens.sigmaPos, orientationSigmaDeg: ens.sigmaDeg, perPickSigmas: perPick,
            seed, secondsPerRealisation: +(elapsed / Math.max(1, distances.length + failed)).toFixed(2),
            spreadMedianM: stats.median, spreadP90M: stats.p90, spreadMaxM: stats.max, verticesNotReproduced: stats.verticesNotReproduced,
            pctMovedMoreThanPositionSigma: +amplifiedPct.toFixed(1),
            measure: "per-vertex RMS of the distance from this surface to each realisation's surface",
            generatedAt: new Date().toISOString(),
          },
        },
      ]);
      setNotices((p) => [...p, `Spread for "${bSpec.label}": ${distances.length} realisations${cancelled ? " (cancelled early)" : budgetStopped ? ` (time budget reached before ${n})` : ""}${failed ? `, ${failed} failed in GemPy` : ""}, ${(elapsed / Math.max(1, distances.length)).toFixed(1)} s each. With the contacts moved by ±${ens.sigmaPos} m${perPick ? ` (${perPick} pick(s) using their own uncertainty_m)` : ""} and orientations by ±${ens.sigmaDeg}°, the surface moved a median ${fmt(stats.median)} m, 90th percentile ${fmt(stats.p90)} m, max ${fmt(stats.max)} m; ${amplifiedPct < 0.05 && amplified > 0 ? "<0.1" : amplifiedPct.toFixed(1)}% of it moved further than the contacts themselves were moved (${ampThreshold} m). Colour: pale = barely moves, dark = moves ${fmt(scaleMax)} m or more${stats.verticesNotReproduced ? `; grey = ${stats.verticesNotReproduced} vertices where at least one realisation produced no surface nearby` : ""}. This is the spread under the uncertainty you entered — not a probability, and only as meaningful as those sigmas.`]);
    }
  }, [fitBox, setTaskProgress, anisotropy, clipToDomainBoundary, clipToTopo, domains, modelDomainId, modelResolution, rangeMultiplier, searchEllipsoid]);

  // Thin single-surface wrapper for the three single-unit tools below.
  const runSurfaceModel = useCallback((spec, opts) => runSurfaceStack([spec], opts), [runSurfaceStack]);

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
  const computeIntercepts = useCallback(() => {
    const traces = tracesRef.current;
    const o = originRef.current;
    const out = [];
    // TASKS.csv #52 (c) — the VEIN layer is listed here too now. #84's exclusions already applied to
    // vein intercepts inside runVeinModel, but the table that exists to review them only ever showed
    // litho and alteration, so a vein pick could be silently excluded by a filter with no UI to see it,
    // and (c)'s named sets could not have contained one at all. Listing it closes both gaps at once.
    [["litho", "Lithology"], ["alt", "Alteration"], ["vein", "Vein / dyke"]].forEach(([layerKey, layerLabel]) => {
      const ends = intervalEndIndex(layers[layerKey]); // #354 — skip row splits inside one unit
      (layers[layerKey] || []).forEach((r) => {
        if (isNaN(r.from)) return;
        if (continuesUnitAbove(ends, r, new Set([r.value]))) return;
        const t = traces.find((tr) => tr.hole_id === r.hole_id);
        if (!t) return;
        const p = findOnTrace(t.pts, r.from);
        if (!p) return;
        const api = sceneToApi(p);
        // TASKS.csv #232 — api coords are origin-relative (see sceneToApi's own comment); add the
        // scene origin back in so the table/CSV export shows real-world E/N/Z, matching what the
        // mesh-export path (meshExport.js's sceneVertsToWorld) already does for the same conversion.
        out.push({ id: interceptId(layerKey, r), layerKey, layerLabel, hole_id: r.hole_id, unit: r.value, from: r.from, x: api.x + o.x, y: api.y + o.y, z: api.z + o.z });
      });
    });
    return out;
  }, [layers.litho, layers.alt, layers.vein]);

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
  const mcRef = useRef(modellingCodes); // TASKS.csv #599 — read by the model check after the run (closure can be stale)
  mcRef.current = modellingCodes;
  const mcodeDefaultRole = (name) => { const r = roleForLithology(name); return r === "overburden" ? "overburden" : (r === "fault" || r === "dyke" || r === "breccia") ? "cross-cutting" : "stratigraphic"; };
  const mcodeGroupOf = (v) => (lithoGroups || []).find((g) => (g.codes || []).includes(v))?.name || null;
  const gatherLithoSurfaceSpec = (target, traces, { silent = false, mapConstraint: mapC = null, pileOrder = null } = {}) => {
    const isMcode = typeof target === "object" && target !== null && target.kind === "mcode";
    const isGroup = typeof target === "object" && target !== null && !isMcode;
    const unitName = isGroup || isMcode ? target.name : target;
    const codes = new Set(isGroup ? (target.codes || []) : [unitName]); // for an mcode: the code itself (drawn section contacts are tagged with it)
    const domain = domains.find((d) => d.id === modelDomainId);
    const points = [];
    let mcodeInfo = null, mcodeLogged = null;
    // TASKS.csv #354 — only real tops: a row whose interval above (same hole) is also one of `codes`
    // continues the unit. For a lithology GROUP that also drops the internal AND/BAS boundaries between
    // member codes, which are not contacts of the grouped unit either.
    const litEnds = intervalEndIndex(layers.litho);
    let splitsSkipped = 0;
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
        const pickSigma = r.uncertainty_m == null || r.uncertainty_m === "" ? NaN : Number(r.uncertainty_m);
        if (Number.isFinite(pickSigma) && pickSigma >= 0) api.sigma = pickSigma;
        points.push(api);
      });
      const why = [skipped.belowRole ? `${skipped.belowRole} below casing / overburden or an intrusion / cross-cutting unit` : null, skipped.holeStart ? `${skipped.holeStart} at a hole start` : null,
        skipped.gap ? `${skipped.gap} below an unlogged gap` : null, skipped.olderAbove ? `${skipped.olderAbove} below an OLDER unit (overturned, repeated or up-hole)` : null].filter(Boolean);
      if (!silent || why.length) setNotices((p) => [...p, `${unitName}: ${tops.length} contact(s) where it starts below a younger stratigraphic unit.${why.length ? ` Not used as contacts: ${why.join("; ")}.` : ""}`]);
    }
    if (!isMcode) traces.forEach((t) => {
      (layers.litho || []).filter((r) => r.hole_id === t.hole_id && codes.has(r.value) && !isNaN(r.from)).forEach((r) => {
        if (continuesUnitAbove(litEnds, r, codes)) { splitsSkipped++; return; }
        // TASKS.csv #84 — a boundary intercept the user has explicitly reviewed and excluded (via the
        // Boundary intercepts table) never feeds a modelling run, same as if the row didn't exist.
        if (excludedIntercepts.includes(interceptId("litho", r))) return;
        // TASKS.csv #52 (c) — and, when a named intercept set is active, only the picks IN it. This is
        // what lets one repeated unit be modelled as the several surfaces it really is (#61): the upper
        // basalt and the lower basalt are the same logged code, so without this every pick of that code
        // across the property is forced onto one surface no matter how many times the unit repeats.
        if (!interceptInActiveSet(interceptId("litho", r))) return;
        const p = findOnTrace(t.pts, r.from);
        if (p && (!domain || pointInDomain(p, domain, implicitMeshesRef.current))) {
          const api = sceneToApi(p);
          if (softIntercepts.includes(interceptId("litho", r))) api.nugget = SOFT_NUGGET;
          // TASKS.csv #275 — which logged code this point came from, so the group coherence check below
          // can say WHICH codes make up each spatial cluster. Rides along on the point object the same
          // way #88's nugget does; the sidecar's pydantic models ignore fields they don't declare.
          api.srcCode = r.value;
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
    if (splitsSkipped && !silent) setNotices((p) => [...p, `${unitName}: ${splitsSkipped} interval start(s) inside the unit (the row above in the same hole is the same ${isGroup ? "group" : "unit"}) were not used as contacts.`]);
    let sectionContactCount = 0;
    if (includeSectionContacts) {
      const o = originRef.current;
      (sections || []).forEach((s) => {
        (s.contacts || []).forEach((c) => {
          if (!codes.has(c.unit) || !c.isUpperContact) return; // #176 — any member code's contact feeds the group
          (c.points || []).forEach((cp) => {
            const api = { x: cp.x - o.x, y: cp.y - o.y, z: cp.z - o.z, srcCode: c.unit }; // srcCode: TASKS.csv #275
            const scenePt = { x: api.x, y: api.z, z: -api.y }; // inverse of sceneToApi, for the domain check
            if (domain && !pointInDomain(scenePt, domain, implicitMeshesRef.current)) return;
            points.push(api);
            sectionContactCount++;
          });
        });
      });
      if (sectionContactCount && !silent) {
        setNotices((p) => [...p, `Included ${sectionContactCount} drawn cross-section contact point(s) for "${unitName}" as extra interface points.`]);
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
      if (!silent) setNotices((p) => [...p, `Included ${used} point(s) along the mapped ${mapC.units.join(" | ")} contact as extra interface points for "${unitName}".`]);
    }

    if (!points.length) {
      if (!silent) setNotices((p) => [...p, domain ? `No lithology intervals for "${unitName}" fall inside domain "${domain.name}" — nothing to model.` : `No lithology intervals found for "${unitName}" — nothing to model.`]);
      return null;
    }
    // TASKS.csv #85 — drop control points too isolated (along the declared structural trend) to trust.
    const supportedPoints = filterBySearchSupport(points, searchEllipsoid);
    if (searchEllipsoid.enabled && supportedPoints.length < points.length && !silent) {
      setNotices((p) => [...p, `Search ellipsoid: excluded ${points.length - supportedPoints.length} of ${points.length} "${unitName}" point(s) with fewer than ${searchEllipsoid.minSamples} neighbor(s) along the declared trend.`]);
    }
    if (!supportedPoints.length) {
      if (!silent) setNotices((p) => [...p, `All "${unitName}" points were excluded by the search ellipsoid — widen its ranges or lower the minimum neighbor count.`]);
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
          setNotices((p) => [...p, `Group "${unitName}" may merge unrelated bodies: ${segregated.length === 1 ? "these codes never" : "some of its codes never"} appear near each other anywhere in the data — ${pairs}${segregated.length > 3 ? ", and others" : ""}. One surface will still be fitted across the gap. Check the group's code list; if they really are one unit in two places, ignore this.`]);
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
    if (!silent && structRows.length) setNotices((p) => [...p, `Orientations for "${unitName}" from structure type(s) ${[...useTypes].join(", ")} (${structRows.length} pick(s) before spatial filtering). Change which types count as contacts under Contact orientations.`]);
    structRows = filterRowsByDomain(structRows, traces, (s) => s.depth);
    const preSearchCount = structRows.length;
    structRows = filterRowsBySearchEllipsoid(structRows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && structRows.length < preSearchCount && !silent) {
      setNotices((p) => [...p, `Search ellipsoid: excluded ${preSearchCount - structRows.length} of ${preSearchCount} structure orientation(s) with fewer than ${searchEllipsoid.minSamples} neighbor(s) along the declared trend.`]);
    }
    let orientations = structureRowsToOrientations(structRows, traces);
    // TASKS.csv #318 — outcrop measurements of the chosen types within the search radius of the mapped
    // contact, as orientations at their own (terrain) position. Only when a map contact is in play: a
    // bedding reading 3 km from anything being modelled has no business steering this surface.
    if (mapC && mapPts.length) {
      const o = originRef.current;
      const near = surfaceOrientationsNear(mapPts, mapC);
      near.forEach((m) => orientations.push({ x: m.x - o.x, y: m.y - o.y, z: m.z - o.z, dip: m.dip, azimuth: m.dipDir }));
      if (!silent) setNotices((p) => [...p, near.length ? `Added ${near.length} outcrop measurement(s) (${mapC.classes.join(", ")}) within ${mapC.radius} m of the mapped contact as orientations.` : `No outcrop measurements of the chosen types lie within ${mapC.radius} m of the mapped contact — none added as orientations.`]);
    }
    if (!orientations.length) {
      // No structure/contact data to draw an orientation from — estimate one from the shape of the
      // litho points themselves instead of blocking the run. Less accurate than a real structure
      // pick, but lets the tool interpolate a surface from contacts alone, which is the point.
      const est = estimateOrientationFromPoints(points);
      orientations = [est];
      if (!silent) setNotices((p) => [...p, `No structure picks found — estimated a single dip/azimuth (~${est.dip.toFixed(0)}°/~${est.azimuth.toFixed(0)}°) from the shape of the "${unitName}" contact points. Import a structure CSV for a more accurate result.`]);
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
    return { label: `Top of ${unitName}`, meshName: unitName, points, orientations, color, type, codes: isMcode ? [...mcodeLogged] : [...codes], ...(isMcode ? { mcode: true } : {}) }; // codes: #356 model check (logged codes); mcode: #599
  };

  const runImplicitModel = useCallback(async (unitName, runOpts = {}) => { // runOpts.ensemble — TASKS.csv #52 (a)
    if (!unitName) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the implicit model."]); return; }
    // TASKS.csv #176 — a `group:<id>` pick resolves to its group object here; the raw-code path is untouched.
    const target = resolveLithoTarget(unitName);
    if (!target) { setNotices((p) => [...p, "That lithology group no longer exists — pick another unit."]); return; }
    const spec = gatherLithoSurfaceSpec(target, traces, { mapConstraint });
    if (!spec) return;
    if (mapConstraint) spec.params = { ...(spec.params || {}), surfaceMapContact: { units: mapConstraint.units, classes: mapConstraint.classes, radiusM: mapConstraint.radius } };
    await runSurfaceModel(spec, runOpts.ensemble ? { ensemble: runOpts.ensemble } : undefined);
  }, [layers.litho, layers.structure, runSurfaceModel, domains, modelDomainId, excludedIntercepts, interceptInActiveSet /* #52 (c) */, searchEllipsoid, softIntercepts, sections, includeSectionContacts, lithoGroups, modellingCodes /* #599 */, mapConstraint, mapLayers, surfaceStructures, terrain]);

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
  // half-support fault-cuts-through-stack modeling as a first pass — noted as a real follow-up (#52).
  const runStackModel = useCallback(async (unitNames) => {
    if (!unitNames || unitNames.length < 2) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the stratigraphic stack."]); return; }

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
    if (skipped.length) setNotices((p) => [...p, `Skipping from the stack (no lithology intervals found): ${skipped.join(", ")}.`]);
    if (specs.length < 2) { setNotices((p) => [...p, "Need at least 2 units with data to model a stack — add more units or check your lithology import."]); return; }
    // TASKS.csv #360 — faults that offset the stack, solved in the same GemPy run (FAULT groups)
    const faultSpecs = [];
    stackFaults.forEach((key) => {
      const f = gatherFaultSpec(key, traces);
      if (f.spec) faultSpecs.push(f.spec); else setNotices((p) => [...p, `Fault "${key.replace("|", " — ")}" left out: ${f.why}`]);
    });
    if (faultSpecs.length) setNotices((p) => [...p, `The stack is offset by ${faultSpecs.length} fault(s) solved in the same model: ${faultSpecs.map((f) => f.meshName).join(", ")}.`]);

    await runSurfaceStack([...faultSpecs, ...specs], { relation: stackRelation }); // TASKS.csv #271
  }, [stackFaults /* #360 */, layers.litho, layers.structure, runSurfaceStack, domains, modelDomainId, excludedIntercepts, interceptInActiveSet /* #52 (c) */, searchEllipsoid, softIntercepts, sections, includeSectionContacts, lithoGroups, modellingCodes /* #599 */, stackRelation]);

  // TASKS.csv #360 — structure picks usable as faults in the stack: one entry per structure type + name
  // (#362 structure_id), each needing a position along a hole and a dip / dip direction.
  const faultCandidates = useMemo(() => {
    const m = new Map();
    (layers.structure || []).forEach((s) => {
      if (!Number.isFinite(s.dip) || !Number.isFinite(s.azimuth)) return;
      const key = `${s.value}|${s.structure_id || ""}`;
      const e = m.get(key) || { key, type: s.value, id: s.structure_id || "", n: 0, faultLike: /flt|fault|shear|shz/i.test(`${s.value} ${s.structure_id || ""}`) };
      e.n++; m.set(key, e);
    });
    return [...m.values()].sort((a, b) => (b.faultLike - a.faultLike) || a.key.localeCompare(b.key));
  }, [layers.structure]);
  const gatherFaultSpec = (key, traces) => {
    const [type, id] = key.split("|");
    const rows = (layers.structure || []).filter((s) => String(s.value) === type && (s.structure_id || "") === id && Number.isFinite(s.dip) && Number.isFinite(s.azimuth));
    const points = [];
    rows.forEach((s) => {
      const t = traces.find((tr) => tr.hole_id === s.hole_id);
      const p = t ? findOnTrace(t.pts, s.depth) : null;
      if (p) points.push(sceneToApi(p));
    });
    const orientations = structureRowsToOrientations(rows, traces);
    if (!points.length || !orientations.length) return { why: "its picks could not be placed on the hole traces." };
    const name = id ? `${type} — ${id}` : type;
    return { spec: { label: `Fault: ${name}`, meshName: `Fault ${name}`, points, orientations, color: colorForStructure(type), type: "fault", fault: true } };
  };
  const addStackUnit = useCallback((u) => {
    if (!u || stackUnits.includes(u)) return;
    // Matches the sidecar's own surfaces[] cap (python-sidecar/app/main.py, max_length=12) — capping
    // here too gives a clear notice instead of a raw validation error back from the sidecar.
    if (stackUnits.length >= 12) { setNotices((p) => [...p, "Stacks are capped at 12 units (matches the sidecar's own limit) — remove one before adding another."]); return; }
    setStackUnits((p) => [...p, u]);
  }, [stackUnits]);
  const removeStackUnit = useCallback((u) => setStackUnits((p) => p.filter((x) => x !== u)), []);
  const moveStackUnit = useCallback((u, dir) => {
    setStackUnits((p) => {
      const i = p.indexOf(u);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.length) return p;
      const next = [...p];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  // Structural modeling tool: models a surface from one structure-plane type (e.g. a fault or shear
  // pick's "value"), self-referentially — each pick's own position feeds the interface point AND its
  // own dip/azimuth feeds the orientation at that point. Unlike the litho/alteration tools, this
  // doesn't need a separate structure-layer lookup, since the structure picks ARE the thing being
  // modelled here.
  const runStructuralModel = useCallback(async (structType) => {
    if (!structType) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the structural model."]); return; }

    let rows = (layers.structure || []).filter((s) => String(s.value).toUpperCase() === String(structType).toUpperCase() && s.dip != null && s.azimuth != null && !isNaN(s.dip) && !isNaN(s.azimuth));
    if (!rows.length) { setNotices((p) => [...p, `No "${structType}" structure picks with dip/azimuth found — nothing to model.`]); return; }
    const domain = domains.find((d) => d.id === modelDomainId);
    rows = filterRowsByDomain(rows, traces, (s) => s.depth);
    if (!rows.length) { setNotices((p) => [...p, `No "${structType}" picks fall inside domain "${domain?.name}" — nothing to model.`]); return; }
    const preEllipsoid = rows.length;
    rows = filterRowsBySearchEllipsoid(rows, traces, (s) => s.depth);
    if (searchEllipsoid.enabled && rows.length < preEllipsoid) {
      setNotices((p) => [...p, `Search ellipsoid: excluded ${preEllipsoid - rows.length} of ${preEllipsoid} "${structType}" pick(s) with fewer than ${searchEllipsoid.minSamples} neighbor(s) along the declared trend.`]);
    }
    if (!rows.length) { setNotices((p) => [...p, `All "${structType}" picks were excluded by the search ellipsoid — widen its ranges or lower the minimum neighbor count.`]); return; }

    // TASKS.csv #362 — one surface per named structure. Picks carrying a structure_id are modelled per ID;
    // picks without one form their own group. Without any IDs, all picks of the type are still one surface
    // (the only thing possible), but the notice now says so instead of implying it is one fault.
    const byId = new Map();
    rows.forEach((s) => { const k = s.structure_id || ""; if (!byId.has(k)) byId.set(k, []); byId.get(k).push(s); });
    const named = [...byId.keys()].filter(Boolean);
    if (!named.length) {
      const holes = new Set(rows.map((s) => s.hole_id)).size;
      if (holes > 1) setNotices((p) => [...p, `All ${rows.length} "${structType}" picks (${holes} holes) are modelled as ONE surface. If they belong to different ${/flt|fault|shear/i.test(structType) ? "faults" : "structures"}, map a structure name/ID column when importing the structure file and each will be modelled on its own.`]);
    } else {
      setNotices((p) => [...p, `Modelling ${named.length} named "${structType}" structure(s) separately: ${named.join(", ")}${byId.has("") ? `, plus ${byId.get("").length} pick(s) with no name as one more surface` : ""}.`]);
    }
    // TASKS.csv #83 — a "structure" layer covers contacts, faults, shear zones, foliation, veins all
    // under one layer type (see sample_data's structure.csv), so this tool's own picked structType
    // string is the best available signal for a starting-guess surface type — refined further by
    // guessSurfaceType's regex, overridable by the user afterward regardless.
    for (const [id, group] of byId) {
      const name = id ? `${structType} — ${id}` : named.length ? `${structType} — unnamed` : structType;
      const points = [];
      group.forEach((s) => {
        const t = traces.find((tr) => tr.hole_id === s.hole_id);
        if (!t) return;
        const p = findOnTrace(t.pts, s.depth);
        if (p) points.push(sceneToApi(p));
      });
      const orientations = structureRowsToOrientations(group, traces);
      if (!points.length || !orientations.length) { setNotices((p) => [...p, `Couldn't locate "${name}" picks along the hole traces.`]); continue; }
      await runSurfaceModel({ label: `Structure: ${name}`, meshName: name, points, orientations, color: colorForStructure(structType), type: guessSurfaceType(`Structure: ${structType}`, structType) });
    }
  }, [layers.structure, runSurfaceModel, domains, modelDomainId, searchEllipsoid]);

  // Alteration modeling tool. TASKS.csv #272 — REWRITTEN (Leapfrog-specialist review).
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
  const runAlterationModel = useCallback((altValue) => {
    if (!altValue) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the alteration model."]); return; }

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
        const { samplePointsFromIntervals, estimateDenseGrid } = await import("../../lib/estimation.js"); // #552 — on demand
        const altRows = (layers.alt || []).filter((r) => r.hole_id != null && r.from != null && r.to != null && !isNaN(r.from) && !isNaN(r.to) && Number(r.to) > Number(r.from));
        // TASKS.csv #52 (c) — an active intercept set restricts the TARGET picks only. The zeros (every
        // other logged alteration interval) are what close the envelope (#272), so filtering those by a
        // set the user built to describe the target would open the halo up instead of narrowing it.
        const targetRows = altRows.filter((r) => r.value === altValue && !excludedIntercepts.includes(interceptId("alt", r)) && interceptInActiveSet(interceptId("alt", r)));
        if (!targetRows.length) throw new Error(`No alteration intervals found for "${altValue}" — nothing to model.`);

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
        if (!worldPts.length) throw new Error("No alteration sample points could be placed in 3D — check that the logged holes have collars.");

        // World -> api (east, north, up, origin-relative) — the space every spatial control in this
        // module (domain test, anisotropy warp) already speaks.
        let pts = worldPts.map((p) => ({ ...p, x: p.x - o.x, y: p.y - o.y, z: p.z - o.z }));
        if (domain) {
          const before = pts.length;
          pts = pts.filter((p) => pointInDomain(apiToScene([p.x, p.y, p.z]), domain, implicitMeshesRef.current));
          if (pts.length < before) setNotices((q) => [...q, `Domain "${domain.name}": excluded ${before - pts.length} of ${before} alteration sample point(s) outside the domain.`]);
        }
        const insideCount = pts.filter((p) => p.value >= 0.5).length;
        if (!insideCount) throw new Error(domain
          ? `No "${altValue}" intervals fall inside domain "${domain.name}" — nothing to model.`
          : `No "${altValue}" sample points could be placed — nothing to model.`);

        // TASKS.csv #86 — same normalized-space trick runSurfaceStack uses: warp every point into the
        // space where the declared anisotropy ellipsoid is a sphere, grid/isosurface there with an
        // isotropic search, then un-warp the resulting mesh vertices. An isotropic interpolator in
        // warped space IS an anisotropic one in real space.
        const basis = anisotropy.enabled ? searchEllipsoidBasis(anisotropy.azimuth, anisotropy.dip) : null;
        const scl = anisotropy.enabled ? anisoScales(anisotropy) : null;
        const center = anisotropy.enabled
          ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, z: pts.reduce((s, p) => s + p.z, 0) / pts.length }
          : null;
        const gridPts = anisotropy.enabled ? pts.map((p) => anisoWarpPoint(p, center, basis, scl)) : pts;

        // Grid extent: the ALTERED points' own box (the zeros only need to be inside the search radius
        // of it, not inside it), padded by the search radius so the envelope has room to close outside
        // the outermost altered sample instead of being cut flat at it.
        const inside = gridPts.filter((p) => p.value >= 0.5);
        const xr = minMax(inside.map((p) => p.x)), yr = minMax(inside.map((p) => p.y)), zr = minMax(inside.map((p) => p.z));
        const pad = radius;
        const bounds = { xmin: xr.min - pad, xmax: xr.max + pad, ymin: yr.min - pad, ymax: yr.max + pad, zmin: zr.min - pad, zmax: zr.max + pad };
        // Keep the grid under estimation.js's MAX_BLOCKS by coarsening rather than throwing: the auto
        // cell size is derived from hole spacing, which says nothing about how BIG the padded box is.
        let cell = cs;
        const cellsAt = (c) => Math.max(1, Math.round((bounds.xmax - bounds.xmin) / c)) * Math.max(1, Math.round((bounds.ymax - bounds.ymin) / c)) * Math.max(1, Math.round((bounds.zmax - bounds.zmin) / c));
        let coarsened = false;
        while (cellsAt(cell) > MAX_BLOCKS * 0.75) { cell *= 1.5; coarsened = true; }

        const grid = estimateDenseGrid(gridPts, {
          bounds, cellSize: { dx: cell, dy: cell, dz: cell }, method: "idw2",
          searchRadius: radius, minSamples: 1, maxSamples: 16, minHoles: 1,
        });
        if (!grid.estimated) throw new Error("No grid cell had an alteration sample within the search radius — increase the search radius.");
        // noData: "outside" — a no-data cell reads as "not altered", which is what lets the envelope
        // close against the edge of the informed region instead of leaving an open shell.
        const mc = marchingCubes(grid.values, grid.nx, grid.ny, grid.nz, 0.5, {
          origin: grid.origin, spacing: grid.cellSize, noData: "outside",
        });
        if (!mc.faces.length) throw new Error(`The interpolated "${altValue}" indicator never crosses 0.5 — no envelope to extract (try a larger search radius or a smaller cell size).`);

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
          cellSizeM: cell, cellSizeAuto: !(alterationCellSize > 0), cellSizeCoarsened: coarsened,
          paddingM: pad, closure, holeSpacingM: auto.spacing,
          anisotropy: anisotropy.enabled ? { azimuth: anisotropy.azimuth, dip: anisotropy.dip, major: anisotropy.major, semiMajor: anisotropy.semiMajor, minor: anisotropy.minor } : null,
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
        setNotices((p) => [...p, `Added "${label}": ${insideCount} altered of ${pts.length} indicator sample point(s)${dropped ? `, ${dropped} unplaceable` : ""} → ${grid.nx}×${grid.ny}×${grid.nz} grid (${cell.toFixed(1)} m cells${coarsened ? ", coarsened to stay under the grid limit" : ""}, ${Math.round(radius)} m search${anisotropy.enabled ? ", anisotropy applied" : ""}) → ${mc.vertices.length.toLocaleString()} vertices / ${mc.faces.length.toLocaleString()} faces${vol.watertight ? `, closed (${vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³)` : ", open"}. Closed indicator envelope, not a draped contact — see TASKS.csv #272.`]);
        if (closure === "artificial") setNotices((p) => [...p, `"${label}" closes partly against the search-radius boundary rather than a logged alteration boundary, so its extent there reflects the ${Math.round(radius)} m search radius, not the data.`]);
        fitBox(new THREE.Box3().setFromObject(mesh));
      } catch (e) {
        setNotices((p) => [...p, errorNotice(`Alteration halo failed: ${e.message || e}`)]);
      }
      setTaskProgress?.(null);
      setAlterationBusy(false);
    }, 40);
  }, [layers.alt, collars, survey, domains, modelDomainId, excludedIntercepts, interceptInActiveSet /* #52 (c) */, anisotropy, alterationCellSize, alterationSearchRadius, fitBox, setTaskProgress]);

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
  const runVeinModel = useCallback((veinValue) => {
    if (!veinValue) return;
    const traces = tracesRef.current;
    if (!traces.length) { setNotices((p) => [...p, "Load collars/survey data before running the vein model."]); return; }
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
        if (!rows.length) throw new Error(`No "${veinValue}" intervals found — nothing to model.`);
        // TASKS.csv #354 — back-to-back rows of this vein in one hole are one intercept (HW of the first,
        // FW of the last), not several thin ones that the midplane/thickness fit would read as separate veins.
        const mergedRows = mergeTouchingIntervals(rows);
        if (mergedRows.length < rows.length) setNotices((q) => [...q, `Vein "${veinValue}": ${rows.length - mergedRows.length} back-to-back row split(s) merged into single intercepts.`]);

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
        if (!intercepts.length) throw new Error("No vein intercepts could be located in 3D — check that the logged holes have collars and survey.");

        let used = intercepts;
        if (domain) {
          const inDomain = (p) => pointInDomain(apiToScene([p.x - o.x, p.y - o.y, p.z - o.z]), domain, implicitMeshesRef.current);
          used = intercepts.filter((i) => inDomain(i.hw) || inDomain(i.fw));
          if (used.length < intercepts.length) setNotices((q) => [...q, `Domain "${domain.name}": excluded ${intercepts.length - used.length} of ${intercepts.length} vein intercept(s) outside the domain.`]);
          if (!used.length) throw new Error(`No "${veinValue}" intercepts fall inside domain "${domain.name}" — nothing to model.`);
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
        setNotices((p) => [...p, `Added "${label}": ${model.intercepts.length} paired intercept(s)${unplaceable ? `, ${unplaceable} unplaceable` : ""} → midplane ${fmt(pl.dip, 1)}° / ${fmt(pl.dipDir, 1)}° (${pl.attitudeSource}), TRUE thickness ${fmt(th.trueMin)}–${fmt(th.trueMax)} m (mean ${fmt(th.trueMean)} m; mean DOWNHOLE length ${fmt(th.downholeMean)} m)${th.refined ? ", thickness corrected against the local modelled normal" : ""} → ${model.grid.nu}×${model.grid.nv} grid, ${model.grid.informedNodes.toLocaleString()} informed nodes, ${fmt(model.grid.cellSize, 1)} m cells, ${fmt(model.grid.searchRadius, 0)} m search${model.grid.coarsened ? " (coarsened to stay under the grid limit)" : ""}${solidVol?.watertight ? `. Solid ${solidVol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³` : ""}.`]);
        setNotices((p) => [...p, `"${label}": hangingwall and footwall are offset ±half the interpolated thickness from one shared midplane, so they cannot cross — minimum modelled thickness ${fmt(ck.minSeparation, 3)} m${ck.pinchOut ? " (the vein pinches out to zero somewhere in the model)" : ""}. Modelled contacts sit ${fmt(ck.contactResidualRms, 2)} m RMS (max ${fmt(ck.contactResidualMax, 2)} m) from the logged ones — measured AT the intercepts, where an inverse-distance field nearly reproduces its own data, so a small number here says the pair honours the logging, not that the shape between holes is right.${pl.rmsOffPlane != null ? ` The intercept midpoints scatter ${fmt(pl.rmsOffPlane, 1)} m RMS off a single plane, so the ${fmt(pl.dip, 0)}°/${fmt(pl.dipDir, 0)}° figure is a reference attitude, not a measurement of one continuous surface.` : ""}`]);
        setNotices((p) => [...p, `A vein fitted from ${model.intercepts.length} intercept(s) is an interpretation, not a measurement: away from the holes its shape, its thickness and its extent are the interpolation's, not the data's. Thickness between holes is interpolated, so a pinch-out or a swell that no hole cut will not appear.`]);
        if (pl.attitudeSource === "fitted to intercept midpoints" && pl.planarity != null && pl.planarity > 0.15) setNotices((p) => [...p, `"${label}": the intercept midpoints are not very planar (out-of-plane spread is ${Math.round(pl.planarity * 100)}% of their in-plane spread), so the fitted ${fmt(pl.dip, 0)}°/${fmt(pl.dipDir, 0)}° reference attitude is a weak average — consider entering the vein's dip and dip direction instead.`]);
        // A hole that logs one vein logs it ONCE. Many intercepts per hole means this code is a vein
        // SET (sheeted veinlets, a stockwork), and a single hangingwall/footwall pair is then the
        // envelope of the set at best — worth saying out loud, because the result still looks like a
        // confident single structure on screen.
        if (ck.midplaneLooRms != null) setNotices((p) => [...p, `"${label}": leave-one-out cross-validation — dropping each intercept and predicting it from the others misses by ${fmt(ck.midplaneLooRms, 1)} m RMS (worst ${fmt(ck.midplaneLooMax, 1)} m) against a ${fmt(model.grid.searchRadius, 0)} m search radius.${ck.incoherentSheet ? " That is no better than guessing at this hole spacing: these intercepts are NOT behaving like one continuous sheet, and a single hangingwall/footwall pair is the wrong picture for them." : ""}`]);
        const holeCount = new Set(used.map((i) => i.holeId)).size;
        if (holeCount && used.length / holeCount > 2.5) setNotices((p) => [...p, `"${label}": ${used.length} intercepts in ${holeCount} hole(s) — about ${(used.length / holeCount).toFixed(1)} per hole. A single vein is cut once per hole, so this code is behaving like a vein SET or stockwork; the pair below is the average envelope of all of them, not one vein. To model one vein, log or filter it as its own code.`]);
        if (ck.nominalLabels) setNotices((p) => [...p, `"${label}" is near-vertical (${fmt(pl.dip, 0)}° dip), so "hangingwall" and "footwall" are nominal labels here — the two surfaces are simply the two walls of the structure.`]);
        const meshes = Object.values(implicitMeshesRef.current);
        if (meshes.length) fitBox(new THREE.Box3().setFromObject(meshes[meshes.length - 1]));
      } catch (e) {
        setNotices((p) => [...p, errorNotice(`Vein model failed: ${e.message || e}`)]);
      }
      setTaskProgress?.(null);
      setVeinBusy(false);
    }, 40);
  }, [layers.vein, domains, modelDomainId, excludedIntercepts, interceptInActiveSet /* #52 (c) */, veinDip, veinDipDir, veinCellSize, veinSearchRadius, fitBox, setTaskProgress]);

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
  const runNumericModel = useCallback(() => {
    const symbol = numericSymbol || assayElements[0]?.symbol;
    if (!symbol) { setNotices((p) => [...p, "No assay elements loaded — import assays before running the numeric model."]); return; }
    if (!collars.length) { setNotices((p) => [...p, "Load collars/survey data before running the numeric model."]); return; }
    if (!Number.isFinite(numericCutoff)) { setNotices((p) => [...p, "Enter a numeric cutoff grade."]); return; }
    const elementUnits = Object.fromEntries(assayElements.map((e) => [e.symbol, e.unit]));
    const unit = elementUnits[symbol] || "ppm";
    const label = `${symbol} > ${numericCutoff} ${unit} shell`;
    setNumericBusy(true);
    setTaskProgress?.({ label, pct: 20 });
    setTimeout(async () => {
      try {
        const { marchingCubes } = await import("../../lib/marchingCubes.js"); // #476 — loaded on first use
        const { samplePointsFromIntervals, estimateDenseGrid, summarizeSupport } = await import("../../lib/estimation.js"); // #552 — on demand
        // TASKS.csv #266 — QC inserts (standards/blanks/duplicates) are excluded by default here, the
        // same as Best Intercepts / Compositing / Grade Statistics already do. They used to reach the
        // grade shell unfiltered; most got dropped downstream only because their synthetic hole_id has
        // no collar, which is luck rather than design — a field duplicate logged under its PARENT
        // hole's id was genuinely double-counted.
        const srcAssays = numericIncludeQAQC ? assays : excludeQAQC(assays);
        let intervals;
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
          intervals = srcAssays
            .filter((a) => a.hole_id != null && a.from != null && a.to != null)
            .map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, avgGrade: a.values?.[symbol] != null ? a.values[symbol] : null }))
            .filter((iv) => iv.avgGrade != null)
            .map((iv) => (cap != null && iv.avgGrade > cap ? { ...iv, avgGrade: cap } : iv));
        }
        const { points: rawPoints, dropped, clamped } = samplePointsFromIntervals(intervals, collars, survey, desurveyHole, desurveyMethod); // #135
        if (!rawPoints.length) throw new Error("No sample points could be placed in 3D — check that holes have collars and (ideally) survey data.");
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
          if (!points.length) throw new Error(`No assay sample points fall inside domain "${gradeDomain.name}" — nothing to model.`);
          if (points.length < rawPoints.length) setNotices((q) => [...q, `Domain "${gradeDomain.name}": excluded ${rawPoints.length - points.length} of ${rawPoints.length} assay sample point(s) outside the domain.`]);
        }
        const above = points.filter((p) => p.value >= numericCutoff).length;
        if (!above) throw new Error(`None of the ${points.length} sample points reach the ${numericCutoff} ${unit} cutoff — nothing to enclose. Lower the cutoff.`);

        // TASKS.csv #273/#86 — anisotropy: warp every sample into the space where the declared ellipsoid
        // is a sphere, grid and iso-surface there with the isotropic search this tool already does, then
        // un-warp the mesh vertices. World coordinates are (east, north, up), the same axis order
        // searchEllipsoidBasis/anisoWarpPoint are defined in, and the warp is centred on the samples'
        // own centroid, so it can be applied to world coordinates directly with no api round-trip.
        const gsBasis = anisotropy.enabled ? searchEllipsoidBasis(anisotropy.azimuth, anisotropy.dip) : null;
        const gsScl = anisotropy.enabled ? anisoScales(anisotropy) : null;
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
        const grid = estimateDenseGrid(gridPoints, {
          bounds, cellSize: { dx: cs, dy: cs, dz: cs }, method: numericMethod,
          searchRadius: effectiveRadius, minSamples: 1, maxSamples: 16,
          minHoles: Math.max(1, numericMinHoles), // TASKS.csv #258
          support: true, // TASKS.csv #91/#92 — classify every grid node so the shell can be coloured by it
        });
        if (!grid.estimated) throw new Error(numericMinHoles > 1
          ? `No grid cell had samples from at least ${numericMinHoles} distinct holes within the search radius — widen the search, or lower "Min holes".`
          : "No grid cell had a sample within the search radius — widen it.");
        const mc = marchingCubes(grid.values, grid.nx, grid.ny, grid.nz, numericCutoff, {
          origin: grid.origin, spacing: grid.cellSize, noData: numericCloseShell ? "outside" : "skip",
        });
        if (!mc.faces.length) throw new Error(`The interpolated ${symbol} grid never crosses ${numericCutoff} ${unit} — no shell to extract (try a lower cutoff, a larger search radius, or a smaller cell size).`);

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
          cellSizeM: cs, paddingM: pad, closure,
          composited: numericUseComposites, compositeLengthM: numericUseComposites ? numericCompositeLength : null,
          minCoverage: numericUseComposites ? numericMinCoverage : null, // TASKS.csv #262
          capValue: Number.isFinite(numericCapValue) && numericCapValue > 0 ? numericCapValue : null,
          minHoles: Math.max(1, numericMinHoles), includeQAQC: numericIncludeQAQC,
          // TASKS.csv #273 — the shared controls this tool now honours, recorded like every other param.
          anisotropy: anisotropy.enabled ? { azimuth: anisotropy.azimuth, dip: anisotropy.dip, major: anisotropy.major, semiMajor: anisotropy.semiMajor, minor: anisotropy.minor } : null,
          domain: gradeDomain ? gradeDomain.name : null,
          samplePoints: points.length, cellsEstimated: grid.estimated,
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
        setNotices((p) => [...p, `Added "${label}": ${points.length} sample point${points.length === 1 ? "" : "s"} (${intervals.length} ${numericUseComposites ? `${numericCompositeLength} m composite` : "raw interval"}${intervals.length === 1 ? "" : "s"}, ${dropped} dropped, ${above} at/above cutoff${clamped ? `, ${clamped} negative grade${clamped === 1 ? "" : "s"} clamped to zero` : ""}) → ${grid.nx}×${grid.ny}×${grid.nz} grid (${grid.estimated.toLocaleString()} cells estimated, ${grid.skipped.toLocaleString()} outside the search radius${grid.singleHoleCells ? `, ${grid.singleHoleCells.toLocaleString()} informed by only ONE hole` : ""}) → ${mc.vertices.length.toLocaleString()} vertices / ${mc.faces.length.toLocaleString()} faces${vol.watertight ? `, closed (${vol.volumeM3.toLocaleString(undefined, { maximumFractionDigits: 0 })} m³)` : `, open (${vol.openEdgeCount} open edges — shell reaches the edge of the estimated region)`}. Exploration target volume only — not a Mineral Resource.`]);
        // TASKS.csv #91/#92 — say what the model is actually supported by, for the whole grid and for
        // the shell surface itself, and point at the sidebar toggle that draws it.
        if (grid.supportCounts) setNotices((p) => [...p, `"${label}" data support — grid: ${summarizeSupport(grid.supportCounts)}. Shell surface vertices: ${summarizeSupport(surfCounts)}. Only "interpolated" means the composites that produced that part of the shell bracket it on all three axes from at least two holes; everything else is grade carried outward from the data. Expand the surface in the list and use "Colour by data support" to see where. This is a geometric data-support measure, NOT a statistical confidence or a kriging variance.`]);
        if (closure === "artificial") setNotices((p) => [...p, `"${label}" was closed ARTIFICIALLY at the search-radius boundary (${mc.closingVertices.toLocaleString()} of its vertices sit on that wall, not on a grade boundary). Its volume depends on your search radius, not only on the data — doubling the radius roughly multiplies the volume by eight. Treat it as a visualisation of where grades might extend, not a measured volume.`]);
        fitBox(new THREE.Box3().setFromObject(mesh));
      } catch (e) {
        setNotices((p) => [...p, errorNotice(`Numeric model failed: ${e.message || e}`)]);
      }
      setTaskProgress?.(null);
      setNumericBusy(false);
    }, 40);
  }, [numericSymbol, assayElements, assays, collars, survey, numericCutoff, numericCellSize, numericSearchRadius, numericMethod, numericUseComposites, numericCompositeLength, numericMinCoverage, numericCloseShell, numericPadding, numericCapValue, numericMinHoles, numericIncludeQAQC, fitBox, setTaskProgress, anisotropy, domains, modelDomainId]); // anisotropy/domains/modelDomainId: TASKS.csv #273

  return { addStackUnit, computeIntercepts, faultCandidates, moveStackUnit, removeStackUnit, runAlterationModel, runImplicitModel, runNumericModel, runStackModel, runStructuralModel, runVeinModel };
}
