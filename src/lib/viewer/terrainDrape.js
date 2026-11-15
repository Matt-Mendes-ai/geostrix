// TASKS.csv #3380 (#3195, Galore Creek review) — a map layer draped on the terrain was holed by it: on the terrain built from the collars
// (a 200 x 101 grid, nodes 147 m apart) patches of ground showed through the unit polygons, up to about 100 m long, and Identify inside a
// polygon answered 'Terrain'. The drape was a plane of 32-256 even segments over the layer's box, heights read BILINEARLY, while the terrain
// is drawn as two triangles per grid cell split along one diagonal: inside a twisted cell the two surfaces part by up to a quarter of the
// cell's twist (metres to tens of metres on rough 147 m cells), far more than the drape's 0.3 m lift. Now the drape's vertices are the
// terrain's own nodes inside the box (plus the box edges), each quad split along the terrain's diagonal and its heights read on the
// terrain's triangles, so inside the box it IS the drawn terrain, lifted. Pure: no three.js.

import { decodeNoDataMask, isNoData } from "../demFill.js"; // TASKS.csv #3449 — the no-data nodes the drawn mesh leaves out (#421)

// The height of the terrain as syncTerrain draws its full mesh: cell (i, j) with corners a (NW), b (NE), c (SW), d (SE) is the triangles
// a-c-b and b-c-d (the diagonal from NE to SW). Clamped to the grid like sampleTerrainElevation.
export function terrainMeshElevation(terrain, x, y) {
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const { gridW, gridH, elevations } = terrain;
  const fx = gridW <= 1 ? 0 : Math.min(gridW - 1, Math.max(0, ((x - xmin) / (xmax - xmin)) * (gridW - 1)));
  const fy = gridH <= 1 ? 0 : Math.min(gridH - 1, Math.max(0, ((ymax - y) / (ymax - ymin)) * (gridH - 1))); // row 0 = north
  const i0 = Math.min(Math.max(0, gridW - 2), Math.floor(fx)), j0 = Math.min(Math.max(0, gridH - 2), Math.floor(fy));
  const i1 = Math.min(gridW - 1, i0 + 1), j1 = Math.min(gridH - 1, j0 + 1);
  const tx = fx - i0, ty = fy - j0;
  const a = elevations[j0 * gridW + i0], b = elevations[j0 * gridW + i1], c = elevations[j1 * gridW + i0], d = elevations[j1 * gridW + i1];
  return tx + ty <= 1 ? a + tx * (b - a) + ty * (c - a) : d + (1 - tx) * (c - d) + (1 - ty) * (b - d);
}

// The drape over bbox [x0, y0, x1, y1]: vertices at every `step`-th terrain node column / row inside it plus its edges (step 1 while that is
// at most maxCols each way), heights on the terrain's triangles, quads split along the terrain's diagonal. With step > 1, or over an
// adaptive (decimated) terrain mesh, the drape is not the drawn surface exactly: `lift` (one value per vertex) is how far the drawn terrain
// rises above the drape's quads around that vertex (skipped nodes, the box's edge cells), and `uniformLift` the adaptive mesh's error; the
// caller lifts each vertex by its own lift plus the uniform one. `extraLift` is the largest of them (kept for reports and tests).
// TASKS.csv #3449 (Matt, v0.1.117: "Hillshade is off in elevation y quite a bit. same with imagery") — the lift was ONE number for the whole
// drape, the worst rise anywhere in the box. On Copernicus GLO-30 reprojected to UTM (EPSG:3156, NW BC) the box's corners are no-data, filled
// for sampling only and left out of the drawn mesh (#421): the fill (1,634 m) met a 2,384 m ridge, a quad of the step-2 drape spanned the
// two, and the ridge's skipped node rose 378 m above it. Every vertex of a hillshade or imagery over the whole terrain was then lifted 380 m
// (513 nodes) to 496 m (1,025 nodes): the picture floated above the ground by the same height everywhere. Now (1) the no-data nodes are not
// ground (the mesh has a hole there): they are not checked, and a drape vertex on one takes the highest drawn node within a step of it, so
// the quads beside the hole do not dip under the ground's edge; (2) each vertex is lifted only by the rises in the quads it belongs to.
// -> { xs, ys (north first), z: Float64Array (ys.length x xs.length, row-major), indices: Uint32Array (a, c, b, b, c, d per quad), step,
//      lift: Float32Array (per vertex), uniformLift, extraLift }
export function terrainDrapeGrid(terrain, bbox, { maxCols = 400, adaptiveError = 0 } = {}) {
  const [bx0, by0, bx1, by1] = bbox;
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const { gridW, gridH } = terrain;
  const dx = gridW > 1 ? (xmax - xmin) / (gridW - 1) : Infinity, dy = gridH > 1 ? (ymax - ymin) / (gridH - 1) : Infinity;
  const colsIn = Number.isFinite(dx) ? Math.max(0, (Math.min(bx1, xmax) - Math.max(bx0, xmin)) / dx) : 0;
  const rowsIn = Number.isFinite(dy) ? Math.max(0, (Math.min(by1, ymax) - Math.max(by0, ymin)) / dy) : 0;
  const step = Math.max(1, Math.ceil(Math.max(colsIn, rowsIn) / maxCols));
  const xs = [bx0];
  if (Number.isFinite(dx)) for (let i = Math.max(0, Math.ceil((bx0 - xmin) / dx)); i < gridW; i += 1) { const x = xmin + i * dx; if (x >= bx1) break; if (x > bx0 && i % step === 0) xs.push(x); }
  xs.push(bx1);
  const ys = [by1]; // north first, as the grid's rows
  if (Number.isFinite(dy)) for (let j = Math.max(0, Math.ceil((ymax - by1) / dy)); j < gridH; j += 1) { const y = ymax - j * dy; if (y <= by0) break; if (y < by1 && j % step === 0) ys.push(y); }
  ys.push(by0);
  const W = xs.length, H = ys.length, z = new Float64Array(W * H);
  for (let r = 0; r < H; r++) for (let k = 0; k < W; k++) z[r * W + k] = terrainMeshElevation(terrain, xs[k], ys[r]);
  // #3449 — the no-data nodes (#421: filled for sampling, never drawn)
  const mask = terrain.noDataMask ? decodeNoDataMask(terrain.noDataMask) : null;
  const bad = (i, j) => !!mask && isNoData(mask, j * gridW + i);
  const cellDrawn = (i, j) => !mask || !(bad(i, j) || bad(i + 1, j) || bad(i, j + 1) || bad(i + 1, j + 1));
  if (mask && Number.isFinite(dx) && Number.isFinite(dy)) {
    const nodeOf = (v, d, n) => { const f = v / d, i = Math.round(f); return Math.abs(f - i) < 1e-6 && i >= 0 && i < n ? i : -1; };
    for (let r = 0; r < H; r++) {
      const j = nodeOf(ymax - ys[r], dy, gridH); if (j < 0) continue;
      for (let k = 0; k < W; k++) {
        const i = nodeOf(xs[k] - xmin, dx, gridW); if (i < 0 || !bad(i, j)) continue;
        let best = -Infinity;
        for (let jj = Math.max(0, j - step); jj <= Math.min(gridH - 1, j + step); jj++) for (let ii = Math.max(0, i - step); ii <= Math.min(gridW - 1, i + step); ii++) {
          if (!bad(ii, jj)) { const e = terrain.elevations[jj * gridW + ii]; if (e > best) best = e; }
        }
        if (best > -Infinity) z[r * W + k] = best;
      }
    }
  }
  const indices = new Uint32Array((W - 1) * (H - 1) * 6);
  let n = 0;
  for (let r = 0; r < H - 1; r++) for (let k = 0; k < W - 1; k++) {
    const a = r * W + k, b = a + 1, c = a + W, d = c + 1;
    indices[n++] = a; indices[n++] = c; indices[n++] = b; indices[n++] = b; indices[n++] = c; indices[n++] = d;
  }
  const lift = new Float32Array(W * H);
  const bump = (r, k, up) => { if (!(up > 1e-6)) return; /* under a micrometre: float noise */ for (const q of [r * W + k, r * W + k + 1, (r + 1) * W + k, (r + 1) * W + k + 1]) if (up > lift[q]) lift[q] = up; };
  const drawnAt = (x, y) => { // the ground is drawn at (x, y): its cell has no no-data corner
    if (!mask) return true;
    const i = Math.min(gridW - 2, Math.max(0, Math.floor((x - xmin) / dx))), j = Math.min(gridH - 2, Math.max(0, Math.floor((ymax - y) / dy)));
    return cellDrawn(i, j);
  };
  // the quads along the box's edges are parts of terrain cells, whose diagonal can cross them elsewhere than theirs: sampled inside
  const drapeAt0 = gridDrapeAt(xs, ys, z);
  // Both surfaces are flat on each piece, so the ground's greatest rise over such a quad is at a corner (none: the corners are read on the
  // ground) or where the cell's diagonal crosses the quad's sides or its own diagonal: those points are checked exactly, plus a 5 x 5 sample
  // for a quad that spans several cells (nodes skipped).
  const edgeQuad = (r, k) => {
    const xa = xs[k], xb = xs[k + 1], yn = ys[r], yS = ys[r + 1], pts = [];
    for (let u = 1; u < 5; u++) for (let v = 1; v < 5; v++) pts.push([xa + ((xb - xa) * u) / 5, yn - ((yn - yS) * v) / 5]);
    if (Number.isFinite(dx) && Number.isFinite(dy)) {
      const i0 = Math.min(Math.max(0, gridW - 2), Math.max(0, Math.floor(((xa + xb) / 2 - xmin) / dx)));
      const j0 = Math.min(Math.max(0, gridH - 2), Math.max(0, Math.floor((ymax - (yn + yS) / 2) / dy)));
      const u0 = (xa - xmin) / dx - i0, u1 = (xb - xmin) / dx - i0, v0 = (ymax - yn) / dy - j0, v1 = (ymax - yS) / dy - j0;
      const at = (u, v) => pts.push([xmin + (i0 + u) * dx, ymax - (j0 + v) * dy]);
      const inU = (u) => u >= u0 - 1e-9 && u <= u1 + 1e-9, inV = (v) => v >= v0 - 1e-9 && v <= v1 + 1e-9;
      if (inV(1 - u0)) at(u0, 1 - u0); if (inV(1 - u1)) at(u1, 1 - u1); if (inU(1 - v0)) at(1 - v0, v0); if (inU(1 - v1)) at(1 - v1, v1);
      const den = (u0 - u1) + (v1 - v0), t = den ? (1 - u1 - v0) / den : NaN; // the quad's diagonal b -> c meets the cell's
      if (t >= 0 && t <= 1) at(u1 + t * (u0 - u1), v0 + t * (v1 - v0));
    }
    for (const [x, y] of pts) { if (x < xa || x > xb || y > yn || y < yS || !drawnAt(x, y)) continue; bump(r, k, terrainMeshElevation(terrain, x, y) - drapeAt0(x, y)); }
  };
  for (let k = 0; k < W - 1; k++) { edgeQuad(0, k); if (H > 2) edgeQuad(H - 2, k); }
  for (let r = 1; r < H - 2; r++) { edgeQuad(r, 0); if (W > 2) edgeQuad(r, W - 2); }
  if (step > 1) { // the nodes left out: how far above the drape's quads they rise, each lifting only its own quad's corners
    const find = (arr, v, desc) => { let lo = 0, hi = arr.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (desc ? arr[m] >= v : arr[m] <= v) lo = m; else hi = m - 1; } return lo; };
    for (let j = 0; j < gridH; j++) {
      const y = ymax - j * dy; if (y < by0 || y > by1) continue;
      const r = find(ys, y, true);
      for (let i = 0; i < gridW; i++) {
        const x = xmin + i * dx; if (x < bx0 || x > bx1 || bad(i, j)) continue;
        bump(r, find(xs, x, false), terrain.elevations[j * gridW + i] - drapeAt0(x, y));
      }
    }
  }
  let most = 0; for (const v of lift) if (v > most) most = v;
  const uniformLift = adaptiveError > 0 ? adaptiveError * 1.25 : 0;
  return { xs, ys, z, indices, step, lift, uniformLift, extraLift: most + uniformLift };
}

// The drape grid's own surface at (x, y), with the same diagonal (for the rise check)
function gridDrapeAt(xs, ys, z) {
  const W = xs.length;
  const find = (arr, v, desc) => { let lo = 0, hi = arr.length - 2; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (desc ? arr[m] >= v : arr[m] <= v) lo = m; else hi = m - 1; } return lo; };
  return (x, y) => {
    const k = find(xs, x, false), r = find(ys, y, true);
    const tx = (x - xs[k]) / (xs[k + 1] - xs[k] || 1), ty = (ys[r] - y) / (ys[r] - ys[r + 1] || 1);
    const a = z[r * W + k], b = z[r * W + k + 1], c = z[(r + 1) * W + k], d = z[(r + 1) * W + k + 1];
    return tx + ty <= 1 ? a + tx * (b - a) + ty * (c - a) : d + (1 - tx) * (c - d) + (1 - ty) * (b - d);
  };
}

// TASKS.csv #3449 — over an adaptive (decimated, #796) terrain mesh the drape is the drawn mesh itself: its triangles inside the box kept as
// they are, those across the box's edge clipped to it (each triangle is flat, so a clipped point's height is read on its own plane), those
// outside dropped. The grid drape (terrainDrapeGrid) skipped nodes on a 513-node grid and lifted each quad over the ridges it cut: at the
// cliffs of NW BC that lift reached 140 m at a vertex. This one matches the drawn terrain exactly, with no more triangles than it.
// vertexIds / indices: buildAdaptiveTerrain's (grid node ids, triangles over them). -> { x, y, z: Float64Array (world), indices: Uint32Array }
export function adaptiveDrape(terrain, { vertexIds, indices }, bbox) {
  const [bx0, by0, bx1, by1] = bbox;
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const { gridW, gridH, elevations } = terrain;
  const sx = gridW > 1 ? (xmax - xmin) / (gridW - 1) : 0, sy = gridH > 1 ? (ymax - ymin) / (gridH - 1) : 0;
  const X = [], Y = [], Z = [], out = [], shared = new Map(); // shared: an unclipped vertex (by its index in vertexIds) -> its drape index
  const nodeXYZ = (v) => { const id = vertexIds[v], i = id % gridW, j = (id - i) / gridW; return [xmin + i * sx, ymax - j * sy, elevations[id]]; };
  const keep = (v) => { let q = shared.get(v); if (q === undefined) { const [x, y, z] = nodeXYZ(v); q = X.length; X.push(x); Y.push(y); Z.push(z); shared.set(v, q); } return q; };
  const add = (x, y, z) => { X.push(x); Y.push(y); Z.push(z); return X.length - 1; };
  const inside = (p) => p[0] >= bx0 && p[0] <= bx1 && p[1] >= by0 && p[1] <= by1;
  // Sutherland-Hodgman against one side of the box: points [x, y, z], linear along each edge (the triangle is a plane)
  const clip = (poly, axis, bound, keepBelow) => {
    const res = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k], q = poly[(k + 1) % poly.length];
      const pin = keepBelow ? p[axis] <= bound : p[axis] >= bound, qin = keepBelow ? q[axis] <= bound : q[axis] >= bound;
      if (pin) res.push(p);
      if (pin !== qin) { const t = (bound - p[axis]) / (q[axis] - p[axis]); res.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1]), p[2] + t * (q[2] - p[2])]); }
    }
    return res;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    const pa = nodeXYZ(a), pb = nodeXYZ(b), pc = nodeXYZ(c);
    if (inside(pa) && inside(pb) && inside(pc)) { out.push(keep(a), keep(b), keep(c)); continue; }
    if (Math.max(pa[0], pb[0], pc[0]) < bx0 || Math.min(pa[0], pb[0], pc[0]) > bx1 || Math.max(pa[1], pb[1], pc[1]) < by0 || Math.min(pa[1], pb[1], pc[1]) > by1) continue;
    let poly = [pa, pb, pc];
    poly = clip(poly, 0, bx0, false); if (poly.length) poly = clip(poly, 0, bx1, true);
    if (poly.length) poly = clip(poly, 1, by0, false); if (poly.length) poly = clip(poly, 1, by1, true);
    if (poly.length < 3) continue;
    const ids = poly.map((p) => add(p[0], p[1], p[2])); // the triangle's own order, so the winding (and the normals) stay the full mesh's
    for (let k = 1; k < ids.length - 1; k++) out.push(ids[0], ids[k], ids[k + 1]);
  }
  return { x: Float64Array.from(X), y: Float64Array.from(Y), z: Float64Array.from(Z), indices: Uint32Array.from(out) };
}

// TASKS.csv #3252 phase 2 — the adaptive mesh's triangles near a small box (a detail tile), so a tile's drape (adaptiveDrape over them) does
// not walk all 160,000-480,000 triangles: each triangle is listed in the cells of a 64 x 64 grid over the terrain its own box touches. The
// subset holds every triangle that can reach the box, so adaptiveDrape over it gives exactly what it gives over the whole mesh.
const BUCKETS = 64;
const bucketCache = new WeakMap();
function triangleBuckets(terrain, am) {
  let b = bucketCache.get(am);
  if (b) return b;
  const { gridW, gridH } = terrain, { vertexIds, indices } = am;
  const cell = new Array(BUCKETS * BUCKETS);
  for (let k = 0; k < cell.length; k++) cell[k] = [];
  const bi = (i) => Math.min(BUCKETS - 1, Math.floor((i / Math.max(1, gridW - 1)) * BUCKETS)), bj = (j) => Math.min(BUCKETS - 1, Math.floor((j / Math.max(1, gridH - 1)) * BUCKETS));
  for (let t = 0; t < indices.length; t += 3) {
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
    for (let q = 0; q < 3; q++) { const id = vertexIds[indices[t + q]], i = id % gridW, j = (id - i) / gridW; if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
    for (let v = bj(j0); v <= bj(j1); v++) for (let u = bi(i0); u <= bi(i1); u++) cell[v * BUCKETS + u].push(t);
  }
  b = { cell, mark: new Uint32Array(indices.length / 3), pass: 0 };
  bucketCache.set(am, b);
  return b;
}
export function trianglesNear(terrain, am, bbox) {
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const b = triangleBuckets(terrain, am);
  const fi = (x) => Math.min(BUCKETS - 1, Math.max(0, Math.floor(((x - xmin) / (xmax - xmin)) * BUCKETS)));
  const fj = (y) => Math.min(BUCKETS - 1, Math.max(0, Math.floor(((ymax - y) / (ymax - ymin)) * BUCKETS)));
  const u0 = fi(bbox[0]), u1 = fi(bbox[2]), v0 = fj(bbox[3]), v1 = fj(bbox[1]);
  const pass = ++b.pass, out = [];
  for (let v = v0; v <= v1; v++) for (let u = u0; u <= u1; u++) for (const t of b.cell[v * BUCKETS + u]) { const k = t / 3; if (b.mark[k] === pass) continue; b.mark[k] = pass; out.push(am.indices[t], am.indices[t + 1], am.indices[t + 2]); }
  return { vertexIds: am.vertexIds, indices: Uint32Array.from(out) };
}
