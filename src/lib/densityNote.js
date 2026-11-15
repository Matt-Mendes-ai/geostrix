// TASKS.csv #3529 (Fireweed rehearsal) — a density table loaded as the Specific gravity layer said only "Loaded 32498 rows into Specific gravity": nothing told a
// resource geologist that this layer is the density the tonnes use, in t/m³, or how many of the values are calculated rather than measured. This builds that
// sentence for the import notice (and the dialog's unit check). Pure: rows in, text out; `t` is the translator.
import { median } from "./arrayStats.js"; // the one median (#1114)

const FLAG_COL = /low[\s_-]*recov/i, METHOD_COL = /^(sg[\s_-]*)?(method|meth|source|type)$/i, YES = /^(y|yes|true|t|1)$/i;
const fmt = (v) => String(+Number(v).toPrecision(4));
const count = (n) => Number(n).toLocaleString("en-US");

// the values a bulk density can take in t/m³ (= g/cc): air-dry core is 1.5-1.8 at the very low end, massive sulphide near 5; anything outside 0.5-10
// is another unit or another quantity (kg/m³, a count, a weight)
export const DENSITY_PLAUSIBLE = { min: 0.5, max: 10 };

// -> { median, n } when the middle value of the numbers in `col` falls outside what a t/m³ density can be, else null
export function densityUnitDoubt(rows, col) {
  if (!col) return null;
  const v = [];
  for (const r of rows || []) { const x = Number(String(r?.[col] ?? "").trim().replace(",", ".")); if (String(r?.[col] ?? "").trim() !== "" && Number.isFinite(x)) v.push(x); }
  if (!v.length) return null;
  const m = median(v);
  return m < DENSITY_PLAUSIBLE.min || m > DENSITY_PLAUSIBLE.max ? { median: m, n: v.length } : null;
}

// rows: the imported Specific gravity rows ({ value, <custom fields by name> }); customFields: the import's extra fields ({ column, name })
export function densityNote(rows, customFields, t) {
  const vals = (rows || []).map((r) => r.value).filter((v) => Number.isFinite(v));
  if (!vals.length) return "";
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const out = [t("This layer is the density the tonnes use (t/m³): {n} intervals, {min} to {max}. The Grade-tonnage dialog and the tonnages of solids take their tonnes from it.", { n: count(vals.length), min: fmt(lo), max: fmt(hi) })];
  const fields = customFields || [];
  const method = fields.find((f) => METHOD_COL.test(String(f.name || f.column)));
  if (method) {
    const by = new Map();
    for (const r of rows) { const v = String(r[method.name] ?? "").trim(); if (v) by.set(v, (by.get(v) || 0) + 1); }
    if (by.size >= 1 && by.size <= 6) out.push(t("{name}: {list}.", { name: method.name, list: [...by].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${count(n)}`).join(", ") }));
  }
  const flag = fields.find((f) => FLAG_COL.test(String(f.name || f.column)));
  if (flag) {
    const n = rows.filter((r) => YES.test(String(r[flag.name] ?? "").trim())).length;
    if (n) out.push(t("{n} interval(s) are flagged {name}.", { n: count(n), name: flag.name }));
  }
  const m = median(vals);
  if (m < DENSITY_PLAUSIBLE.min || m > DENSITY_PLAUSIBLE.max) out.push(t("These values do not look like t/m³ (the middle value is {m}): a density in kg/m³ needs dividing by 1000 before it is used for tonnes.", { m: fmt(m) }));
  return out.join(" ");
}
