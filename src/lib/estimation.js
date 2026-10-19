// TASKS.csv #117 — grade estimation into block models. Micromine-specialist AND Leapfrog-specialist
// audits both independently flagged this as the top gap: GeoStrix could import/display someone else's
// pre-built block model (voxel.js) but had no in-app engine to populate one FROM composited assays —
// the actual "resource estimation" step. Depends on downhole compositing (#118, implemented alongside
// this) as its input: estimation should run on regularized composites, not raw variable-length sample
// intervals, exactly like every real workflow (Micromine/Leapfrog/Datamine) does it.
//
// Originally two methods — nearest-neighbour and inverse-distance weighting — and NOT ordinary kriging (now added,
// #709: see the end of this note). Kriging needs a fitted variogram model (nugget/sill/range from an experimental
// variogram the user would build and fit interactively) as a genuine prerequisite step, not just a
// harder formula substituted in the same loop; shipping a kriging button without that would produce
// numbers that look like a real estimate but aren't backed by one, which is worse than not having the
// button. NN/IDW are complete, defensible estimation methods in their own right (IDW in particular is
// still routinely used for early-stage/scoping estimates). The variogram-modelling UI now exists (#147, the Variogram
// tool fits nugget / sill / range); TASKS.csv #709 adds ordinary kriging with it (method "ok", okEstimate below):
// point kriging at the block centre with the nearest maxSamples composites, the kriging variance reported per block.
import { MAX_BLOCKS, MAX_BLOCK_BUDGET, SUPPORT_COLORS, ESTIMATION_METHODS } from "./estimationMeta.js"; // #552; budget: #625
export { MAX_BLOCKS, SUPPORT_COLORS, ESTIMATION_METHODS };
import { pointOnTrace } from "./desurvey.js";
import { valueIn } from "./geochem.js";
import { experimentalVariogram, fitVariogramModel, suggestLagDistance, variogramModelValue } from "./variogram.js"; // #709

// Squared distance below which a query point counts as sitting ON a sample: every non-nearest-neighbour
// method here is an EXACT interpolator, i.e. it must return the sample's own value at the sample's
// position rather than a weighted average that happens to be near it.
const EXACT_D2 = 1e-6;

// Turn composited (or raw) downhole intervals into world-space sample points {x,y,z,value,hole_id,from,to}
// by desurveying each hole once and interpolating each interval's midpoint depth along the trace.
// Composites/intervals whose hole has no collar, or whose midpoint falls outside the hole's traced
// range, are skipped (not enough information to place them in 3D) — the caller is told how many were
// dropped (`dropped`, of which `beyondTrace` were deeper than the trace) so that isn't a silent gap.
// TASKS.csv #571 — "outside the traced range" was not actually checked: pointOnTrace clamps a depth past the
// end of the trace onto the trace's last point, so a sample deeper than the hole's length (a typo, a wrong
// hole, a hole with no length whose trace stops at its last survey) was stacked at the bottom of the hole.
// `method` (TASKS.csv #135) is the project's selected desurvey method, forwarded verbatim to the
// injected desurveyHole — estimation samples MUST sit on the same trace the 3D view draws, or an
// isosurface silently stops lining up with the holes that produced it. Omitting it falls back to
// minimum curvature inside desurveyHole, i.e. the pre-#135 behaviour.
export function samplePointsFromIntervals(intervals, collars, survey, desurveyHole, method) {
  const collarById = new Map(collars.map((c) => [c.hole_id, c]));
  const surveyByHole = new Map();
  survey.forEach((s) => { if (!surveyByHole.has(s.hole_id)) surveyByHole.set(s.hole_id, []); surveyByHole.get(s.hole_id).push(s); });
  const traceCache = new Map();

  const points = [];
  let dropped = 0;
  let clamped = 0; // TASKS.csv #270 (LOW-4)
  let beyondTrace = 0; // TASKS.csv #571
  intervals.forEach((iv) => {
    if (iv.from == null || iv.to == null || iv.avgGrade == null) { dropped++; return; }
    if (!traceCache.has(iv.hole_id)) {
      const collar = collarById.get(iv.hole_id);
      traceCache.set(iv.hole_id, collar ? desurveyHole(collar, surveyByHole.get(iv.hole_id) || [], method) : null);
    }
    const trace = traceCache.get(iv.hole_id);
    if (!trace || !trace.length) { dropped++; return; }
    const mid = (iv.from + iv.to) / 2;
    if (mid > trace[trace.length - 1].md + 0.01 || mid < trace[0].md - 0.01) { dropped++; beyondTrace++; return; } // #571
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
  return { points, dropped, clamped, beyondTrace };
}

// Alternative entry point: sample directly from raw assay rows (no compositing) — useful for a quick
// look before setting up a composite length, or for sparse datasets where compositing would throw
// most of the data away. `assays` rows are {hole_id, from, to, values:{symbol:...}}.
export function samplePointsFromAssays(assays, symbol, unit, elementUnits, collars, survey, desurveyHole, method) {
  const intervals = assays
    .filter((a) => a.hole_id != null && a.from != null && a.to != null)
    .map((a) => ({ hole_id: a.hole_id, from: a.from, to: a.to, avgGrade: valueIn(a, symbol, unit, elementUnits) }))
    .filter((iv) => iv.avgGrade != null);
  return samplePointsFromIntervals(intervals, collars, survey, desurveyHole, method);
}

// Estimate grade into a regular block grid from `samplePoints`. Returns { cells, blocksEstimated,
// blocksSkipped } where cells are {x,y,z (center), dx,dy,dz, value, nSamples} ready to hand straight
// to store.jsx's addVoxelModel — same cell shape voxel.js's importers already produce, so the result
// renders through the exact same voxel viewer with no separate code path. A block with fewer than
// `minSamples` points inside its search radius gets NO cell at all (rather than an extrapolated/zero
// value) — an empty region of the grid should read as "not estimated", not "estimated at zero grade".
// TASKS.csv #650 — a structural trend turns the spherical search into an ellipsoid: samples and each query point
// are expressed in the trend's own axes and scaled (opts.trend = { basis: { major, semiMajor, minor }, scales }, from
// lib/trend.js trendBasis + trendSearchScales: major 1, so the search radius is the major semi-axis and the
// others are radius x int / max and radius x min / max). Distances, and therefore the neighbour search, the
// IDW weights and the MLS fit, all happen in that frame; blocks stay on their real grid.
function trendFrame(trend, center) {
  if (!trend?.basis || !trend?.scales) return null;
  const { major: a, semiMajor: b, minor: c } = trend.basis, s = trend.scales;
  return (x, y, z) => {
    const dx = x - center.x, dy = y - center.y, dz = z - center.z;
    return [(dx * a.x + dy * a.y + dz * a.z) * s.major, (dx * b.x + dy * b.y + dz * b.z) * s.semiMajor, (dx * c.x + dy * c.y + dz * c.z) * s.minor];
  };
}
// TASKS.csv #709 — the variogram ordinary kriging uses: the one given (nugget, sill, range), or one fitted to these
// composites (omnidirectional, lag = median nearest-sample distance, 12 lags). `pts` are already in the search frame
// (after a trend's warp), so a fitted range is the range along the trend's major axis.
function resolveVariogram(pts, given, cellSize) {
  const v = given || {};
  const model = v.model || "spherical";
  if ([v.nugget, v.sill, v.range].every((x) => Number.isFinite(x)) && v.sill > 0 && v.range > 0) return { model, nugget: Math.min(Math.max(0, v.nugget), v.sill), sill: v.sill, range: v.range, fitted: false };
  const lag = suggestLagDistance(pts) || cellSize?.dx || 10;
  const ev = experimentalVariogram(pts, { lagDistance: lag, nLags: 12 });
  const fit = fitVariogramModel(ev.bins, { model });
  if (!fit || !(fit.sill > 0) || !(fit.range > 0)) throw new Error("A variogram could not be fitted to these composites (too few pairs at most lags). Enter the nugget, sill and range, or use the Variogram tool to choose them.");
  return { model, nugget: Math.min(Math.max(0, fit.nugget), fit.sill), sill: fit.sill, range: fit.range, fitted: true, lagM: +lag.toFixed(2) };
}

function withTrend(samplePoints, opts) {
  if (!opts.trend || !samplePoints.length) return { pts: samplePoints, q: null };
  const n = samplePoints.length;
  const center = samplePoints.reduce((m, p) => ({ x: m.x + p.x / n, y: m.y + p.y / n, z: m.z + p.z / n }), { x: 0, y: 0, z: 0 });
  const f = trendFrame(opts.trend, center);
  if (!f) return { pts: samplePoints, q: null };
  return { pts: samplePoints.map((p) => { const [x, y, z] = f(p.x, p.y, p.z); return { ...p, x, y, z }; }), q: f };
}

export function estimateBlockModel(samplePoints, opts) {
  const { bounds, cellSize, method = "idw2", searchRadius = null, minSamples = 1, maxSamples = 16, minHoles = 1, maxPerHole = 0, lengthWeight = true, restrictToDomain = false } = opts;
  const { dx, dy, dz, nx, ny, nz, totalBlocks } = gridDims(bounds, cellSize, opts.maxBlocks); // maxBlocks: #626
  if (!samplePoints.length) return { cells: [], blocksEstimated: 0, blocksSkipped: totalBlocks, singleHoleCells: 0 };

  // TASKS.csv #709 — kriging needs a variogram (resolveVariogram), in the same frame the search works in
  const tw0 = method === "ok" ? withTrend(samplePoints, opts) : null;
  const variogram = method === "ok" ? resolveVariogram(tw0.pts, opts.variogram, cellSize) : null;
  const estOpts = { method, searchRadius, minSamples, maxSamples, minHoles, maxPerHole, lengthWeight, restrictToDomain, variogram };
  // TASKS.csv #91/#92 — support classification is opt-in and OFF by default: it widens the neighbour
  // search and adds per-cell work, so it must never be paid for by a caller that didn't ask. `bracketTol`
  // is half a cell, so bracketing has to be real at the scale the block model is drawn at.
  const tw = tw0 || withTrend(samplePoints, opts); // #650
  const est0 = makeCellEstimator(tw.pts, { ...estOpts, support: !!opts.support, bracketTol: Math.min(dx, dy, dz) / 2 });
  const est = tw.q ? (x, y, z) => est0(...tw.q(x, y, z)) : est0;
  const wantSupport = !!opts.support;
  // TASKS.csv #661 — opts.columns: write typed columns (the worker transfers them) instead of one object per block
  const asColumns = !!opts.columns;
  const cells = asColumns ? null : [];
  let n = 0;
  const cap = asColumns ? totalBlocks : 0;
  const col = asColumns ? {
    x: new Float64Array(cap), y: new Float64Array(cap), z: new Float64Array(cap), value: new Float64Array(cap),
    nSamples: new Uint16Array(cap), nHoles: new Uint16Array(cap),
    ...(wantSupport ? { support: new Uint8Array(cap).fill(255), supportIndex: new Float64Array(cap), nearestSampleM: new Float64Array(cap) } : {}),
    ...(method === "ok" ? { kv: new Float64Array(cap) } : {}), // #709 — kriging variance
  } : null;
  let blocksSkipped = 0;
  let singleHoleCells = 0; // TASKS.csv #258 — surfaced in the run summary
  let dominatedCells = 0; // TASKS.csv #676 — 2+ holes, but one carries >= 95 % of the weight
  const mlsCounts = { full: 0, reduced: 0, idw: 0 }; // TASKS.csv #516
  const okCounts = { kriged: 0, exact: 0, negativeWeights: 0, fallbackIdw: 0 }; // TASKS.csv #709
  const supportCounts = { interpolated: 0, extrapolated: 0, unsupported: 0, searchLimited: 0 };

  for (let iz = 0; iz < nz; iz++) {
    const cz = bounds.zmin + (iz + 0.5) * dz;
    for (let iy = 0; iy < ny; iy++) {
      const cy = bounds.ymin + (iy + 0.5) * dy;
      for (let ix = 0; ix < nx; ix++) {
        const cx = bounds.xmin + (ix + 0.5) * dx;
        const r = est(cx, cy, cz);
        if (!r) { blocksSkipped++; if (wantSupport) supportCounts.unsupported++; continue; } // no estimate IS the unsupported class
        if (r.nHoles === 1) singleHoleCells++;
        else if (r.domShare >= DOMINANT_SHARE) dominatedCells++; // #676
        if (r.mlsMode) mlsCounts[r.mlsMode]++; // #516
        if (r.okMode) { okCounts[r.okMode]++; if (r.okNeg) okCounts.negativeWeights++; } // #709
        if (r.support) {
          supportCounts[r.support.cls]++;
          if (r.support.cls === SUPPORT_EXTRAPOLATED && r.support.dataBracketed) supportCounts.searchLimited++;
        }
        if (asColumns) {
          col.x[n] = cx; col.y[n] = cy; col.z[n] = cz; col.value[n] = r.value; col.nSamples[n] = r.nSamples; col.nHoles[n] = r.nHoles;
          if (col.kv) col.kv[n] = r.kv ?? NaN;
          if (r.support) { col.support[n] = SUPPORT_CODES[r.support.cls]; col.supportIndex[n] = r.support.index; col.nearestSampleM[n] = r.support.nearest; }
          n++;
          continue;
        }
        const cell = { x: cx, y: cy, z: cz, dx, dy, dz, value: r.value, nSamples: r.nSamples, nHoles: r.nHoles };
        if (r.kv != null) cell.kv = r.kv; // #709
        if (r.support) {
          cell.support = r.support.cls;
          cell.supportIndex = r.support.index;
          cell.nearestSampleM = r.support.nearest;
        }
        cells.push(cell);
      }
    }
    opts.onProgress?.((iz + 1) / nz); // #520 — once per z-slice (the estimation worker relays it)
  }
  // #661 — trimmed to the blocks actually estimated (slice copies, so the spare capacity is freed with the originals)
  const columns = asColumns ? Object.fromEntries([["n", n], ["dx", dx], ["dy", dy], ["dz", dz], ...Object.entries(col).map(([k, a]) => [k, a.slice(0, n)])]) : null;
  return { ...(asColumns ? { columns } : { cells }), blocksEstimated: asColumns ? n : cells.length, blocksSkipped, singleHoleCells, dominatedCells, grid: { nx, ny, nz }, supportCounts: wantSupport ? supportCounts : null, mlsCounts: method === "mls1" ? mlsCounts : null, ...(method === "ok" ? { okCounts, variogram } : {}) };
}

// TASKS.csv #142 — the grid sizing + per-cell NN/IDW math shared by estimateBlockModel (sparse cell
// list, for block models) and estimateDenseGrid (dense array, for isosurface extraction). Factored out
// so the two entry points can't drift apart: the numeric grade-shell tool must produce the SAME grade
// at a given grid position that the block-model tool would, or the two would disagree about where a
// cutoff envelope sits.
function gridDims(bounds, cellSize, maxBlocks = MAX_BLOCKS) {
  const limit = Math.min(MAX_BLOCK_BUDGET, Math.max(1, Number(maxBlocks) || MAX_BLOCKS)); // #625
  const dx = Math.max(0.01, cellSize.dx), dy = Math.max(0.01, cellSize.dy), dz = Math.max(0.01, cellSize.dz);
  const nx = Math.max(1, Math.round((bounds.xmax - bounds.xmin) / dx));
  const ny = Math.max(1, Math.round((bounds.ymax - bounds.ymin) / dy));
  const nz = Math.max(1, Math.round((bounds.zmax - bounds.zmin) / dz));
  const totalBlocks = nx * ny * nz;
  if (totalBlocks > limit) {
    throw new Error(`Block grid would be ${totalBlocks.toLocaleString()} blocks (${nx}×${ny}×${nz}) — over the ${limit.toLocaleString()}-block limit kept for a responsive in-app estimation pass. Use a larger cell size or a smaller extent.`);
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

// TASKS.csv #642 — which candidates an estimate uses. With minHoles > 1 no single hole may supply more than
// ceil(maxSamples / minHoles) of them (the "max samples per hole" every resource package has). #258's check used to
// count distinct holes among the nearest maxSamples only — and beside a hole composited at 2 m all 16 nearest come
// from that one hole, so every node near the data was rejected: Woodjam Cu (50 m cells, 150 m search, min holes 2)
// estimated 116 of 122,317 nodes, all isolated, and the grade shell "never crossed" 300 ppm although half the
// composites are above it. Counting holes anywhere in the radius instead would have passed those nodes with a
// value still taken from one hole — exactly what #258 exists to stop. `candidates` must be sorted by distance.
// TASKS.csv #676 — a block whose dominant hole carries at least this share of the weight is effectively one hole's
export const DOMINANT_SHARE = 0.95;
// TASKS.csv #709 — maxPerHole: an explicit "max samples per hole" (Micromine's search setting); 0 / missing = only the
// implicit cap from min distinct holes (#642). The smaller of the two applies.
export function perHoleCap(maxSamples, minHoles, maxPerHole = 0) {
  let cap = minHoles > 1 ? Math.max(1, Math.ceil(maxSamples / minHoles)) : Infinity;
  if (maxPerHole > 0) cap = Math.min(cap, Math.floor(maxPerHole));
  return cap;
}
export function selectUsed(candidates, maxSamples, minHoles = 1, maxPerHole = 0) {
  const cap = perHoleCap(maxSamples, minHoles, maxPerHole);
  if (cap === Infinity) return candidates.slice(0, maxSamples);
  const used = [], perHole = new Map();
  for (let i = 0; i < candidates.length && used.length < maxSamples; i++) {
    const d = candidates[i], n = perHole.get(d.hole_id) || 0;
    if (n >= cap) continue;
    perHole.set(d.hole_id, n + 1);
    used.push(d);
  }
  return used;
}

// TASKS.csv #91/#92 — the neighbour search (spatial index + Chebyshev ring walk + the `settled`
// stopping rule) factored out of makeCellEstimator so the support classifier can reuse the EXACT same
// neighbourhood the estimator used. This is pure code motion out of makeCellEstimator: it returns the
// candidate list sorted by squared distance, and every constraint decision (minSamples, the domain
// restriction, maxSamples truncation, minHoles) stays with the caller, unchanged. Two consumers seeing
// different neighbourhoods would make the support class a statement about a different estimate than
// the one actually reported, which is precisely the sort of quiet disagreement #257/#258 were about.
//
// Returns (cx, cy, cz) => Array<{ d2, value, hole_id, len, domain }> sorted ascending by d2.
function makeNeighbourGatherer(samplePoints, opts = {}) {
  const { searchRadius = null, minSamples = 1, maxSamples = 16, minHoles = 1, maxPerHole = 0, lengthWeight = true, restrictToDomain = false } = opts;
  const r2 = searchRadius != null ? searchRadius * searchRadius : null;
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
      // `p` is carried by REFERENCE (not copied coordinates) so the moving-least-squares fit and the
      // support classifier can see each sample's position without making the hot loop allocate more.
      dists.push({ d2, value: p.value, hole_id: p.hole_id, len: lenOf(p), domain: p.domain ?? null, p });
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
        if (settled(dists, safeD2, maxSamples, minSamples, minHoles, restrictToDomain, maxPerHole)) break;
      }
    } else {
      for (let i = 0; i < samplePoints.length; i++) consider(samplePoints[i]);
    }

    dists.sort((a, b) => a.d2 - b.d2);
    return dists;
  };
}

// Returns a function (cx, cy, cz) => { value, nSamples, nHoles } | null (null = not enough samples /
// not enough distinct holes in range, i.e. "not estimated" — never a zero/extrapolated value).
//
// opts: { method, searchRadius, minSamples, maxSamples, minHoles, lengthWeight, restrictToDomain }
function makeCellEstimator(samplePoints, opts = {}) {
  const {
    method = "idw2", minSamples = 1, maxSamples = 16, minHoles = 1, maxPerHole = 0, restrictToDomain = false,
  } = opts;
  const power = methodPower(method); // null => nearest-neighbour or MLS (handled below)
  // TASKS.csv #91/#92 — when support classification is asked for, it is computed from THIS SAME
  // neighbour search rather than from a second pass. Two passes cost ~2.8x the un-classified run
  // (measured 642 ms -> 1,808 ms on a 40,664-node / 5,000-sample grid); fusing them brings it to ~1.7x,
  // and it also removes any possibility of the class describing a different neighbourhood than the value
  // it is attached to. The gather is widened to `bracketMax` so `dataBracketed` has a deterministic
  // neighbourhood to look at — a superset, so the nearest-maxSamples used set, and therefore every
  // estimated value, is bit-for-bit identical either way (asserted in verification).
  const wantSupport = !!opts.support;
  const bracketTol = opts.bracketTol || 0;
  const bracketMax = Math.max(maxSamples, Math.min(64, maxSamples * 4));
  const gather = makeNeighbourGatherer(samplePoints, wantSupport ? { ...opts, maxSamples: bracketMax } : opts);

  const shareIds = [], shareW = []; // #676 — scratch for the dominant-hole share, reused across blocks
  return (cx, cy, cz) => {
    const dists = gather(cx, cy, cz);
    if (dists.length < minSamples) return null;

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
    const used = selectUsed(candidates, maxSamples, minHoles, maxPerHole); // #642 — per-hole cap when minHoles > 1

    // TASKS.csv #258 — minimum DISTINCT drillholes. minSamples counts sample points, and a single hole
    // composited at 2 m supplies ~25 of them inside a 50 m radius, so it can never express "at least
    // two holes must see this block" — the first sanity constraint any resource practitioner applies.
    const holes = new Set();
    for (let i = 0; i < used.length; i++) holes.add(used[i].hole_id);
    if (holes.size < minHoles) return null;

    let value, mlsMode = null, okRes = null;
    if (method === "nn") {
      value = used[0].value; // nearest-neighbour
    } else {
      const exact = used.find((s) => s.d2 < EXACT_D2);
      if (exact) {
        value = exact.value; // every non-NN method here is an EXACT interpolator at a sample position
      } else if (method === "mls1") {
        // TASKS.csv #516 — rank-deficient neighbourhoods (every sample on one section plane, or one line) used to
        // fall back to IDW² silently; now the trend is fitted inside the samples' own plane / line, and only a
        // truly degenerate neighbourhood falls back — counted either way (mlsMode) for the run summary.
        const m = mlsLinear(used, cx, cy, cz);
        if (m) { value = m.value; mlsMode = m.rank === 3 ? "full" : "reduced"; }
        else { value = idwValue(used, 2); mlsMode = "idw"; }
      } else if (method === "ok") {
        // TASKS.csv #709 — a singular system (two composites at one position with no nugget) falls back to IDW2, counted
        const k = okEstimate(used, cx, cy, cz, opts.variogram);
        if (k) { value = k.value; okRes = k; } else { value = idwValue(used, 2); okRes = { fallback: true }; }
      } else {
        value = idwValue(used, power);
      }
    }
    if (value == null || !Number.isFinite(value)) return null;
    const out = { value, nSamples: used.length, nHoles: holes.size };
    // TASKS.csv #676 — passing "min distinct holes" says nothing about how much the second hole counts: 1 m from hole A
    // with hole B 60 m away, B's eight samples carried 0.09 % of the IDW weight. The dominant hole's share of the
    // weight (the method's own distance weights; MLS uses IDW2's; NN and an exact hit are one sample) is reported.
    if (holes.size > 1) {
      let share = 1;
      if (method !== "nn" && !used.some((u) => u.d2 < EXACT_D2)) {
        // at most maxSamples entries: per-hole sums in two small reused arrays, no Map per block
        const pw = method === "mls1" ? 2 : power;
        let tot = 0, nh = 0;
        for (let i = 0; i < used.length; i++) {
          const w = used[i].len / Math.pow(used[i].d2, pw / 2), h = used[i].hole_id;
          tot += w;
          let k = 0; while (k < nh && shareIds[k] !== h) k++;
          if (k === nh) { shareIds[nh] = h; shareW[nh] = 0; nh++; }
          shareW[k] += w;
        }
        let top = 0; for (let k = 0; k < nh; k++) if (shareW[k] > top) top = shareW[k];
        share = tot > 0 ? top / tot : 1;
      }
      out.domShare = share;
    }
    if (mlsMode) out.mlsMode = mlsMode; // #516
    if (method === "ok") { // #709 — an exact hit has no kriging error at that point
      if (!okRes) { out.okMode = "exact"; out.kv = 0; }
      else if (okRes.fallback) out.okMode = "fallbackIdw";
      else { out.okMode = "kriged"; out.kv = okRes.kv; if (okRes.negative) out.okNeg = true; }
    }
    if (wantSupport) out.support = supportFrom(candidates, used, holes, cx, cy, cz, bracketTol, bracketMax, opts.searchRadius);
    return out;
  };
}

// TASKS.csv #91/#92 — the classification itself, shared by makeCellEstimator's fused path and by the
// standalone makeSupportClassifier (which exists so a mesh's VERTICES can be classified after the fact,
// where there is no grid pass to fuse into). `candidates` is the sorted in-radius list, `used` its
// nearest-maxSamples prefix — i.e. exactly the samples that produced the estimate.
function supportFrom(candidates, used, holes, cx, cy, cz, bracketTol, bracketMax, searchRadius) {
  let anyNegX = false, anyPosX = false, anyNegY = false, anyPosY = false, anyNegZ = false, anyPosZ = false;
  const allHoles = new Set();
  const wide = candidates.length > bracketMax ? candidates.slice(0, bracketMax) : candidates;
  for (let i = 0; i < wide.length; i++) {
    const p = wide[i].p;
    const ox = p.x - cx, oy = p.y - cy, oz = p.z - cz;
    if (ox < -bracketTol) anyNegX = true; else if (ox > bracketTol) anyPosX = true;
    if (oy < -bracketTol) anyNegY = true; else if (oy > bracketTol) anyPosY = true;
    if (oz < -bracketTol) anyNegZ = true; else if (oz > bracketTol) anyPosZ = true;
    allHoles.add(wide[i].hole_id);
  }
  const dataBracketed = anyNegX && anyPosX && anyNegY && anyPosY && anyNegZ && anyPosZ && allHoles.size >= 2;

  let negX = false, posX = false, negY = false, posY = false, negZ = false, posZ = false;
  let octMask = 0;
  for (let i = 0; i < used.length; i++) {
    const p = used[i].p;
    const ox = p.x - cx, oy = p.y - cy, oz = p.z - cz;
    if (ox < -bracketTol) negX = true; else if (ox > bracketTol) posX = true;
    if (oy < -bracketTol) negY = true; else if (oy > bracketTol) posY = true;
    if (oz < -bracketTol) negZ = true; else if (oz > bracketTol) posZ = true;
    octMask |= 1 << ((ox >= 0 ? 1 : 0) | (oy >= 0 ? 2 : 0) | (oz >= 0 ? 4 : 0));
  }
  let nOctants = 0;
  for (let b = 0; b < 8; b++) if (octMask & (1 << b)) nOctants++;
  const bracketed = { x: negX && posX, y: negY && posY, z: negZ && posZ };
  // Two distinct holes is part of the definition, not an extra constraint: one hole is a line, and a
  // line cannot bracket a point in 3-space no matter how many composites are strung along it.
  const isInterp = bracketed.x && bracketed.y && bracketed.z && holes.size >= 2;
  const nearest = Math.sqrt(used[0].d2);
  return {
    cls: isInterp ? SUPPORT_INTERPOLATED : SUPPORT_EXTRAPOLATED,
    code: isInterp ? 2 : 1,
    nearest, nSamples: used.length, nHoles: holes.size, nOctants, bracketed, dataBracketed,
    nHolesWide: allHoles.size, nWide: wide.length,
    index: supportIndex({ nearest, nHoles: holes.size, nOctants, searchRadius }),
  };
}

// ---------------------------------------------------------------------------------------------
// TASKS.csv #91 / #92 — data-support classification.
//
// #91 asks every estimated region to say which of three things it is:
//   INTERPOLATED — the position is BRACKETED by data: the informing composites lie on BOTH sides of it
//                  along all three axes, and come from at least two distinct drillholes. This is the
//                  only class where the estimate is an interpolation in the literal sense.
//   EXTRAPOLATED — an estimate WAS produced (samples were in range and every constraint passed), but
//                  the data all lie to one side: the value is being carried outward from the data, not
//                  between it. Everything below the deepest intercept, and everything outboard of the
//                  last hole in a section, lands here.
//   UNSUPPORTED  — no estimate at all: too few samples, or too few distinct holes, inside the search
//                  radius. Already how the estimator behaves (it returns null rather than a zero) —
//                  this just gives that state a name so it can be counted and drawn.
//
// This generalises the two findings the NI 43-101/QP review (#257, #258) landed. #257 established that
// a grade shell can close against the SEARCH-RADIUS WALL and still report a confident watertight
// tonnage; #258 that a huge share of blocks can be informed by a single hole (88% of blocks on the real
// Harry Property dataset). Both are special cases of the same thing: the output looks equally confident
// everywhere, while the data behind it is not. Classifying every cell, and reporting the split, makes
// that visible for the whole model rather than only at the shell boundary.
//
// WHY AXIS BRACKETING, and its honest limits. The bracket test is "is there a sample with a negative
// offset AND a sample with a positive offset, on each of x, y, z". That is a deliberately conservative
// approximation of the convex-hull test #91's notes describe: hull containment is the exact statement,
// but an exact 3-D hull test per cell (240 candidate separating planes for a 16-point neighbourhood) is
// far too expensive to run at MAX_BLOCKS, and axis bracketing is strictly WEAKER — every hull-interior
// point is axis-bracketed, so this can call a point interpolated that a hull test would not, but never
// the reverse. It is also grid-axis dependent, which for a rotated deposit means it under-reports
// "interpolated" rather than over-reports it. Under-reporting support is the safe direction to err.
//
// `bracketTol` guards the case that would otherwise be a lie: samples down ONE near-vertical hole have
// tiny, sign-random x/y offsets, and a naive sign test would call a cell alongside that hole "bracketed"
// on the strength of centimetre-scale survey wobble. An offset must exceed bracketTol on an axis to
// count as bracketing it — callers pass half the cell size, so bracketing has to be real at the scale
// the model is actually drawn at.
export const SUPPORT_INTERPOLATED = "interpolated";
export const SUPPORT_EXTRAPOLATED = "extrapolated";
export const SUPPORT_UNSUPPORTED = "unsupported";
// Green / amber / red, as the design doc asked for.
export const SUPPORT_CODES = { unsupported: 0, extrapolated: 1, interpolated: 2 };

// TASKS.csv #92 — the CONTINUOUS sibling of the 3-bucket classification above.
//
// NAMING, DELIBERATELY: this is the "Data Support Index", not a confidence interval, not a probability,
// and not an estimation variance. It is a geometric heuristic computed from three things the search
// neighbourhood actually knows — how far the nearest composite is, how many distinct holes informed the
// cell, and how well the samples surround it — combined as a geometric mean of three 0–1 sub-scores:
//
//   fDist  = 1 - (nearest sample distance / search radius),  clamped to [0,1]
//   fHoles = min(nHoles, 3) / 3
//   fGeom  = min(occupied octants, 6) / 6
//   index  = cbrt(fDist * fHoles * fGeom)
//
// A geometric mean, not an average, so that any single component going to zero takes the index with it:
// a cell 5 m from a composite but informed by one hole from one direction is NOT well supported, and an
// arithmetic mean would let its distance term hide that.
//
// What it is NOT, and must never be presented as: kriging variance. Ordinary kriging derives an
// estimation variance from a FITTED VARIOGRAM — a measured model of how the grade itself decorrelates
// with distance. Nothing here measures grade continuity at all; the index would return exactly the same
// number for a nuggety vein and a smoothly-zoned porphyry drilled on the same pattern. It answers "how
// much data is near this cell and how well does it surround it", which is a question about the DRILL
// PATTERN, not about the deposit. Labelling that as confidence would be exactly the overclaiming the QP
// review (#257–#270) spent its effort removing from this app. All UI copy must call it data support.
export function supportIndex({ nearest, nHoles, nOctants, searchRadius }) {
  const fDist = Number.isFinite(searchRadius) && searchRadius > 0
    ? Math.max(0, Math.min(1, 1 - nearest / searchRadius))
    : 1; // no bounded radius => distance carries no information here; say so rather than invent a scale
  const fHoles = Math.min(nHoles, 3) / 3;
  const fGeom = Math.min(nOctants, 6) / 6;
  const prod = fDist * fHoles * fGeom;
  return prod <= 0 ? 0 : Math.cbrt(prod);
}

// Returns (x, y, z) => { cls, code, nearest, nSamples, nHoles, nOctants, bracketed:{x,y,z}, index }.
// Takes the SAME opts object as makeCellEstimator so the classification describes the neighbourhood the
// estimate was actually built from — pass the estimator's own opts through verbatim, plus `bracketTol`.
export function makeSupportClassifier(samplePoints, opts = {}) {
  const {
    searchRadius = null, minSamples = 1, maxSamples = 16, minHoles = 1, maxPerHole = 0,
    restrictToDomain = false, bracketTol = 0,
  } = opts;
  // The WIDER neighbourhood used only for `dataBracketed` (see supportFrom). It must be an explicit,
  // bounded number, not "everything in the search radius": makeNeighbourGatherer's ring walk stops as
  // soon as the nearest `maxSamples` are provably settled, so extra candidates beyond that are an
  // artefact of which buckets the walk happened to touch — reading them would make dataBracketed depend
  // on bucket geometry rather than on the data. Caught in verification: a cell with all four holes
  // inside a 400 m search radius reported only one hole in its neighbourhood.
  const bracketMax = Math.max(maxSamples, Math.min(64, maxSamples * 4));
  const gather = makeNeighbourGatherer(samplePoints, { ...opts, maxSamples: bracketMax });
  const none = {
    cls: SUPPORT_UNSUPPORTED, code: 0, nearest: Infinity, nSamples: 0, nHoles: 0,
    nOctants: 0, bracketed: { x: false, y: false, z: false }, dataBracketed: false,
    nHolesWide: 0, nWide: 0, index: 0,
  };

  return (cx, cy, cz) => {
    const dists = gather(cx, cy, cz);
    if (dists.length < minSamples) return none;
    let candidates = dists;
    if (restrictToDomain) {
      const cellDomain = dists[0].domain;
      if (cellDomain == null) return none;
      candidates = dists.filter((d) => d.domain === cellDomain);
      if (candidates.length < minSamples) return none;
    }
    const used = selectUsed(candidates, maxSamples, minHoles, maxPerHole); // #642 — the estimator's own selection
    const holes = new Set();
    for (let i = 0; i < used.length; i++) holes.add(used[i].hole_id);
    if (holes.size < minHoles) return none;
    return supportFrom(candidates, used, holes, cx, cy, cz, bracketTol, bracketMax, searchRadius);
  };
}

// TASKS.csv #91 — one-line human summary of a classification tally, used verbatim in run notices and in
// the surface panel so the wording can't drift between them.
export function summarizeSupport(counts) {
  const total = (counts.interpolated || 0) + (counts.extrapolated || 0) + (counts.unsupported || 0);
  if (!total) return "no cells classified";
  const pct = (n) => `${Math.round((100 * (n || 0)) / total)}%`;
  let s = `${(counts.interpolated || 0).toLocaleString()} interpolated (${pct(counts.interpolated)}), `
    + `${(counts.extrapolated || 0).toLocaleString()} extrapolated (${pct(counts.extrapolated)}), `
    + `${(counts.unsupported || 0).toLocaleString()} unsupported (${pct(counts.unsupported)})`;
  if (counts.searchLimited) {
    s += `. Of the extrapolated cells, ${counts.searchLimited.toLocaleString()} DO have data surrounding them inside the search radius — the neighbourhood simply never reached it (every sample used came from nearer composites in fewer holes). Raising max samples, lengthening composites, or limiting samples per hole would convert those.`;
  }
  return s;
}

// TASKS.csv #87 — method table. Kept in one place so the estimator, the modal's dropdown and the
// parameter-provenance stamp can never disagree about what a stored `method` string means.
// Ordinary kriging ("ok") is here since TASKS.csv #709, with its variogram resolved up front (resolveVariogram).
const METHOD_IDS = new Set(ESTIMATION_METHODS.map((m) => m.id));
export function isEstimationMethod(id) { return METHOD_IDS.has(id); }
// TASKS.csv #709 — ordinary kriging at one point. Covariance C(h) = sill - gamma(h) (C(0) = sill: the nugget is a
// jump at h > 0). Solves the (n+1) x (n+1) system [C 1; 1' 0] [w; mu] = [c0; 1] by Gaussian elimination with
// partial pivoting (n <= maxSamples, so at most a few dozen unknowns). Returns { value, kv, negative } or null when
// the system is singular. kv = sill - sum(w c0) - mu: the kriging variance, in the grade's squared units.
export function okEstimate(used, cx, cy, cz, vg) {
  const n = used.length;
  if (!n) return null;
  if (n === 1) return { value: used[0].value, kv: Math.max(0, 2 * (vg.sill - covAt(Math.sqrt(used[0].d2), vg))), negative: false }; // w = 1, mu = c0 - sill
  const m = n + 1;
  const A = new Float64Array(m * m), b = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    const pi = used[i].p;
    for (let j = i; j < n; j++) {
      const pj = used[j].p;
      const c = i === j ? vg.sill : covAt(Math.hypot(pi.x - pj.x, pi.y - pj.y, pi.z - pj.z), vg);
      A[i * m + j] = c; A[j * m + i] = c;
    }
    A[i * m + n] = 1; A[n * m + i] = 1;
    b[i] = covAt(Math.sqrt(used[i].d2), vg);
  }
  A[n * m + n] = 0; b[n] = 1;
  const rhs = Float64Array.from(b);
  for (let col = 0; col < m; col++) {
    let piv = col, best = Math.abs(A[col * m + col]);
    for (let r = col + 1; r < m; r++) { const v = Math.abs(A[r * m + col]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-12 * vg.sill) return null;
    if (piv !== col) {
      for (let k = 0; k < m; k++) { const t = A[col * m + k]; A[col * m + k] = A[piv * m + k]; A[piv * m + k] = t; }
      const t = rhs[col]; rhs[col] = rhs[piv]; rhs[piv] = t;
    }
    const d = A[col * m + col];
    for (let r = col + 1; r < m; r++) {
      const f = A[r * m + col] / d;
      if (f === 0) continue;
      for (let k = col; k < m; k++) A[r * m + k] -= f * A[col * m + k];
      rhs[r] -= f * rhs[col];
    }
  }
  const x = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = rhs[r];
    for (let k = r + 1; k < m; k++) s -= A[r * m + k] * x[k];
    x[r] = s / A[r * m + r];
  }
  let value = 0, wc = 0, negative = false;
  for (let i = 0; i < n; i++) { value += x[i] * used[i].value; wc += x[i] * b[i]; if (x[i] < -1e-9) negative = true; }
  if (!Number.isFinite(value)) return null;
  return { value, kv: Math.max(0, vg.sill - wc - x[n]), negative };
}
function covAt(h, vg) { return h <= 0 ? vg.sill : vg.sill - variogramModelValue(h, vg); }

function methodPower(method) {
  return method === "idw3" ? 3 : method === "idw1" ? 1 : method === "idw2" ? 2 : null;
}

// Length-weighted inverse-distance. TASKS.csv #262 — weight is length / d^power.
function idwValue(used, power) {
  let wSum = 0, vSum = 0;
  for (let i = 0; i < used.length; i++) {
    const s = used[i];
    const w = s.len / Math.pow(s.d2, power / 2);
    wSum += w; vSum += w * s.value;
  }
  return wSum > 0 ? vSum / wSum : null;
}

// TASKS.csv #87 — moving least squares, degree 1: weighted-least-squares fit of v ≈ a + b·dx + c·dy +
// e·dz through the neighbourhood, using the SAME singular weights (length / d²) as IDW², evaluated at
// the cell centre (offsets are relative to it, so the answer is just `a`). Two properties that make
// this a genuinely different method rather than IDW with extra steps:
//   * it reproduces a linear grade trend EXACTLY, where IDW cannot (IDW's estimate is always a convex
//     combination of the samples, so it flattens a trend and puts a bullseye on every hole);
//   * singular weights make it an exact interpolator at a sample position, same as IDW.
// Returns null when the normal equations are singular — fewer than 4 samples, or a degenerate
// neighbourhood (all samples down one straight hole is the common real case), where a plane is not
// determined. The caller falls back to IDW² rather than emitting a fitted-looking number from an
// underdetermined system.
// The result is clamped to [min, max] of the samples used: an unclamped local plane will happily
// extrapolate a negative grade, or a grade above anything ever assayed, at the edge of a neighbourhood.
function mlsLinear(used, cx, cy, cz) {
  if (used.length < 4) return mlsReduced(used, cx, cy, cz); // #516 — too few for a 3D plane; maybe enough in-plane
  // Normal equations for the 4-parameter model, built directly (M is 4x4 symmetric).
  const M = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const rhs = [0, 0, 0, 0];
  let vMin = Infinity, vMax = -Infinity, scale = 0;
  for (let i = 0; i < used.length; i++) {
    const s = used[i];
    const p = s.p;
    const b = [1, p.x - cx, p.y - cy, p.z - cz];
    const w = s.len / s.d2;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) M[r * 4 + c] += w * b[r] * b[c];
      rhs[r] += w * b[r] * s.value;
    }
    if (s.value < vMin) vMin = s.value;
    if (s.value > vMax) vMax = s.value;
    const m = Math.max(Math.abs(b[1]), Math.abs(b[2]), Math.abs(b[3]));
    if (m > scale) scale = m;
  }
  const sol = solve4(M, rhs, scale);
  if (sol == null) return mlsReduced(used, cx, cy, cz); // #516 — rank-deficient: fit within the samples' subspace
  const a = sol[0];
  if (!Number.isFinite(a)) return null;
  return { value: a < vMin ? vMin : a > vMax ? vMax : a, rank: 3 };
}

// TASKS.csv #516 — the linear trend fitted inside the samples' OWN subspace when they don't span 3D: holes drilled
// on one section give coplanar samples, and the 4-parameter fit is singular whatever the data. The weighted
// spread of the sample offsets is eigen-decomposed (3x3 Jacobi); axes with real spread are kept (a plane = 2, a
// line = 1) and the value is fitted as v = a + Σ g_k (offset · axis_k) — `a` is the trend's value at the cell's
// projection onto the samples' plane / line (nothing can be said about the trend across it). Rank 0 (all samples
// at one point) returns null -> IDW².
function mlsReduced(used, cx, cy, cz) {
  const n = used.length;
  if (n < 2) return null;
  let W = 0; const m = [0, 0, 0];
  const off = used.map((s) => [s.p.x - cx, s.p.y - cy, s.p.z - cz]);
  const w = used.map((s) => s.len / s.d2);
  for (let i = 0; i < n; i++) { W += w[i]; for (let k = 0; k < 3; k++) m[k] += w[i] * off[i][k]; }
  for (let k = 0; k < 3; k++) m[k] /= W;
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C[r * 3 + c] += w[i] * (off[i][r] - m[r]) * (off[i][c] - m[c]) / W;
  const { values, vectors } = jacobiEigen3(C);
  const top = Math.max(...values);
  if (!(top > 0)) return null;
  const axes = [0, 1, 2].filter((k) => values[k] > 1e-6 * top).sort((a, b) => values[b] - values[a]).slice(0, 2).map((k) => [vectors[k * 3], vectors[k * 3 + 1], vectors[k * 3 + 2]]);
  const k = axes.length, dim = k + 1;
  if (n < dim) return null;
  const M = new Array(dim * dim).fill(0), rhs = new Array(dim).fill(0);
  let vMin = Infinity, vMax = -Infinity, scale = 0;
  for (let i = 0; i < n; i++) {
    const b = [1, ...axes.map((ax) => off[i][0] * ax[0] + off[i][1] * ax[1] + off[i][2] * ax[2])];
    for (let r = 0; r < dim; r++) { for (let c = 0; c < dim; c++) M[r * dim + c] += w[i] * b[r] * b[c]; rhs[r] += w[i] * b[r] * used[i].value; }
    const v = used[i].value; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    for (let j = 1; j < dim; j++) scale = Math.max(scale, Math.abs(b[j]));
  }
  const sol = solveN(M, rhs, dim, scale);
  if (!sol || !Number.isFinite(sol[0])) return null;
  const a = sol[0];
  return { value: a < vMin ? vMin : a > vMax ? vMax : a, rank: k };
}

// symmetric 3x3 eigen-decomposition (cyclic Jacobi); vectors are the columns k -> vectors[k*3 .. k*3+2]
function jacobiEigen3(S) {
  const A = S.slice(), V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 50; sweep++) {
    const off = Math.abs(A[1]) + Math.abs(A[2]) + Math.abs(A[5]);
    if (off < 1e-14 * (Math.abs(A[0]) + Math.abs(A[4]) + Math.abs(A[8]) + 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = A[p * 3 + q];
      if (Math.abs(apq) < 1e-300) continue;
      const theta = (A[q * 3 + q] - A[p * 3 + p]) / (2 * apq);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = A[k * 3 + p], akq = A[k * 3 + q]; A[k * 3 + p] = c * akp - s * akq; A[k * 3 + q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = A[p * 3 + k], aqk = A[q * 3 + k]; A[p * 3 + k] = c * apk - s * aqk; A[q * 3 + k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = V[k * 3 + p], vkq = V[k * 3 + q]; V[k * 3 + p] = c * vkp - s * vkq; V[k * 3 + q] = s * vkp + c * vkq; }
    }
  }
  return { values: [A[0], A[4], A[8]], vectors: [V[0], V[3], V[6], V[1], V[4], V[7], V[2], V[5], V[8]] };
}

// Gaussian elimination with partial pivoting, n x n (n <= 3 here); singular -> null (same threshold idea as solve4)
function solveN(Min, rhs, n, scale) {
  const A = Min.slice(), b = rhs.slice();
  const tol = 1e-9 * Math.max(1, Math.abs(A[0])) * Math.max(1e-6, scale * scale);
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) { const v = Math.abs(A[r * n + col]); if (v > best) { best = v; piv = r; } }
    if (!(best > tol)) return null;
    if (piv !== col) {
      for (let c = 0; c < n; c++) { const t = A[col * n + c]; A[col * n + c] = A[piv * n + c]; A[piv * n + c] = t; }
      const t = b[col]; b[col] = b[piv]; b[piv] = t;
    }
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / A[col * n + col];
      for (let c = col; c < n; c++) A[r * n + c] -= f * A[col * n + c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = b[r]; for (let c = r + 1; c < n; c++) s -= A[r * n + c] * x[c]; x[r] = s / A[r * n + r]; }
  return x;
}

// Gaussian elimination with partial pivoting on a 4x4 system. `scale` is the neighbourhood's own
// spatial extent, used to set a singularity threshold that is meaningful in the system's units rather
// than an absolute epsilon (a 0.5 m cell grid and a 500 m one produce wildly different magnitudes).
function solve4(Min, rhs, scale) {
  const A = Min.slice(), b = rhs.slice();
  const tol = 1e-9 * Math.max(1, Math.abs(A[0])) * Math.max(1e-6, scale * scale);
  for (let col = 0; col < 4; col++) {
    let piv = col, best = Math.abs(A[col * 4 + col]);
    for (let r = col + 1; r < 4; r++) { const v = Math.abs(A[r * 4 + col]); if (v > best) { best = v; piv = r; } }
    if (!(best > tol)) return null;
    if (piv !== col) {
      for (let c = 0; c < 4; c++) { const t = A[col * 4 + c]; A[col * 4 + c] = A[piv * 4 + c]; A[piv * 4 + c] = t; }
      const t = b[col]; b[col] = b[piv]; b[piv] = t;
    }
    for (let r = col + 1; r < 4; r++) {
      const f = A[r * 4 + col] / A[col * 4 + col];
      if (f === 0) continue;
      for (let c = col; c < 4; c++) A[r * 4 + c] -= f * A[col * 4 + c];
      b[r] -= f * b[col];
    }
  }
  const x = [0, 0, 0, 0];
  for (let r = 3; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < 4; c++) s -= A[r * 4 + c] * x[c];
    x[r] = s / A[r * 4 + r];
  }
  return x;
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
function settled(dists, safeD2, maxSamples, minSamples, minHoles, restrictToDomain, maxPerHole = 0) {
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
  // #642 — with a per-hole cap the used set can reach past the nearest maxSamples (other holes' samples further
  // out), so it is settled only once the capped selection is full and its furthest member is inside safeD2.
  // Short of that the walk goes on to the search radius (where it stops anyway).
  const capped = perHoleCap(maxSamples, minHoles, maxPerHole) !== Infinity;
  // TASKS.csv #662 — the capped selection takes maxSamples entries from the distance-sorted list, so its furthest
  // member is never nearer than the maxSamples-th nearest candidate overall (nor than that within one domain, a
  // subset). While that one is outside safeD2 the capped set cannot be settled either: answer without the sort.
  // Measured before this: min holes 2 made a 976k-node grade-shell grid 2.7x and a 1M block model 4.3x slower.
  if (capped && all.kth > safeD2) return false;
  const cappedSettled = (keep) => {
    const used = selectUsed(dists.filter((d) => !keep || keep(d)).sort((a, b) => a.d2 - b.d2), maxSamples, minHoles, maxPerHole);
    return used.length >= maxSamples && used[used.length - 1].d2 <= safeD2;
  };
  if (capped && !restrictToDomain) return cappedSettled(null);
  if (restrictToDomain) {
    let dom = null;
    for (let i = 0; i < dists.length; i++) if (dists[i].d2 === all.nearest) { dom = dists[i].domain; break; }
    if (dom == null) return true; // this cell gets rejected outright; more candidates can't change that
    if (capped) return cappedSettled((d) => d.domain === dom);
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
  const { bounds, cellSize, method = "idw2", searchRadius = null, minSamples = 1, maxSamples = 16, minHoles = 1, maxPerHole = 0, lengthWeight = true, restrictToDomain = false } = opts;
  const { dx, dy, dz, nx, ny, nz, totalBlocks } = gridDims(bounds, cellSize, opts.maxBlocks); // maxBlocks: #625
  const values = new Float64Array(totalBlocks).fill(NaN);
  const origin = { x: bounds.xmin + 0.5 * dx, y: bounds.ymin + 0.5 * dy, z: bounds.zmin + 0.5 * dz };
  const out = { nx, ny, nz, bounds, cellSize: { dx, dy, dz }, origin, values, estimated: 0, skipped: totalBlocks, singleHoleCells: 0 };
  if (!samplePoints.length) return out;

  const twK = method === "ok" ? withTrend(samplePoints, opts) : null; // #709 — kriging works on grade shells too
  const variogram = method === "ok" ? resolveVariogram(twK.pts, opts.variogram, cellSize) : null;
  if (variogram) out.variogram = variogram;
  const estOpts = { method, searchRadius, minSamples, maxSamples, minHoles, maxPerHole, lengthWeight, restrictToDomain, variogram };
  // TASKS.csv #91/#92 — opt-in per-node data-support classification, OFF by default so no existing
  // caller pays for it. When on, the grid carries two extra parallel arrays on the same
  // [ix + nx * (iy + ny * iz)] indexing as `values`, so a mesh extracted from this grid can be coloured
  // by support with no second interpolation pass and no risk of the two disagreeing.
  const wantSupport = !!opts.support;
  const tw = twK || withTrend(samplePoints, opts); // #650
  const est0 = makeCellEstimator(tw.pts, { ...estOpts, support: wantSupport, bracketTol: Math.min(dx, dy, dz) / 2 });
  const est = tw.q ? (x, y, z) => est0(...tw.q(x, y, z)) : est0;
  const supportCode = wantSupport ? new Uint8Array(totalBlocks) : null; // 0 unsupported / 1 extrapolated / 2 interpolated
  const supportIdx = wantSupport ? new Float32Array(totalBlocks) : null;
  const supportCounts = { interpolated: 0, extrapolated: 0, unsupported: 0, searchLimited: 0 };
  let estimated = 0;
  let singleHoleCells = 0, dominatedCells = 0; // dominatedCells: #676
  for (let iz = 0; iz < nz; iz++) {
    const cz = origin.z + iz * dz;
    for (let iy = 0; iy < ny; iy++) {
      const cy = origin.y + iy * dy;
      const rowBase = nx * (iy + ny * iz);
      for (let ix = 0; ix < nx; ix++) {
        const cx = origin.x + ix * dx;
        const r = est(cx, cy, cz);
        if (wantSupport) {
          // A cell the estimator refused IS the unsupported class, by definition — no separate query.
          const sup = r && r.support;
          supportCode[rowBase + ix] = sup ? sup.code : 0;
          supportIdx[rowBase + ix] = sup ? sup.index : 0;
          supportCounts[sup ? sup.cls : SUPPORT_UNSUPPORTED]++;
          if (sup && sup.cls === SUPPORT_EXTRAPOLATED && sup.dataBracketed) supportCounts.searchLimited++;
        }
        if (!r) continue;
        if (r.nHoles === 1) singleHoleCells++;
        else if (r.domShare >= DOMINANT_SHARE) dominatedCells++; // #676
        values[rowBase + ix] = r.value;
        estimated++;
      }
    }
    opts.onProgress?.((iz + 1) / nz); // #520
  }
  out.estimated = estimated;
  out.skipped = totalBlocks - estimated;
  out.singleHoleCells = singleHoleCells;
  out.dominatedCells = dominatedCells; // #676
  out.supportCode = supportCode;
  out.supportIndex = supportIdx;
  out.supportCounts = wantSupport ? supportCounts : null;
  return out;
}
