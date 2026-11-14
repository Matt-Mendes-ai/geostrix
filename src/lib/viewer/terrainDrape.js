// TASKS.csv #3380 (#3195, Galore Creek review) — a map layer draped on the terrain was holed by it: on the terrain built from the collars
// (a 200 x 101 grid, nodes 147 m apart) patches of ground showed through the unit polygons, up to about 100 m long, and Identify inside a
// polygon answered 'Terrain'. The drape was a plane of 32-256 even segments over the layer's box, heights read BILINEARLY, while the terrain
// is drawn as two triangles per grid cell split along one diagonal: inside a twisted cell the two surfaces part by up to a quarter of the
// cell's twist (metres to tens of metres on rough 147 m cells), far more than the drape's 0.3 m lift. Now the drape's vertices are the
// terrain's own nodes inside the box (plus the box edges), each quad split along the terrain's diagonal and its heights read on the
// terrain's triangles, so inside the box it IS the drawn terrain, lifted. Pure: no three.js.

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
// adaptive (decimated) terrain mesh, the drape is not the drawn surface exactly: `extraLift` is how far the terrain's nodes rise above the
// drape inside the box (step > 1) plus the adaptive mesh's error, so the caller lifts the drape clear of it.
// -> { xs, ys (north first), z: Float64Array (ys.length x xs.length, row-major), indices: Uint32Array (a, c, b, b, c, d per quad), step, extraLift }
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
  const indices = new Uint32Array((W - 1) * (H - 1) * 6);
  let n = 0;
  for (let r = 0; r < H - 1; r++) for (let k = 0; k < W - 1; k++) {
    const a = r * W + k, b = a + 1, c = a + W, d = c + 1;
    indices[n++] = a; indices[n++] = c; indices[n++] = b; indices[n++] = b; indices[n++] = c; indices[n++] = d;
  }
  let rise = 0;
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
    for (const [x, y] of pts) { if (x < xa || x > xb || y > yn || y < yS) continue; const up = terrainMeshElevation(terrain, x, y) - drapeAt0(x, y); if (up > rise) rise = up; }
  };
  for (let k = 0; k < W - 1; k++) { edgeQuad(0, k); if (H > 2) edgeQuad(H - 2, k); }
  for (let r = 1; r < H - 2; r++) { edgeQuad(r, 0); if (W > 2) edgeQuad(r, W - 2); }
  if (step > 1) { // the nodes left out: how far above the drape's quads they rise
    const drapeAt = gridDrapeAt(xs, ys, z);
    for (let j = 0; j < gridH; j++) {
      const y = ymax - j * dy; if (y < by0 || y > by1) continue;
      for (let i = 0; i < gridW; i++) {
        const x = xmin + i * dx; if (x < bx0 || x > bx1) continue;
        const up = terrain.elevations[j * gridW + i] - drapeAt(x, y);
        if (up > rise) rise = up;
      }
    }
  }
  return { xs, ys, z, indices, step, extraLift: rise + (adaptiveError > 0 ? adaptiveError * 1.25 : 0) };
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
