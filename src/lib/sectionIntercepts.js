// TASKS.csv #3860 (Scottie Gold review) — a section of vein gold on a sheet: its grade bars were a hair wide (each bar's length was its share of the
// section's highest value, so with one 123 g/t sample every other bar was a pixel long), and it labelled single samples ('123 g/t Au') where Best
// intercepts gives '3.70 m @ 56.41 g/t Au' for the same place. Pure functions; the drawing is components/SectionWindow.jsx.
import { computeBestIntercepts } from "./geochem.js";
import { p90Cutoff } from "./drillPlan.js";
import { gradeUnitLabel } from "./geochemColumns.js";
import { fmtSig3 } from "./numberFormat.js";

// The axis of an element's grade bars on the section: linear from 0 when its positive values span under two decades (as the strip log's
// assayAxis), else log from its lowest positive value. -> { log, lo, hi }
export function gradeBarAxis(values) {
  let lo = Infinity, hi = 0;
  for (const v of values || []) if (v > 0 && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (!(hi > 0)) return { log: false, lo: 0, hi: 0 };
  return { log: hi / lo >= 100, lo, hi };
}
// a bar's length as a share of the longest (at least 6 % on a log axis, so the lowest value still shows)
export function gradeBarFrac(v, axis) {
  if (!(v > 0) || !(axis?.hi > 0)) return 0;
  if (!axis.log) return Math.min(1, v / axis.hi);
  return Math.max(0.06, Math.min(1, (Math.log10(v) - Math.log10(axis.lo)) / (Math.log10(axis.hi) - Math.log10(axis.lo))));
}

// The best intercepts of each element drawn on the section, by Best intercepts' rule (a cut-off, at most `dilution` m of internal dilution, a
// minimum length), from the section's own assay rows (r.assay: { sym, from, to, value, u }). cutoffs: { [sym]: number } (blank: the P90 of the
// section's values for it, rounded to one figure, as Best intercepts suggests). -> [{ hole_id, sym, from, to, length, grade, gt, text, cutoff }],
// the `top` best (grade x length) per element
export function sectionIntercepts(points, { cutoffs = {}, dilution = 2, minLength = 0, top = 8 } = {}) {
  const bySym = new Map();
  for (const r of points || []) {
    const a = r?.assay;
    if (!a || a.pxrf || !Number.isFinite(a.value) || !(a.to > a.from)) continue;
    if (!bySym.has(a.sym)) bySym.set(a.sym, { u: a.u || "ppm", rows: [] });
    bySym.get(a.sym).rows.push({ hole_id: r.hole_id, from: a.from, to: a.to, values: { [a.sym]: a.value } });
  }
  const out = [];
  for (const [sym, { u, rows }] of bySym) {
    const typed = Number(cutoffs?.[sym]);
    const cutoff = cutoffs?.[sym] !== "" && cutoffs?.[sym] != null && Number.isFinite(typed) ? typed : p90Cutoff(rows.map((q) => q.values[sym]));
    if (cutoff == null) continue;
    const comps = computeBestIntercepts(rows, sym, u, { [sym]: u }, { cutoff, maxInternalDilution: dilution, minLength });
    const unit = gradeUnitLabel(sym, u);
    comps.map((c) => ({ hole_id: c.hole_id, sym, from: Number(c.from), to: Number(c.to), length: Number(c.length), grade: Number(c.avgGrade), cutoff }))
      .filter((c) => Number.isFinite(c.length) && Number.isFinite(c.grade))
      .map((c) => ({ ...c, gt: c.length * c.grade, text: `${c.length.toFixed(2)} m @ ${fmtSig3(c.grade)} ${unit} ${sym}` }))
      .sort((p, q) => q.gt - p.gt).slice(0, top).forEach((c) => out.push(c));
  }
  return out;
}
