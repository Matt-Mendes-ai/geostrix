// TASKS.csv #1152 — interpretation lines drawn over a geophysics survey (Matt: "the option of drawing interpretation lines
// and having them as layers on any survey"). A set of lines is an ordinary MAP LAYER (lib/mapLayers.js: polyline features
// with attributes, a category style on "type"), so it drapes on the terrain in the 3D view, is listed with the map
// layers, prints in the Layout legend, exports as Shapefile / GeoPackage / KML / DXF with its attributes, reprojects with
// the project and saves with it. Each line records the survey it was drawn on, its type, a name, a confidence and its
// length. Pure: no React, no three.js.
import { median } from "./arrayStats.js";

export const INTERPRETATION_TYPES = [
  { value: "fault", label: "Fault", color: "#d7263d" },
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
export function addInterpretationLine(layer, points, attrs = {}) {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 0.01);
  if (pts.length < 2) return layer;
  const type = INTERPRETATION_TYPES.some((t) => t.value === attrs.type) ? attrs.type : "other";
  const n = layer.features.length + 1;
  const feature = {
    parts: [pts.map((p) => [r2(p.x), r2(p.y)])],
    attributes: { name: attrs.name || `${typeLabel(type)} ${n}`, type, survey: attrs.survey ?? layer.survey ?? "", confidence: CONFIDENCE.includes(attrs.confidence) ? attrs.confidence : "probable", length_m: Math.round(lineLengthM(pts)), note: attrs.note || "" },
  };
  const z = median(pts.map((p) => p.z)); // NaN with no elevations
  const elevation = layer.features.length === 0 && Number.isFinite(z) ? r2(z) : layer.elevation;
  return withBbox({ ...layer, elevation, features: [...layer.features, feature] });
}

export function removeInterpretationLine(layer, index) {
  if (index < 0 || index >= layer.features.length) return layer;
  return withBbox({ ...layer, features: layer.features.filter((_, i) => i !== index) });
}

export function updateInterpretationLine(layer, index, attrs) {
  if (index < 0 || index >= layer.features.length) return layer;
  const features = layer.features.map((f, i) => (i === index ? { ...f, attributes: { ...f.attributes, ...attrs } } : f));
  return withBbox({ ...layer, features });
}

// Two clicks at the same spot within `ms` (a double-click) end a line: the second click is not a vertex
export const isRepeatClick = (prev, next, { ms = 400, m = 2 } = {}) => !!prev && !!next && next.at - prev.at < ms && Math.hypot(next.x - prev.x, next.y - prev.y) <= m;
