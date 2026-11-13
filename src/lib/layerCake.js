// TASKS.csv #2905 (WA iron review; Matt's decision 2026-11-12) — the LAYER-CAKE stack: a flat-lying, conformable pile modelled as
// elevation grids, not as one GemPy field. On six 5-6.5 m iron-formation strands under 18 m cells, GemPy took 9.5 minutes and put the tops
// out of order and folded (17 % of the logged metres where they were logged); a pile like that is the easiest model there is.
//   * the first top of a package: an elevation grid through its picks (each hole's highest top of the unit);
//   * each lower top: the one above minus an interpolated thickness (the drop from the top above to this one in each hole, 0 where the
//     unit is absent, never negative), so tops never cross or fold back;
//   * an unconformity (a new package, #1309) starts a new layer-cake: the top under it IS the unconformity (its own grid), the units
//     under it are a cake of their own from the next top down, truncated by the unconformity; every top is then held at or under the
//     one above it;
//   * grids: tensioned minimum curvature (lib/minCurvature.js), which bends smoothly through the picks and scales to thousands of holes.
// Out: what the sidecar's GemPy stack returns, so the rest of the run (clipping, contact fit, the model check, unit volumes, sections,
// "Add as block model") is the same code: surfaces [{ name, vertices: [[x, y, z]], faces: [[a, b, c]] }]; block { extent, resolution,
// ids (z fastest, then y, then x; id 1 = above the first top, id k + 1 = the unit under top k), labels [null, unit 1, ...] }; and
// `evaluated` (the id at each of evalPts, exactly, from the grids). API frame: x east, y north, z up, origin-relative. Pure.
import { minCurvatureGrid } from "./minCurvature.js";
import { median } from "./arrayStats.js"; // #1114 — the one median

// the grid over the box's plan: at most maxNodes a side (128: 0.7 s a grid; 200: 3.3 s, on a loaded machine), square cells, and no finer
// than `minCell` (half the hole spacing: finer nodes add time, not detail, between picks)
export function cakeGrid(extent, maxNodes = 128, minCell = 0) {
  const [xmin, xmax, ymin, ymax] = extent;
  const cell = Math.max((xmax - xmin) / maxNodes, (ymax - ymin) / maxNodes, minCell || 0, 1e-6);
  return { xmin, ymax, cell, nx: Math.max(2, Math.ceil((xmax - xmin) / cell)), ny: Math.max(2, Math.ceil((ymax - ymin) / cell)) };
}

// bilinear between node centres (row 0 north), held at the edge
export function gridAt(values, g, x, y) {
  const fx = (x - g.xmin) / g.cell - 0.5, fy = (g.ymax - y) / g.cell - 0.5;
  const i0 = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), j0 = Math.max(0, Math.min(g.ny - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - i0)), ty = Math.max(0, Math.min(1, fy - j0));
  const k = j0 * g.nx + i0;
  const a = values[k], b = values[k + 1], c = values[k + g.nx], d = values[k + g.nx + 1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}

// the median distance from a hole's top to the nearest other hole's (in plan), from a bucket grid; 0 with fewer than 3
export function nearestSpacing(pts) {
  const P = [], seen = new Set();
  for (const p of pts) { const k = `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`; if (!seen.has(k)) { seen.add(k); P.push(p); } }
  if (P.length < 3) return 0;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const b = Math.max((x1 - x0) / Math.sqrt(P.length), (y1 - y0) / Math.sqrt(P.length), 1e-6), buckets = new Map(), key = (i, j) => i * 1000003 + j;
  for (const p of P) { const k = key(Math.floor((p.x - x0) / b), Math.floor((p.y - y0) / b)); const a = buckets.get(k); if (a) a.push(p); else buckets.set(k, [p]); }
  const d = [];
  for (const p of P) {
    const i0 = Math.floor((p.x - x0) / b), j0 = Math.floor((p.y - y0) / b);
    let best = Infinity;
    for (let r = 0; r < 64 && !(best <= (r - 1) * b); r++) for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
      for (const q of buckets.get(key(i, j)) || []) if (q !== p) best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y));
    }
    if (Number.isFinite(best)) d.push(best);
  }
  return median(d) || 0;
}

// one value per hole (its highest top of the unit: the first logged top down the hole); points without a hole stay as they are
export function topsByHole(points) {
  const by = new Map(), free = [];
  for (const p of points || []) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
    if (p.hole_id == null) { free.push(p); continue; }
    const cur = by.get(p.hole_id);
    if (!cur || p.z > cur.z) by.set(p.hole_id, p);
  }
  return { by, all: [...by.values(), ...free] };
}

const surfaceGrid = (pts, g, tension) => {
  if (pts.length === 1) return new Float32Array(g.nx * g.ny).fill(pts[0].v);
  return minCurvatureGrid(pts, g, { tension, relTol: 1e-4 }).values; // 1e-4: decimetres on tops of a few hundred metres, a third of the time
};

// specs: the stack's units youngest first [{ meshName, points: [{ x, y, z, hole_id? }], package? }]; extent [xmin, xmax, ymin, ymax, zmin,
// zmax]; resolution [nx, ny, nz] (the block's). -> { surfaces, block, evaluated, grid, report: { units: [{ unit, thickness: { holes,
// median, zeroHoles } | null, packageTop }], clamped: [{ unit, nodes }] } } | { error }
export function layerCake(specs, extent, resolution, { maxNodes = 128, tension = 0.35, thicknessTension = 0.6, evalPts = null } = {}) {
  const n = specs.length;
  if (!n) return { error: "no units" };
  const tops = specs.map((s) => topsByHole(s.points));
  const g = cakeGrid(extent, maxNodes, nearestSpacing(tops.flatMap((t) => [...t.by.values()])) / 2), N = g.nx * g.ny;
  for (let k = 0; k < n; k++) if (!tops[k].all.length) return { error: `${specs[k].meshName}: no top picks` };
  const Z = new Array(n);
  const report = { units: [], clamped: [] };
  const pkgOf = specs.map((s) => s.package ?? 0);
  const grid = (k) => surfaceGrid(tops[k].all.map((p) => ({ x: p.x, y: p.y, v: p.z })), g, tension);
  let first = 0; // the index of the current package's first top
  for (let k = 0; k < n; k++) {
    if (k > 0 && pkgOf[k] !== pkgOf[k - 1]) first = k;
    // a package's first top starts a cake; under an unconformity that top IS the unconformity, so the next top starts the cake too
    const startsCake = k === first || (first > 0 && k === first + 1);
    if (startsCake) { Z[k] = grid(k); report.units.push({ unit: specs[k].meshName, thickness: null, packageTop: true }); continue; }
    // thickness of the unit between top k - 1 and top k: in each hole with top k, the drop from top k - 1 (as picked in that hole,
    // else as gridded there); 0 where the two coincide (a unit absent, #1030's pinch-out points); never negative
    const obs = [];
    let zero = 0;
    for (const p of tops[k].all) {
      const above = p.hole_id != null && tops[k - 1].by.has(p.hole_id) ? tops[k - 1].by.get(p.hole_id).z : gridAt(Z[k - 1], g, p.x, p.y);
      const t = Math.max(0, above - p.z);
      if (t < 1e-6) zero++;
      obs.push({ x: p.x, y: p.y, v: t });
    }
    const T = obs.length === 1 ? new Float32Array(N).fill(obs[0].v) : minCurvatureGrid(obs, g, { tension: thicknessTension, relTol: 1e-4 }).values;
    const z = new Float32Array(N);
    for (let i = 0; i < N; i++) z[i] = Z[k - 1][i] - Math.max(0, T[i]);
    Z[k] = z;
    report.units.push({ unit: specs[k - 1].meshName, below: specs[k].meshName, thickness: { holes: obs.length, median: median(obs.filter((o) => o.v >= 1e-6).map((o) => o.v)) || 0, zeroHoles: zero } }); // the median where present
  }
  // every top at or under the one above it: an unconformity truncates the cake under it, and nothing crosses
  for (let k = 1; k < n; k++) {
    let c = 0;
    for (let i = 0; i < N; i++) if (Z[k][i] > Z[k - 1][i]) { Z[k][i] = Z[k - 1][i]; c++; }
    if (c) report.clamped.push({ unit: specs[k].meshName, nodes: c, of: N });
  }
  // meshes: the grid's nodes, two triangles a cell
  const surfaces = specs.map((s, k) => {
    const vertices = new Array(N), faces = [];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) vertices[j * g.nx + i] = [g.xmin + (i + 0.5) * g.cell, g.ymax - (j + 0.5) * g.cell, Z[k][j * g.nx + i]];
    for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < g.nx - 1; i++) { const a = j * g.nx + i; faces.push([a, a + g.nx, a + 1], [a + 1, a + g.nx, a + g.nx + 1]); }
    return { name: s.meshName, vertices, faces };
  });
  // the id at a point: 1 + the number of tops above it
  const idAt = (x, y, z) => { let id = 1; for (let k = 0; k < n; k++) { if (gridAt(Z[k], g, x, y) > z) id++; else break; } return id; };
  const [xmin, xmax, ymin, ymax, zmin, zmax] = extent, [bx, by, bz] = resolution;
  const ids = new Int32Array(bx * by * bz), dx = (xmax - xmin) / bx, dy = (ymax - ymin) / by, dz = (zmax - zmin) / bz, col = new Float64Array(n);
  for (let ix = 0; ix < bx; ix++) for (let iy = 0; iy < by; iy++) {
    const x = xmin + (ix + 0.5) * dx, y = ymin + (iy + 0.5) * dy;
    for (let k = 0; k < n; k++) col[k] = gridAt(Z[k], g, x, y);
    for (let iz = 0; iz < bz; iz++) {
      const z = zmin + (iz + 0.5) * dz;
      let id = 1; for (let k = 0; k < n && col[k] > z; k++) id++;
      ids[ix * by * bz + iy * bz + iz] = id;
    }
  }
  const block = { extent: [...extent], resolution: [bx, by, bz], ids, labels: [null, ...specs.map((s) => s.meshName)] };
  const evaluated = evalPts ? evalPts.map(([x, y, z]) => idAt(x, y, z)) : null;
  return { surfaces, block, evaluated, grid: g, report };
}

// TASKS.csv #2905 — near-flat contacts: the dip of the plane through each top's picks (least squares z = a + b x + c y), the steepest of
// them. -> degrees, or NaN with too few picks
export function contactDipDeg(points) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  if (P.length < 3) return NaN;
  let mx = 0, my = 0, mz = 0;
  for (const p of P) { mx += p.x; my += p.y; mz += p.z; }
  mx /= P.length; my /= P.length; mz /= P.length;
  let sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
  for (const p of P) { const x = p.x - mx, y = p.y - my, z = p.z - mz; sxx += x * x; sxy += x * y; syy += y * y; sxz += x * z; syz += y * z; }
  const det = sxx * syy - sxy * sxy;
  if (!(Math.abs(det) > 1e-9 * (sxx * syy || 1))) return NaN; // the picks in a line
  const b = (sxz * syy - syz * sxy) / det, c = (syz * sxx - sxz * sxy) / det;
  return (Math.atan(Math.hypot(b, c)) * 180) / Math.PI;
}
// 10 degrees: a vertical thickness within 1.5 % of the true one (cos 10 = 0.985). The review's WA iron block fits at 4.5-5.8 degrees (its
// tops' planes through 103-170 picks each), just over the 2.5-5 it estimated by eye.
export const FLAT_DIP_DEG = 10;
export function stackIsFlat(specs, maxDeg = FLAT_DIP_DEG) {
  const dips = specs.map((s) => contactDipDeg(s.points)).filter(Number.isFinite);
  if (!dips.length) return null;
  const steepest = Math.max(...dips);
  return { flat: steepest <= maxDeg, steepest };
}
