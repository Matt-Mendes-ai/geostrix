// TASKS.csv #600 (startup budget) — split out of meshExport.js so the 3D view can keep it eager while the
// exporters (and three's GLTFExporter) load on first use.
// TASKS.csv #491 — the same conversion as sceneVertsToWorld, but flat ([x0, y0, z0, x1, ...]) and straight
// off the typed arrays: the #52 sync-out stores surfaces flat anyway, and building one [x, y, z] array per
// vertex through BufferAttribute.getX was most of a ~260 ms UI stall after a 1M-face solid import.
// `round` (optional) is applied to every coordinate.
export function sceneVertsToWorldFlat(geometry, origin, round = null) {
  const pos = geometry?.attributes?.position;
  if (!pos) return { vertices: [], indices: [] };
  const ox = origin?.x || 0, oy = origin?.y || 0, oz = origin?.z || 0;
  const a = pos.array, st = pos.itemSize === 3 && !pos.isInterleavedBufferAttribute ? 3 : 0;
  const n = pos.count, vertices = new Array(n * 3);
  for (let i = 0; i < n; i++) {
    const sx = st ? a[i * 3] : pos.getX(i), sy = st ? a[i * 3 + 1] : pos.getY(i), sz = st ? a[i * 3 + 2] : pos.getZ(i);
    const x = sx + ox, y = oy - sz, z = sy + oz;
    vertices[i * 3] = round ? round(x) : x; vertices[i * 3 + 1] = round ? round(y) : y; vertices[i * 3 + 2] = round ? round(z) : z;
  }
  const index = geometry.index;
  const m = index ? index.count : n, ia = index?.array, indices = new Array(m);
  for (let i = 0; i < m; i++) indices[i] = index ? ia[i] : i;
  return { vertices, indices };
}
