// TASKS.csv #3943 (Matt's first-time test: 'the option of plotting minerals along the drill trace just like we have for assays, that way I can
// see multiple minerals for intervals with multiple minerals, have this done also for assays') — bars along the trace: for each interval, one bar
// per chosen mineral (its per cent) or element (its grade), side by side in lanes beside the trace, the bar's length following the value. Pure
// (no three.js): the choices, each bar's lane and length, the bar scale. lib/viewer/traceBars.js draws them; lib/viewer/useTraceBars.js keeps
// them in the 3D view.
import { TOTAL_SULPHIDES_FIELD } from "./mineralFields.js";
import { CODE_PREFIX, widthValueOf } from "./widthBy.js";
import { CATEGORICAL_SAFE_COLORS } from "./layers.js";

export const MAX_BARS = 6, LIGHT_MAX_BARS = 3; // a few at a time; light drawing draws the first three

export const barLabel = (id) => (id === TOTAL_SULPHIDES_FIELD ? "Total sulphides" : id.startsWith(CODE_PREFIX) ? id.slice(CODE_PREFIX.length) : id);

const p98 = (vals) => { if (!vals.length) return NaN; vals.sort((a, b) => a - b); return vals[Math.min(vals.length - 1, Math.round(0.98 * (vals.length - 1)))]; };

// the bars of a Mineralization layer: rows -> { bars: [{ hole_id, from, to, lane, f }], scale: [{ id, label, full, unit }] }
// every chosen mineral shares one scale (all per cents: a 4 % bar is as long for pyrite as for sphalerite); f = value / full, capped at 1
export function mineralBars(rows, chosen, { shown = null, max = MAX_BARS } = {}) {
  const ids = (chosen || []).slice(0, max), list = rows || [], bars = [];
  if (!ids.length || !list.length) return { bars, scale: [] };
  const all = [];
  for (const r of list) for (const id of ids) { const v = widthValueOf(r, id); if (Number.isFinite(v) && v > 0) all.push(v); }
  const full = p98(all);
  if (!(full > 0)) return { bars, scale: [] };
  for (const r of list) {
    if (shown && !shown(r)) continue;
    const from = Number(r?.from), to = Number(r?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) continue;
    ids.forEach((id, lane) => { const v = widthValueOf(r, id); if (Number.isFinite(v) && v > 0) bars.push({ hole_id: r.hole_id, from, to, lane, f: Math.min(1, v / full), v }); }); // v: the section's tooltip (#4002)
  }
  return { bars, scale: ids.map((id) => ({ id, label: barLabel(id), full, unit: "%" })) };
}

// the assays' bar scale: each element its own (Au in g/t and Cu in % share none), its full bar at the 98th percentile of all its samples (the
// legend and the bars read the same numbers); kept per samples array -> [{ id, label, full, unit }]
const assayCache = new WeakMap();
export function assayBarScale(assays, syms, units = {}, max = MAX_BARS) {
  const ids = (syms || []).slice(0, max), list = assays || [];
  if (!ids.length || !list.length) return [];
  let per = assayCache.get(list); if (!per) assayCache.set(list, (per = new Map()));
  const out = [];
  for (const s of ids) {
    if (!per.has(s)) { const vals = []; for (const a of list) { const v = a?.values?.[s]; if (Number.isFinite(v) && v > 0) vals.push(v); } per.set(s, p98(vals)); }
    const full = per.get(s);
    if (full > 0) out.push({ id: s, label: s, full, unit: units[s] || "" });
  }
  return out;
}
// the bars of the assays: rows { hole_id, from, to, values: { [sym]: number } } -> { bars, scale }; lane = the element's place among those chosen
export function assayBars(assays, syms, { shown = null, units = {}, max = MAX_BARS } = {}) {
  const ids = (syms || []).slice(0, max), list = assays || [], bars = [];
  const scale = assayBarScale(list, ids, units, max), full = Object.fromEntries(scale.map((x) => [x.id, x.full]));
  if (!scale.length) return { bars, scale };
  for (const a of list) {
    if (shown && !shown(a)) continue;
    const from = Number(a?.from), to = Number(a?.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) continue;
    ids.forEach((s, lane) => { const v = a?.values?.[s]; if (Number.isFinite(v) && v > 0 && full[s] > 0) bars.push({ hole_id: a.hole_id, from, to, lane, f: Math.min(1, v / full[s]) }); });
  }
  return { bars, scale };
}
// a Mineralization layer's bar scale alone (the legend) -> [{ id, label, full, unit }]
export const mineralBarScale = (rows, chosen) => mineralBars(rows, chosen).scale;
// a mineral bar's colour: a logged code takes the layer legend's colour (codeColour), a field (Total sulphides, a per-mineral column) the
// colour-blind-safe palette by its lane
export const mineralBarColour = (id, lane, codeColour) => (String(id).startsWith(CODE_PREFIX) && codeColour ? codeColour(String(id).slice(CODE_PREFIX.length)) : CATEGORICAL_SAFE_COLORS[Math.max(0, lane) % CATEGORICAL_SAFE_COLORS.length]);

// the legend's bar scale: one row per chosen item, its colour and the value a full bar stands for -> a legend group
const fmt = (v) => String(+Number(v).toPrecision(3));
export function barLegendGroup(key, title, scale, colourOf) {
  return { key, label: title, items: scale.map((s, i) => [s.label, colourOf(s.id, i), { kind: "line", value: `▮ = ${fmt(s.full)}${s.unit ? ` ${s.unit}` : ""}` }]) }; // a line swatch: a bar
}
