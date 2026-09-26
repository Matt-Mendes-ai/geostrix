// TASKS.csv #314 (#330 Leapfrog review) — GemPy can return NaN vertex coordinates; FastAPI serialises NaN
// as JSON null with HTTP 200, so a broken surface used to arrive looking like a success and be built into a
// mesh with NaN positions (invisible, and poisoning its bounding box, so "zoom to surface" went nowhere).
// Every triangle touching a bad vertex is dropped. The bad vertices stay in the array (indices must not
// shift) but are moved onto a finite vertex so the mesh's bounding box stays true; nothing references them.
export function sanitizeMesh(vertices, faces) {
  const n = vertices?.length || 0;
  const ok = (v) => Array.isArray(v) && v.length >= 3 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
  const bad = new Set();
  for (let i = 0; i < n; i++) if (!ok(vertices[i])) bad.add(i);
  if (!bad.size) return { vertices, faces, badVertices: 0, droppedFaces: 0 };
  if (bad.size === n) return { vertices: [], faces: [], badVertices: n, droppedFaces: faces?.length || 0 };
  const anchor = vertices.find(ok);
  const cleanV = vertices.map((v, i) => (bad.has(i) ? [anchor[0], anchor[1], anchor[2]] : v));
  const cleanF = (faces || []).filter((f) => !f.some((i) => bad.has(i) || i < 0 || i >= n));
  return { vertices: cleanV, faces: cleanF, badVertices: bad.size, droppedFaces: (faces?.length || 0) - cleanF.length };
}
