// TASKS.csv #1152 — interpretation lines drawn over a geophysics survey (Matt: "the option of drawing interpretation lines
// and having them as layers on any survey"). A set of lines is an ordinary MAP LAYER (lib/mapLayers.js: polyline features
// with attributes, a category style on "type"), so it drapes on the terrain in the 3D view, is listed with the map
// layers, prints in the Layout legend, exports as Shapefile / GeoPackage / KML / DXF with its attributes, reprojects with
// the project and saves with it. Each line records the survey it was drawn on, its type, a name, a confidence and its
// length. Pure: no React, no three.js.
import { median } from "./arrayStats.js";
import { ringArea } from "./polygonRings.js"; // TASKS.csv #1439
import { hashColor, CATEGORICAL_SAFE_COLORS } from "./layers.js"; // #1439 — a drawn unit's colour; the curated palette: TASKS.csv #2088 / #2572

export const INTERPRETATION_TYPES = [
  { value: "fault", label: "Fault", color: "#d7263d" },
  { value: "shear", label: "Shear zone", color: "#a4133c" }, // TASKS.csv #2274 — the structure of a lode-gold deposit, beside Fault
  { value: "contact", label: "Contact", color: "#1a2028" },
  { value: "lineament", label: "Lineament", color: "#6c757d" },
  { value: "dyke", label: "Dyke", color: "#7b2cbf" },
  { value: "fold_axis", label: "Fold axis", color: "#2a9d8f" },
  { value: "anomaly_axis", label: "Anomaly axis", color: "#e36414" },
  { value: "trend", label: "Trend", color: "#3a6ea5" },
  { value: "boundary", label: "Unit boundary", color: "#8d5b1f" },
  { value: "other", label: "Other", color: "#b8bec7" },
];
export const CONFIDENCE = ["certain", "probable", "possible"];
// TASKS.csv #1239 — a fold axis is a line with a plunge; a fault trace has a dip. Optional, per line type: [the angle field, the direction field, their labels].
const PLUNGE = ["plunge", "plunge_dir", "Plunge", "Plunge direction"], DIP = ["dip", "dip_dir", "Dip", "Dip direction"];
const ATTITUDE = { fold_axis: PLUNGE, anomaly_axis: PLUNGE, lineament: PLUNGE, trend: PLUNGE, fault: DIP, shear: DIP, dyke: DIP, contact: DIP, boundary: DIP }; // shear: #2274
export const attitudeOf = (type) => ATTITUDE[type] || null;
// The attributes for what was typed: blanks are left out. { error: true } when a value is not an angle in range (0-90, direction 0-360).
export function attitudeAttrs(type, angle, direction) {
  const f = attitudeOf(type), out = {};
  if (!f) return out;
  for (const [key, text, max] of [[f[0], angle, 90], [f[1], direction, 360]]) {
    const t = String(text ?? "").trim();
    if (!t) continue;
    const v = Number(t);
    if (!Number.isFinite(v) || v < 0 || v > max) return { error: true };
    out[key] = v;
  }
  return out;
}
export const typeLabel = (v) => INTERPRETATION_TYPES.find((t) => t.value === v)?.label || v;

export const isInterpretationLayer = (l) => !!l?.interpretation;

// TASKS.csv #1157 — which layer the pane draws into. pick: what the select was set to ("" = nothing chosen, NEW_LAYER = a new
// one). Choosing New layer has to hold while the survey already has a layer: it used to fall through to that layer.
export const NEW_LAYER = "__new__";
export function chooseLayerId(pick, layers, survey) {
  if (pick === NEW_LAYER) return NEW_LAYER;
  if (layers.some((l) => l.id === pick)) return pick;
  return layers.find((l) => l.survey === survey)?.id || (layers.length && !survey ? layers[0].id : NEW_LAYER);
}
// a second new layer on one survey must not read the same as the first in the select, the legend and the Map layers list
export function uniqueLayerName(name, layers) {
  const taken = new Set(layers.map((l) => l.name));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`)) n++;
  return `${name} ${n}`;
}

// A new, empty interpretation layer. survey: the survey's name (a geophysics import's file name, a raster's name) or "".
export function interpretationLayer(name, survey = "") {
  return {
    name: name || (survey ? `Interpretation — ${survey}` : "Interpretation"),
    interpretation: true, survey,
    geomType: "polyline", features: [], fields: ["name", "type", "survey", "confidence", "length_m", "note"], bbox: null,
    styleField: "type", categories: INTERPRETATION_TYPES.map((t) => ({ value: t.value, label: t.label, color: t.color, outline: null, visible: true, count: 0 })),
    lineWidthM: 6, opacity: 1, visible: true, drapeMode: "terrain", elevation: 0, showOutlines: false,
  };
}

export function lineLengthM(points) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return m;
}

const r2 = (v) => Math.round(v * 100) / 100;

function withBbox(layer) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of layer.features) for (const part of f.parts) for (const [x, y] of part) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const counts = {};
  for (const f of layer.features) counts[f.attributes.type] = (counts[f.attributes.type] || 0) + 1;
  return { ...layer, bbox: layer.features.length ? [x0, y0, x1, y1] : null, categories: layer.categories.map((c) => ({ ...c, count: counts[c.value] || 0 })) };
}

// points: [{ x, y, z? }] world; attrs: { name, type, survey, confidence, note }. -> the layer with the line appended, or
// the layer unchanged when the line has fewer than two distinct points. With no terrain the layer sits flat at its
// `elevation`: the first line sets it to the median elevation of the clicks, so the lines sit at the survey, not at 0.
// opts.elevation (#2269): the elevation a first line sets when the clicks hit nothing (no terrain, no grid), in place of their median
// TASKS.csv #2630 (1) — the vertices snapped to a hole (lib/viewer/interpretSnap.js), as the line's 'ties' attribute: 'RC538 229 m
// (Lithology: P); RC540 collar'. Project data: English.
export function tiesText(points) {
  return (points || []).filter((p) => p?.snap?.hole_id).map(({ snap: s }) => (s.kind === "collar" ? `${s.hole_id} collar` : s.kind === "trace" ? `${s.hole_id} ${s.md} m` : `${s.hole_id} ${s.md} m (${s.label})`)).join("; ");
}

export function addInterpretationLine(layer, points, attrs = {}, opts = {}) {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 0.01);
  if (pts.length < 2) return layer;
  const type = INTERPRETATION_TYPES.some((t) => t.value === attrs.type) ? attrs.type : "other";
  // TASKS.csv #2095 — the default name numbers lines of ITS type ('Fault 1' for the first fault, not 'Fault 2' after a contact), unique
  let n = layer.features.filter((f) => f.attributes?.type === type).length + 1;
  while (!attrs.name && layer.features.some((f) => f.attributes?.name === `${typeLabel(type)} ${n}`)) n++;
  const feature = {
    parts: [pts.map((p) => [r2(p.x), r2(p.y)])],
    attributes: { name: attrs.name || `${typeLabel(type)} ${n}`, type, survey: attrs.survey ?? layer.survey ?? "", confidence: CONFIDENCE.includes(attrs.confidence) ? attrs.confidence : "probable", length_m: Math.round(lineLengthM(pts)), note: attrs.note || "" },
  };
  const z = Number.isFinite(opts.elevation) ? opts.elevation : median(pts.map((p) => p.z)); // NaN with no elevations
  const elevation = layer.features.length === 0 && Number.isFinite(z) ? r2(z) : layer.elevation;
  const attitude = { ...(attrs.attitude || {}) };
  const ties = tiesText(pts); // #2630
  if (ties) { attitude.ties = ties; feature.tieVerts = pts.map((p) => (p.snap?.hole_id ? { ...p.snap } : null)); } // #2767 — per vertex, for an edit
  Object.assign(feature.attributes, attitude);
  const fields = [...layer.fields, ...Object.keys(attitude).filter((k) => !layer.fields.includes(k))]; // #1239 — a field appears with its first value
  return withBbox({ ...layer, elevation, fields, features: [...layer.features, feature] });
}

// TASKS.csv #2767 (#2630 (2)) — a finished line's vertex moved (the pane's Edit vertices: a drag in the 3D view). snap: what the new spot
// is tied to (lib/viewer/interpretSnap.js), or null. The length, the ties text (from the per-vertex ties) and the layer's box follow. A line
// drawn before per-vertex ties were kept keeps its ties text unless the moved vertex is tied now.
export function moveInterpretationVertex(layer, index, vi, xy, snap = null) {
  const f = layer?.features?.[index], part = f?.parts?.[0];
  if (!part || !(vi >= 0 && vi < part.length) || !Number.isFinite(xy?.[0]) || !Number.isFinite(xy?.[1])) return layer;
  const nextPart = part.map((q, i) => (i === vi ? [r2(xy[0]), r2(xy[1])] : q));
  const legacy = !f.tieVerts && !!f.attributes?.ties && !snap;
  const tv = (f.tieVerts || part.map(() => null)).map((t, i) => (i === vi ? (snap?.hole_id ? { ...snap } : null) : t));
  const pts = nextPart.map(([x, y], i) => ({ x, y, snap: tv[i] }));
  const attributes = { ...f.attributes, length_m: Math.round(lineLengthM(pts)) };
  const ties = tiesText(pts);
  if (ties) attributes.ties = ties; else if (!legacy) delete attributes.ties;
  const nf = { ...f, parts: [nextPart, ...f.parts.slice(1)], attributes };
  if (tv.some(Boolean)) nf.tieVerts = tv; else delete nf.tieVerts;
  const fields = attributes.ties != null && !layer.fields.includes("ties") ? [...layer.fields, "ties"] : layer.fields;
  return withBbox({ ...layer, fields, features: layer.features.map((g, i) => (i === index ? nf : g)) });
}

export function removeInterpretationLine(layer, index) {
  if (index < 0 || index >= layer.features.length) return layer;
  return withBbox({ ...layer, features: layer.features.filter((_, i) => i !== index) });
}

// TASKS.csv #2522 — a removed line put back where it was (the pane's Restore after a one-click delete)
export function restoreInterpretationLine(layer, index, feature) {
  if (!feature) return layer;
  const at = Math.max(0, Math.min(Number.isInteger(index) ? index : layer.features.length, layer.features.length));
  return withBbox({ ...layer, features: [...layer.features.slice(0, at), feature, ...layer.features.slice(at)] });
}

export function updateInterpretationLine(layer, index, attrs) {
  if (index < 0 || index >= layer.features.length) return layer;
  const features = layer.features.map((f, i) => (i === index ? { ...f, attributes: { ...f.attributes, ...attrs } } : f));
  return withBbox({ ...layer, features });
}

// TASKS.csv #1439 (review #1352, Silvertip) — geology drawn in GeoStrix: unit polygons as a polygon map layer whose `unit` field
// is what Model from map reads, so a map drawn here can be modelled like an imported one. Pure.
export const isDrawnGeologyLayer = (l) => !!l?.drawnGeology;
export function geologyPolygonLayer(name) {
  return {
    name: name || "Geology (drawn)", drawnGeology: true,
    geomType: "polygon", features: [], fields: ["unit", "area_m2", "note"], bbox: null,
    styleField: "unit", categories: [], lineWidthM: 2, opacity: 0.6, visible: true, drapeMode: "terrain", elevation: 0, showOutlines: true,
  };
}
// TASKS.csv #2088 / #2572 — a new unit's colour: colorOf(unit) (the pane passes the logs' colour for a unit named like a logged code), else
// the first colour of the curated palette no unit of the layer has yet (hex: the legend's colour picker and the KML read only #rrggbb; the
// name hash put every one-letter code in one purple band), the hash only when the palette is used up. A unit left with no polygon leaves
// the legend (#2095).
function withUnitBbox(layer, colorOf = null) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of layer.features) for (const part of f.parts) for (const [x, y] of part) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const counts = {};
  for (const f of layer.features) counts[f.attributes.unit] = (counts[f.attributes.unit] || 0) + 1;
  const kept = layer.categories.map((c) => ({ ...c, count: counts[c.value] || 0 })).filter((c) => c.count > 0);
  const used = new Set(kept.map((c) => String(c.color).toLowerCase()));
  const pick = (u) => {
    const own = colorOf?.(u);
    if (own && /^#[0-9a-f]{6}$/i.test(own)) return own;
    const free = CATEGORICAL_SAFE_COLORS.find((c) => !used.has(c.toLowerCase()));
    return free || hashColor(u);
  };
  const fresh = Object.keys(counts).filter((u) => !kept.some((c) => c.value === u)).map((u) => { const color = pick(u); used.add(String(color).toLowerCase()); return { value: u, label: u, color, outline: null, visible: true, count: counts[u] }; });
  return { ...layer, bbox: layer.features.length ? [x0, y0, x1, y1] : null, categories: [...kept, ...fresh] };
}
// points: [{ x, y, z? }] world, the corners in click order (a last click on the first corner is dropped); attrs: { unit, note }.
// -> the layer with the closed polygon appended, or unchanged with fewer than three distinct corners.
export function addUnitPolygon(layer, points, attrs = {}, opts = {}) { // opts.elevation: #2269
  let pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 0.01);
  if (pts.length > 3 && Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) <= 0.01) pts = pts.slice(0, -1);
  if (pts.length < 3) return layer;
  const ring = pts.map((p) => [r2(p.x), r2(p.y)]);
  ring.push(ring[0]);
  const unit = String(attrs.unit || "").trim() || "Unit";
  const feature = { parts: [ring], attributes: { unit, area_m2: Math.round(ringArea(ring)), note: attrs.note || "" } };
  const z = Number.isFinite(opts.elevation) ? opts.elevation : median(pts.map((p) => p.z));
  const elevation = layer.features.length === 0 && Number.isFinite(z) ? r2(z) : layer.elevation;
  return withUnitBbox({ ...layer, elevation, features: [...layer.features, feature] }, opts.colorOf); // colorOf: #2572
}
export function removeUnitPolygon(layer, index) {
  if (index < 0 || index >= layer.features.length) return layer;
  return withUnitBbox({ ...layer, features: layer.features.filter((_, i) => i !== index) });
}

// Two clicks at the same spot within `ms` (a double-click) end a line: the second click is not a vertex
export const isRepeatClick = (prev, next, { ms = 400, m = 2 } = {}) => !!prev && !!next && next.at - prev.at < ms && Math.hypot(next.x - prev.x, next.y - prev.y) <= m;
