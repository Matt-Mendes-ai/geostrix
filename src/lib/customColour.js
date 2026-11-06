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
  s = filled && vals.length >= 0.8 * filled && hi > lo ? { numeric: true, min: lo, max: hi, log, clipLo: lo > vals[0], clipHi: hi < vals[vals.length - 1] } : { numeric: false };
  byField.set(field, s);
  return s;
}

const fieldOf = (layer, layerStyles) => layerStyles?.[`custom:${layer?.id}`]?.colourBy || "value";

// the colour of one row of a custom layer as its style says
const rampT = (s, n) => (s.log ? (Math.log10(Math.max(n, s.min)) - Math.log10(s.min)) / (Math.log10(s.max) - Math.log10(s.min)) : (n - s.min) / (s.max - s.min));
const rampColour = (s, n) => magColor(Math.min(1, Math.max(0, rampT(s, n))), 0, 1);
export function customColour(layer, layerStyles, row) {
  const field = fieldOf(layer, layerStyles), v = row?.[field];
  if (empty(v)) return NO_VALUE_COLOUR;
  const s = scaleOf(layer, field);
  if (s.numeric) { const n = num(v); return Number.isFinite(n) ? rampColour(s, n) : NO_VALUE_COLOUR; }
  return hashColor(v);
}

// the overlay legend's groups for the visible custom layers (categories up to 24, or a ramp)
export function customLegendGroups(customLayers, customVisible = {}, layerStyles = {}) {
  const out = [], fmt = (v) => String(+Number(v).toPrecision(4));
  for (const L of customLayers || []) {
    if (customVisible[L.id] === false || !(L.rows || []).length) continue;
    const st = layerStyles[`custom:${L.id}`] || {}, field = st.colourBy || "value", label = field === "value" ? L.name : `${L.name} · ${field}`;
    if (st.color) { out.push({ key: `custom_${L.id}`, label, items: [[label, st.color]] }); continue; }
    const s = scaleOf(L, field);
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
