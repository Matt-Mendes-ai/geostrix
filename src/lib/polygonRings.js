// Polygon ring helpers shared by the GeoPackage and shapefile writers (no dependencies, so shapefile.js stays light).
// TASKS.csv #728 — every ring of a feature is classified by containment: a ring inside another ring is a hole of the
// smallest outer ring holding it. TASKS.csv #1025 — the shapefile writer also needs each ring's winding.
export function ringContains(ring, [px, py]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// shoelace: > 0 counter-clockwise, < 0 clockwise (x east, y north)
export function signedRingArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}
export const ringArea = (r) => Math.abs(signedRingArea(r));
// rings -> [[outer, ...holes], ...]
export function polygonsFromRings(rings) {
  const rs = rings.filter((r) => r?.length >= 3);
  const depth = rs.map((r, i) => rs.filter((o, k) => k !== i && ringContains(o, r[0])).length);
  const polys = [];
  rs.forEach((r, i) => { if (depth[i] % 2 === 0) polys.push({ outer: r, holes: [], i }); });
  rs.forEach((r, i) => {
    if (depth[i] % 2 === 0) return;
    const holder = polys.filter((p) => ringContains(p.outer, r[0])).sort((a, b) => ringArea(a.outer) - ringArea(b.outer))[0];
    if (holder) holder.holes.push(r);
  });
  return polys.map((p) => [p.outer, ...p.holes]);
}
export const closeRing = (r) => { const a = r[0], b = r[r.length - 1]; return a[0] === b[0] && a[1] === b[1] && (a[2] ?? 0) === (b[2] ?? 0) ? r : [...r, a]; };
// TASKS.csv #1025 (review #1016) — the ESRI shapefile rule: outer rings clockwise, holes counter-clockwise, each closed.
// Rings written in the winding they arrived in (Perk-Rocky's TAB: 20 clockwise, 111 counter-clockwise) were read by GDAL
// as 35.894 km² with 2 invalid polygons instead of 34.337 km² and 0.
export function shapefileRings(rings) {
  const out = [];
  polygonsFromRings(rings).forEach(([outer, ...holes]) => {
    out.push(closeRing(signedRingArea(outer) > 0 ? [...outer].reverse() : outer));
    holes.forEach((h) => out.push(closeRing(signedRingArea(h) < 0 ? [...h].reverse() : h)));
  });
  return out;
}
