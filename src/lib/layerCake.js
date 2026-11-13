// TASKS.csv #2905 (WA iron review; Matt's decision 2026-11-12) — the LAYER-CAKE stack: a flat-lying, conformable pile modelled as
// elevation grids, not as one GemPy field. On six 5-6.5 m iron-formation strands under 18 m cells, GemPy took 9.5 minutes and put the tops
// out of order and folded (17 % of the logged metres where they were logged); a pile like that is the easiest model there is.
//   * the first top of a package: an elevation grid through its picks (each hole's highest top of the unit);
//   * each lower top: the one above minus an interpolated thickness (the drop from the top above to this one in each hole, 0 where the
//     unit is absent, never negative), so tops never cross or fold back;
//   * an unconformity (a new package, #1309) starts a new layer-cake: the top under it IS the unconformity (its own grid), the units
//     under it are a cake of their own from the next top down, truncated by the unconformity; every top is then held at or under the
//     one above it;
//   * each top and thickness is an exact field through its observations (#2905 follow-up, side 5): the Explicit surface's thin-plate spline
//     up to 600 of them, an exact local inverse-distance field over the 12 nearest beyond; each lower top's thickness is measured from the
//     MODELLED top above at its pick, so every top passes through its own picks. The tensioned minimum-curvature grid used before smoothed
//     them away: on the WA iron field (6,281 holes, six strands, the same picks and pinch-outs) it put 39.5 % of the logged metres in their
//     unit (a 185 m grid on 24 km), these fields 78.7 %, in 6 s either way; on the 268-hole block 60 % against 72 %;
//   * the grid (cakeGrid) carries the meshes and the block; the evaluated points (the model check) are read from the fields themselves.
// Out: what the sidecar's GemPy stack returns, so the rest of the run (clipping, contact fit, the model check, unit volumes, sections,
// "Add as block model") is the same code: surfaces [{ name, vertices: [[x, y, z]], faces: [[a, b, c]] }]; block { extent, resolution,
// ids (z fastest, then y, then x; id 1 = above the first top, id k + 1 = the unit under top k), labels [null, unit 1, ...] }; and
// `evaluated` (the id at each of evalPts, exactly, from the grids). API frame: x east, y north, z up, origin-relative. Pure.
import { thinPlate } from "./explicitSurface.js"; // the Explicit surface's spline, exact through its inputs
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

// an exact field through observations { x, y, v }: (x, y) -> v. A thin-plate spline up to MAX_SPLINE (a dense O(n^3) solve), an exact local
// inverse-distance field over the K_NEAR nearest beyond (a bucket grid finds them; a pick returns its own value), the mean when the
// observations cannot carry a surface (fewer than 3, in a line).
const MAX_SPLINE = 600, K_NEAR = 12;
function nearField(obs) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const o of obs) { if (o.x < x0) x0 = o.x; if (o.x > x1) x1 = o.x; if (o.y < y0) y0 = o.y; if (o.y > y1) y1 = o.y; }
  const g = Math.max(1, Math.round(Math.sqrt(obs.length / 4))), sx = (x1 - x0) / g || 1, sy = (y1 - y0) / g || 1;
  const ci = (v, lo, st) => Math.min(g - 1, Math.max(0, Math.floor((v - lo) / st)));
  const lists = Array.from({ length: g * g }, () => []);
  for (const o of obs) lists[ci(o.x, x0, sx) * g + ci(o.y, y0, sy)].push(o);
  const cells = lists.map((l) => ({ x: Float64Array.from(l, (o) => o.x), y: Float64Array.from(l, (o) => o.y), v: Float64Array.from(l, (o) => o.v) }));
  const kd = new Float64Array(K_NEAR), kv = new Float64Array(K_NEAR);
  return (x, y) => {
    kd.fill(Infinity);
    const cx = ci(x, x0, sx), cy = ci(y, y0, sy);
    let stopAt = -1;
    for (let r = 0; r <= g; r++) {
      for (let i = cx - r; i <= cx + r; i++) {
        if (i < 0 || i >= g) continue;
        const edge = Math.abs(i - cx) === r;
        for (let j = cy - r; j <= cy + r; j += edge ? 1 : 2 * r || 1) {
          if (j < 0 || j >= g) continue;
          const c = cells[i * g + j];
          for (let m0 = 0; m0 < c.x.length; m0++) {
            const d2 = (c.x[m0] - x) ** 2 + (c.y[m0] - y) ** 2;
            if (d2 >= kd[K_NEAR - 1]) continue;
            let m = K_NEAR - 1;
            while (m > 0 && kd[m - 1] > d2) { kd[m] = kd[m - 1]; kv[m] = kv[m - 1]; m--; }
            kd[m] = d2; kv[m] = c.v[m0];
          }
        }
      }
      if (stopAt < 0 && kd[K_NEAR - 1] < Infinity) stopAt = r + 1; // one ring more: a nearer one can sit in the next ring's corners
      if (stopAt >= 0 && r >= stopAt) break;
    }
    let sw = 0, sv = 0;
    for (let m = 0; m < K_NEAR && kd[m] < Infinity; m++) { if (kd[m] < 1e-12) return kv[m]; sw += 1 / kd[m]; sv += kv[m] / kd[m]; }
    return sw ? sv / sw : 0;
  };
}
export function fieldThrough(obs) {
  const mean = obs.length ? obs.reduce((t, o) => t + o.v, 0) / obs.length : 0;
  if (obs.length > MAX_SPLINE) return nearField(obs);
  if (obs.length >= 3) { const f = thinPlate(obs.map((o) => o.x), obs.map((o) => o.y), obs.map((o) => o.v)); if (f) return f; }
  return () => mean;
}

// specs: the stack's units youngest first [{ meshName, points: [{ x, y, z, hole_id? }], package? }]; extent [xmin, xmax, ymin, ymax, zmin,
// zmax]; resolution [nx, ny, nz] (the block's). -> { surfaces, block, evaluated, grid, report: { units: [{ unit, thickness: { holes,
// median, zeroHoles } | null, packageTop }], clamped: [{ unit, nodes }] } } | { error }
// onProgress(done, total) (#3085): after each top's field, and once more after the block (total = units + 1)
export function layerCake(specs, extent, resolution, { maxNodes = 128, evalPts = null, onProgress = null } = {}) {
  const n = specs.length;
  if (!n) return { error: "no units" };
  const tops = specs.map((s) => topsByHole(s.points));
  const g = cakeGrid(extent, maxNodes, nearestSpacing(tops.flatMap((t) => [...t.by.values()])) / 2), N = g.nx * g.ny;
  for (let k = 0; k < n; k++) if (!tops[k].all.length) return { error: `${specs[k].meshName}: no top picks` };
  const report = { units: [], clamped: [] };
  const pkgOf = specs.map((s) => s.package ?? 0);
  // the fields, top down: a cake's first top through its picks; each lower top as a thickness under the one above
  const fields = new Array(n);
  // every top at places (xs, ys), in order, each held at or under the one above (an unconformity truncates the cake under it; nothing crosses).
  // upTo: the tops 0 .. upTo only; clamped (optional): per top, how many places were held under the one above. -> [Float64Array per top]
  const topsAt = (xs, ys, upTo = n - 1, clamped = null) => {
    const out = [];
    for (let k = 0; k <= upTo; k++) {
      const f = fields[k], z = new Float64Array(xs.length);
      for (let i = 0; i < xs.length; i++) {
        z[i] = f.top ? f.top(xs[i], ys[i]) : out[k - 1][i] - Math.max(0, f.thick(xs[i], ys[i]));
        if (k > 0 && z[i] > out[k - 1][i] + 1e-9) { z[i] = out[k - 1][i]; if (clamped) clamped[k]++; } else if (k > 0 && z[i] > out[k - 1][i]) z[i] = out[k - 1][i];
      }
      out.push(z);
    }
    return out;
  };
  let first = 0; // the index of the current package's first top
  for (let k = 0; k < n; k++) {
    if (k > 0 && pkgOf[k] !== pkgOf[k - 1]) first = k;
    // a package's first top starts a cake; under an unconformity that top IS the unconformity, so the next top starts the cake too
    const startsCake = k === first || (first > 0 && k === first + 1);
    if (startsCake) { fields[k] = { top: fieldThrough(tops[k].all.map((p) => ({ x: p.x, y: p.y, v: p.z }))) }; report.units.push({ unit: specs[k].meshName, thickness: null, packageTop: true }); onProgress?.(k + 1, n + 1); continue; }
    // the thickness of the unit between top k - 1 and top k at each pick of top k: the drop from the MODELLED top above there, so top k passes
    // through its picks; 0 where the two coincide (a unit absent, #1030's pinch-out points); never negative
    const P = tops[k].all, above = topsAt(P.map((p) => p.x), P.map((p) => p.y), k - 1)[k - 1];
    const obs = P.map((p, i) => ({ x: p.x, y: p.y, v: Math.max(0, above[i] - p.z) }));
    const zero = obs.filter((o) => o.v < 1e-6).length;
    fields[k] = { thick: fieldThrough(obs) };
    onProgress?.(k + 1, n + 1); // #3085
    report.units.push({ unit: specs[k - 1].meshName, below: specs[k].meshName, thickness: { holes: obs.length, median: median(obs.filter((o) => o.v >= 1e-6).map((o) => o.v)) || 0, zeroHoles: zero } }); // the median where present
  }
  // the grid: the meshes and the block (the clamp counted per top, as nodes held under the one above)
  const gx = new Float64Array(N), gy = new Float64Array(N);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { gx[j * g.nx + i] = g.xmin + (i + 0.5) * g.cell; gy[j * g.nx + i] = g.ymax - (j + 0.5) * g.cell; }
  const held = new Array(n).fill(0), Zd = topsAt(gx, gy, n - 1, held);
  for (let k = 1; k < n; k++) if (held[k]) report.clamped.push({ unit: specs[k].meshName, nodes: held[k], of: N });
  const Z = Zd.map((z) => Float32Array.from(z));
  // meshes: the grid's nodes, two triangles a cell
  const surfaces = specs.map((s, k) => {
    const vertices = new Array(N), faces = [];
    for (let i = 0; i < N; i++) vertices[i] = [gx[i], gy[i], Z[k][i]];
    for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < g.nx - 1; i++) { const a = j * g.nx + i; faces.push([a, a + g.nx, a + 1], [a + 1, a + g.nx, a + g.nx + 1]); }
    return { name: s.meshName, vertices, faces };
  });
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
  // the id at each evaluated point from the fields themselves (1 + the tops above it); the midpoints of a hole share a place: each place once
  let evaluated = null;
  if (evalPts) {
    const place = new Map(), ux = [], uy = [];
    const at = evalPts.map(([x, y]) => { const key = `${x}|${y}`; let i = place.get(key); if (i === undefined) { i = ux.length; place.set(key, i); ux.push(x); uy.push(y); } return i; });
    const T = topsAt(ux, uy);
    evaluated = evalPts.map(([, , z], q) => { const i = at[q]; let id = 1; for (let k = 0; k < n && T[k][i] > z; k++) id++; return id; });
  }
  onProgress?.(n + 1, n + 1); // #3085
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
