// TASKS.csv #2176 step 1 — the drillhole scene build of the 3D view, moved out of ViewerModule.jsx unchanged (its #1084 size cap):
// every hole's trace, collar marker, interval tubes, point markers, structure discs and custom-layer rows, the camera anchor of a
// project with no holes, the layer batches and the passes that follow a rebuild. ViewerModule's effect calls buildDrillholeScene with
// the values and refs the body used to close over, on the same dependency list. The comments below are the effect's own.
import * as THREE from "three";
import { DRAW_ORDER } from "../../lib/viewer/drawOrder.js"; // TASKS.csv #2776
import { t as tr } from "../../lib/i18n.js";
import { LAYER_META, minMax } from "../../lib/layers.js";
import { arrMin, arrMax } from "../../lib/arrayStats.js";
import { desurveyHole, holeAttitudeAssumed } from "../../lib/desurvey.js";
import { errorNotice, notice } from "../../lib/notices.js"; // notice: #2937
import { resolveLayerStyle, TUBE_SEGMENTS } from "../../lib/layerStyle.js";
import { customColour } from "../../lib/customColour.js";
import { PickStandIn } from "../../lib/viewer/pickStandIn.js";
import { buildLayerBatches, collarMarkerMaterial, syncBatchedInstances } from "../../lib/viewer/layerBatches.js";
import { syncHoleLabels } from "../../lib/viewer/holeLabels.js";
import { addTraceChunks } from "../../lib/viewer/traceBatch.js"; // #2176 step 3
import { makeTextSprite } from "../../lib/viewer/textSprite.js";
import { lazyTip } from "../../lib/viewer/lazyTip.js";
import { traceLookup } from "../../lib/viewer/modelHelpers.js";
import { PROTO_CYLINDER, PROTO_SPHERE_8, PROTO_SPHERE_12, PROTO_CIRCLE_24, PROTO_PRISM_4, PROTO_SQUARE, PIN_AXIS, dipPinDir, INTERVAL_PROTO, UP_Y, DIR_TMP, POINT_PROTO } from "../../lib/viewer/protos.js";

const toRad = (d) => (d * Math.PI) / 180;

// TASKS.csv #378 — collar markers were a fixed cream (0xf2e9d8): 1.10:1 against this default background,
// i.e. invisible in plan view, where a vertical hole IS its collar. They now take the dark text colour
// on a light background and the old cream on a dark one (relative luminance threshold 0.35).
export function collarColorFor(bg) {
  const c = new THREE.Color(bg);
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const Y = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return Y > 0.35 ? 0x1a2028 : 0xf2e9d8;
}
// TASKS.csv #1569 — each block model's min / max corner in scene space (origin-relative, z-up flipped), for the fit box
export function voxelFitCorners(models, o) {
  const out = [];
  (models || []).forEach((model) => {
    if (!model.cells?.length) return;
    const xs = minMax(model.cells, (c) => c.x), ys = minMax(model.cells, (c) => c.y), zs = minMax(model.cells, (c) => c.z);
    out.push([{ x: xs.min - o.x, y: zs.min - o.z, z: -(ys.min - o.y) }, { x: xs.max - o.x, y: zs.max - o.z, z: -(ys.max - o.y) }]);
  });
  return out;
}
export const isIntervalRow = (r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.to - r.from > 0.5;

// ---------- TASKS.csv #2176 step 2: what a build may keep from the last one ----------
// What the last build made, per viewer (its layer-groups object, so a remounted scene starts with a full build):
// { ox, oy, oz, rebuildSeq, holes: Map(hole_id -> entry), sigs: Map(group key -> signature), holeSets: Map(group key -> Set of hole ids) }
const sceneCaches = new WeakMap();
const NO_HOLES = new Map();
// the drillhole layers this build fills from `layers` (custom layers are keyed by their id)
export const BUILT_ROW_KEYS = ["litho", "alt", "vein", "breccia", "structzone", "weath", "geotech", "recovery", "sg", "litho_gc", "alt_gc", "mnlgy", "magsusc", "structure"];
// two arrays holding the same objects in the same order (a signature, a hole's survey rows)
export const sameRefs = (a, b) => a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]));

// Which holes must be desurveyed again. An entry is { collar, hs (its survey rows), method, raw, assumedVertical, pts, look, trace }:
// kept whole when its collar object, survey rows and method are the same and the origin has not moved; kept without its
// origin-relative part (pts) when only the origin moved. full: no last build, a new origin, the Refresh button, or a hole id
// that occurs twice (holeEntries is then null and every hole is desurveyed as before).
// TASKS.csv #2937 (WA iron review) — a desurvey method switch rebuilt every layer of 6,390 holes (2.1-2.8 s, +390 MB over four switches)
// although on holes within 5 degrees of vertical the four methods put every station within millimetres. With `desurvey` given, a hole whose
// collar and survey rows are the same and only the method changed is desurveyed again here and compared: within QUIET_SHIFT_M at every
// station (10 cm) it takes the new trace (tools read the method chosen) but is not 'changed', so its drawing and the layer groups on it are kept;
// otherwise it is redrawn as before. -> also `shift`: { max (m), hole, moved, kept } for the notice, or null when no method changed.
export const QUIET_SHIFT_M = 0.1; // 10 cm: invisible beside the 1.6 m radius the intervals are drawn at (WA iron's largest shift: 8.6 cm)
export function maxStationShift(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let m = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y, a[i].z - b[i].z); if (!(d <= m)) m = d; }
  return m;
}
export function planHoles(prev, collars, surveyByHole, method, { ox, oy, oz, rebuildSeq }, desurvey = null) {
  const originSame = !!prev && prev.ox === ox && prev.oy === oy && prev.oz === oz;
  const holeEntries = new Map(), changedHoles = new Set();
  let shift = null;
  for (const c of collars) {
    if (holeEntries.has(c.hole_id)) return { full: true, holeEntries: null, changedHoles: new Set(collars.map((x) => x.hole_id)), shift: null };
    const hs = surveyByHole.get(c.hole_id) || [];
    const old = prev?.holes.get(c.hole_id);
    if (old && old.collar === c && old.method === method && sameRefs(old.hs, hs)) { holeEntries.set(c.hole_id, originSame ? old : { ...old, hs, pts: null, look: null, trace: null }); continue; }
    if (desurvey && originSame && old?.raw && old.collar === c && sameRefs(old.hs, hs)) { // #2937 — only the method changed
      const raw = desurvey(c, hs, method), d = maxStationShift(old.raw, raw);
      shift = shift || { max: 0, hole: null, moved: 0, kept: 0 };
      if (d > shift.max) { shift.max = d; shift.hole = c.hole_id; }
      if (d <= QUIET_SHIFT_M) { holeEntries.set(c.hole_id, { ...old, hs, method, raw, pts: null, look: null, trace: null }); shift.kept++; continue; }
      holeEntries.set(c.hole_id, { collar: c, hs, method, raw, assumedVertical: old.assumedVertical });
      shift.moved++; changedHoles.add(c.hole_id); continue;
    }
    holeEntries.set(c.hole_id, { collar: c, hs, method });
    changedHoles.add(c.hole_id);
  }
  if (prev) for (const id of prev.holes.keys()) if (!holeEntries.has(id)) changedHoles.add(id); // a removed hole
  return { full: !originSame || prev.rebuildSeq !== rebuildSeq, holeEntries, changedHoles, shift };
}

// Which layer groups are made again: all on a full build; else a group whose signature changed, that is new, or that has
// rows in a hole desurveyed again (its members stand on that hole's trace).
export function planGroups(prev, sigs, changedHoles, full) {
  const out = new Set();
  for (const [k, sig] of sigs) {
    if (full || !prev || !sameRefs(prev.sigs.get(k), sig)) { out.add(k); continue; }
    const holes = prev.holeSets.get(k);
    if (!holes) { out.add(k); continue; }
    for (const id of changedHoles) if (holes.has(id)) { out.add(k); break; }
  }
  return out;
}

// TASKS.csv #2373 (review #2325, WA uranium) — the style keys a custom layer's colours alone depend on (opacity is applied in place since
// #1528): a change of only these repaints the layer's instances (paintCustomLayer) instead of rebuilding its group. 'Colour by' on the
// 439,780-reading gamma log rebuilt every pick stand-in: 1.6-2.0 s and ~300-550 MB of garbage per click.
const PAINT_KEYS = new Set(["colourBy", "rampMin", "rampMax", "rampScale", "classes", "color", "opacity"]);
// two style JSONs (as the build's signature holds them) -> true when they differ in PAINT_KEYS only
export function onlyPaintChanged(a, b) {
  const x = JSON.parse(a || "null") || {}, y = JSON.parse(b || "null") || {};
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (!PAINT_KEYS.has(k) && JSON.stringify(x[k]) !== JSON.stringify(y[k])) return false;
  return true;
}
const _paint = new THREE.Color();
// each row's colour as the build gives it (an interval: one colour, its model colour, else customColour; a point: one colour, else
// customColour), written into the layer's batches: a compact batch's instanceColor directly, anything else through its members
export function paintCustomLayer(layer, layerStyles) {
  const g = layer?.group;
  if (!g) return 0;
  const stI = resolveLayerStyle(layerStyles[`custom:${layer.id}`], "interval"), stP = resolveLayerStyle(layerStyles[`custom:${layer.id}`], "point");
  const linear = new Map(); // colour -> [r, g, b] in the working colour space, parsed once
  const rgbOf = (c) => { let v = linear.get(c); if (!v) { _paint.set(c); v = [_paint.r, _paint.g, _paint.b]; linear.set(c, v); } return v; };
  const colourOf = (row) => (row.to != null && !isNaN(row.to) ? stI.color || row.modelColor || customColour(layer, layerStyles, row) : stP.color || customColour(layer, layerStyles, row));
  let n = 0;
  for (const c of g.children) {
    const cp = c.userData?.compact;
    if (!cp) continue;
    const a = c.instanceColor.array;
    for (let i = 0; i < cp.rows.length; i++) { const row = cp.rows[i]?.row; if (!row) continue; const v = rgbOf(colourOf(row)); a[i * 3] = v[0]; a[i * 3 + 1] = v[1]; a[i * 3 + 2] = v[2]; n++; }
    c.instanceColor.needsUpdate = true;
  }
  for (const c of g.children) {
    if (c.userData?.compact) continue;
    const members = c.userData?.batchMembers || (c.userData?.pickIgnore ? [] : [c]);
    for (const m of members) { const row = m.userData?.row; if (row && m.material?.color) { m.material.color.set(colourOf(row)); n++; } }
    if (c.userData?.batchMembers) syncBatchedInstances(c);
  }
  return n;
}

// TASKS.csv #2797 — the last build's origin when the collars' new mean is within `tol` metres of it (and both are finite), else the mean
// 50 m, not 1 m: five collars added near the middle of the WA lithium project (2,248 holes) moved the mean 1.3 m. The origin only has to
// stay near the data: float32 vertices 50 m off-centre lose nothing visible (about 4 micrometres at 50 m).
export const ORIGIN_KEEP_M = 50;
export function keptOrigin(prev, mean, tol = ORIGIN_KEEP_M) {
  if (prev && [prev.ox, prev.oy, prev.oz, mean.ox, mean.oy, mean.oz].every(Number.isFinite) && Math.hypot(mean.ox - prev.ox, mean.oy - prev.oy, mean.oz - prev.oz) < tol) return { ox: prev.ox, oy: prev.oy, oz: prev.oz };
  return mean;
}

export function buildDrillholeScene(ctx) {
  const { applyCategoryVisibility, applyLegendOverrideColors, autoFitInitial, baseColorForBuild, bgColorRef, boundaries, buildAssaySpheresRef, buildDefer, buildGeophysPtsRef, buildSurfaceSamplesRef, collarMaterialRef, collarSize /* #2823 */, collars, customLayers, desurveyMethod, effectiveLabel, fitBox, hasAutoFitRef, holeLabelAnchorsRef, holeLabelModeRef, isRowVisibleForBuild, lastHoleTraceCountRef, lastTracesRef, layerGroupsRef, layers, layerStyles, mapLayers, numericLayerColor, numericRange, numericSymbology, omfObjects, originRef, placedSurfaceSamples, pointBuildersStale, rasters, rebuildSeq, setDataLoaded, setNotices, setTracesSeq, surfaceStructures, survey, syncImplicitOrigin, terrain, tracesRef, voxelModels } = ctx;
  const groups = layerGroupsRef.current;
  if (!groups.litho || buildDefer.skip()) return; // #1500 — a restore just scheduled its state: build once, next render
  // TASKS.csv #131 — c.material?.map?.dispose?.() added alongside the existing geometry/material
  // disposal: every OTHER mesh type built into these groups uses a plain color-only material (no
  // .map), so this was a harmless no-op for all of them, but hole-label Sprites use a CanvasTexture
  // (SpriteMaterial.map) that this loop would otherwise leak — a growing, uncollectable GPU texture
  // per rebuild — since disposing the material alone does not dispose a texture it merely references.
  // TASKS.csv #312 — two additions: shared prototype geometries (PROTO_CYLINDER etc.) must NOT be
  // disposed here, since every future rebuild and every other layer still references them, and an
  // InstancedMesh batch needs its own .dispose() to release its instance buffers (disposing the
  // geometry/material alone would not, and the geometry is a shared prototype anyway).
  // #2170 — old materials are disposed AFTER the new scene has drawn, and only those no new object uses: disposing them first released every
  // shader program, recompiled on the next frame (5 s per commit on a 20,000-hole project)
  // #2176 — clears only the groups this build makes again (all of them on a full build)
  const clearGroups = (list) => {
    const oldMats = [];
    list.forEach((g) => { while (g.children.length) { const c = g.children.pop(); if (!c.geometry?.userData?.sharedProto) c.geometry?.dispose?.(); c.material?.map?.dispose?.(); if (c.material) oldMats.push(c.material); c.dispose?.(); } });
    setTimeout(() => { const live = new Set(); Object.values(groups).forEach((g) => g.traverse((o) => o.material && live.add(o.material))); oldMats.forEach((m) => { if (!live.has(m)) m.dispose?.(); }); }, 1500);
  };
  const labelAnchors = []; // #1277 — one per hole, drawn after the loop and again on a label-mode change
  if (!collars.length) {
    sceneCaches.delete(groups); // #2176 — the next build with holes is a full one
    clearGroups(Object.values(groups));
    setDataLoaded(false);
    hasAutoFitRef.current = false;
    // No drillhole collars yet, but there may still be a terrain surface or raster drape loaded on
    // its own (e.g. testing a DEM/GeoTIFF import before any collar data exists) — without this,
    // originRef stays at its useRef default of (0,0,0) and a real-world-coordinate terrain/raster
    // (easting/northing in the hundreds of thousands to millions) would sit far outside the
    // camera's default framing. That renders successfully — it's just off-screen — which reads
    // exactly like "I imported it but it won't display" (the bug this session's SRTM fix targets;
    // see raster.js parseDEMFiles). The terrain/raster effects below already read originRef.current
    // and rebuild whenever it changes, so setting it here and fitting the camera is enough to make
    // them visible without duplicating their own geometry-building logic.
    // Boundaries (Geosoft .ply import) don't carry a bbox directly — computed from their own vertices
    // — same off-screen-without-collars risk as terrain/rasters, so included in the same fallback.
    const boundaryBbox = (() => {
      const pts = (boundaries || []).flatMap((b) => b.polylines || []).flat();
      if (!pts.length) return null;
      const bxr = minMax(pts, (p) => p.x), byr = minMax(pts, (p) => p.y); // not Math.min/max(...) — see layers.js's minMax comment
      return [bxr.min, byr.min, bxr.max, byr.max];
    })();
    // Same off-screen-without-collars risk for OMF imports (a project with only points/lines/
    // surfaces and no drillholes yet) — world position is origin + each vertex triple.
    let omfZs = null;
    const omfBbox = (() => {
      const xs = [], ys = [], zs = [];
      (omfObjects || []).forEach((o) => {
        const [gox, goy, goz] = o.origin || [0, 0, 0];
        const n = (o.vertices || []).length / 3;
        for (let i = 0; i < n; i++) {
          xs.push(gox + o.vertices[i * 3]); ys.push(goy + o.vertices[i * 3 + 1]); zs.push(goz + o.vertices[i * 3 + 2]);
        }
      });
      (voxelModels || []).forEach((m) => (m.cells || []).forEach((c) => { xs.push(c.x); ys.push(c.y); zs.push(c.z); }));
      if (!xs.length) return null;
      omfZs = zs;
      const xr = minMax(xs), yr = minMax(ys);
      return [xr.min, yr.min, xr.max, yr.max];
    })();
    // TASKS.csv #228 (mineral-exploration-specialist audit finding, real live bug — confirmed by code
    // read, not just reported) — this whole `!collars.length` branch returns before the geophys_pts
    // build below ever runs and before its extent was considered as a camera anchor, so a project
    // with NO drillholes yet (a geophysics-survey-only or, once #228 lands, surface-geochem-only
    // project — exactly the "before ever drilling" workflow this app's target audience actually
    // starts most programs with) imported cleanly, reported the right point count, and rendered
    // nothing at all. Same class of "off-screen, not actually broken" bug this fallback already
    // exists to fix for terrain/rasters/boundaries/OMF — geophys_pts just wasn't included.
    const geophysPtsBbox = (() => {
      const pts = layers.geophys_pts || [];
      if (!pts.length) return null;
      const gxr = minMax(pts, (p) => p.x), gyr = minMax(pts, (p) => p.y);
      return [gxr.min, gyr.min, gxr.max, gyr.max];
    })();
    // TASKS.csv #228 — same "off-screen, not actually broken" anchor consideration as geophysPtsBbox
    // right above, for a surface-geochem-only project (no drillholes, no geophysics points either).
    const surfaceSamplesBbox = (() => {
      if (!placedSurfaceSamples.length) return null;
      const sxr = minMax(placedSurfaceSamples, (p) => p.x), syr = minMax(placedSurfaceSamples, (p) => p.y);
      return [sxr.min, syr.min, sxr.max, syr.max];
    })();
    // TASKS.csv #316/#317 — a map-layer-only or outcrop-structure-only project (mapping before any
    // drilling) has the same off-screen risk; both carry world coordinates.
    const mapLayersBbox = (() => {
      const bbs = (mapLayers || []).map((l) => l.bbox).filter(Boolean);
      (surfaceStructures || []).forEach((st) => {
        if (!st.rows?.length) return;
        const xr = minMax(st.rows, (r) => r.x), yr = minMax(st.rows, (r) => r.y);
        bbs.push([xr.min, yr.min, xr.max, yr.max]);
      });
      if (!bbs.length) return null;
      return [arrMin(bbs.map((b) => b[0])), arrMin(bbs.map((b) => b[1])), arrMax(bbs.map((b) => b[2])), arrMax(bbs.map((b) => b[3]))];
    })();
    const anchorBbox = terrain?.bbox || rasters?.[0]?.bbox || boundaryBbox || omfBbox || geophysPtsBbox || surfaceSamplesBbox || mapLayersBbox || null;
    if (anchorBbox) {
      const [bxmin, bymin, bxmax, bymax] = anchorBbox;
      const ox = (bxmin + bxmax) / 2, oy = (bymin + bymax) / 2;
      let ezMin = -50, ezMax = 500; // sane fallback vertical range for a raster/boundary-only anchor (no elevation data to measure)
      if (terrain?.elevations?.length) {
        const er = minMax(terrain.elevations); // not Math.min/max(...) — see layers.js's minMax comment
        ezMin = er.min; ezMax = er.max;
      } else if (omfZs?.length) {
        // Bug fix (found while testing OMF import): the -50..500 fallback assumes elevations near
        // sea level, which real OMF projects (typically at a mine site's actual elevation, e.g.
        // ~1000m+) don't satisfy — the camera would fit to a vertical range that doesn't contain any
        // of the actual imported geometry, rendering an apparently-empty scene. Measure OMF objects'
        // real z-extent instead when there's no terrain to measure it from.
        const zr = minMax(omfZs);
        ezMin = zr.min; ezMax = zr.max;
      } else if (geophysPtsBbox && layers.geophys_pts?.length) {
        const zr = minMax(layers.geophys_pts, (p) => p.z);
        ezMin = zr.min; ezMax = zr.max;
      } else if (surfaceSamplesBbox && placedSurfaceSamples.length) {
        const zr = minMax(placedSurfaceSamples, (p) => p.z);
        ezMin = zr.min; ezMax = zr.max;
      }
      originRef.current = { x: ox, y: oy, z: (ezMin + ezMax) / 2 };
      syncImplicitOrigin(); // #407
      const { x: rox, y: roy, z: roz } = originRef.current;
      const box = new THREE.Box3(
        new THREE.Vector3(bxmin - rox, ezMin - roz, -(bymax - roy)),
        new THREE.Vector3(bxmax - rox, ezMax - roz, -(bymin - roy)),
      );
      fitBox(box, 1.3);
      // TASKS.csv #1803 / #1804 / #1805 (review #1646, Kodiak) — with no collars the anchor box is the fit extent: Fit / Zoom to fit all /
      // the 3D slice range used hole traces only, and Snapshot was disabled ('Load some data first') beside two IP models
      lastTracesRef.current = [[{ x: box.min.x, y: box.min.y, z: box.min.z }, { x: box.max.x, y: box.max.y, z: box.max.z }]];
      lastHoleTraceCountRef.current = 0;
      setDataLoaded(true);
    }
    // TASKS.csv #312 — this no-collars branch builds geophys_pts/surface_samples itself and then
    // returns before the main path's own buildLayerBatches pass at the end of this effect, so it
    // has to batch what it just built or a collar-less project (a standalone geophysics survey or
    // soil-sample grid, which can easily be thousands of point markers) would keep paying one draw
    // call per point. Same call, same semantics as the main path's.
    Object.values(layerGroupsRef.current).forEach((g) => { if (g) buildLayerBatches(g); });
    // TASKS.csv #551 — geophysics points and surface samples are built by their own builders (below the
    // big effect's own groups), here for a project with no drillholes yet
    buildGeophysPtsRef.current(); buildSurfaceSamplesRef.current(); buildAssaySpheresRef.current();
    return;
  }

  // TASKS.csv #2797 — the origin is the collars' mean, kept from the last build while the mean stays within ORIGIN_KEEP_M (50 m) of it:
  // a new origin moves every object, so any collar commit was a full rebuild (a few added or corrected collars move the mean by
  // a metre or so). Measured from the kept origin, so the drift never adds up past it; a full build re-centres.
  const { ox, oy, oz } = keptOrigin(sceneCaches.get(groups), {
    ox: collars.reduce((s, c) => s + c.x, 0) / collars.length,
    oy: collars.reduce((s, c) => s + c.y, 0) / collars.length,
    oz: collars.reduce((s, c) => s + c.z, 0) / collars.length,
  });
  originRef.current = { x: ox, y: oy, z: oz };
  syncImplicitOrigin(); // #407 — re-base surfaces/solids built against an earlier origin

  const allTraces = [];

  // Perf (user report: "the app is getting a bit heavy on my laptop") — every builder below used to
  // do `rows.filter(r => r.hole_id === c.hole_id)` INSIDE the per-collar loop, i.e. a full scan of
  // the entire layer array once per hole (O(holes × rows) per layer, repeated for every interval/
  // point/structure/custom layer, on every rebuild of this effect — which happens on nearly any
  // sidebar change since collars/layers aren't the only deps). Grouping each layer by hole_id ONCE
  // up front (O(rows) total) and looking up each hole's own rows via Map.get() below turns that into
  // O(rows) overall regardless of hole count — same rendered result, just without redoing a full
  // linear scan per hole for every layer type. Biggest win on real projects (hundreds of holes ×
  // thousands of assay/lithology rows), where the old approach was quietly quadratic.
  const groupByHole = (rows) => {
    const m = new Map();
    (rows || []).forEach((r) => {
      if (!r.hole_id) return;
      let arr = m.get(r.hole_id);
      if (!arr) { arr = []; m.set(r.hole_id, arr); }
      arr.push(r);
    });
    return m;
  };
  // TASKS.csv #209 — same quadratic-scan fix as the groupByHole comment above already applied to
  // litho/alt/etc., just never extended to survey: `survey.filter(s => s.hole_id === c.hole_id)`
  // inside the per-collar loop below was still an O(holes × survey rows) full-array scan every
  // rebuild. Real projects carry multiple survey stations per hole (unlike this task's own
  // profiling repro, which used straight synthetic holes with none), so this was a live, if
  // smaller, contributor on real datasets — grouped once here instead, same O(rows) shape.
  const surveyByHole = groupByHole(survey.filter((s) => !isNaN(s.depth)));

  // TASKS.csv #2176 step 2 — rebuild only what a commit touched. On a 20,544-hole project a 3,000-row structure commit
  // desurveyed every hole again (1.9 s) and made 20,000 new trace lines, whose first frame then cost 8 s of WebGL setup.
  // Each hole's desurvey is kept, keyed on its collar object, its survey rows and the method (planHoles); a layer group is
  // made again only when its rows, style or the callbacks it reads changed, or a hole it has rows in was desurveyed again
  // (planGroups); every other group keeps its objects, batches and GPU buffers. A new origin (a collar commit moves the
  // collars' mean), duplicate hole ids, the Refresh view button (rebuildSeq) and the first build are full builds, as before.
  const prev = sceneCaches.get(groups);
  const plan = planHoles(prev, collars, surveyByHole, desurveyMethod, { ox, oy, oz, rebuildSeq }, desurveyHole); // desurveyHole: #2937
  const { full, holeEntries, changedHoles } = plan;
  const sigs = new Map(BUILT_ROW_KEYS.map((k) => [k, [layers[k], JSON.stringify(layerStyles[k] ?? null), effectiveLabel, baseColorForBuild, LAYER_META[k]?.numeric ? JSON.stringify([numericSymbology?.[k] ?? null, numericRange?.[k] ?? null]) : ""]]));
  customLayers.forEach((l) => sigs.set(l.id, [l, l.group, JSON.stringify(layerStyles[`custom:${l.id}`] ?? null)]));
  // #2373 — a custom layer whose style changed in its colours only is repainted in place, not rebuilt (its holes unchanged)
  const repaint = [];
  if (prev && !full) for (const l of customLayers) {
    const old = prev.sigs.get(l.id), sig = sigs.get(l.id), holes = prev.holeSets.get(l.id);
    if (!old || old[0] !== l || old[1] !== l.group || old[2] === sig[2] || !holes || !onlyPaintChanged(old[2], sig[2])) continue;
    if ([...changedHoles].some((id) => holes.has(id))) continue;
    prev.sigs.set(l.id, sig); repaint.push(l);
  }
  const rebuild = planGroups(prev, sigs, changedHoles, full);
  const rebuildHoles = full || changedHoles.size > 0;
  if (full) clearGroups(Object.values(groups));
  else clearGroups([...(rebuildHoles ? [groups.holes, groups.hole_labels] : []), ...[...rebuild].map((k) => customLayers.find((l) => l.id === k)?.group || groups[k])].filter(Boolean));
  const byHoleIf = (k, rows) => (rebuild.has(k) ? groupByHole(rows) : NO_HOLES); // a kept group builds nothing below
  const rowsByHole = {
    litho: byHoleIf("litho", layers.litho), alt: byHoleIf("alt", layers.alt), vein: byHoleIf("vein", layers.vein),
    geotech: byHoleIf("geotech", layers.geotech), litho_gc: byHoleIf("litho_gc", layers.litho_gc), alt_gc: byHoleIf("alt_gc", layers.alt_gc),
    mnlgy: byHoleIf("mnlgy", layers.mnlgy), magsusc: byHoleIf("magsusc", layers.magsusc), structure: byHoleIf("structure", layers.structure),
    recovery: byHoleIf("recovery", layers.recovery), sg: byHoleIf("sg", layers.sg), breccia: byHoleIf("breccia", layers.breccia), weath: byHoleIf("weath", layers.weath), structzone: byHoleIf("structzone", layers.structzone), // #608, #2162, #604
  };
  const customRowsByHoleByLayer = new Map(customLayers.map((l) => [l.id, byHoleIf(l.id, l.rows)]));
  // the holes each group has rows in, for the next build's planGroups (a kept group keeps its set)
  const holeSets = new Map();
  for (const k of sigs.keys()) holeSets.set(k, rebuild.has(k) ? new Set((rowsByHole[k] || customRowsByHoleByLayer.get(k) || NO_HOLES).keys()) : prev.holeSets.get(k));

  // Bug-hunt pass: color/size range for numeric point layers (mnlgy/magsusc) used to be computed
  // per-hole inside buildPointMarkers below, so the same absolute value rendered a different color
  // depending on which hole it happened to be in (each hole got its own 0-1 scale). Computed once
  // here across ALL holes/rows (still respecting the current visibility filter) so values compare
  // consistently across the whole project — same approach the geophysics point cloud already used.
  const numericRangeFor = (groupKey, rows) => {
    const numeric = (rows || []).filter((r) => isRowVisibleForBuild(groupKey, r)).map((r) => r.value).filter((v) => typeof v === "number" && !isNaN(v));
    return minMax(numeric); // not Math.min/max(...) — see layers.js's minMax comment
  };
  const globalPointRanges = {
    mnlgy: numericRangeFor("mnlgy", layers.mnlgy),
    magsusc: numericRangeFor("magsusc", layers.magsusc),
    // TASKS.csv #137 — specific gravity has no fixed, universally-known domain the way RQD%/
    // recovery% do (0-100), so it needs the actual project data's own min/max the same way
    // mnlgy/magsusc's point markers already do, rather than rqdColor's hardcoded 0-100 ramp
    // (which would render almost every real SG value, ~2-5, as a near-identical dark red).
    sg: numericRangeFor("sg", layers.sg),
  };
  const buildErrors = [];
  const traceHoles = []; // #2176 step 3 — { holeId, pts, dashed } for addTraceChunks
  const traceById = new Map(tracesRef.current.map((t) => [t.hole_id, t])); // #2170: was a filter per hole, O(holes²) (11.8 s at 20,544)
  collars.forEach((c) => {
   try {
    // #2176 — the hole's kept desurvey, trace and lookup when its collar, survey rows, method and the origin are the same
    const e = holeEntries?.get(c.hole_id) || { collar: c, hs: surveyByHole.get(c.hole_id) || [], method: desurveyMethod };
    if (!e.raw) {
      const hs = e.hs;
      e.raw = desurveyHole(c, hs, desurveyMethod); // TASKS.csv #135
      const assumedVertical = holeAttitudeAssumed(c, hs); // #2014 — no survey rows and no collar azimuth / dip: drawn as a vertical stick, dashed, and the tip says so
      e.assumedVertical = assumedVertical;
    }
    const raw = e.raw;
    if (!raw.length) return;
    const assumedVertical = e.assumedVertical;
    if (!e.pts) {
      e.pts = raw.map((p) => ({ md: p.md, x: p.x - ox, y: p.z - oz, z: -(p.y - oy) }));
      e.look = traceLookup(e.pts); // look: #1500 — binary search instead of a scan per interval
      e.trace = { hole_id: c.hole_id, pts: e.pts, wx: raw.map((p) => p.x), wy: raw.map((p) => p.y), wz: raw.map((p) => p.z) };
    }
    const pts = e.pts, look = e.look;
    allTraces.push(pts);
    traceById.delete(c.hole_id);
    traceById.set(c.hole_id, e.trace);
    // TASKS.csv #131 — collar (hole) labels, opt-in via holeLabelMode; #1277 — drawn from these anchors by syncHoleLabels
    labelAnchors.push({ id: c.hole_id, x: pts[0].x, y: pts[0].y, z: pts[0].z, zWorld: c.z, depth: pts.length ? pts[pts.length - 1].md : 0 });

    // TASKS.csv #2662 — a hole whose survey stations are all of an 'assumed' method (#2494: the collar's 'survey method' attribute) goes
    // where its planned direction says, not where it was measured: drawn dashed like #2014's assumed vertical sticks, and the tip says so
    const methodAssumed = c.attrs?.["survey method"] === "assumed";
    if (rebuildHoles) { // #2176 — the holes group is kept when no hole was desurveyed again
    if (!collarMaterialRef.current) collarMaterialRef.current = collarMarkerMaterial(new THREE.MeshBasicMaterial({ color: collarColorFor(bgColorRef.current), transparent: true })); // #378; #2623; transparent (opacity 1): #2776
    const marker = new THREE.Mesh(PROTO_SPHERE_12, collarMaterialRef.current); // TASKS.csv #312 — shared prototype + scale (was SphereGeometry(3.2, 12, 12))
    marker.scale.setScalar(3.2);
    marker.renderOrder = DRAW_ORDER.collars; // TASKS.csv #2776 — over a flat raster (its batch takes it)
    marker.position.set(pts[0].x, pts[0].y, pts[0].z);
    marker.userData = { collarMarker: true /* #2823 */, tip: `${c.hole_id}\ncollar${assumedVertical ? `\n${tr("no azimuth / dip and no survey: drawn as an ASSUMED vertical hole")}` : methodAssumed ? `\n${tr("survey method assumed: the direction below the collar was not measured (drawn dashed)")}` : ""}`, collar: c }; // collar: #1504 — Identify lists its fields; #2014; #2662
    groups.holes.add(marker); // #2319

    // TASKS.csv #2176 step 3 — the trace goes into a merged LineSegments chunk (lib/viewer/traceBatch.js, after the loop): one THREE.Line
    // and material per hole was ~20,000 draw calls a frame at 20,544 holes. Dashed when the hole is an assumed vertical stick (#2014);
    // its hole id rides on the chunk's per-hole hits (#1533)
    traceHoles.push({ holeId: c.hole_id, pts, dashed: assumedVertical || methodAssumed }); // #2662: an 'assumed' survey method too
    }

    // TASKS.csv #137 — geotech/recovery are both known 0-100 percentages, so rqdColor's fixed
    // ramp fits both; specific gravity has no such fixed domain (real values run ~2-5), so it
    // uses the project's own actual min/max instead (globalPointRanges.sg above), same as the
    // numeric point-marker layers (mnlgy/magsusc) below already do via magColor.
    // TASKS.csv #237 — now routed through numericLayerColor so a user-defined class scheme (if any)
    // wins; with no scheme defined this returns exactly what it always did.
    const numericIntervalColor = (groupKey, value) =>
      numericLayerColor(groupKey, value, groupKey === "sg" ? globalPointRanges.sg : { min: 0, max: 100 });
    const buildIntervalTube = (groupKey, opt = {}) => { // opt (#684): { filter, meta } — a point layer drawing its real intervals
      const meta = { ...LAYER_META[groupKey], ...(opt.meta || {}) };
      const st = resolveLayerStyle(layerStyles[groupKey], "interval", { opacity: meta.opacity }); // TASKS.csv #635
      const radius = meta.radius * st.size;
      (rowsByHole[groupKey]?.get(c.hole_id) || []).filter((r) => isRowVisibleForBuild(groupKey, r) && (!opt.filter || opt.filter(r))).forEach((row) => {
       try {
        if (!Number.isFinite(row.from) || !Number.isFinite(row.to)) return; // #613 — null (a blank "to" after a JSON round-trip) passed isNaN
        const p1 = look.at(row.from), p2 = look.at(row.to);
        const mid = look.between(row.from, row.to);
        // TASKS.csv #209 — CatmullRomCurve3 + TubeGeometry was 89% of a 24,000-interval build (~0.42 ms each), and is needed only
        // where an interval spans a real bend: p1 / mid / p2 colinear within 5 cm takes the shared-cylinder path (the trace's ~3 m
        // sample points are not a curvature test: gating on mid.length was measured worse). 10.9 s -> 2.6 s; see #209's notes.
        const straight = (() => {
          if (!mid.length) return true; // p1/p2 only, nothing to check
          const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
          const lenSq = dx * dx + dy * dy + dz * dz;
          if (lenSq < 1e-9) return true;
          const tol = 0.05; // metres — well under drawing precision at typical viewer scales
          for (const p of mid) {
            const t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy + (p.z - p1.z) * dz) / lenSq;
            const projX = p1.x + t * dx, projY = p1.y + t * dy, projZ = p1.z + t * dz;
            const ddx = p.x - projX, ddy = p.y - projY, ddz = p.z - projZ;
            if (ddx * ddx + ddy * ddy + ddz * ddz > tol * tol) return false;
          }
          return true;
        })();
        let geo, mesh_ = null;
        if (straight) {
          const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z;
          const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (len < 1e-6) return;
          // TASKS.csv #312 — was a per-interval CylinderGeometry(radius, radius, len, 6, 1, false)
          // .translate(0, len/2, 0). Now the shared unit prototype (already translated the same
          // way) with the radius/length carried in .scale instead, which is what lets every
          // straight interval in a layer share ONE InstancedMesh draw call — see PROTO_CYLINDER
          // and buildLayerBatches. Same vertices, same placement; three.js raycasts in local
          // space, so picking is unchanged.
          geo = INTERVAL_PROTO[st.shape];
          const color = st.color || (meta.numeric ? numericIntervalColor(groupKey, row.value) : baseColorForBuild(groupKey, row.value));
          mesh_ = new PickStandIn(geo, { color, transparent: st.opacity < 1, opacity: st.opacity }); // #1500 — never drawn itself (its batch is)
          mesh_.scale.set(radius, len, radius);
          mesh_.position.set(p1.x, p1.y, p1.z);
          mesh_.quaternion.setFromUnitVectors(UP_Y, DIR_TMP.set(dx / len, dy / len, dz / len)); // #1500 — shared vectors
        } else {
          const vecs = [new THREE.Vector3(p1.x, p1.y, p1.z), ...mid.map((p) => new THREE.Vector3(p.x, p.y, p.z)), new THREE.Vector3(p2.x, p2.y, p2.z)]; // #1500 — only here
          const curve = new THREE.CatmullRomCurve3(vecs);
          geo = new THREE.TubeGeometry(curve, Math.max(2, vecs.length * 2), radius, TUBE_SEGMENTS[st.shape], false);
          const color = st.color || (meta.numeric ? numericIntervalColor(groupKey, row.value) : baseColorForBuild(groupKey, row.value));
          const mat = new THREE.MeshLambertMaterial({ color, transparent: st.opacity < 1, opacity: st.opacity });
          mesh_ = new THREE.Mesh(geo, mat);
        }
        const mesh = mesh_;
        // TASKS.csv #208 — a mapped Description in the tooltip; #227 — catValue for the category pass; #1500 — the tooltip made on first
        // read (lazyTip), holeId for the visible-holes pass
        mesh.userData = lazyTip({ row, holeId: c.hole_id, catValue: row.value, ...(groupKey === "litho" ? { lithoRow: row } : {}) }, () => `${c.hole_id}\n${meta.label}: ${meta.numeric ? row.value : effectiveLabel(groupKey, row.value)}${row.extra != null ? ` (${row.extra}${meta.extraSuffix || ""})` : ""}\n${+row.from.toFixed(2)}–${+row.to.toFixed(2)} m${row.intensity ? ` · intensity ${row.intensity}` : ""}${Number.isFinite(row.alpha) ? ` · alpha ${row.alpha}°` : ""}${row.description ? `\n${row.description}` : ""}`); // lithoRow: TASKS.csv #599 picking
        groups[groupKey].add(mesh);
       } catch (err) { buildErrors.push(`${groupKey} ${c.hole_id} ${row.from}-${row.to}: ${err.message}`); }
      });
    };
    buildIntervalTube("litho");
    buildIntervalTube("alt");
    buildIntervalTube("vein");
    buildIntervalTube("breccia"); // #608
    buildIntervalTube("structzone"); // #604
    buildIntervalTube("weath"); // #2162
    buildIntervalTube("geotech");
    buildIntervalTube("recovery");
    buildIntervalTube("sg");
    buildIntervalTube("litho_gc");
    buildIntervalTube("alt_gc");

    const buildPointMarkers = (groupKey, filter = null) => {
      const meta = LAYER_META[groupKey];
      const st = resolveLayerStyle(layerStyles[groupKey], "point"); // TASKS.csv #635
      const vals = (rowsByHole[groupKey]?.get(c.hole_id) || []).filter((r) => isRowVisibleForBuild(groupKey, r) && (!filter || filter(r)));
      const { min, max } = globalPointRanges[groupKey] || { min: 0, max: 0 };
      vals.forEach((row) => {
       try {
        const mid = (row.from + row.to) / 2;
        const p = look.at(mid);
        if (!p) return;
        const size = meta.numeric ? 1.6 + 3.5 * (max > min ? (row.value - min) / (max - min) : 0.3) : 2 + Math.min(3, (row.extra || 1) * 0.4);
        const color = st.color || (meta.numeric ? numericLayerColor(groupKey, row.value, { min, max }) : baseColorForBuild(groupKey, row.value));
        const mesh = new PickStandIn(POINT_PROTO[st.shape], { color, transparent: st.opacity < 1, opacity: st.opacity, side: st.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide }); // TASKS.csv #312 — shared prototype + scale; #635 style; #1500 a stand-in
        mesh.scale.setScalar(size * st.size);
        mesh.position.set(p.x, p.y, p.z);
        mesh.userData = lazyTip({ row, holeId: c.hole_id, catValue: row.value }, () => `${c.hole_id}\n${meta.label}: ${meta.numeric ? row.value : effectiveLabel(groupKey, row.value)}${row.extra != null ? ` (${row.extra}%)` : ""}\n@ ${mid.toFixed(0)} m`); // #1500
        groups[groupKey].add(mesh);
       } catch (err) { buildErrors.push(`${groupKey} ${c.hole_id}: ${err.message}`); }
      });
    };
    // TASKS.csv #684 — a mineralisation log can be an INTERVAL log (Woodjam: 958 rows over 1 m, up to 69 m long), and
    // each row used to become one sphere at its midpoint — a depth that is not in the data. Rows longer than half a
    // metre are drawn as intervals; point-style rows (from = to, as in Harry and the synthetic set) stay markers.
    buildIntervalTube("mnlgy", { filter: isIntervalRow, meta: { radius: 2.8, opacity: 0.85, extraSuffix: "%" } });
    buildPointMarkers("mnlgy", (r) => !isIntervalRow(r));
    buildPointMarkers("magsusc");

    const stStruct = resolveLayerStyle(layerStyles.structure, "plane", { opacity: 0.55 }); // TASKS.csv #635
    (rowsByHole.structure?.get(c.hole_id) || []).filter((s) => isRowVisibleForBuild("structure", s)).forEach((s) => {
      const p = look.at(s.depth);
      if (!p) return;
      // TASKS.csv #394 — a pick without a recorded dip AND dip direction is drawn as a small sphere on the
      // trace, NOT as a plane: it used to default to dip 45 / az 0 and the tooltip then presented
      // "dip 45° / az 0°" as if measured, so alpha-only or unoriented picks looked like real
      // north-dipping planes.
      const oriented = s.dip != null && !isNaN(s.dip) && s.azimuth != null && !isNaN(s.azimuth);
      const color = stStruct.color || baseColorForBuild("structure", s.value);
      if (!oriented) {
        const mark = new THREE.Mesh(PROTO_SPHERE_8, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: stStruct.opacity }));
        mark.scale.setScalar(2.2 * stStruct.size);
        mark.position.set(p.x, p.y, p.z);
        mark.userData = { row: s, tip: `${c.hole_id}\nStructure: ${effectiveLabel("structure", s.value)}\norientation not recorded (dip —)\n@ ${s.depth.toFixed(0)} m`, catValue: s.value };
        groups.structure.add(mark);
        return;
      }
      const dip = s.dip;
      const az = s.azimuth;
      const geo = stStruct.shape === "square" ? PROTO_SQUARE : PROTO_CIRCLE_24; // TASKS.csv #312 — shared prototype + scale (was CircleGeometry(6, 24)); #635 shape
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: stStruct.opacity < 1, opacity: stStruct.opacity });
      const disc = new THREE.Mesh(geo, mat);
      disc.scale.setScalar(6 * stStruct.size);
      disc.rotation.order = "YXZ";
      disc.rotation.x = Math.PI / 2 - toRad(dip);
      disc.rotation.y = -toRad(az);
      disc.position.set(p.x, p.y, p.z);
      const lbl = effectiveLabel("structure", s.value);
      disc.userData = { row: s, tip: `${c.hole_id}\nStructure: ${lbl}\ndip ${dip.toFixed(0)}° / az ${az.toFixed(0)}°\n@ ${s.depth.toFixed(0)} m`, catValue: s.value };
      groups.structure.add(disc);
      // TASKS.csv #1241 — a disc looks the same dipping 60/045 and 60/225: a pin from its centre down the dip, past the rim so it shows on an opaque disc.
      // A shared prototype, so the pins batch into one draw call and follow the category and hole filters and the colour overrides like the discs.
      const pin = new THREE.Mesh(PROTO_PRISM_4, new THREE.MeshBasicMaterial({ color }));
      pin.quaternion.setFromUnitVectors(PIN_AXIS, dipPinDir.set(Math.sin(toRad(az)) * Math.cos(toRad(dip)), -Math.sin(toRad(dip)), -Math.cos(toRad(az)) * Math.cos(toRad(dip))));
      pin.scale.set(0.35 * stStruct.size, 8 * stStruct.size, 0.35 * stStruct.size);
      pin.position.set(p.x, p.y, p.z);
      pin.userData = disc.userData;
      groups.structure.add(pin);
    });

    customLayers.forEach((layer) => {
      const stI = resolveLayerStyle(layerStyles[`custom:${layer.id}`], "interval"), stP = resolveLayerStyle(layerStyles[`custom:${layer.id}`], "point"); // TASKS.csv #635
      // TASKS.csv #227 — geometry is now built regardless of customVisible (visibility is toggled
      // cheaply afterward via the layer's own group.visible, see the small effect near layerVisible's
      // own visibility effect) so this rebuild no longer needs to re-run every time a custom layer's
      // checkbox is toggled — see customVisible's removal from this effect's own dependency array.
      (customRowsByHoleByLayer.get(layer.id)?.get(c.hole_id) || []).forEach((row) => {
        if (row.to != null && !isNaN(row.to)) {
          const p1 = look.at(row.from), p2 = look.at(row.to);
          // TASKS.csv #1529 (review #1497, Lawyers) — a custom interval runs straight between its two ends, so it is the shared
          // unit cylinder scaled and turned (as the built-in interval layers, #312) and batches into a few draw calls per layer.
          // It was a TubeGeometry + material per row: Lawyers' 5 custom layers were 16,860 meshes, ~14,700 draw calls, 9 fps orbit.
          const dx = p2.x - p1.x, dy = p2.y - p1.y, dz = p2.z - p1.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (!(len > 1e-6)) return;
          const mesh = new PickStandIn(INTERVAL_PROTO[stI.shape] || PROTO_CYLINDER, { color: stI.color || row.modelColor || customColour(layer, layerStyles, row), transparent: stI.opacity < 1, opacity: stI.opacity }); // #1500; #1697
          mesh.scale.set(1.6 * stI.size, len, 1.6 * stI.size);
          mesh.position.set(p1.x, p1.y, p1.z);
          mesh.quaternion.setFromUnitVectors(PIN_AXIS, dipPinDir.set(dx / len, dy / len, dz / len));
          mesh.userData = lazyTip({ row, holeId: c.hole_id }, () => `${c.hole_id}\n${layer.name}: ${row.value ?? "—"}\n${+row.from.toFixed(2)}–${+row.to.toFixed(2)} m`); // #1500
          layer.group.add(mesh);
        } else if (row.depth != null && !isNaN(row.depth)) {
          const p = look.at(row.depth);
          const mesh = new PickStandIn(POINT_PROTO[stP.shape], { color: stP.color || customColour(layer, layerStyles, row), transparent: stP.opacity < 1, opacity: stP.opacity, side: stP.shape === "disc" ? THREE.DoubleSide : THREE.FrontSide }); // TASKS.csv #312 — shared prototype + scale; #635 style; #1500 a stand-in
          mesh.scale.setScalar(2.4 * stP.size);
          mesh.position.set(p.x, p.y, p.z);
          mesh.userData = lazyTip({ row, holeId: c.hole_id }, () => `${c.hole_id}\n${layer.name}: ${row.value ?? "—"}\n@ ${row.depth.toFixed(0)} m`); // #1500
          layer.group.add(mesh);
        }
      });
    });
   } catch (err) {
     buildErrors.push(`${c.hole_id}: ${err.message}`);
   }
  });
  if (rebuildHoles || plan.shift?.kept) tracesRef.current = [...traceById.values()]; // #2176 — the same list otherwise; #2937 — the new method's traces
  if (rebuildHoles) addTraceChunks(groups.holes, traceHoles); // #2176 step 3
  for (const l of repaint) paintCustomLayer(l, layerStyles); // #2373
  if (plan.holeEntries) sceneCaches.set(groups, { ox, oy, oz, rebuildSeq, holes: plan.holeEntries, sigs, holeSets }); else sceneCaches.delete(groups);

  // Bug fix (user report: imported a real OMF block model — resistivity.omf — into a project that
  // already had drillholes loaded, and it just never appeared, no matter how they panned/zoomed).
  // Root cause: this auto-fit only ever looked at drillhole trace points (`allTraces` above) — a
  // voxel/block model (UBC mesh, block-model CSV, or an OMF volume) never participated in the camera
  // fit AT ALL, in any code path, including the no-collars fallback above. A block model can sit
  // anywhere relative to the drillholes (a regional geophysics inversion is often centered somewhere
  // else entirely), so it would silently render fully off-screen — passing every "did it import
  // correctly" check (no errors, correct cell count reported) while being genuinely invisible.
  // Contributing each model's own min/max corner (in the same local/origin-relative, z-up-flipped
  // space `allTraces` points already use — see the `pts` mapping above) is enough to expand the fit
  // box to include it; a full per-cell contribution isn't needed since fitView only cares about the
  // overall AABB.
  const nHoleTraces = allTraces.length; // #1319
  allTraces.push(...voxelFitCorners(voxelModels, { x: ox, y: oy, z: oz }));

  // TASKS.csv #312 — every layer group is fully populated at this point, so collapse each group's
  // same-geometry/same-material families into InstancedMesh batches (see buildLayerBatches). This
  // must run BEFORE the applyCategoryVisibility/applyLegendOverrideColors calls below, since both
  // of those mirror their per-object changes into the batches they find.
  // #2176 — only the groups made again (a kept group's members are batched already)
  if (full) Object.values(layerGroupsRef.current).forEach((g) => { if (g) buildLayerBatches(g); });
  else [...(rebuildHoles ? [groups.holes] : []), ...[...rebuild].map((k) => customLayers.find((l) => l.id === k)?.group || groups[k])].forEach((g) => { if (g) buildLayerBatches(g); });
  // TASKS.csv #551 — assay spheres, geophysics points and surface samples have their own builders (each clears and
  // batches only its own group): run them on the traces and origin just built
  // #2176 — with the same traces and origin, only a builder whose own inputs changed since it last ran (a deferred commit, #1500)
  const stale = pointBuildersStale?.() || [true, true, true];
  if (rebuildHoles || stale[0]) buildAssaySpheresRef.current();
  if (rebuildHoles || stale[1]) buildGeophysPtsRef.current();
  if (rebuildHoles || stale[2]) buildSurfaceSamplesRef.current();

  lastTracesRef.current = allTraces;
  lastHoleTraceCountRef.current = nHoleTraces;
  // TASKS.csv #2937 — what a method switch moved, said (the review: 'no line saying what a desurvey change moved')
  if (plan.shift && !plan.full) {
    const sh = plan.shift, m = sh.max < 0.01 ? `${(sh.max * 1000).toFixed(1)} mm` : `${sh.max.toFixed(sh.max < 1 ? 3 : 2)} m`;
    setNotices((p) => [...p, notice(sh.moved ? "Desurvey method changed: the stations moved by up to {m} ({hole}). {moved} hole(s) moved more than 10 cm and were redrawn; {kept} kept their drawing (the tools use the new method's positions)." : "Desurvey method changed: the stations moved by up to {m} ({hole}), under 10 cm in every hole, so the drawing is kept; the tools use the new method's positions.", { m, hole: sh.hole || "—", moved: sh.moved, kept: sh.kept })]);
  }
  if (buildErrors.length) setNotices((p) => [...p, errorNotice(tr("{buildErrors} row(s) failed to render (skipped, rest of the model is unaffected): {v}{v2}", { buildErrors: buildErrors.length, v: buildErrors.slice(0, 3).join(" · "), v2: buildErrors.length > 3 ? "…" : "" }))]);
  if (allTraces.length) {
    if (!hasAutoFitRef.current) { autoFitInitial(allTraces, nHoleTraces); hasAutoFitRef.current = true; }
    setDataLoaded(true);
  }
  // TASKS.csv #227 (continuation) — categoryFilter was pulled out of this effect's own dependency
  // array (see isRowVisibleForBuild above: category-hidden rows are still built now, not skipped),
  // so a real rebuild triggered by something else entirely (e.g. a new CSV import) creates fresh,
  // three.js-default-visible children that must have the CURRENTLY active category filters
  // reapplied here, or a category a user had already hidden would incorrectly reappear until they
  // touched the filter again. The companion effect below (keyed on [categoryFilter] alone) handles
  // the common case — toggling a chip with no rebuild involved.
  if (rebuildHoles) { // #2176 — the labels stand on the collars: kept with them (1.5 s for 2,248 labels)
    holeLabelAnchorsRef.current = labelAnchors; // #1277
    collarSize?.apply(groups.holes, labelAnchors); // TASKS.csv #2823 — the markers' size from the drilling / the setting, now they are batched
    syncHoleLabels(groups.hole_labels, labelAnchors, holeLabelModeRef.current, makeTextSprite);
  }
  applyCategoryVisibility();
  // Same reasoning for legendOverride: build-time color now comes from baseColorForBuild (plain
  // default, no override), so a real rebuild's fresh meshes need any currently-active legend color
  // overrides reapplied here too, or they'd flash back to default colors until legendOverride itself
  // next changes.
  applyLegendOverrideColors();
  if (rebuildHoles) setTracesSeq((n) => n + 1); // #888 — explicit-surface picks on holes follow the new traces; #2176 — only when they changed
  // voxelModels here (see the comment above this effect): a mere visibility/opacity/legend toggle
  // must NOT re-trigger this effect's unconditional fitView() call and wipe out the user's pan/zoom.
  // applyCategoryVisibility/applyLegendOverrideColors are deliberately NOT listed either, for the
  // same reason categoryFilter/legendOverride were removed from this array — both are called
  // directly above using whatever this render closed over, not as re-trigger conditions.
}
