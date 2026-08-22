// TASKS.csv #117 — grade estimation into block models. Micromine-specialist AND Leapfrog-specialist
// audits both independently flagged this as the top gap: GeoStrix could import/display someone else's
// pre-built block model (voxel.js) but had no in-app engine to populate one FROM composited assays —
// the actual "resource estimation" step. Depends on downhole compositing (#118, implemented alongside
// this) as its input: estimation should run on regularized composites, not raw variable-length sample
// intervals, exactly like every real workflow (Micromine/Leapfrog/Datamine) does it.
//
// Two methods are implemented — nearest-neighbour and inverse-distance weighting (power 2 or 3) — NOT
// ordinary kriging. Kriging needs a fitted variogram model (nugget/sill/range from an experimental
// variogram the user would build and fit interactively) as a genuine prerequisite step, not just a
// harder formula substituted in the same loop; shipping a kriging button without that would produce
// numbers that look like a real estimate but aren't backed by one, which is worse than not having the
// button. NN/IDW are complete, defensible estimation methods in their own right (IDW in particular is
// still routinely used for early-stage/scoping estimates), and TASKS.csv keeps a follow-up entry logged
// for kriging as a separate, larger piece of work (needs its own variogram-modelling UI first).
import { pointOnTrace } from "./desurvey.js";
import { valueIn } from "./geochem.js";

export const MAX_BLOCKS = 200000; // keeps a synchronous brute-force estimation pass responsive — see estimateBlockModel

// Turn composited (or raw) downhole intervals into world-space sample points {x,y,z,value,hole_id,from,to}
// by desurveying each hole once and interpolating each interval's midpoint depth along the trace.
// Composites/intervals whose hole has no collar, or whose midpoint falls outside the hole's traced
// range, are silently skipped (not enough information to place them in 3D) — the caller is told how
// many were dropped so that isn't a silent gap.
export function samplePointsFromIntervals(intervals, collars, survey, desurveyHole) {
  const collarById = new Map(collars.map((c) => [c.hole_id, c]));
  const surveyByHole = new Map();
  survey.forEach((s) => { if (!surveyByHole.has(s.hole_id)) surveyByHole.set(s.hole_id, []); surveyByHole.get(s.hole_id).push(s); });
  const traceCache = new Map();

  const points = [];
  let dropped = 0;
  intervals.forEach((iv) => {
    if (iv.from == null || iv.to == null || iv.avgGrade == null) { dropped++; return; }
    if (!traceCache.has(iv.hole_id)) {
      const collar = collarById.get(iv.hole_id);
      traceCache.set(iv.hole_id, collar ? desurveyHole(collar, surveyByHole.get(iv.hole_id) || []) : null);
    }
    const trace = traceCache.get(iv.hole_id);
    if (!trace || !trace.length) { dropped++; return; }
    const mid = (iv.from + iv.to) / 2;
    const p = pointOnTrace(trace, mid);
    if (!p) { dropped++; return; }
    points.push({ x: p.x, y: p.y, z: p.z, value: iv.avgGrade, hole_id: iv.hole_id, from: iv.from, to: iv.to });
  });
  return { points, dropped };
}

// Alternative entry point: sample directly from raw assay rows (no compositing) — useful for a quick
// look before setting up a composite length, or for sparse datasets where compositing would throw
// most of the data away. `assays` rows are {hole_id, from, to, values:{symbol:...}}.
export function samplePointsFromAssays(assays, symbol, unit, elementUnits, collars, survey, desurveyHole) {
  const intervals = assays
    .filter((a) => a.hole_id != null && a.from != null && a.to != null)
    .map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, avgGrade: valueIn(a, symbol, unit, elementUnits) }))
    .filter((iv) => iv.avgGrade != null);
  return samplePointsFromIntervals(intervals, collars, survey, desurveyHole);
}

// Estimate grade into a regular block grid from `samplePoints`. Returns { cells, blocksEstimated,
// blocksSkipped } where cells are {x,y,z (center), dx,dy,dz, value, nSamples} ready to hand straight
// to store.jsx's addVoxelModel — same cell shape voxel.js's importers already produce, so the result
// renders through the exact same voxel viewer with no separate code path. A block with fewer than
// `minSamples` points inside its search radius gets NO cell at all (rather than an extrapolated/zero
// value) — an empty region of the grid should read as "not estimated", not "estimated at zero grade".
export function estimateBlockModel(samplePoints, opts) {
  const { bounds, cellSize, method = "idw2", searchRadius = null, minSamples = 1, maxSamples = 16 } = opts;
  const dx = Math.max(0.01, cellSize.dx), dy = Math.max(0.01, cellSize.dy), dz = Math.max(0.01, cellSize.dz);
  const nx = Math.max(1, Math.round((bounds.xmax - bounds.xmin) / dx));
  const ny = Math.max(1, Math.round((bounds.ymax - bounds.ymin) / dy));
  const nz = Math.max(1, Math.round((bounds.zmax - bounds.zmin) / dz));
  const totalBlocks = nx * ny * nz;
  if (totalBlocks > MAX_BLOCKS) {
    throw new Error(`Block grid would be ${totalBlocks.toLocaleString()} blocks (${nx}×${ny}×${nz}) — over the ${MAX_BLOCKS.toLocaleString()}-block limit kept for a responsive in-app estimation pass. Use a larger cell size or a smaller extent.`);
  }
  if (!samplePoints.length) return { cells: [], blocksEstimated: 0, blocksSkipped: totalBlocks };

  const power = method === "idw3" ? 3 : method === "idw2" ? 2 : null; // null => nearest-neighbour
  const r2 = searchRadius != null ? searchRadius * searchRadius : null;
  const cells = [];
  let blocksSkipped = 0;

  for (let iz = 0; iz < nz; iz++) {
    const cz = bounds.zmin + (iz + 0.5) * dz;
    for (let iy = 0; iy < ny; iy++) {
      const cy = bounds.ymin + (iy + 0.5) * dy;
      for (let ix = 0; ix < nx; ix++) {
        const cx = bounds.xmin + (ix + 0.5) * dx;

        // gather in-radius samples with their squared distance, without allocating an object per
        // sample up front — this loop runs nx*ny*nz*nSamples times so it's worth keeping tight.
        const dists = [];
        for (let i = 0; i < samplePoints.length; i++) {
          const p = samplePoints[i];
          const ddx = p.x - cx, ddy = p.y - cy, ddz = p.z - cz;
          const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
          if (r2 != null && d2 > r2) continue;
          dists.push({ d2, value: p.value });
        }
        if (dists.length < minSamples) { blocksSkipped++; continue; }
        dists.sort((a, b) => a.d2 - b.d2);
        const used = dists.slice(0, maxSamples);

        let value;
        if (power == null) {
          value = used[0].value; // nearest-neighbour
        } else {
          const EXACT_D2 = 1e-6;
          const exact = used.find((s) => s.d2 < EXACT_D2);
          if (exact) {
            value = exact.value;
          } else {
            let wSum = 0, vSum = 0;
            used.forEach((s) => { const w = 1 / Math.pow(s.d2, power / 2); wSum += w; vSum += w * s.value; });
            value = wSum > 0 ? vSum / wSum : null;
          }
        }
        if (value == null) { blocksSkipped++; continue; }
        cells.push({ x: cx, y: cy, z: cz, dx, dy, dz, value, nSamples: used.length });
      }
    }
  }
  return { cells, blocksEstimated: cells.length, blocksSkipped, grid: { nx, ny, nz } };
}
