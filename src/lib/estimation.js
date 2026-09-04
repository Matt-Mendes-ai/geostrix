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
  let clamped = 0; // TASKS.csv #270 (LOW-4)
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
    // TASKS.csv #270 (LOW-4) — a negative grade is a data error (validateAssays already flags them as
    // a QC issue), never a real concentration. Letting one through drags an IDW average below zero and
    // moves the isosurface's cutoff boundary, so clamp at zero here — the single place every estimation
    // entry point funnels through — and report the count so the clamping is visible, not silent.
    let value = iv.avgGrade;
    if (value < 0) { value = 0; clamped++; }
    // TASKS.csv #262 — carry length/coverage through so makeCellEstimator can length-weight. A 0.2 m
    // domain-break residual composite must NOT influence a block as much as a full 2.0 m composite.
    const length = iv.length != null ? iv.length : (iv.to - iv.from);
    points.push({
      x: p.x, y: p.y, z: p.z, value, hole_id: iv.hole_id, from: iv.from, to: iv.to,
      length: Number.isFinite(length) && length > 0 ? length : null,
      coverage: iv.coverage != null ? iv.coverage : null,
      domain: iv.domain != null ? iv.domain : null, // TASKS.csv #260 — kept for domain-restricted search
    });
  });
  return { points, dropped, clamped };
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
  const { bounds, cellSize, method = "idw2", searchRadius = null, minSamples = 1, maxSamples = 16, minHoles = 1, lengthWeight = true, restrictToDomain = false } = opts;
  const { dx, dy, dz, nx, ny, nz, totalBlocks } = gridDims(bounds, cellSize);
  if (!samplePoints.length) return { cells: [], blocksEstimated: 0, blocksSkipped: totalBlocks, singleHoleCells: 0 };

  const est = makeCellEstimator(samplePoints, { method, searchRadius, minSamples, maxSamples, minHoles, lengthWeight, restrictToDomain });
  const cells = [];
  let blocksSkipped = 0;
  let singleHoleCells = 0; // TASKS.csv #258 — surfaced in the run summary

  for (let iz = 0; iz < nz; iz++) {
    const cz = bounds.zmin + (iz + 0.5) * dz;
    for (let iy = 0; iy < ny; iy++) {
      const cy = bounds.ymin + (iy + 0.5) * dy;
      for (let ix = 0; ix < nx; ix++) {
        const cx = bounds.xmin + (ix + 0.5) * dx;
        const r = est(cx, cy, cz);
        if (!r) { blocksSkipped++; continue; }
        if (r.nHoles === 1) singleHoleCells++;
        cells.push({ x: cx, y: cy, z: cz, dx, dy, dz, value: r.value, nSamples: r.nSamples, nHoles: r.nHoles });
      }
    }
  }
  return { cells, blocksEstimated: cells.length, blocksSkipped, singleHoleCells, grid: { nx, ny, nz } };
}

// TASKS.csv #142 — the grid sizing + per-cell NN/IDW math shared by estimateBlockModel (sparse cell
// list, for block models) and estimateDenseGrid (dense array, for isosurface extraction). Factored out
// so the two entry points can't drift apart: the numeric grade-shell tool must produce the SAME grade
// at a given grid position that the block-model tool would, or the two would disagree about where a
// cutoff envelope sits.
function gridDims(bounds, cellSize) {
  const dx = Math.max(0.01, cellSize.dx), dy = Math.max(0.01, cellSize.dy), dz = Math.max(0.01, cellSize.dz);
  const nx = Math.max(1, Math.round((bounds.xmax - bounds.xmin) / dx));
  const ny = Math.max(1, Math.round((bounds.ymax - bounds.ymin) / dy));
  const nz = Math.max(1, Math.round((bounds.zmax - bounds.zmin) / dz));
  const totalBlocks = nx * ny * nz;
  if (totalBlocks > MAX_BLOCKS) {
    throw new Error(`Block grid would be ${totalBlocks.toLocaleString()} blocks (${nx}×${ny}×${nz}) — over the ${MAX_BLOCKS.toLocaleString()}-block limit kept for a responsive in-app estimation pass. Use a larger cell size or a smaller extent.`);
  }
  return { dx, dy, dz, nx, ny, nz, totalBlocks };
}

// TASKS.csv #292 — uniform-grid spatial index over the sample points. makeCellEstimator's old linear
// scan was O(cells x samples): measured at 62,500 cells x 5,000 points, 1,068 ms with a 50 m radius and
// 81,376 ms with none, and at the MAX_BLOCKS cap the unbounded case ran for ~250 s of blocked main
// thread. A full k-d tree isn't needed: bucket the points on a uniform grid, then walk outward from the
// query cell's own bucket one Chebyshev ring at a time (see makeCellEstimator's query loop for the
// stopping rule, which is what makes this exact rather than approximate).
//
// The bucket edge is chosen from the DATA's own extent, not from the search radius: bucketing at the
// radius sounds natural but collapses to a single bucket exactly in the case that hurts most (a huge or
// "unlimited" radius), which is how the first version of this fix still froze on a real 117,312-block
// run. Aiming at roughly a handful of points per bucket keeps the ring walk cheap at any radius.
function buildSampleIndex(samplePoints, searchRadius) {
  const n = samplePoints.length;
  if (!n) return null;
  let xmin = Infinity, ymin = Infinity, zmin = Infinity, xmax = -Infinity, ymax = -Infinity, zmax = -Infinity;
  for (let i = 0; i < n; i++) {
    const p = samplePoints[i];
    if (p.x < xmin) xmin = p.x; if (p.x > xmax) xmax = p.x;
    if (p.y < ymin) ymin = p.y; if (p.y > ymax) ymax = p.y;
    if (p.z < zmin) zmin = p.z; if (p.z > zmax) zmax = p.z;
  }
  const spread = Math.max(xmax - xmin, ymax - ymin, zmax - zmin);
  if (!(spread > 0)) return null; // every sample at one position — nothing to index
  // ~8 points per bucket on average if the points were uniformly spread; clamped so a huge dataset
  // can't produce an absurd number of buckets and a tiny one doesn't get a single bucket.
  // ~2 points per bucket if the points were uniformly spread. Finer than it sounds: the ring walk
  // below stops as soon as the answer is settled, so smaller buckets mean it stops sooner and with far
  // fewer candidates to sort — the dominant cost in the unbounded-radius case.
  const perAxis = Math.max(2, Math.min(160, Math.round(Math.cbrt(n / 2)) || 2));
  let size = spread / perAxis;
  // ...but never coarser than the search radius when there is one: a bucket wider than the radius makes
  // even the first ring scan points that can never qualify (measured: 1,105 ms vs 227 ms on the same
  // 62,500-cell x 2,000-point run with a 50 m radius). Floor it so a very small radius on a very large
  // property can't ask for an unreasonable number of buckets.
  if (searchRadius > 0 && Number.isFinite(searchRadius) && searchRadius < size) {
    size = Math.max(searchRadius, spread / 256);
  }
  const buckets = new Map();
  const key = (bx, by, bz) => `${bx},${by},${bz}`;
  for (let i = 0; i < n; i++) {
    const p = samplePoints[i];
    const k = key(Math.floor((p.x - xmin) / size), Math.floor((p.y - ymin) / size), Math.floor((p.z - zmin) / size));
    let arr = buckets.get(k);
    if (!arr) { arr = []; buckets.set(k, arr); }
    arr.push(p);
  }
  const nbx = Math.floor((xmax - xmin) / size) + 1;
  const nby = Math.floor((ymax - ymin) / size) + 1;
  const nbz = Math.floor((zmax - zmin) / size) + 1;
  return { size, xmin, ymin, zmin, xmax, ymax, zmax, nbx, nby, nbz, buckets, key };
}

// Returns a function (cx, cy, cz) => { value, nSamples, nHoles } | null (null = not enough samples /
// not enough distinct holes in range, i.e. "not estimated" — never a zero/extrapolated value).
//
// opts: { method, searchRadius, minSamples, maxSamples, minHoles, lengthWeight, restrictToDomain }
function makeCellEstimator(samplePoints, opts = {}) {
  const {
    method = "idw2", searchRadius = null, minSamples = 1, maxSamples = 16,
    minHoles = 1, lengthWeight = true, restrictToDomain = false,
  } = opts;
  const power = method === "idw3" ? 3 : method === "idw2" ? 2 : null; // null => nearest-neighbour
  const r2 = searchRadius != null ? searchRadius * searchRadius : null;
  const EXACT_D2 = 1e-6;
  const index = buildSampleIndex(samplePoints, searchRadius);

  // TASKS.csv #262 — a composite's own length is its declared support; weighting by length/d^p is the
  // standard length-weighted IDW. Missing/unknown length falls back to 1 (i.e. old behaviour) rather
  // than dropping the sample.
  const lenOf = (p) => (lengthWeight && p.length != null && p.length > 0 ? p.length : 1);

  return (cx, cy, cz) => {
    const dists = [];
    const consider = (p) => {
      const ddx = p.x - cx, ddy = p.y - cy, ddz = p.z - cz;
      const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
      if (r2 != null && d2 > r2) return;
      dists.push({ d2, value: p.value, hole_id: p.hole_id, len: lenOf(p), domain: p.domain ?? null });
    };

    if (index) {
      const b = index.size;
      const bx = Math.floor((cx - index.xmin) / b);
      const by = Math.floor((cy - index.ymin) / b);
      const bz = Math.floor((cz - index.zmin) / b);
      // Offsets that stay inside the populated bucket box. A grid cell can sit far outside the data
      // (padding, or a sparse property), and without this the walk spends its whole time looking up
      // buckets that cannot exist — the single biggest cost in the unbounded-radius case, since every
      // ring is O(ring^2) lookups.
      const loX = -bx, hiX = index.nbx - 1 - bx;
      const loY = -by, hiY = index.nby - 1 - by;
      const loZ = -bz, hiZ = index.nbz - 1 - bz;
      // Chebyshev distance from this query bucket to the nearest / furthest bucket that can hold data.
      const axisMin = (lo, hi) => (lo <= 0 && hi >= 0 ? 0 : Math.min(Math.abs(lo), Math.abs(hi)));
      const startRing = Math.max(axisMin(loX, hiX), axisMin(loY, hiY), axisMin(loZ, hiZ));
      const dataRing = Math.max(Math.abs(loX), Math.abs(hiX), Math.abs(loY), Math.abs(hiY), Math.abs(loZ), Math.abs(hiZ));
      const ringsForRadius = searchRadius != null ? Math.ceil(searchRadius / b) + 1 : Infinity;
      const maxRing = Math.min(dataRing, ringsForRadius);
      // Walk outward one Chebyshev ring at a time. After scanning every ring up to r, any point not yet
      // seen lies in a bucket at ring r+1 or beyond, hence at distance >= r * b from anywhere inside the
      // query's own bucket — so once the candidates in hand settle the answer within r * b, no later
      // ring can change it and the walk stops. That is what makes this exact rather than approximate,
      // while typically touching only a couple of rings.
      const visit = (ox, oy, oz) => {
        const arr = index.buckets.get(index.key(bx + ox, by + oy, bz + oz));
        if (arr) for (let i = 0; i < arr.length; i++) consider(arr[i]);
      };
      for (let ring = startRing; ring <= maxRing; ring++) {
        const x0 = Math.max(-ring, loX), x1 = Math.min(ring, hiX);
        const y0 = Math.max(-ring, loY), y1 = Math.min(ring, hiY);
        const z0 = Math.max(-ring, loZ), z1 = Math.min(ring, hiZ);
        for (let ox = x0; ox <= x1; ox++) {
          const onX = ox === -ring || ox === ring;
          for (let oy = y0; oy <= y1; oy++) {
            const onY = oy === -ring || oy === ring;
            if (onX || onY) {
              for (let oz = z0; oz <= z1; oz++) visit(ox, oy, oz);
            } else {
              if (-ring >= z0 && -ring <= z1) visit(ox, oy, -ring);
              if (ring !== -ring && ring >= z0 && ring <= z1) visit(ox, oy, ring);
            }
          }
        }
        const safeD2 = (ring * b) * (ring * b);
        if (settled(dists, safeD2, maxSamples, minSamples, minHoles, restrictToDomain)) break;
      }
    } else {
      for (let i = 0; i < samplePoints.length; i++) consider(samplePoints[i]);
    }

    if (dists.length < minSamples) return null;
    dists.sort((a, b) => a.d2 - b.d2);

    // TASKS.csv #260 — REAL domain-restricted search. "Honor domain" previously only stopped a single
    // composite from spanning two domains; the interpolation search itself was a plain Euclidean sphere
    // through every point regardless of geology, so grade was smeared out of a mineralised unit into
    // barren host across a hangingwall contact or a fault (diluting in-situ grade AND inflating shell
    // volume outward across the contact). With this on, the cell adopts the domain of its NEAREST
    // composite — a nearest-neighbour domain model, the simplest defensible way to assign a domain to
    // a point in space from downhole-only domain logging — and then only ever sees composites carrying
    // that same domain. A cell whose nearest composite has no logged domain is left un-estimated rather
    // than quietly falling back to the unrestricted search.
    let candidates = dists;
    if (restrictToDomain) {
      const cellDomain = dists[0].domain;
      if (cellDomain == null) return null;
      candidates = dists.filter((d) => d.domain === cellDomain);
      if (candidates.length < minSamples) return null;
    }
    const used = candidates.slice(0, maxSamples);

    // TASKS.csv #258 — minimum DISTINCT drillholes. minSamples counts sample points, and a single hole
    // composited at 2 m supplies ~25 of them inside a 50 m radius, so it can never express "at least
    // two holes must see this block" — the first sanity constraint any resource practitioner applies.
    const holes = new Set();
    for (let i = 0; i < used.length; i++) holes.add(used[i].hole_id);
    if (holes.size < minHoles) return null;

    let value;
    if (power == null) {
      value = used[0].value; // nearest-neighbour
    } else {
      const exact = used.find((s) => s.d2 < EXACT_D2);
      if (exact) {
        value = exact.value;
      } else {
        let wSum = 0, vSum = 0;
        used.forEach((s) => { const w = s.len / Math.pow(s.d2, power / 2); wSum += w; vSum += w * s.value; });
        value = wSum > 0 ? vSum / wSum : null;
      }
    }
    if (value == null) return null;
    return { value, nSamples: used.length, nHoles: holes.size };
  };
}

// TASKS.csv #292 — the ring walk's stopping rule. `safeD2` is the squared distance below which the
// candidate set is already complete (nothing unscanned can be nearer). The answer is settled once the
// samples that will actually be USED all sit inside that distance and every count constraint that
// could still change with more candidates is satisfied:
//   * we hold at least maxSamples candidates and the maxSamples-th nearest is inside safeD2 (any
//     further point is further away than all of them, so it could never enter the used set), and
//   * with a domain restriction, that must hold for the cell's own domain — which is itself decided by
//     the nearest candidate, so that nearest candidate must be inside safeD2 too.
// Conservative by construction: when it can't prove completeness it simply keeps walking, ending in the
// worst case at the same full scan the old code always did.
function settled(dists, safeD2, maxSamples, minSamples, minHoles, restrictToDomain) {
  if (safeD2 <= 0 || !dists.length) return false;
  const need = Math.max(maxSamples, minSamples, minHoles, 1);
  // kth smallest d2 among the entries passing `keep`, or Infinity if there aren't k of them. A bounded
  // insertion buffer rather than a sort: this runs once per ring per cell, and sorting the whole
  // candidate list each time was itself a measurable share of the run.
  const kthAndNearest = (keep) => {
    const top = []; // ascending, at most `need` entries
    let nearest = Infinity, count = 0;
    for (let i = 0; i < dists.length; i++) {
      const d = dists[i];
      if (keep && !keep(d)) continue;
      count++;
      if (d.d2 < nearest) nearest = d.d2;
      if (top.length < need) {
        let j = top.length - 1;
        top.push(d.d2);
        while (j >= 0 && top[j] > d.d2) { top[j + 1] = top[j]; j--; }
        top[j + 1] = d.d2;
      } else if (d.d2 < top[need - 1]) {
        let j = need - 2;
        while (j >= 0 && top[j] > d.d2) { top[j + 1] = top[j]; j--; }
        top[j + 1] = d.d2;
      }
    }
    return { kth: count >= need ? top[Math.min(maxSamples, need) - 1] : Infinity, nearest, count };
  };

  const all = kthAndNearest(null);
  if (all.nearest > safeD2) return false; // even the nearest sample isn't settled yet
  if (restrictToDomain) {
    let dom = null;
    for (let i = 0; i < dists.length; i++) if (dists[i].d2 === all.nearest) { dom = dists[i].domain; break; }
    if (dom == null) return true; // this cell gets rejected outright; more candidates can't change that
    const inDom = kthAndNearest((d) => d.domain === dom);
    return inDom.kth <= safeD2;
  }
  return all.kth <= safeD2;
}

// TASKS.csv #142 — dense-grid sibling of estimateBlockModel for the numeric (grade-shell) implicit
// model. Same bounds/cellSize/method/search options and the same per-cell math, but returns EVERY grid
// position as a flat Float64Array indexed [ix + nx * (iy + ny * iz)] (x fastest), with un-estimated
// cells (too few samples inside the search radius) set to NaN. marchingCubes.js needs a full regular
// lattice — a sparse cell list has no way to say "this position was skipped" vs. "this position is
// zero grade", and a false zero at the edge of the estimated region would show up as a fake
// grade-shell wall there. Node positions are the CELL CENTERS (bounds.xmin + (ix + 0.5) * dx, etc.),
// identical to estimateBlockModel's cell centers, so a grade shell extracted from this grid sits
// exactly where the equivalent block model's cutoff boundary would.
export function estimateDenseGrid(samplePoints, opts) {
  const { bounds, cellSize, method = "idw2", searchRadius = null, minSamples = 1, maxSamples = 16, minHoles = 1, lengthWeight = true, restrictToDomain = false } = opts;
  const { dx, dy, dz, nx, ny, nz, totalBlocks } = gridDims(bounds, cellSize);
  const values = new Float64Array(totalBlocks).fill(NaN);
  const origin = { x: bounds.xmin + 0.5 * dx, y: bounds.ymin + 0.5 * dy, z: bounds.zmin + 0.5 * dz };
  const out = { nx, ny, nz, bounds, cellSize: { dx, dy, dz }, origin, values, estimated: 0, skipped: totalBlocks, singleHoleCells: 0 };
  if (!samplePoints.length) return out;

  const est = makeCellEstimator(samplePoints, { method, searchRadius, minSamples, maxSamples, minHoles, lengthWeight, restrictToDomain });
  let estimated = 0;
  let singleHoleCells = 0;
  for (let iz = 0; iz < nz; iz++) {
    const cz = origin.z + iz * dz;
    for (let iy = 0; iy < ny; iy++) {
      const cy = origin.y + iy * dy;
      const rowBase = nx * (iy + ny * iz);
      for (let ix = 0; ix < nx; ix++) {
        const r = est(origin.x + ix * dx, cy, cz);
        if (!r) continue;
        if (r.nHoles === 1) singleHoleCells++;
        values[rowBase + ix] = r.value;
        estimated++;
      }
    }
  }
  out.estimated = estimated;
  out.skipped = totalBlocks - estimated;
  out.singleHoleCells = singleHoleCells;
  return out;
}
