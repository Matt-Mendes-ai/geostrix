// TASKS.csv #3553 (Fireweed rehearsal, Macpass) — the density layer kept the file's method column (MEAS 25,464, REG 6,489, LAB-SPG04 545), but a
// numeric layer could only be coloured and filtered by its value: the 6,489 densities regressed from the grade drew exactly like the measured ones,
// and only Identify said 'method REG'. A numeric hole layer can now be coloured by one of its kept text columns (method, low_recovery), each value
// shown or hidden, with the values and their counts in the layer's panel and the 3D legend. Kept in the layer's symbology (numericSymbology[key]
// .byField = { field, hidden: [values] }), so it is saved with the project and its views like the classes are.
import { CATEGORICAL_SAFE_COLORS } from "./layers.js";

// the columns every interval / point row has, and what the layer already shows another way
const KNOWN = new Set(["hole_id", "from", "to", "depth", "value", "extra", "intensity", "alpha", "beta", "dip", "azimuth", "description", "id", "layer"]);
const isNumberText = (v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)));
export const BLANK = "";

// a row's value of a column as the legend lists it (trimmed text; a blank cell is its own entry)
export const fieldValueOf = (row, field) => { const v = row?.[field]; return v == null ? BLANK : String(v).trim(); };

// rows -> [{ field, values: [[value, count]] (most rows first) }]: the text columns with 2 to maxValues values over at least `min` filled rows;
// a column of numbers is not offered (it is a value to plot), nor one with a value per row (a comment)
export function keptTextFields(rows, { maxValues = 40, min = 5 } = {}) {
  const stats = new Map(); // field -> { counts: Map, filled, numeric, over }
  for (const r of rows || []) {
    if (!r || typeof r !== "object") continue;
    for (const k in r) {
      if (KNOWN.has(k) || k.startsWith("_")) continue;
      let s = stats.get(k);
      if (!s) { s = { counts: new Map(), filled: 0, numeric: 0, over: false }; stats.set(k, s); }
      const v = r[k];
      if (v == null || v === "") continue;
      if (typeof v === "object") { s.over = true; continue; }
      s.filled++;
      if (isNumberText(v)) s.numeric++;
      if (s.over) continue;
      const key = String(v).trim();
      s.counts.set(key, (s.counts.get(key) || 0) + 1);
      if (s.counts.size > maxValues) s.over = true;
    }
  }
  const n = (rows || []).length, out = [];
  for (const [field, s] of stats) {
    if (s.over || s.filled < min || s.numeric >= 0.9 * s.filled) continue;
    const counts = new Map(s.counts);
    if (n > s.filled) counts.set(BLANK, n - s.filled);
    if (counts.size < 2) continue;
    out.push({ field, values: [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))) });
  }
  return out.sort((a, b) => a.field.localeCompare(b.field));
}

// TASKS.csv #3691 (Fireweed rehearsal round 3: 'MEAS' took the amber of the zinc classes drawn beside it) — the colour-blind-safe palette in an order that opens with
// hues the assay grade classes do not use (they run cream -> orange -> brown), the warm ones (amber, yellow, vermillion, sand, olive) last
const WARM = new Set(["#E69F00", "#F0E442", "#D55E00", "#DDCC77", "#999933"]);
export const FIELD_PALETTE = [...CATEGORICAL_SAFE_COLORS.filter((c) => !WARM.has(c)), ...CATEGORICAL_SAFE_COLORS.filter((c) => WARM.has(c))];
// the colour of each value: by count, the palette in turn (the same order the panel and the legend list them)
export function fieldValueColours(values) {
  const m = new Map();
  values.forEach(([v], i) => m.set(v, v === BLANK ? "#9aa3ad" : FIELD_PALETTE[i % FIELD_PALETTE.length]));
  return m;
}

// sym: the layer's numericSymbology entry; rows: the layer's rows -> null (coloured by its value) or { field, values, colourOf(row), shown(row) }
export function fieldColourer(sym, rows) {
  const by = sym?.byField;
  if (!by?.field) return null;
  const f = keptTextFields(rows).find((x) => x.field === by.field);
  if (!f) return null;
  const colours = fieldValueColours(f.values), hidden = new Set(by.hidden || []);
  return {
    field: by.field,
    values: f.values.map(([v, n]) => ({ value: v, n, colour: colours.get(v), hidden: hidden.has(v) })),
    colourOf: (row) => colours.get(fieldValueOf(row, by.field)) || "#9aa3ad",
    shown: (row) => !hidden.size || !hidden.has(fieldValueOf(row, by.field)),
  };
}
