// TASKS.csv #3152 (from #2928 (5), WA iron) — the single-surface Implicit top of TNAM had no mesh above or below 32 of its own 159 contacts
// after its cuts, while its fit line still counted 159 (the 32 were measured against the nearest kept part, metres to the side). A contact is
// covered when a kept triangle lies over or under it in plan; the fit is taken over those, and the run says how many were left out and which
// cut removed the surface there. Scene frame: y up, plan = (x, z). Pure.

// points: [[x, y, z]], verts: [[x, y, z]] or [{ x, y, z }], faces: [[a, b, c]] -> Uint8Array (1 = a triangle lies over or under the point)
export function coveredInPlan(points, verts, faces) {
  const n = points?.length || 0, out = new Uint8Array(n);
  if (!n || !faces?.length) return out;
  const vx = (k) => (Array.isArray(verts[k]) ? verts[k][0] : verts[k].x), vz = (k) => (Array.isArray(verts[k]) ? verts[k][2] : verts[k].z);
  // the triangles in a plan grid of about one triangle a cell, so each point tests only the triangles of its own cell
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const f of faces) for (const k of f) { const x = vx(k), z = vz(k); if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const side = Math.max(1, Math.ceil(Math.sqrt(faces.length))), cx = (x1 - x0) / side || 1, cz = (z1 - z0) / side || 1;
  const cells = new Map(), key = (i, j) => i * 65536 + j;
  faces.forEach((f, t) => {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const k of f) { const x = vx(k), z = vz(k); if (x < a0) a0 = x; if (x > a1) a1 = x; if (z < b0) b0 = z; if (z > b1) b1 = z; }
    const i0 = Math.max(0, Math.floor((a0 - x0) / cx)), i1 = Math.min(side - 1, Math.floor((a1 - x0) / cx));
    const j0 = Math.max(0, Math.floor((b0 - z0) / cz)), j1 = Math.min(side - 1, Math.floor((b1 - z0) / cz));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j); const l = cells.get(k); if (l) l.push(t); else cells.set(k, [t]); }
  });
  const EPS = 1e-9;
  for (let p = 0; p < n; p++) {
    const px = points[p][0], pz = points[p][2];
    if (px < x0 - EPS || px > x1 + EPS || pz < z0 - EPS || pz > z1 + EPS) continue;
    const i = Math.min(side - 1, Math.max(0, Math.floor((px - x0) / cx))), j = Math.min(side - 1, Math.max(0, Math.floor((pz - z0) / cz)));
    for (const t of cells.get(key(i, j)) || []) {
      const [a, b, c] = faces[t];
      const ax = vx(a), az = vz(a), bx = vx(b), bz = vz(b), qx = vx(c), qz = vz(c);
      const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz), d2 = (px - qx) * (bz - qz) - (bx - qx) * (pz - qz), d3 = (px - ax) * (qz - az) - (qx - ax) * (pz - az);
      const neg = d1 < -EPS || d2 < -EPS || d3 < -EPS, pos = d1 > EPS || d2 > EPS || d3 > EPS;
      if (!(neg && pos)) { out[p] = 1; break; }
    }
  }
  return out;
}

// the contacts the final mesh does not cover, and the first cut whose input mesh still covered them. stages: [{ cut, verts, faces }] from the
// LAST cut back to the first (each stage the mesh BEFORE that cut). -> { covered: Uint8Array, left: n, byCut: { cut: count }, never: count }
export function contactCoverage(points, finalVerts, finalFaces, stages = []) {
  const covered = coveredInPlan(points, finalVerts, finalFaces);
  let left = 0; const leftIdx = [];
  for (let i = 0; i < covered.length; i++) if (!covered[i]) { left++; leftIdx.push(i); }
  const byCut = {}; let never = 0;
  if (left) {
    let todo = leftIdx;
    for (const st of stages) {
      if (!todo.length) break;
      const c = coveredInPlan(todo.map((i) => points[i]), st.verts, st.faces), still = [];
      todo.forEach((i, k) => { if (c[k]) byCut[st.cut] = (byCut[st.cut] || 0) + 1; else still.push(i); });
      // a contact the mesh before this cut covered was removed BY this cut; the rest go on to the earlier cuts
      todo = still;
    }
    never = todo.length;
  }
  return { covered, left, byCut, never };
}
