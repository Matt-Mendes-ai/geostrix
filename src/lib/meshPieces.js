// TASKS.csv #3991 (Matt: "I should be able to select meshes individually and delete them" — an implicit surface that is 2 separate pieces, a
// sheet and a blob, with no way to keep one) — the separate pieces (connected components) of an indexed triangle mesh, and the mesh cut down to
// some of them. Two triangles are in one piece when they share a vertex index: the volume card's own count (volumetrics.js
// countConnectedComponents), so the pieces offered are the pieces the card reports. Pure; meshPiecesClient.js runs it in a worker for a big mesh
// and caches the labels per geometry.

// index: the triangle vertex indices (any array-like), vertexCount: the positions' count -> { count, labels: Int32Array (one per triangle,
// 0 = the piece with the most triangles, then by size), sizes: triangles per piece }; null when there is nothing to label
export function labelPieces(index, vertexCount) {
  const tri = Math.floor((index?.length || 0) / 3);
  if (!tri || !(vertexCount > 0)) return null;
  const parent = new Int32Array(vertexCount);
  for (let i = 0; i < vertexCount; i++) parent[i] = i;
  const find = (a) => { let r = a; while (parent[r] !== r) r = parent[r]; while (parent[a] !== r) { const n = parent[a]; parent[a] = r; a = n; } return r; };
  for (let t = 0; t < tri; t++) {
    const a = find(index[3 * t]), b = find(index[3 * t + 1]), c = find(index[3 * t + 2]);
    if (a !== b) parent[a] = b;
    const b2 = find(b);
    if (b2 !== c) parent[c] = b2;
  }
  const rootOf = new Int32Array(tri), seen = new Map();
  for (let t = 0; t < tri; t++) {
    const r = find(index[3 * t]);
    rootOf[t] = r;
    seen.set(r, (seen.get(r) || 0) + 1);
  }
  // pieces numbered by size (largest first; ties by first triangle), so "piece 1" is the main body
  const order = [...seen.entries()].sort((x, y) => y[1] - x[1]), num = new Map(order.map(([r], i) => [r, i]));
  const labels = new Int32Array(tri);
  for (let t = 0; t < tri; t++) labels[t] = num.get(rootOf[t]);
  return { count: order.length, labels, sizes: order.map(([, n]) => n) };
}

// the mesh cut down to the pieces in `keep` (a Set of labels): the positions it still uses, compacted, and the triangles re-indexed.
// positions: flat xyz (any array-like) -> { positions: Float32Array, index: Uint32Array, faces, vertices }
export function keepPieces(positions, index, labels, keep) {
  const tri = labels.length, map = new Int32Array(positions.length / 3).fill(-1), outIdx = [];
  let nv = 0;
  for (let t = 0; t < tri; t++) {
    if (!keep.has(labels[t])) continue;
    for (let k = 0; k < 3; k++) { const v = index[3 * t + k]; if (map[v] < 0) map[v] = nv++; outIdx.push(map[v]); }
  }
  const out = new Float32Array(nv * 3);
  for (let v = 0; v < map.length; v++) if (map[v] >= 0) { out[3 * map[v]] = positions[3 * v]; out[3 * map[v] + 1] = positions[3 * v + 1]; out[3 * map[v] + 2] = positions[3 * v + 2]; }
  return { positions: out, index: Uint32Array.from(outIdx), faces: outIdx.length / 3, vertices: nv };
}

// the triangles of one piece, as an index into the SAME positions (for a highlight: no copy of the positions)
export function pieceIndex(index, labels, label) {
  const out = [];
  for (let t = 0; t < labels.length; t++) if (labels[t] === label) out.push(index[3 * t], index[3 * t + 1], index[3 * t + 2]);
  return Uint32Array.from(out);
}

// what an edit leaves: "delete" a piece, "keep" only it, or "split" into one mesh per piece -> [{ keep: Set, piece?: k }] (a list of meshes)
export function pieceParts(kind, count, label) {
  if (!(count > 1)) return null;
  const all = [...Array(count).keys()];
  if (kind === "delete") return [{ keep: new Set(all.filter((l) => l !== label)) }];
  if (kind === "keep") return [{ keep: new Set([label]) }];
  if (kind === "split") return all.map((l) => ({ keep: new Set([l]), piece: l }));
  return null;
}

// the name of a split piece: "Top of DLST (piece 2 of 2)"; an earlier "(piece k of n)" is replaced, not stacked
export const pieceName = (name, k, n) => `${String(name || "Surface").replace(/ \(piece \d+ of \d+\)$/, "")} (piece ${k} of ${n})`;

// the record an edit leaves on the surface (its `edits`, which the exports itemise: meshExport.js provenanceLines)
export function pieceEdit(kind, { count, label, facesBefore, facesAfter, volumeBeforeM3 = null, volumeAfterM3 = null, at = new Date().toISOString() }) {
  return { at, kind: "piece", action: kind === "delete" ? "piece removed by the user" : kind === "keep" ? "other pieces removed by the user" : "split into separate meshes by the user", piecesBefore: count, piece: label + 1, facesBefore, facesAfter, volumeBeforeM3, volumeAfterM3 };
}
