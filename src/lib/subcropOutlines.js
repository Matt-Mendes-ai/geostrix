// TASKS.csv #2956 (WA iron review) — the subcrop from collars as something a model can use: one nearest-hole polygon per hole (its Voronoi
// cell), cut back to a set distance from the hole so the map says nothing far from the drilling, as a polygon geology map with a unit field
// (Model it and Model from map read polygons; cells of one unit side by side make no contact there, extractMapContacts skips them). Pure.
import { Delaunay } from "d3-delaunay";

// the median distance from each point to its nearest neighbour (0 when there are fewer than two places)
export function medianSpacing(points) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (P.length < 2) return 0;
  const del = Delaunay.from(P, (p) => p.x, (p) => p.y), d = [];
  for (let i = 0; i < P.length; i++) {
    let best = Infinity;
    for (const j of del.neighbors(i)) { const h = Math.hypot(P[j].x - P[i].x, P[j].y - P[i].y); if (h > 0 && h < best) best = h; }
    if (Number.isFinite(best)) d.push(best);
  }
  d.sort((a, b) => a - b);
  return d.length ? d[d.length >> 1] : 0;
}

// a default reach: twice the median hole spacing, rounded to 5 m, at least 5 m (stated in the notice; the pane lets it be changed)
export function defaultReach(points) {
  const s = medianSpacing(points);
  return s > 0 ? Math.max(5, Math.round((2 * s) / 5) * 5) : 50;
}

// Sutherland–Hodgman: a polygon clipped by a convex one (both counter-clockwise or both clockwise, rings without the closing vertex)
function clipConvex(subject, clip) {
  let out = subject;
  const sideSign = Math.sign(area(clip)) || 1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length], input = out;
    out = [];
    const inside = (p) => sideSign * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) >= 0;
    const cross = (p, q) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
      const t = den === 0 ? 0 : ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den;
      return [p[0] + t * dx, p[1] + t * dy];
    };
    for (let k = 0; k < input.length; k++) {
      const p = input[k], q = input[(k + 1) % input.length], pin = inside(p), qin = inside(q);
      if (pin) { out.push(p); if (!qin) out.push(cross(p, q)); } else if (qin) out.push(cross(p, q));
    }
  }
  return out;
}
const area = (r) => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[i], b = r[(i + 1) % r.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

// points [{ x, y, unit, hole_id, cover }] -> [{ ring (closed), unit, hole_id, cover }]: each hole's nearest-hole cell within reachM of it
export function subcropOutlines(points, { reachM, sides = 24 } = {}) {
  const P = (points || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (!P.length || !(reachM > 0)) return [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const vor = Delaunay.from(P, (p) => p.x, (p) => p.y).voronoi([x0 - reachM, y0 - reachM, x1 + reachM, y1 + reachM]);
  const out = [];
  P.forEach((p, i) => {
    const cell = vor.cellPolygon(i); // closed, counter-clockwise in y-up; null for a duplicate place
    if (!cell) return;
    const circle = Array.from({ length: sides }, (_, k) => { const a = (2 * Math.PI * k) / sides; return [p.x + reachM * Math.cos(a), p.y + reachM * Math.sin(a)]; });
    const ring = clipConvex(cell.slice(0, -1).map(([x, y]) => [x, y]), circle);
    if (ring.length < 3) return;
    out.push({ ring: [...ring, ring[0]], unit: p.unit, hole_id: p.hole_id, ...(Number.isFinite(p.cover) ? { cover: p.cover } : {}) });
  });
  return out;
}

// the outlines as a polygon geology map layer (unit field, coloured like the logs; categories by count, as the subcrop's)
export function outlineLayer(points, name, colorOf, { reachM }) {
  const cells = subcropOutlines(points, { reachM });
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const counts = new Map();
  const features = cells.map((c) => {
    for (const [x, y] of c.ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    counts.set(c.unit, (counts.get(c.unit) || 0) + 1);
    return { parts: [c.ring], attributes: { unit: c.unit, hole_id: c.hole_id, ...(c.cover != null ? { cover_m: +c.cover.toFixed(2) } : {}) } };
  });
  return {
    name, subcropOutlines: true, geomType: "polygon", features, fields: ["unit", "hole_id", "cover_m"], styleField: "unit",
    bbox: features.length ? [x0, y0, x1, y1] : null, reachM,
    categories: [...counts].sort((a, b) => b[1] - a[1]).map(([u, n]) => ({ value: u, label: u, color: colorOf(u), outline: null, visible: true, count: n })),
    opacity: 0.75, visible: true, // drape and elevation: the store's defaults for a polygon map (on the terrain, else at the ground estimate)
  };
}
