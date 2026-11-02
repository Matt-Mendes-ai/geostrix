// TASKS.csv #1339 — the separate connected bodies of a triangle mesh with shared vertices (a marching-cubes envelope),
// by triangle count, and the mesh cut down to its largest one. Faces: [[a, b, c]]. Pure.
function faceLabels(faces) {
  const parent = new Map();
  const find = (v) => {
    if (!parent.has(v)) parent.set(v, v);
    let r = v;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(v) !== r) { const n = parent.get(v); parent.set(v, r); v = n; }
    return r;
  };
  faces.forEach(([a, b, c]) => { const r = find(a); parent.set(find(b), r); parent.set(find(c), r); });
  return faces.map((f) => find(f[0]));
}

// -> { count, largest (its root label), largestShare (0-1 of the triangles) }
export function meshBodies(faces) {
  const labels = faceLabels(faces), n = new Map();
  labels.forEach((l) => n.set(l, (n.get(l) || 0) + 1));
  let largest = null, most = 0;
  n.forEach((k, l) => { if (k > most) { most = k; largest = l; } });
  return { count: n.size, largest, largestShare: faces.length ? most / faces.length : 0, labels };
}

// -> { vertices, faces, removedBodies } with the unused vertices gone
export function keepLargestBody(vertices, faces) {
  const b = meshBodies(faces);
  if (b.count < 2) return { vertices, faces, removedBodies: 0 };
  const map = new Map(), outV = [], outF = [];
  const idx = (v) => { let i = map.get(v); if (i === undefined) { i = outV.length; map.set(v, i); outV.push(vertices[v]); } return i; };
  faces.forEach((f, i) => { if (b.labels[i] === b.largest) outF.push([idx(f[0]), idx(f[1]), idx(f[2])]); });
  return { vertices: outV, faces: outF, removedBodies: b.count - 1 };
}
