// TASKS.csv #568 — cut a triangle mesh exactly at a boundary instead of dropping whole triangles. Clipping a GemPy
// surface to topography (by triangle centroid) or to a domain (any vertex outside) used to leave a stair-stepped
// edge at the model's cell size (about 55 m steps at 36^3 over 2 km), so the surface stopped short of the ground or
// the fault, in 3D, in sections and in OBJ / DXF exports. Here a triangle that straddles the boundary is SPLIT:
// the crossing point on each straddling edge is found by bisection on the `isOutside` test (12 steps = 1/4096 of
// the edge, ~1 cm on a 55 m edge), and the inside part is kept as one or two triangles with the original winding.
// Crossing points are shared by the two triangles of an edge, so the cut edge stays watertight.
//
// verts: [{x, y, z}], faces: [[a, b, c]], isOutside(point) -> boolean (the side to remove).
// Returns { verts (the input vertices, then the new crossing points), faces, split, removed }.
export function clipMesh(verts, faces, isOutside, { iterations = 12 } = {}) {
  const out = verts.slice();
  const outside = verts.map((v) => !!isOutside(v));
  const crossing = new Map(); // "inside|outside" vertex pair -> index of the crossing point
  const cross = (a, b) => { // a inside, b outside
    const key = `${a}|${b}`;
    let idx = crossing.get(key);
    if (idx !== undefined) return idx;
    const A = verts[a], B = verts[b];
    let lo = 0, hi = 1;
    for (let k = 0; k < iterations; k++) {
      const t = (lo + hi) / 2;
      if (isOutside({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t })) hi = t; else lo = t;
    }
    const t = (lo + hi) / 2;
    idx = out.length;
    out.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: A.z + (B.z - A.z) * t });
    crossing.set(key, idx);
    return idx;
  };
  const kept = [];
  let split = 0, removed = 0;
  for (const f of faces) {
    const o = f.map((i) => outside[i]);
    const nOut = o[0] + o[1] + o[2];
    if (nOut === 0) { kept.push(f); continue; }
    if (nOut === 3) { removed++; continue; }
    split++;
    // rotate so the odd one out comes first, keeping the cyclic order (= the winding)
    const r = nOut === 1 ? o.indexOf(true) : o.indexOf(false);
    const [p, q, s] = [f[r], f[(r + 1) % 3], f[(r + 2) % 3]];
    if (nOut === 1) {
      // p outside, q and s inside: quad q, s, s->p, p->q
      const sp = cross(s, p), qp = cross(q, p);
      kept.push([qp, q, s], [qp, s, sp]);
    } else {
      // p inside, q and s outside: one triangle p, p->q, p->s
      kept.push([p, cross(p, q), cross(p, s)]);
    }
  }
  return { verts: out, faces: kept, split, removed };
}
