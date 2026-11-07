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
export function blockReach(points, bounds, cell, radius, { margin = 0 } = {}) {
  const g = gridShape(bounds, cell);
  const R = radius > 0 && Number.isFinite(radius) ? radius + Math.max(0, margin) : null;
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
    const iz0 = lo(p.z - R, z0, dz), iz1 = hi(p.z + R, z0, dz, nz);
    for (let iz = iz0; iz <= iz1; iz++) {
      const ez = z0 + iz * dz - p.z, r2z = R2 - ez * ez;
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
export function cellToFitReach(points, bounds, radius, budget, from, opts = {}) {
  let c = Math.max(0.5, from);
  for (let i = 0; i < 400 && c < 1e5; i++) {
    const r = blockReach(points, bounds, c, radius, opts);
    if (!r.tooBig && r.reach <= budget) return c;
    // jump ahead by the cube root of the overshoot (reach scales about with 1 / cell^3), never less than one 2 % step
    const ratio = r.tooBig ? 8 : r.reach / budget;
    const next = Math.max(Math.ceil((c * 1.02) * 2) / 2, Math.floor(c * Math.cbrt(ratio) * 0.98 * 2) / 2);
    c = next > c ? next : c + 0.5;
  }
  return c;
}
