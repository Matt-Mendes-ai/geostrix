// TASKS.csv #1697 (review #1645, Copley) — custom layers (Copley's SWIR, QuickLog, Oxidation, Veins, Mineralization) were coloured only by a hash
// of their value column, an empty reading drew as its own coloured 'null' class, no other field could colour them (the white-mica
// wavelength ai_Wav_WtMica, the classic porphyry SWIR vector, could not be shown in 3D), and no legend listed them. Now the Style
// dialog's 'Colour by' picks the field (style.colourBy, default the value column): a numeric field takes a viridis ramp over its
// range, anything else its category colours; an empty reading is grey 'no value'. The overlay legend gets a group per visible layer.
import { hashColor, magColor } from "./layers.js";

export const NO_VALUE_COLOUR = "#b8bec7";
const empty = (v) => v == null || v === "" || (typeof v === "number" && !Number.isFinite(v));
const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

// the fields a layer's rows carry that could colour it (not the position columns)
export function customFields(layer) {
  const keys = new Set();
  for (const r of (layer?.rows || []).slice(0, 500)) for (const k of Object.keys(r || {})) if (!["hole_id", "from", "to", "depth", "_src", "modelColor"].includes(k)) keys.add(k);
  return [...keys];
}

// per layer rows + field: numeric (>= 80 % of the filled values are numbers) with its range, else categorical
const cache = new WeakMap();
function scaleOf(layer, field) {
  const rows = layer?.rows || [];
  let byField = cache.get(rows);
  if (!byField) { byField = new Map(); cache.set(rows, byField); }
  let s = byField.get(field);
  if (s) return s;
  let filled = 0;
  const vals = [];
  for (const r of rows) { const v = r?.[field]; if (empty(v)) continue; filled++; const n = num(v); if (Number.isFinite(n)) vals.push(n); }
  vals.sort((a, b) => a - b);
  // TASKS.csv #1539 (review #1497, Lawyers) — the ramp spans the 2nd-98th percentile, on a log scale when that spans more than a
  // decade (as the built-in numeric layers, #1699): Lawyers' vein % (median 2, p98 65, max 95) was one dark purple from min to max
  const q = (p) => vals[Math.round(p * (vals.length - 1))];
  let lo = vals.length ? q(0.02) : NaN, hi = vals.length ? q(0.98) : NaN;
  if (!(hi > lo) && vals.length) { lo = vals[0]; hi = vals[vals.length - 1]; }
  const log = lo > 0 && hi / lo > 10;
  s = filled && vals.length >= 0.8 * filled && hi > lo ? { numeric: true, min: lo, max: hi, log, clipLo: lo > vals[0], clipHi: hi < vals[vals.length - 1], dataMin: vals[0], dataMax: vals[vals.length - 1] } : { numeric: false };
  byField.set(field, s);
  return s;
}

const fieldOf = (layer, layerStyles) => layerStyles?.[`custom:${layer?.id}`]?.colourBy || "value";

// TASKS.csv #2367 (review #2325, WA uranium) — a numeric custom layer's ramp was fixed at the 2nd-98th percentile (eU3O8 11-318 ppm: everything
// from 318 to 7,464 ppm one yellow). The layer's style may now set the range (rampMin / rampMax), the scale ('linear' / 'log'; auto: log when the
// range spans more than a decade) and classes (2-12 equal steps on that scale); the default stays p2-p98. Cached per style object and rows.
const styled = new WeakMap();
export function customScale(layer, field, st) {
  const base = scaleOf(layer, field);
  if (!base.numeric || !st || (!Number.isFinite(st.rampMin) && !Number.isFinite(st.rampMax) && !st.rampScale && !(st.classes >= 2))) return base;
  let byRows = styled.get(st); if (!byRows) { byRows = new WeakMap(); styled.set(st, byRows); }
  const rows = layer?.rows || [];
  let byField = byRows.get(rows); if (!byField) { byField = new Map(); byRows.set(rows, byField); }
  let s = byField.get(field);
  if (s) return s;
  const min = Number.isFinite(st.rampMin) ? st.rampMin : base.min, max = Number.isFinite(st.rampMax) ? st.rampMax : base.max;
  if (!(max > min)) { byField.set(field, base); return base; }
  const log = st.rampScale === "linear" ? false : st.rampScale === "log" ? min > 0 : min > 0 && max / min > 10;
  s = { ...base, min, max, log, classes: st.classes >= 2 ? Math.min(12, Math.round(st.classes)) : 0, clipLo: min > base.dataMin, clipHi: max < base.dataMax };
  byField.set(field, s);
  return s;
}
// the default scale of a field (the Style dialog's placeholders)
export const customScaleDefault = (layer, field) => scaleOf(layer, field);

// the colour of one row of a custom layer as its style says
const rampT0 = (s, n) => (s.log ? (Math.log10(Math.max(n, s.min)) - Math.log10(s.min)) / (Math.log10(s.max) - Math.log10(s.min)) : (n - s.min) / (s.max - s.min));
const rampT = (s, n) => { const t = Math.min(1, Math.max(0, rampT0(s, n))); return s.classes ? Math.min(s.classes - 1, Math.floor(t * s.classes)) / (s.classes - 1) : t; }; // classes: #2367
const rampColour = (s, n) => magColor(rampT(s, n), 0, 1);
// the value at fraction t of a scale (a class edge)
const atT = (s, t) => (s.log ? 10 ** (Math.log10(s.min) + t * (Math.log10(s.max) - Math.log10(s.min))) : s.min + t * (s.max - s.min));
export function customColour(layer, layerStyles, row) {
  const field = fieldOf(layer, layerStyles), v = row?.[field];
  if (empty(v)) return NO_VALUE_COLOUR;
  const s = customScale(layer, field, layerStyles?.[`custom:${layer?.id}`]); // #2367
  if (s.numeric) { const n = num(v); return Number.isFinite(n) ? rampColour(s, n) : NO_VALUE_COLOUR; }
  return hashColor(v);
}

// the overlay legend's groups for the visible custom layers (categories up to 24, or a ramp)
export function customLegendGroups(customLayers, customVisible = {}, layerStyles = {}) {
  const out = [], fmt = (v) => String(+Number(v).toPrecision(4));
  for (const L of customLayers || []) {
    if (customVisible[L.id] === false || !(L.rows || []).length) continue;
    const st = layerStyles[`custom:${L.id}`] || {}, field = st.colourBy || "value";
    // #2367 — the unit the log import kept (ppm, cps), when the name does not already say it
    const unit = field === "value" && L.unit && !String(L.name).includes(`(${L.unit})`) ? ` (${L.unit})` : "";
    const label = field === "value" ? `${L.name}${unit}` : `${L.name} · ${field}`;
    if (st.color) { out.push({ key: `custom_${L.id}`, label, items: [[label, st.color]] }); continue; }
    const s = customScale(L, field, st); // #2367
    if (s.numeric && s.classes) { // #2367 — one row per class, its value range
      const items = [];
      for (let i = 0; i < s.classes; i++) {
        const lo = atT(s, i / s.classes), hi = atT(s, (i + 1) / s.classes);
        items.push([i === s.classes - 1 && s.clipHi ? `≥ ${fmt(lo)}` : i === 0 && s.clipLo ? `< ${fmt(hi)}` : `${fmt(lo)} – ${fmt(hi)}`, magColor(i / (s.classes - 1), 0, 1)]); // an end class past the data's range is open
      }
      out.push({ key: `custom_${L.id}`, label, items: items.reverse() });
      continue;
    }
    if (s.numeric) {
      const colors = Array.from({ length: 17 }, (_, i) => magColor(i / 16, 0, 1));
      out.push({ key: `custom_${L.id}`, label, items: [], ramp: { kind: "ramp", log: s.log, min: s.min, max: s.max, minLabel: `${s.clipLo ? "≤ " : ""}${fmt(s.min)}`, maxLabel: `${s.clipHi ? "≥ " : ""}${fmt(s.max)}`, colors, ticks: [] } }); // #1539
      continue;
    }
    const counts = new Map(); let none = 0;
    for (const r of L.rows) { const v = r?.[field]; if (empty(v)) { none++; continue; } const k = String(v); counts.set(k, (counts.get(k) || 0) + 1); }
    const items = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24).map(([k]) => [k, hashColor(k)]);
    if (none) items.push(["no value", NO_VALUE_COLOUR]);
    if (items.length) out.push({ key: `custom_${L.id}`, label, items });
  }
  return out;
}
