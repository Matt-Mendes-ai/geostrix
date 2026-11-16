// TASKS.csv #1625 — the ground the Maps tab's plan (components/MapsPlanView.jsx) covers: every visible raster, the terrain, map layers,
// boundaries, collars and surface samples. null when there is nothing to draw (the tab keeps its card).
// TASKS.csv #2125 (review #2013, Woodjam) — a layer that lies far from the drillholes (lib/landingCheck.js: a wrong-zone GeoTIFF 409 km
// west) is left out of the extent when there are collars, so Fit frames the project, not a 410 km box with the drilling a 40 px smudge;
// planFarLayers names them for the plan's note.
import { t as tr } from "./i18n.js"; // TASKS.csv #3830
import { farFromCollars, collarsBox, FAR_MIN_M } from "./landingCheck.js";
// TASKS.csv #3830 (Scottie Gold maps review) — 77 of 266 rock samples lay 11 km north of the drilling and Fit framed them, so the drilling was a tenth of the view: a surface sample far from the collars (the same
// distance rule as a layer) is left out of Fit, and counted for the plan's note. -> { far: n, distM: the farthest } (far 0 with no collars)
export function farSampleCount(samples, collars) {
  const ref = collarsBox(collars);
  if (!ref || !(samples || []).length) return { far: 0, distM: 0 };
  const lim = Math.max(FAR_MIN_M, Math.hypot(ref[2] - ref[0], ref[3] - ref[1]));
  let far = 0, distM = 0;
  for (const s of samples) {
    if (!Number.isFinite(s?.x) || !Number.isFinite(s?.y)) continue;
    const d = Math.hypot(Math.max(0, ref[0] - s.x, s.x - ref[2]), Math.max(0, ref[1] - s.y, s.y - ref[3]));
    if (d >= lim) { far++; if (d > distM) distM = d; }
  }
  return { far, distM };
}
const pointsBox = (polylines) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const pl of polylines || []) for (const p of pl || []) { if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) continue; if (p.x < a) a = p.x; if (p.x > c) c = p.x; if (p.y < b) b = p.y; if (p.y > d) d = p.y; }
  return Number.isFinite(a) ? [a, b, c, d] : null;
};
// -> [{ kind: "raster" | "terrain" | "map layer" | "boundary", name, far }] of the visible layers far from the collars
// surveys (TASKS.csv #3342): lib/planSurveys.js surveysOnPlan's entries ({ name, box }), the Geophysics point surveys drawn on the plan
export function planFarLayers({ rasters = [], terrain, mapLayers = [], boundaries = [], collars = [], surveys = [], surfaceSamples = [] }) {
  if (!(collars || []).length) return [];
  const out = [];
  const check = (kind, name, b) => { const far = b && farFromCollars(b, collars); if (far) out.push({ kind, name, far }); };
  rasters.forEach((r) => r.visible !== false && check("raster", r.name, r.bbox));
  if (terrain) check("terrain", terrain.name, terrain.bbox);
  mapLayers.forEach((l) => l.visible !== false && check("map layer", l.name, l.bbox));
  boundaries.forEach((b) => b.visible !== false && check("boundary", b.name, pointsBox(b.polylines)));
  (surveys || []).forEach((s) => check("survey", s.name, s.box)); // #3342
  { const fs = farSampleCount(surfaceSamples, collars); if (fs.far) out.push({ kind: "surface samples", name: tr("{far} of {n} surface samples", { far: fs.far, n: surfaceSamples.length }), far: { distM: fs.distM } }); } // #3830
  return out;
}
export function planDataExtent({ rasters = [], terrain, mapLayers = [], boundaries = [], collars = [], surfaceSamples = [], surveys = [] }) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const box = (b) => { if (!b) return; if (b[0] < x0) x0 = b[0]; if (b[1] < y0) y0 = b[1]; if (b[2] > x1) x1 = b[2]; if (b[3] > y1) y1 = b[3]; };
  const pt = (p) => { if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) box([p.x, p.y, p.x, p.y]); };
  const near = (b) => !b || !(collars || []).length || !farFromCollars(b, collars); // #2125
  rasters.forEach((r) => r.visible !== false && near(r.bbox) && box(r.bbox));
  if (terrain && near(terrain.bbox)) box(terrain.bbox);
  mapLayers.forEach((l) => l.visible !== false && near(l.bbox) && box(l.bbox));
  boundaries.forEach((b) => b.visible !== false && near(pointsBox(b.polylines)) && (b.polylines || []).forEach((pl) => pl.forEach(pt)));
  collars.forEach(pt);
  { const ref = collarsBox(collars), lim = ref ? Math.max(FAR_MIN_M, Math.hypot(ref[2] - ref[0], ref[3] - ref[1])) : Infinity; surfaceSamples.forEach((p) => { if (ref && Number.isFinite(p?.x) && Number.isFinite(p?.y) && Math.hypot(Math.max(0, ref[0] - p.x, p.x - ref[2]), Math.max(0, ref[1] - p.y, p.y - ref[3])) >= lim) return; pt(p); }); } // #3830 — a sample far from the drilling does not set the frame
  (surveys || []).forEach((s) => near(s.box) && box(s.box)); // #3342 — the point surveys
  return Number.isFinite(x0) && x1 >= x0 ? [x0, y0, Math.max(x1, x0 + 1), Math.max(y1, y0 + 1)] : null;
}
