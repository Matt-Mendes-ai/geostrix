// TASKS.csv #796 — an adaptive triangle mesh for big terrain grids (the #792 PyVista review: "decimate the terrain
// instead of drawing every node"). A 1025 x 1025 grid drawn node-for-node is two million triangles; most of them sit
// on ground a few large triangles describe to within a fraction of a metre.
//
// Right-triangulated irregular network (RTIN), after Evans, Kirkpatrick & Townsend (2001) and Vladimir Agafonkin's
// Martini (github.com/mapbox/martini, ISC licence), written here for GeoStrix's grids: any width x height, laid on
// the smallest (2^k + 1)-square that holds it, with no-data nodes. Every triangle is split along its hypotenuse
// while the split point's height differs from the hypotenuse's mean by more than `maxError` (metres) - its error,
// carried up from its descendants, so the mesh never cracks. (Measured at the split points, not at every node a
// triangle covers, so a node can sit a little beyond maxError - 1.13 m at 1 m in the test.) Triangles that mix real nodes with nodes outside the
// grid or no-data nodes get an infinite error, so the grid's edges and holes stay exactly where the full mesh puts
// them; triangles touching any such node are left out, as before (#421).
//
// buildAdaptiveTerrain(gridW, gridH, elevations, isBad, { maxTriangles }) -> { vertexIds, indices, maxError, triangles }
//   vertexIds: Uint32Array of grid node indices (j * gridW + i) the mesh uses; indices: Uint32Array into vertexIds
//   (the full mesh's winding: a, c, b for a quad's upper-left triangle); maxError: the tolerance it settled on.
// The tolerance starts at 0.25 m and doubles until the mesh fits in `maxTriangles`.

function rtinCoords(size) {
  const tile = size - 1, n = tile * tile * 2 - 2;
  const coords = new Uint16Array(n * 4);
  for (let i = 0; i < n; i++) {
    let id = i + 2, ax = 0, ay = 0, bx = 0, by = 0, cx = 0, cy = 0;
    if (id & 1) { bx = by = cx = tile; } else { ax = ay = cy = tile; }
    while ((id >>= 1) > 1) {
      const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
      if (id & 1) { bx = ax; by = ay; ax = cx; ay = cy; } else { ax = bx; ay = by; bx = cx; by = cy; }
      cx = mx; cy = my;
    }
    const k = i * 4;
    coords[k] = ax; coords[k + 1] = ay; coords[k + 2] = bx; coords[k + 3] = by;
  }
  return coords;
}

export function rtinErrors(gridW, gridH, elevations, isBad) {
  let size = 2;
  while (size - 1 < Math.max(gridW, gridH) - 1) size = (size - 1) * 2 + 1;
  if (size < 3) size = 3;
  const tile = size - 1, n = tile * tile * 2 - 2, nParents = n - tile * tile;
  // heights on the square: the grid, edge-extended beyond it (only so the arithmetic stays finite)
  const h = new Float32Array(size * size), bad = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    const jy = Math.min(y, gridH - 1);
    for (let x = 0; x < size; x++) {
      const ix = Math.min(x, gridW - 1), k = jy * gridW + ix;
      h[y * size + x] = elevations[k];
      bad[y * size + x] = x >= gridW || y >= gridH || (isBad ? isBad(k) : !Number.isFinite(elevations[k])) ? 1 : 0;
    }
  }
  const coords = rtinCoords(size);
  const errors = new Float32Array(size * size);
  for (let i = n - 1; i >= 0; i--) {
    const k = i * 4;
    const ax = coords[k], ay = coords[k + 1], bx = coords[k + 2], by = coords[k + 3];
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1, cx = mx + my - ay, cy = my + ax - mx;
    const a = ay * size + ax, b = by * size + bx, m = my * size + mx, c = cy * size + cx;
    const nb = bad[a] + bad[b] + bad[m] + bad[c];
    let e = nb > 0 && nb < 4 ? Infinity : Math.abs((h[a] + h[b]) / 2 - h[m]);
    if (i < nParents) {
      const l = ((ay + cy) >> 1) * size + ((ax + cx) >> 1), r = ((by + cy) >> 1) * size + ((bx + cx) >> 1);
      if (errors[l] > e) e = errors[l];
      if (errors[r] > e) e = errors[r];
    }
    if (e > errors[m]) errors[m] = e;
  }
  return { size, errors, bad };
}

// The leaf triangles for one tolerance: count only (emit = null) or written into `out` as square-node triplets
function rtinWalk({ size, errors, bad }, maxError, out) {
  const tile = size - 1;
  let count = 0;
  const walk = (ax, ay, bx, by, cx, cy) => {
    const mx = (ax + bx) >> 1, my = (ay + by) >> 1;
    if (Math.abs(ax - cx) + Math.abs(ay - cy) > 1 && errors[my * size + mx] > maxError) {
      walk(cx, cy, ax, ay, mx, my);
      walk(bx, by, cx, cy, mx, my);
      return;
    }
    const a = ay * size + ax, b = by * size + bx, c = cy * size + cx;
    if (bad[a] || bad[b] || bad[c]) return;
    if (out) { out[count * 3] = a; out[count * 3 + 1] = b; out[count * 3 + 2] = c; }
    count++;
  };
  walk(0, 0, tile, tile, tile, 0);
  walk(tile, tile, 0, 0, 0, tile);
  return count;
}

export function buildAdaptiveTerrain(gridW, gridH, elevations, isBad = null, { maxTriangles = 160000, startError = 0.25 } = {}) {
  const rt = rtinErrors(gridW, gridH, elevations, isBad);
  let maxError = startError, count = rtinWalk(rt, maxError, null);
  while (count > maxTriangles && maxError < 1e5) { maxError *= 2; count = rtinWalk(rt, maxError, null); }
  const tri = new Uint32Array(count * 3);
  rtinWalk(rt, maxError, tri);
  // compact to the grid nodes actually used
  const remap = new Int32Array(rt.size * rt.size).fill(-1), ids = [];
  const indices = new Uint32Array(count * 3);
  for (let t = 0; t < count; t++) {
    // RTIN leaves come out in either orientation: put each one in the full mesh's (counter-clockwise seen from
    // above in scene space, where rows run south) so the normals agree
    let p = tri[t * 3], q = tri[t * 3 + 1], r = tri[t * 3 + 2];
    const px = p % rt.size, py = (p / rt.size) | 0, qx = q % rt.size, qy = (q / rt.size) | 0, rx = r % rt.size, ry = (r / rt.size) | 0;
    if ((qx - px) * (ry - py) - (qy - py) * (rx - px) > 0) { const s = q; q = r; r = s; }
    for (const [slot, v] of [[0, p], [1, q], [2, r]]) {
      if (remap[v] < 0) { remap[v] = ids.length; ids.push(((v / rt.size) | 0) * gridW + (v % rt.size)); }
      indices[t * 3 + slot] = remap[v];
    }
  }
  return { vertexIds: Uint32Array.from(ids), indices, maxError, triangles: count };
}
