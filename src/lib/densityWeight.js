// TASKS.csv #3562 (Fireweed / Macpass rehearsal) — density-weighted grades. A core shack that has bulk densities reports a massive-sulphide
// interval weighted by length x density (NB23-023 70.50-84.20 m: 12.53 % Zn by length, 14.90 % by length x density): a dense sulphide
// sample carries more metal per metre than a light one. Pure functions; the layer is the project's Specific gravity layer ({ hole_id, from, to, value } rows, t/m3).

import { DEFAULT_DENSITY_RANGE } from "./densityRange.js"; // TASKS.csv #3682 — the ONE density range (the project's, 1-6 t/m3 by default): this file kept a density range of its own after #3587 and accepted what Data QC flags

// the project's density rows as a lookup: (hole, from, to) -> the length-weighted mean density over the sg rows overlapping that span, or null
// when none does. Rows with no usable value (blank, <= 0, outside the project's density range) are not readings. range: { min, max } (densityRangeOf(project)).
export function densityLookup(rows, range = DEFAULT_DENSITY_RANGE) {
  const byHole = new Map();
  let n = 0, left = 0;
  for (const r of rows || []) {
    const v = Number(r?.value), f = Number(r?.from), t = Number(r?.to);
    if (r?.value == null || r.value === "" || !Number.isFinite(v) || !(t > f)) continue;
    if (v < range.min || v > range.max) { left++; continue; }
    let a = byHole.get(r.hole_id);
    if (!a) byHole.set(r.hole_id, (a = []));
    a.push({ from: f, to: t, v });
    n++;
  }
  for (const a of byHole.values()) a.sort((x, y) => x.from - y.from || x.to - y.to);
  if (!n) return null;
  const EPS = 1e-6;
  const at = (hole, from, to) => {
    const a = byHole.get(hole);
    if (!a) return null;
    let lo = 0, hi = a.length; // first row that may reach past `from`: rows are sorted by start, so scan back a little for a long row that started earlier
    while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].from < from - EPS) lo = m + 1; else hi = m; }
    let w = 0, s = 0;
    for (let i = Math.max(0, lo - 8); i < a.length && a[i].from < to - EPS; i++) {
      const ov = Math.min(a[i].to, to) - Math.max(a[i].from, from);
      if (ov <= EPS) continue;
      w += ov; s += ov * a[i].v;
    }
    return w > EPS ? s / w : null;
  };
  at.readings = n; at.left = left; at.holes = byHole.size;
  return at;
}

// parts [{ v, w, rho }] (a grade, its length in metres and its density or null) -> { grade, weighted, meanRho, noDensityM, noDensityN }.
// A part with no density takes the mean density of the parts that have one (length-weighted), so it counts as an average sample rather than
// being dropped or dragging the grade; with no density anywhere the grade is by length alone (weighted: false).
export function weightedGrade(parts) {
  let wl = 0, gl = 0, known = 0, knownRho = 0, noM = 0, noN = 0, any = false;
  for (const p of parts) {
    if (!(p.w > 0)) continue;
    wl += p.w; gl += p.v * p.w;
    if (p.rho != null && p.rho > 0) { any = true; known += p.w; knownRho += p.w * p.rho; } else { noM += p.w; noN++; }
  }
  if (!(wl > 0)) return { grade: null, weighted: false, meanRho: null, noDensityM: 0, noDensityN: 0 };
  if (!any) return { grade: gl / wl, weighted: false, meanRho: null, noDensityM: noM, noDensityN: noN };
  const mean = knownRho / known;
  let num = 0, den = 0;
  for (const p of parts) {
    if (!(p.w > 0)) continue;
    const r = p.rho != null && p.rho > 0 ? p.rho : mean;
    num += p.v * p.w * r; den += p.w * r;
  }
  return { grade: num / den, weighted: true, meanRho: mean, noDensityM: noM, noDensityN: noN };
}
