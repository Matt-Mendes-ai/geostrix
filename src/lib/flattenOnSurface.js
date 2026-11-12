// TASKS.csv #2710 (split from #2424) — a stratigraphic ('flattened') variogram: the in-plane pairs follow a modelled contact (a Top of a
// unit) instead of a flat or tilted plane. Each composite's elevation becomes its depth below the surface at its own (x, y), so two samples
// at the same depth below a folded or tilted contact pair as if level. Pure; world coordinates (east, north, up), as saved surfaces are.

// vertices: [x, y, z, ...]; indices: [a, b, c, ...] -> (x, y, zNear) => the surface's elevation there (where several sheets of it lie above
// one another, the one nearest zNear), or null outside its footprint. The triangles are binned on a plan grid, so a query reads a few.
export function surfaceElevation(vertices, indices) {
  const V = vertices || [], I = indices || [];
  const nt = Math.floor(I.length / 3);
  if (!nt || V.length < 9) return () => null;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < V.length; i += 3) { const x = V[i], y = V[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const g = Math.max(1e-6, Math.sqrt(Math.max(1e-6, (x1 - x0) * (y1 - y0)) / nt) * 2);
  const nx = Math.max(1, Math.ceil((x1 - x0) / g) + 1); // the bins are keyed row by row (j * nx + i)
  const bins = new Map();
  for (let t = 0; t < nt; t++) {
    const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
    const i0 = Math.floor((Math.min(V[a], V[b], V[c]) - x0) / g), i1 = Math.floor((Math.max(V[a], V[b], V[c]) - x0) / g);
    const j0 = Math.floor((Math.min(V[a + 1], V[b + 1], V[c + 1]) - y0) / g), j1 = Math.floor((Math.max(V[a + 1], V[b + 1], V[c + 1]) - y0) / g);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = j * nx + i; const l = bins.get(k); if (l) l.push(t); else bins.set(k, [t]); }
  }
  return (x, y, zNear = null) => {
    if (!(x >= x0 && x <= x1 && y >= y0 && y <= y1)) return null;
    const list = bins.get(Math.floor((y - y0) / g) * nx + Math.floor((x - x0) / g));
    if (!list) return null;
    let best = null, bestD = Infinity;
    for (const t of list) {
      const a = I[3 * t] * 3, b = I[3 * t + 1] * 3, c = I[3 * t + 2] * 3;
      const ax = V[a], ay = V[a + 1], bx = V[b], by = V[b + 1], cx = V[c], cy = V[c + 1];
      const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(det) < 1e-12) continue; // a vertical triangle has no elevation to give in plan
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / det, l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / det, l3 = 1 - l1 - l2;
      const e = -1e-9;
      if (l1 < e || l2 < e || l3 < e) continue;
      const z = l1 * V[a + 2] + l2 * V[b + 2] + l3 * V[c + 2];
      const d = zNear == null ? -z : Math.abs(z - zNear); // no hint: the highest
      if (d < bestD) { bestD = d; best = z; }
    }
    return best;
  };
}

// points: [{ x, y, z, ... }] -> { points: the same with z = the depth below the surface, negative (z - surface), outside: how many lie
// outside its footprint (left out) }
export function flattenOnSurface(points, zAt) {
  const out = [];
  let outside = 0;
  for (const p of points || []) {
    const s = zAt(p.x, p.y, p.z);
    if (s == null || !Number.isFinite(s)) { outside++; continue; }
    out.push({ ...p, z: p.z - s });
  }
  return { points: out, outside };
}
