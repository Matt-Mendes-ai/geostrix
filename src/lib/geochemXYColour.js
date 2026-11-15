// TASKS.csv #3585 (left over from #3577) — the X-Y scatter coloured by a FIELD of the Y layer (the density method, the low-recovery flag, a hole type, a year):
// each sample takes the value of that field at its own interval (the row of the same hole that covers the sample's mid-depth, as the Y value itself is read),
// and a value gets a colour. Only a field with few distinct values is offered (a category, not a measurement); the colours are the categorical palette. Pure.
import { fieldNames, fieldOf, rowCount } from "./layerColumns.js";
import { rowsRefOf } from "./tableFields.js";
import { CATEGORICAL_SAFE_COLORS } from "./layers.js";

export const FIELD_MAX_VALUES = 12;
const SKIP = new Set(["hole_id", "from", "to", "depth", "value", "n", "x", "y", "z", "id"]);

const rowsOfChoice = (choice, ctx) => (choice?.layerKey ? ctx?.layers?.[choice.layerKey] : rowsRefOf((ctx?.customLayers || []).find((c) => c.id === choice?.layerId))) || [];
const text = (v) => (v == null || v === "" ? null : typeof v === "boolean" ? (v ? "yes" : "no") : String(v));

// the fields of the choice's layer worth colouring by: 2 to FIELD_MAX_VALUES distinct values -> [{ field, values: [{ value, n }] }] (most rows first)
export function colourFields(choice, ctx) {
  const rows = rowsOfChoice(choice, ctx), N = rowCount(rows), out = [];
  if (!N) return out;
  for (const f of fieldNames(rows)) {
    if (SKIP.has(f) || f === choice?.field || f.startsWith("_") || /^coverage_/.test(f)) continue;
    const at = fieldOf(rows, f), counts = new Map();
    let tooMany = false;
    for (let i = 0; i < N && !tooMany; i++) { const t = text(at(i)); if (t == null) continue; counts.set(t, (counts.get(t) || 0) + 1); if (counts.size > FIELD_MAX_VALUES) tooMany = true; }
    if (tooMany || counts.size < 2) continue;
    out.push({ field: f, values: [...counts].map(([value, n]) => ({ value, n })).sort((a, b) => b.n - a.n || a.value.localeCompare(b.value, undefined, { numeric: true })) });
  }
  return out;
}

// -> { at(sample) -> the field's value at the sample's interval | null, values: [value ...], colourOf(sample) -> hex, colours: Map value -> hex }
export function fieldColouring(choice, field, ctx, { none = "#b8bec7" } = {}) {
  const rows = rowsOfChoice(choice, ctx), N = rowCount(rows);
  const cf = colourFields(choice, ctx).find((x) => x.field === field);
  if (!N || !cf) return null;
  const gH = fieldOf(rows, "hole_id"), gF = fieldOf(rows, "from"), gT = fieldOf(rows, "to"), gD = fieldOf(rows, "depth"), gV = fieldOf(rows, field);
  const byHole = new Map();
  for (let i = 0; i < N; i++) {
    const hole = gH(i), v = text(gV(i)); if (hole == null || v == null) continue;
    let from = Number(gF(i)), to = Number(gT(i));
    if (!Number.isFinite(from)) { const d = Number(gD(i)); if (!Number.isFinite(d)) continue; from = d; to = d; }
    (byHole.get(hole) || byHole.set(hole, []).get(hole)).push({ from, to: Number.isFinite(to) ? to : from, v });
  }
  for (const list of byHole.values()) list.sort((a, b) => a.from - b.from);
  const at = (s) => {
    const list = byHole.get(s?.hole_id), from = Number(s?.from), to = Number(s?.to);
    if (!list || !Number.isFinite(from)) return null;
    const mid = Number.isFinite(to) && to > from ? (from + to) / 2 : from;
    let lo = 0, hi = list.length - 1, k = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].from <= mid) { k = m; lo = m + 1; } else hi = m - 1; }
    for (let i = k; i >= 0 && i >= k - 3; i--) if (list[i].from <= mid && mid <= list[i].to) return list[i].v;
    return null;
  };
  const colours = new Map(cf.values.map((x, i) => [x.value, CATEGORICAL_SAFE_COLORS[i % CATEGORICAL_SAFE_COLORS.length]]));
  return { field, values: cf.values.map((x) => x.value), counts: cf.values, colours, at, colourOf: (s) => colours.get(at(s)) || none };
}

// a per-axis scale switch: "auto" (the fitted rule), "log" or "linear" -> the choice xyDiagram's fit honours
export const AXIS_SCALES = ["auto", "log", "linear"];
