// TASKS.csv #1416 (review #1352, Silvertip) — which blocks of a grid any data can reach: a block whose centre lies farther than the
// search radius from every point is never estimated, whatever the method (the neighbour search stops at the radius). On
// Silvertip's three pads ~1 km apart, 'Fit to the drilling' made a 2,287,801-block box of which ~37,000 could be estimated; the
// budget, the loop and the memory were all spent on the box. Now:
//   - the block model's budget counts the reachable blocks (its output holds only estimated blocks);
//   - both estimators skip the unreachable blocks without a neighbour search;
//   - the Grade estimation dialog counts the blocks within reach of the drill traces before the run (a superset of the
//     composites' reach: composites lie on the traces).
// With a structural trend the search is an ellipsoid whose semi-axes are at most the radius (trendSearchScales: major 1, the
// others smaller), so a sphere of the radius around each point contains it: the mask is never smaller than the truth.
// Pure: no DOM. Grid layout as estimation.js gridDims: n = round(extent / cell), centres at min + (i + 0.5) cell,
// index ix + nx * (iy + ny * iz).

export const REACH_MAX_GRID = 64e6; // one byte per block of the box: 64 MB at most; past that the cell is too small for the box

export function gridShape(bounds, cell) {
  const c = typeof cell === "number" ? { dx: cell, dy: cell, dz: cell } : cell;
  const dx = Math.max(0.01, c.dx), dy = Math.max(0.01, c.dy), dz = Math.max(0.01, c.dz);
  const nx = Math.max(1, Math.round((bounds.xmax - bounds.xmin) / dx));
  const ny = Math.max(1, Math.round((bounds.ymax - bounds.ymin) / dy));
  const nz = Math.max(1, Math.round((bounds.zmax - bounds.zmin) / dz));
  return { dx, dy, dz, nx, ny, nz, total: nx * ny * nz };
}

// points: [{x, y, z}] in the grid's frame. radius: metres (null / 0 / Infinity = every block is reachable).
// -> { total, reach, mask (Uint8Array, 1 = reachable) | null when every block is, tooBig: the box is over REACH_MAX_GRID }
// TASKS.csv #2418 — rz: a vertical reach shorter than the radius (a flat search, whose short axis is vertical: verticalReach below),
// so the mask is the flat ellipsoid around each point, not the sphere: a 195 m x 3 m search on WA uranium counted 2.5 M blocks
// reaching 195 m above and below the holes, where a few per cent of them can be estimated.
export function blockReach(points, bounds, cell, radius, { margin = 0, rz = null } = {}) {
  const g = gridShape(bounds, cell);
  const R = radius > 0 && Number.isFinite(radius) ? radius + Math.max(0, margin) : null;
  const Rz = R && rz > 0 && Number.isFinite(rz) ? Math.min(R, rz + Math.max(0, margin)) : R, kz = R ? R / Rz : 1;
  if (!R) return { ...g, reach: g.total, mask: null };
  if (g.total > REACH_MAX_GRID) return { ...g, reach: NaN, mask: null, tooBig: true };
  const { dx, dy, dz, nx, ny, nz } = g;
  const mask = new Uint8Array(g.total);
  const R2 = R * R * (1 + 1e-12) + 1e-12;
  const x0 = bounds.xmin + 0.5 * dx, y0 = bounds.ymin + 0.5 * dy, z0 = bounds.zmin + 0.5 * dz;
  const lo = (v, o, d) => Math.max(0, Math.ceil((v - o) / d - 1e-9)), hi = (v, o, d, n) => Math.min(n - 1, Math.floor((v - o) / d + 1e-9));
  for (let k = 0; k < points.length; k++) {
    const p = points[k];
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    const iz0 = lo(p.z - Rz, z0, dz), iz1 = hi(p.z + Rz, z0, dz, nz);
    for (let iz = iz0; iz <= iz1; iz++) {
      const ez = (z0 + iz * dz - p.z) * kz, r2z = R2 - ez * ez; // kz: #2418, the vertical stretched to the radius
      if (r2z < 0) continue;
      const ry = Math.sqrt(r2z), iy0 = lo(p.y - ry, y0, dy), iy1 = hi(p.y + ry, y0, dy, ny);
      for (let iy = iy0; iy <= iy1; iy++) {
        const ey = y0 + iy * dy - p.y, r2y = r2z - ey * ey;
        if (r2y < 0) continue;
        const rx = Math.sqrt(r2y), ix0 = lo(p.x - rx, x0, dx), ix1 = hi(p.x + rx, x0, dx, nx);
        if (ix1 >= ix0) { const base = nx * (iy + ny * iz); mask.fill(1, base + ix0, base + ix1 + 1); }
      }
    }
  }
  let reach = 0;
  for (let i = 0; i < mask.length; i++) reach += mask[i];
  return { ...g, reach, mask };
}

// the world radius a search reaches, given the trend's scales (all >= 1 along the minor axes, 1 along the major): the radius
export function worldReach(searchRadius, trend) {
  if (!(searchRadius > 0) || !Number.isFinite(searchRadius)) return null;
  const s = trend?.scales;
  const m = s ? Math.min(1, ...[s.major, s.semiMajor, s.minor].filter((v) => v > 0)) : 1;
  return searchRadius / m;
}

// #2418 — the vertical semi-axis of a search whose short axis is vertical (a flat search: dip 0), or null (any other shape keeps the
// sphere of worldReach, which contains it). trend: { basis, scales } as the engine takes it.
export function verticalReach(searchRadius, trend) {
  const s = trend?.scales, minor = trend?.basis?.minor;
  if (!(searchRadius > 0) || !Number.isFinite(searchRadius) || !s || !minor || !(s.minor > 1)) return null;
  if (Math.abs(minor.z) < 0.9999 || Math.min(s.major, s.semiMajor) < 1 - 1e-9) return null;
  return searchRadius / s.minor;
}

// polylines (desurveyed traces: [{x, y, z}]) -> points no more than `step` apart along them, and the margin that makes a reach
// computed from them a superset of the reach of any point on the lines (half the step)
export function densifyTraces(traces, step) {
  const out = [];
  for (const t of traces || []) {
    for (let i = 0; i < t.length; i++) {
      const a = t[i];
      out.push(a);
      const b = t[i + 1];
      if (!b) break;
      const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / step);
      for (let k = 1; k <= n; k++) { const f = k / (n + 1); out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f }); }
    }
  }
  return { points: out, margin: step / 2 };
}

// the smallest cell (from `from` up, 2 % steps rounded to 0.5 m, as cellToFit) whose reachable blocks fit the budget
// #2418 — dz: a fixed cell height (the fit then sizes the plan cell only)
// #2636 — opts.segments: `points` are trace segments (segmentReach)
export function cellToFitReach(points, bounds, radius, budget, from, opts = {}) {
  let c = Math.max(0.5, from);
  for (let i = 0; i < 400 && c < 1e5; i++) {
    const r = (opts.segments ? segmentReach : blockReach)(points, bounds, opts.dz > 0 ? { dx: c, dy: c, dz: opts.dz } : c, radius, opts); // segments: #2636
    if (!r.tooBig && r.reach <= budget) return c;
    // jump ahead by the cube root of the overshoot (reach scales about with 1 / cell^3), never less than one 2 % step
    const ratio = r.tooBig ? 8 : r.reach / budget;
    const root = opts.dz > 0 ? Math.sqrt(ratio) : Math.cbrt(ratio); // #2418 — with a fixed height the reach scales with 1 / cell^2
    const next = Math.max(Math.ceil((c * 1.02) * 2) / 2, Math.floor(c * root * 0.98 * 2) / 2);
    c = next > c ? next : c + 0.5;
  }
  return c;
}

// TASKS.csv #2636 — the dialog's count from the trace SEGMENTS, not from points densified along them. A point every half cell
// refilled nearly the same rows as its neighbour: 99,200 points for a 40 x 40 grid of 400 m holes, 1.1-1.2 s a pass and 4.8 s for
// the count and its cell fits (18 s in the dialog under load, Run disabled all the while). Each segment fills, row by row, the
// x interval of its capsule (every point within the radius of the segment), exactly: about 15 times fewer rows and no margin.
// rz (#2418): the capsule of a flat search is a capsule in a frame whose z is stretched by radius / rz.
// segments: [[ax, ay, az, bx, by, bz]]; margin widens the radius (the clipped traces of a restricting solid, lib/reachSolid.js).
// A desurveyed trace has a station every few metres (135 for a 400 m hole): a capsule per station pair repeats the rows of its
// neighbours, so each trace is first simplified (Douglas-Peucker) to within `tol` of itself; the caller widens the radius by `tol`.
export function simplifyTrace(t, tol) {
  const n = t?.length || 0;
  if (n <= 2 || !(tol > 0)) return t || [];
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop(), a = t[i0], b = t[i1];
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, L2 = ux * ux + uy * uy + uz * uz;
    let worst = -1, wd = tol * tol;
    for (let i = i0 + 1; i < i1; i++) {
      const p = t[i], wx = p.x - a.x, wy = p.y - a.y, wz = p.z - a.z;
      const f = L2 > 0 ? Math.min(1, Math.max(0, (wx * ux + wy * uy + wz * uz) / L2)) : 0;
      const ex = wx - f * ux, ey = wy - f * uy, ez = wz - f * uz, d2 = ex * ex + ey * ey + ez * ez;
      if (d2 > wd) { wd = d2; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([i0, worst], [worst, i1]); }
  }
  return t.filter((_, i) => keep[i]);
}

export function tracesToSegments(traces, tol = 0) {
  const out = [];
  for (const t0 of traces || []) {
    const t = simplifyTrace(t0, tol);
    if (t?.length === 1) { const a = t[0]; out.push([a.x, a.y, a.z, a.x, a.y, a.z]); continue; }
    for (let i = 0; i + 1 < (t?.length || 0); i++) { const a = t[i], b = t[i + 1]; out.push([a.x, a.y, a.z, b.x, b.y, b.z]); }
  }
  return out.filter((q) => q.every(Number.isFinite));
}

// the x interval [lo, hi] (relative to the segment's start, in the stretched frame) where the row (y = wy, z = wz from the start) is
// within R of the segment u; null when the row misses the capsule. The capsule is convex, so its row is one interval: the hull of
// the two end spheres' intervals and the cylinder's, the cylinder's clipped to the projection 0 <= t <= 1.
function capsuleRow(ux, uy, uz, L2, wy, wz, R2) {
  let lo = Infinity, hi = -Infinity;
  const sphere = (cy, cz, cx) => { const r2 = R2 - cy * cy - cz * cz; if (r2 >= 0) { const r = Math.sqrt(r2); if (cx - r < lo) lo = cx - r; if (cx + r > hi) hi = cx + r; } };
  sphere(wy, wz, 0); // the start
  if (L2 > 1e-18) {
    sphere(wy - uy, wz - uz, ux); // the end
    const k = wy * uy + wz * uz, q = wy * wy + wz * wz;
    const a = 1 - (ux * ux) / L2, b = (-2 * ux * k) / L2, c = q - (k * k) / L2 - R2;
    let s0, s1;
    if (a < 1e-12) { if (c > 0) return Number.isFinite(lo) ? [lo, hi] : null; s0 = -Infinity; s1 = Infinity; } // the segment runs along x
    else { const disc = b * b - 4 * a * c; if (disc < 0) return Number.isFinite(lo) ? [lo, hi] : null; const r = Math.sqrt(disc); s0 = (-b - r) / (2 * a); s1 = (-b + r) / (2 * a); }
    // 0 <= (ux s + k) / L2 <= 1
    if (Math.abs(ux) < 1e-12) { if (k < 0 || k > L2) { s0 = 1; s1 = 0; } }
    else { const e0 = -k / ux, e1 = (L2 - k) / ux; s0 = Math.max(s0, Math.min(e0, e1)); s1 = Math.min(s1, Math.max(e0, e1)); }
    if (s1 >= s0) { if (s0 < lo) lo = s0; if (s1 > hi) hi = s1; }
  }
  return Number.isFinite(lo) && hi >= lo ? [lo, hi] : null;
}

export function segmentReach(segments, bounds, cell, radius, { margin = 0, rz = null } = {}) {
  const g = gridShape(bounds, cell);
  const R = radius > 0 && Number.isFinite(radius) ? radius + Math.max(0, margin) : null;
  const Rz = R && rz > 0 && Number.isFinite(rz) ? Math.min(R, rz + Math.max(0, margin)) : R, kz = R ? R / Rz : 1;
  if (!R) return { ...g, reach: g.total, mask: null };
  if (g.total > REACH_MAX_GRID) return { ...g, reach: NaN, mask: null, tooBig: true };
  const { dx, dy, dz, nx, ny, nz } = g;
  const mask = new Uint8Array(g.total);
  const R2 = R * R * (1 + 1e-12) + 1e-12, pad = R * 1e-9 + 1e-9;
  const x0 = bounds.xmin + 0.5 * dx, y0 = bounds.ymin + 0.5 * dy, z0 = bounds.zmin + 0.5 * dz;
  const lo = (v, o, d) => Math.max(0, Math.ceil((v - o) / d - 1e-9)), hi = (v, o, d, n) => Math.min(n - 1, Math.floor((v - o) / d + 1e-9));
  for (const sg of segments) {
    const [ax, ay, az, bx, by, bz] = sg;
    const ux = bx - ax, uy = by - ay, uz = (bz - az) * kz, L2 = ux * ux + uy * uy + uz * uz; // z stretched by kz (#2418)
    const iz0 = lo(Math.min(az, bz) - Rz, z0, dz), iz1 = hi(Math.max(az, bz) + Rz, z0, dz, nz);
    const iy0 = lo(Math.min(ay, by) - R, y0, dy), iy1 = hi(Math.max(ay, by) + R, y0, dy, ny);
    for (let iz = iz0; iz <= iz1; iz++) {
      const wz = (z0 + iz * dz - az) * kz;
      for (let iy = iy0; iy <= iy1; iy++) {
        const wy = y0 + iy * dy - ay;
        const iv = capsuleRow(ux, uy, uz, L2, wy, wz, R2);
        if (!iv) continue;
        const ix0 = lo(ax + iv[0] - pad, x0, dx), ix1 = hi(ax + iv[1] + pad, x0, dx, nx);
        if (ix1 >= ix0) { const base = nx * (iy + ny * iz); mask.fill(1, base + ix0, base + ix1 + 1); }
      }
    }
  }
  let reach = 0;
  for (let i = 0; i < mask.length; i++) reach += mask[i];
  return { ...g, reach, mask };
}

// TASKS.csv #1579 (review #1497, Lawyers) — everything the Grade estimation dialog asks of the reach, in one call, for its worker
// (lib/blockReach.worker.js): the reach counts and the fit searches froze the window 1.2-1.7 s on opening it on Lawyers (446 holes,
// a 5 x 6 km box). traces: desurveyed holes [[{x, y, z}]]; cell3: { dx, dy, dz }; from: the cell size the fit searches start at;
// fit10: also the smallest cell from 10 m (#1570, a box that changed). -> { reach, tooBig, fitCell, fitCellMax, fit10 } (null where
// not asked or not needed; the fits only when the current cell is over the budget, as the dialog shows them).
export function reachSummary({ traces, segments = null, margin = 0, bounds, cell3, radius, rz = null, fixedDz = null, budget, maxBudget = null, from, fitAllowed = true, fit10 = false }) {
  // #2636 — segments (exact, no margin); `segments` / `margin` given: the parts of the traces inside a restricting solid (#2422)
  const tol = segments ? 0 : Math.min(cell3.dx, cell3.dy, cell3.dz) / 4; // the simplified traces stay within tol of the stations
  const segs = segments || tracesToSegments(traces, tol);
  const opts = { margin: segments ? margin : tol, rz, dz: fixedDz, segments: true }; // rz / dz: #2418
  const r = segmentReach(segs, bounds, cell3, radius, opts);
  const over = !!r.tooBig || r.reach > budget;
  return {
    reach: r.reach, tooBig: !!r.tooBig,
    fitCell: over && fitAllowed ? cellToFitReach(segs, bounds, radius, budget, from, opts) : null,
    fitCellMax: over && fitAllowed && maxBudget != null && budget < maxBudget ? cellToFitReach(segs, bounds, radius, maxBudget, from, opts) : null,
    fit10: fit10 ? cellToFitReach(segs, bounds, radius, budget, 10, opts) : null,
  };
}
