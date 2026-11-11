// TASKS.csv #1625 — the ground the Maps tab's plan (components/MapsPlanView.jsx) covers: every visible raster, the terrain, map layers,
// boundaries, collars and surface samples. null when there is nothing to draw (the tab keeps its card).
// TASKS.csv #2125 (review #2013, Woodjam) — a layer that lies far from the drillholes (lib/landingCheck.js: a wrong-zone GeoTIFF 409 km
// west) is left out of the extent when there are collars, so Fit frames the project, not a 410 km box with the drilling a 40 px smudge;
// planFarLayers names them for the plan's note.
import { farFromCollars } from "./landingCheck.js";
const pointsBox = (polylines) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const pl of polylines || []) for (const p of pl || []) { if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue; if (p.x < a) a = p.x; if (p.x > c) c = p.x; if (p.y < b) b = p.y; if (p.y > d) d = p.y; }
  return Number.isFinite(a) ? [a, b, c, d] : null;
};
// -> [{ kind: "raster" | "terrain" | "map layer" | "boundary", name, far }] of the visible layers far from the collars
export function planFarLayers({ rasters = [], terrain, mapLayers = [], boundaries = [], collars = [] }) {
  if (!(collars || []).length) return [];
  const out = [];
  const check = (kind, name, b) => { const far = b && farFromCollars(b, collars); if (far) out.push({ kind, name, far }); };
  rasters.forEach((r) => r.visible !== false && check("raster", r.name, r.bbox));
  if (terrain) check("terrain", terrain.name, terrain.bbox);
  mapLayers.forEach((l) => l.visible !== false && check("map layer", l.name, l.bbox));
  boundaries.forEach((b) => b.visible !== false && check("boundary", b.name, pointsBox(b.polylines)));
  return out;
}
export function planDataExtent({ rasters = [], terrain, mapLayers = [], boundaries = [], collars = [], surfaceSamples = [] }) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const box = (b) => { if (!b) return; if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3]; };
  const pt = (p) => { if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) box([p.x, p.y, p.x, p.y]); };
  const near = (b) => !b || !(collars || []).length || !farFromCollars(b, collars); // #2125
  rasters.forEach((r) => r.visible !== false && near(r.bbox) && box(r.bbox));
  if (terrain && near(terrain.bbox)) box(terrain.bbox);
  mapLayers.forEach((l) => l.visible !== false && near(l.bbox) && box(l.bbox));
  boundaries.forEach((b) => b.visible !== false && near(pointsBox(b.polylines)) && (b.polylines || []).forEach((pl) => pl.forEach(pt)));
  collars.forEach(pt);
  surfaceSamples.forEach(pt);
  return Number.isFinite(x0) && x1 >= x0 ? [x0, y0, Math.max(x1, x0 + 1), Math.max(y1, y0 + 1)] : null;
}
