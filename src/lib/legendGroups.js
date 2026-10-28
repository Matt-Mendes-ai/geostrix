// TASKS.csv #725 — the legend groups of a view, shared by the 3D figure overlay (#381, ViewerModule) and the Layout
// legend element (LayoutModule "Load from view"), so a printed legend lists exactly what the 3D view draws:
// categorical layers (minus hidden categories / holes, with the user's label and colour overrides), assay grade
// classes, and block models (classes as swatches, continuous models as a ramp from lib/legendScale.js).
// Pure: callers pass their state (live viewer state, or a saved theme).
import { LAYER_META, CATEGORICAL_SAFE_COLORS, colorForMedium } from "./layers.js";
import { legendScale } from "./legendScale.js";

// the per-element identity hues of assay markers (moved from ViewerModule; TASKS.csv #306)
export const ASSAY_ELEMENT_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 11, 14, 15, 8, 10, 13].map((i) => CATEGORICAL_SAFE_COLORS[i]);
// With style.breaks set, colour comes from the first break whose `max` the value is <= (QGIS graduated
// convention); a value above every break gets the last break's colour. Otherwise the element's hue.
export function assayColorFor(value, idx, style) {
  if (style?.breaks?.length) {
    const sorted = style.breaks; // stored pre-sorted by max — see AssayStyleModal
    const hit = sorted.find((b) => value <= b.max);
    return (hit || sorted[sorted.length - 1]).color;
  }
  return style?.color || ASSAY_ELEMENT_COLORS[idx % ASSAY_ELEMENT_COLORS.length];
}

// the categorical layers a legend lists, in order (ViewerModule's CATEGORY_LAYER_KEYS)
export const LEGEND_CATEGORY_KEYS = ["litho", "alt", "vein", "breccia", "structzone", "litho_gc", "alt_gc", "mnlgy", "structure"];

export const fmtLegendValue = (v) => (Math.abs(v) >= 1000 || v === 0 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : Math.abs(v) >= 0.1 ? v.toFixed(2) : v.toPrecision(2));

// keys: the categorical layer keys, in order. hidden[key]: a Set or array of hidden values. singleColor[key]: a one-
// colour layer style (#635). labelFor / colorFor(key, value): with the user's overrides applied.
export function categoryLegendGroups({ keys, layers, layerVisible, hidden = {}, visibleHoles = {}, singleColor = {}, labelFor, colorFor }) {
  const groups = [];
  keys.forEach((key) => {
    if (!layerVisible?.[key]) return;
    const rows = layers?.[key] || [];
    if (!rows.length) return;
    if (singleColor[key]) { groups.push({ key, label: LAYER_META[key].label, items: [["all (one colour)", singleColor[key]]] }); return; }
    const h = hidden[key];
    const isHidden = h instanceof Set ? (v) => h.has(v) : Array.isArray(h) ? ((s) => (v) => s.has(v))(new Set(h)) : () => false;
    const seen = new Set();
    const items = [];
    for (const row of rows) {
      const v = row.value;
      if (v == null || v === "") continue;
      const k = String(v);
      if (isHidden(k) || seen.has(k)) continue;
      if (row.hole_id && visibleHoles[row.hole_id] === false) continue;
      seen.add(k);
      items.push([labelFor(key, v), colorFor(key, v)]);
    }
    if (items.length) groups.push({ key, label: LAYER_META[key].label, items: items.sort((a, b) => String(a[0]).localeCompare(String(b[0]))) });
  });
  return groups;
}

// Assay grade classes are discrete swatches (one per class, with its range); an element with no classes gets one swatch
// saying size shows grade.
export function assayLegendGroups({ assays, assayElements, assayVisible, assayDisplayElements = [], assayStyle = {} }) {
  if (!assayVisible || !assayDisplayElements.length || !(assays || []).length) return [];
  const fmt = fmtLegendValue;
  const unitOf = Object.fromEntries((assayElements || []).map((e) => [e.symbol, e.unit]));
  return assayDisplayElements.map((sym, idx) => {
    const style = assayStyle[sym];
    const unit = unitOf[sym] || "";
    const items = style?.breaks?.length
      ? style.breaks.map((b, i) => {
        const lo = i ? style.breaks[i - 1].max : null;
        const last = i === style.breaks.length - 1;
        return [lo == null ? `≤ ${fmt(b.max)} ${unit}` : last ? `> ${fmt(lo)} ${unit}` : `${fmt(lo)}–${fmt(b.max)} ${unit}`, b.color];
      })
      : [[`${sym} (sphere size = grade)`, assayColorFor(0, idx, style)]];
    if (style?.minCutoff != null && Number.isFinite(style.minCutoff)) items.push([`below ${fmt(style.minCutoff)} ${unit} hidden`, "transparent"]);
    return { key: `assay_${sym}`, label: `${sym} (${unit})`, items };
  });
}

// A model's own stops: classes as swatches, a continuous model as a ramp (log or linear, #498 / #522)
export function scaleLegendGroup(key, label, model, lo, hi) {
  const L = legendScale(model, lo, hi, fmtLegendValue);
  return L.kind === "classes" ? { key, label, items: L.items } : { key, label, items: [], ramp: L };
}
export function voxelLegendGroups(voxelModels) {
  const groups = [];
  (voxelModels || []).forEach((m) => {
    if (m.visible === false || !Number.isFinite(m.min) || !Number.isFinite(m.max)) return;
    const lo = Number.isFinite(m.threshold) ? Math.max(m.min, m.threshold) : m.min;
    const hi = Number.isFinite(m.rangeMax) ? Math.min(m.max, m.rangeMax) : m.max;
    // TASKS.csv #356 — a model of named classes (e.g. the implicit model's units) gets swatches, not a numeric ramp.
    if (m.valueLabels && m.stops?.length) { groups.push({ key: `voxel_${m.id}`, label: m.name, items: m.stops.filter((st) => st.value >= lo && st.value <= hi).map((st) => [m.valueLabels[st.value] ?? String(st.value), st.color]) }); return; }
    groups.push(scaleLegendGroup(`voxel_${m.id}`, m.property && !m.name.includes(m.property) ? `${m.name} — ${m.property}` : m.name, m, lo, hi)); // #711 — say what the values are
  });
  return groups;
}

// TASKS.csv #948 — the Surface Geology map in a legend: its map layers (each unit of the layer's categorical style, or
// its one colour), the surface samples (anomaly classes, else one colour, else by medium, as the 3D view colours them)
// and the boundaries. Each row carries { kind: "fill" | "line" | "point" } so a legend draws a polygon unit as a square,
// a contact or fault as a line stub and a structure point or sample as a dot (a colour square alone could not tell
// them apart).
const KIND_OF = { polygon: "fill", polyline: "line", point: "point" };
export function mapLayerLegendGroups(mapLayers) {
  const groups = [];
  (mapLayers || []).forEach((l, i) => {
    if (l.visible === false || !(l.features || []).length) return;
    const kind = KIND_OF[l.geomType] || "fill";
    // TASKS.csv #1122 (review #1016) — the opacity the layer is draped at (sceneBuilders: l.opacity ?? 0.6), so a swatch
    // is not stronger than the unit it describes on a geology map over imagery; 1 is left out (rows unchanged)
    const op = Number.isFinite(l.opacity) ? l.opacity : kind === "fill" ? 0.6 : 1;
    const o = op < 1 ? { kind, opacity: op } : { kind };
    const cats = l.styleField ? (l.categories || []).filter((c) => c.visible !== false) : [];
    const items = cats.length
      ? cats.map((c) => [c.label ?? (c.value == null ? "(no value)" : String(c.value)), c.color, o])
      : [[l.name || "map layer", l.color || "#e2a63c", o]];
    groups.push({ key: `map_${l.id ?? i}`, label: l.name || "Map layer", items });
  });
  return groups;
}
export function boundaryLegendGroups(boundaries) {
  const items = (boundaries || []).filter((b) => b.visible !== false).map((b) => [b.name || "boundary", b.color || "#e2a63c", { kind: "line" }]);
  return items.length ? [{ key: "boundaries", label: "Boundaries", items }] : [];
}
// samples: the drawn surface samples (with .medium); style: the layer's one-colour style, if any; anomalyGroup: the
// anomaly map's group (anomalyLegendGroup) when it colours them
export function surfaceSampleLegendGroup({ samples, visible = true, style = null, anomalyGroup = null }) {
  if (!visible || !(samples || []).length) return null;
  if (anomalyGroup) return { ...anomalyGroup, items: anomalyGroup.items.map(([l, c]) => [l, c, { kind: "point" }]) };
  if (style?.color) return { key: "surface_samples", label: "Surface samples", items: [["all samples", style.color, { kind: "point" }]] };
  const media = [...new Set(samples.map((r) => r.medium || ""))].sort((a, b) => a.localeCompare(b));
  return { key: "surface_samples", label: "Surface samples", items: media.map((m) => [m || "(no medium)", colorForMedium(m), { kind: "point" }]) };
}

// TASKS.csv #725 — groups as Layout legend rows: [label, colour] swatches as before, plus a group heading row
// [label, null, { heading: true }] when more than one group is shown, and a ramp row [label, null, { ramp }]. A row's
// own options ({ kind }, #948) are kept.
export function legendGroupsToItems(groups) {
  const multi = groups.length > 1;
  const items = [];
  groups.forEach((g) => {
    if (g.ramp) { items.push([g.label, null, { ramp: { colors: g.ramp.colors, minLabel: g.ramp.minLabel, maxLabel: g.ramp.maxLabel, log: !!g.ramp.log } }]); return; }
    if (multi || g.alwaysHead) items.push([g.label, null, { heading: true }]); // TASKS.csv #843 — the anomaly map's rule is always printed
    g.items.forEach(([label, color, opt]) => items.push(opt ? [label, color, opt] : [label, color]));
  });
  return items;
}

// a legend swatch's shape for a row's kind (#948): { width, height, borderRadius, ... } for a square, a dot or a line stub
export function swatchShape(kind, size) {
  if (kind === "line") return { width: size + 6, height: 3, borderRadius: 1 };
  if (kind === "point") return { width: size - 3, height: size - 3, borderRadius: "50%" };
  return { width: size, height: size };
}
