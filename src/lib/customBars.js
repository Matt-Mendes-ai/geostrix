// TASKS.csv #4008 — bars along the trace (#3943) and in the section window (#4002) for numeric CUSTOM layers (a mineral database imported as one numeric layer
// per mineral, #3205 / #3307), not only the Mineralization layer and the assays. Each chosen layer is a lane with its own colour; layers whose unit matches
// share one scale (the 98th percentile of their pooled values: 4 % of pyrite is as long as 4 % of sphalerite), a layer with another unit or none has its own.
// Pure (no three.js). The choice is each custom layer's style (`bar`, set in its Style dialog and listed in the Mineralization panel's Bars chooser).
import { isNumericLayer } from "./domainLayers.js";
import { rowsOf } from "./rowTable.js";
import { CATEGORICAL_SAFE_COLORS } from "./layers.js";
import { MAX_BARS } from "./traceBarsData.js";

export const customStyleKey = (id) => `custom:${id}`;
const num = (v) => (v === "" || v == null ? NaN : Number(v));
const p98 = (vals) => { if (!vals.length) return NaN; vals.sort((a, b) => a - b); return vals[Math.min(vals.length - 1, Math.round(0.98 * (vals.length - 1)))]; };
const intervalRows = (layer) => { const out = []; for (const r of rowsOf(layer?.rows) || []) { const f = num(r.from), t = num(r.to), v = num(r.value); if (Number.isFinite(f) && Number.isFinite(t) && t > f && Number.isFinite(v)) out.push({ hole_id: r.hole_id, from: f, to: t, v }); } return out; };

// the custom layers a Bars chooser can list: numeric, with interval rows -> [{ id, label, unit }]
export function numericCustomChoices(customLayers) {
  const out = [];
  for (const l of customLayers || []) {
    const rows = rowsOf(l?.rows);
    if (!rows?.length || !isNumericLayer(rows) || !intervalRows(l).length) continue;
    out.push({ id: l.id, label: l.name || l.id, unit: l.unit || "" });
  }
  return out;
}

// the layers drawn as bars: the chosen (style.bar), shown, in the layer list's order, at most `max`
export function barLayers(customLayers, visible, styles, max = MAX_BARS) {
  return (customLayers || []).filter((l) => styles?.[customStyleKey(l.id)]?.bar && visible?.[l.id] !== false).slice(0, max);
}

// the colour of a custom layer's bar: its style colour when it has one, else the colour-blind-safe palette by lane
export const customBarColour = (layer, lane, styles) => styles?.[customStyleKey(layer.id)]?.color || CATEGORICAL_SAFE_COLORS[Math.max(0, lane) % CATEGORICAL_SAFE_COLORS.length];

// layers: barLayers(...); laneStart: the lanes the minerals take first; shown(hole_id) optional
// -> { bars: [{ hole_id, from, to, lane, f, v }], scale: [{ id, label, full, unit, lane }] }  (f = value / the layer's scale, capped at 1)
export function customBars(layers, { laneStart = 0, shown = null } = {}) {
  const bars = [], sets = (layers || []).map((l) => ({ l, rows: intervalRows(l), unit: String(l.unit || "").trim() }));
  const pooled = new Map(); // a shared unit's values
  for (const s of sets) if (s.unit) { const k = s.unit.toLowerCase(); const a = pooled.get(k) || pooled.set(k, []).get(k); for (const r of s.rows) if (r.v > 0) a.push(r.v); }
  const fullOf = new Map([...pooled].map(([k, vals]) => [k, p98(vals)]));
  const scale = [];
  sets.forEach((s, i) => {
    const lane = laneStart + i, full = s.unit ? fullOf.get(s.unit.toLowerCase()) : p98(s.rows.filter((r) => r.v > 0).map((r) => r.v));
    if (!(full > 0)) return;
    scale.push({ id: customStyleKey(s.l.id), label: s.l.name || s.l.id, full, unit: s.unit, lane });
    for (const r of s.rows) { if (!(r.v > 0) || (shown && !shown(r.hole_id))) continue; bars.push({ hole_id: r.hole_id, from: r.from, to: r.to, lane, f: Math.min(1, r.v / full), v: r.v }); }
  });
  return { bars, scale };
}
