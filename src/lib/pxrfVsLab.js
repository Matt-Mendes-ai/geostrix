// TASKS.csv #1675 (review #1645, Copley) — QAQC found no QC samples on Copley, correctly, but said nothing of the 556 pXRF readings, 551 of
// which sit inside a lab interval: the reviewer had to join them in SQL and Python to learn that pXRF K tracks the lab (r 0.84) while pXRF Cu
// does not (r 0.20). Each pXRF reading is paired with the lab interval of the same hole that holds its depth (the reading's midpoint); per
// element: the pairs, Pearson r, Spearman rank r, the median pXRF / lab ratio and the two means. Pure.
import { isPxrfRow } from "./qaqc.js";
import { valueIn } from "./geochem.js";
import { median } from "./arrayStats.js"; // #1114 — the one median

// the sample-type values the assays carry, most common first: [[value, count]] (so 'no QC found' can be told from 'QC not recognised')
export function sampleTypesSeen(assays, max = 8) {
  const m = new Map();
  for (const a of assays || []) { const t = String(a?.sample_type ?? (isPxrfRow(a) ? "pXRF" : "")).trim(); if (t) m.set(t, (m.get(t) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, max);
}

const pearson = (x, y) => {
  const n = x.length; if (n < 3) return null;
  let mx = 0, my = 0; for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; } mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
};
const ranks = (v) => { const idx = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]), r = new Array(v.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };

// the pXRF readings and the lab interval holding each: [{ pxrf, lab }]
export function pxrfLabPairs(assays) {
  const lab = new Map();
  for (const a of assays || []) {
    if (isPxrfRow(a) || !(a?.to > a?.from) || a.hole_id == null) continue;
    if (!lab.has(a.hole_id)) lab.set(a.hole_id, []);
    lab.get(a.hole_id).push(a);
  }
  for (const list of lab.values()) list.sort((p, q) => p.from - q.from);
  const out = [];
  for (const p of assays || []) {
    if (!isPxrfRow(p) || !Number.isFinite(p.from)) continue;
    const list = lab.get(p.hole_id); if (!list) continue;
    const d = Number.isFinite(p.to) ? (p.from + p.to) / 2 : p.from;
    let lo = 0, hi = list.length - 1, at = -1;
    while (lo <= hi) { const k = (lo + hi) >> 1; if (list[k].from <= d) { at = k; lo = k + 1; } else hi = k - 1; }
    if (at >= 0 && d < list[at].to) out.push({ pxrf: p, lab: list[at] });
  }
  return out;
}

// per element with at least minPairs pairs: { symbol, n, r, rho, medianRatio, meanPxrf, meanLab } sorted by rho (best first)
export function pxrfVsLab(assays, elements, units = {}, minPairs = 10) {
  const pairs = pxrfLabPairs(assays), out = [];
  for (const e of elements || []) {
    const s = e.symbol ?? e, u = units[s] || e.unit || "ppm", x = [], y = [];
    for (const { pxrf, lab } of pairs) {
      const a = valueIn(pxrf, s, u, units), b = valueIn(lab, s, u, units);
      if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) { x.push(a); y.push(b); }
    }
    if (x.length < minPairs) continue;
    out.push({ symbol: s, unit: u, n: x.length, r: pearson(x, y), rho: pearson(ranks(x), ranks(y)), medianRatio: median(x.map((v, i) => v / y[i])), meanPxrf: x.reduce((t, v) => t + v, 0) / x.length, meanLab: y.reduce((t, v) => t + v, 0) / y.length });
  }
  return { pairs: pairs.length, readings: (assays || []).filter(isPxrfRow).length, rows: out.sort((a, b) => (b.rho ?? -2) - (a.rho ?? -2)) };
}
