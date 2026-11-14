// TASKS.csv #3342 (Galore Creek review) — a table of points had no way onto the Maps plan: the IP receiver positions dropped on the plan opened
// the drillhole import on 'Collars' (no hole id: nothing to import), and once imported as a Geophysics point survey they were not drawn on the
// plan; no survey outline could be made. Pure: the point surveys as plan dots (thinned), a survey's outline (its convex hull) for a boundary,
// and whether a dropped table is a points table (X / Y and no hole id) to put on the map as a point layer.
import { surveyKey } from "./geophysSurveys.js";
import { surveyLabel } from "./rasterMethod.js";
import { guessGeophysColumns } from "./geophysColumns.js";

// -> [{ key, name, n, xy: Float64Array [x0, y0 ...] (at most maxPerSurvey points, evenly thinned), box }] per survey (its _src), by size
export function surveysOnPlan(rows, maxPerSurvey = 5000) {
  const by = new Map();
  for (const r of rows || []) {
    if (!Number.isFinite(r?.x) || !Number.isFinite(r?.y)) continue;
    const k = surveyKey(r);
    (by.get(k) || by.set(k, []).get(k)).push(r);
  }
  const out = [];
  for (const [key, pts] of by) {
    const step = Math.max(1, Math.ceil(pts.length / maxPerSurvey)), m = Math.ceil(pts.length / step);
    const xy = new Float64Array(m * 2), box = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of pts) { if (p.x < box[0]) box[0] = p.x; if (p.x > box[2]) box[2] = p.x; if (p.y < box[1]) box[1] = p.y; if (p.y > box[3]) box[3] = p.y; }
    for (let i = 0, j = 0; i < pts.length && j < m; i += step, j++) { xy[2 * j] = pts[i].x; xy[2 * j + 1] = pts[i].y; }
    out.push({ key, name: surveyLabel(key), n: pts.length, xy, box });
  }
  return out.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

// a closed convex hull [{ x, y }] (first point repeated last) of the points (monotone chain); null under three distinct points or all on a line
export function convexHull(points) {
  const p = [];
  const seen = new Set();
  for (const q of points || []) { if (!Number.isFinite(q?.x) || !Number.isFinite(q?.y)) continue; const k = `${q.x},${q.y}`; if (!seen.has(k)) { seen.add(k); p.push({ x: q.x, y: q.y }); } }
  if (p.length < 3) return null;
  p.sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  const ring = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  if (ring.length < 3) return null;
  return [...ring, ring[0]];
}

// the area (m²) of a closed ring
export function ringArea(ring) {
  let a = 0;
  for (let i = 1; i < (ring || []).length; i++) a += ring[i - 1].x * ring[i].y - ring[i].x * ring[i - 1].y;
  return Math.abs(a) / 2;
}

// a survey's outline as a boundary: { name, polylines: [ring], closedFlags: [true], color } or null
export function surveyOutlineBoundary(rows, key) {
  const ring = convexHull((rows || []).filter((r) => surveyKey(r) === key));
  return ring ? { name: `${surveyLabel(key)} outline`, polylines: [ring], closedFlags: [true], color: "#7c3aed", source: { kind: "survey outline", survey: key } } : null;
}

// a hole id column, as the drillhole import reads one
const HOLE_ID = /^(hole|hole[ _-]?id|holeid|bhid|dhid|drill[ _-]?hole([ _-]?id)?|hole[ _-]?(name|number|no))$/i;
// -> { x, y, geographic } when the headers have X / Y (or longitude / latitude) and no hole id: a table of points (stations, electrodes,
// pads, sample sites), else null
export function pointTableColumns(headers) {
  const hs = (headers || []).map((h) => String(h ?? "").trim()).filter(Boolean);
  if (hs.some((h) => HOLE_ID.test(h))) return null;
  const g = guessGeophysColumns(hs);
  if (!g.x || !g.y) return null;
  return { x: g.x, y: g.y, geographic: !!g.geographic };
}

// rows -> a parsed point layer for lib/mapLayerBuild.js buildLayer: { name, geomType: "point", epsg, features: [{ parts: [[[x, y]]], attributes }] }
export function pointTableLayer(name, rows, cols) {
  const num = (v) => (v === "" || v == null ? NaN : typeof v === "number" ? v : Number(String(v).trim().replace(",", ".")));
  const features = [];
  let skipped = 0;
  for (const r of rows || []) {
    const x = num(r[cols.x]), y = num(r[cols.y]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) { skipped++; continue; }
    const attributes = {};
    for (const [k, v] of Object.entries(r)) if (k !== cols.x && k !== cols.y && (v == null || typeof v !== "object")) attributes[k] = v ?? "";
    features.push({ parts: [[[x, y]]], attributes });
  }
  return { name, geomType: "point", epsg: cols.geographic ? 4326 : null, features, skippedCount: skipped };
}
