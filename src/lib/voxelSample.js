// TASKS.csv #323 (part 2) — evaluate a block / voxel model back onto the drillholes.
// Walks each hole's desurveyed trace in small steps, looks up the model cell at each step, and merges
// consecutive steps in the same cell into one downhole interval {hole_id, from, to, value}. The result is a
// downhole layer: shown beside the logs in the strip log (a recovered susceptibility next to the logged
// one, a grade estimate next to the assays) and exportable like any other interval table. Steps outside
// every cell leave a gap — nothing is extrapolated.
import { desurveyHole, pointOnTrace } from "./desurvey.js";
import { median } from "./arrayStats.js"; // TASKS.csv #1114 — the true median (mean of the middle two)


// Uniform bucket grid over the cells; a cell is registered in every bucket its box overlaps.
export function buildVoxelLookup(cells) {
  // TASKS.csv #3811 (Scottie Gold) — evaluating a 778,822-cell IP model onto 84 holes froze the window 4.5 s, nearly all of it here: a filter that built an
  // array per cell, three medians sorting every cell and a Map keyed by a string 'i,j,k'. Now: the medians from a stride sample of at most 20,000 cells (a
  // mesh's sizes repeat), and the buckets a counted index over the model's own extent (typed arrays; a Map of numbers past 16 million buckets). The
  // lookup is the same: half-open cell boxes, the first cell of the bucket that holds the point.
  const valid = [];
  for (const c of cells || []) if (Number.isFinite(c?.x) && Number.isFinite(c.y) && Number.isFinite(c.z) && c.dx > 0 && c.dy > 0 && c.dz > 0 && Number.isFinite(c.dx) && Number.isFinite(c.dy) && Number.isFinite(c.dz)) valid.push(c);
  if (!valid.length) return { find: () => null, minCell: NaN };
  const step = Math.max(1, Math.ceil(valid.length / 20000)), smp = [];
  for (let i = 0; i < valid.length; i += step) smp.push(valid[i]);
  const b = median(smp.map((c) => Math.max(c.dx, c.dy, c.dz)));
  const minCell = Math.min(median(smp.map((c) => c.dx)), median(smp.map((c) => c.dy)), median(smp.map((c) => c.dz)));
  const n = valid.length, lo = new Int32Array(n * 3), hi = new Int32Array(n * 3);
  let I0 = Infinity, J0 = Infinity, K0 = Infinity, I1 = -Infinity, J1 = -Infinity, K1 = -Infinity;
  for (let q = 0; q < n; q++) {
    const c = valid[q];
    const i0 = Math.floor((c.x - c.dx / 2) / b), i1 = Math.floor((c.x + c.dx / 2 - 1e-9) / b);
    const j0 = Math.floor((c.y - c.dy / 2) / b), j1 = Math.floor((c.y + c.dy / 2 - 1e-9) / b);
    const k0 = Math.floor((c.z - c.dz / 2) / b), k1 = Math.floor((c.z + c.dz / 2 - 1e-9) / b);
    lo[q * 3] = i0; lo[q * 3 + 1] = j0; lo[q * 3 + 2] = k0; hi[q * 3] = i1; hi[q * 3 + 1] = j1; hi[q * 3 + 2] = k1;
    if (i0 < I0) I0 = i0; if (j0 < J0) J0 = j0; if (k0 < K0) K0 = k0; if (i1 > I1) I1 = i1; if (j1 > J1) J1 = j1; if (k1 > K1) K1 = k1;
  }
  const NI = I1 - I0 + 1, NJ = J1 - J0 + 1, NK = K1 - K0 + 1, NB = NI * NJ * NK;
  const key = (i, j, k) => (i < I0 || i > I1 || j < J0 || j > J1 || k < K0 || k > K1 ? -1 : ((i - I0) * NJ + (j - J0)) * NK + (k - K0));
  const inBox = (c, x, y, z) => x >= c.x - c.dx / 2 && x < c.x + c.dx / 2 && y >= c.y - c.dy / 2 && y < c.y + c.dy / 2 && z >= c.z - c.dz / 2 && z < c.z + c.dz / 2;
  if (NB <= 16e6) {
    const count = new Int32Array(NB + 1);
    for (let q = 0; q < n; q++) for (let i = lo[q * 3]; i <= hi[q * 3]; i++) for (let j = lo[q * 3 + 1]; j <= hi[q * 3 + 1]; j++) for (let k = lo[q * 3 + 2]; k <= hi[q * 3 + 2]; k++) count[key(i, j, k) + 1]++;
    for (let t = 0; t < NB; t++) count[t + 1] += count[t];
    const fill = count.slice(0, NB), list = new Int32Array(count[NB]);
    for (let q = 0; q < n; q++) for (let i = lo[q * 3]; i <= hi[q * 3]; i++) for (let j = lo[q * 3 + 1]; j <= hi[q * 3 + 1]; j++) for (let k = lo[q * 3 + 2]; k <= hi[q * 3 + 2]; k++) list[fill[key(i, j, k)]++] = q;
    const find = (x, y, z) => {
      const kk = key(Math.floor(x / b), Math.floor(y / b), Math.floor(z / b));
      if (kk < 0) return null;
      for (let s = count[kk]; s < count[kk + 1]; s++) { const c = valid[list[s]]; if (inBox(c, x, y, z)) return c; }
      return null;
    };
    return { find, minCell };
  }
  const buckets = new Map();
  for (let q = 0; q < n; q++) for (let i = lo[q * 3]; i <= hi[q * 3]; i++) for (let j = lo[q * 3 + 1]; j <= hi[q * 3 + 1]; j++) for (let k = lo[q * 3 + 2]; k <= hi[q * 3 + 2]; k++) {
    const kk = key(i, j, k), l = buckets.get(kk);
    if (l) l.push(valid[q]); else buckets.set(kk, [valid[q]]);
  }
  const find = (x, y, z) => {
    const kk = key(Math.floor(x / b), Math.floor(y / b), Math.floor(z / b));
    const l = kk < 0 ? null : buckets.get(kk);
    if (l) for (const c of l) if (inBox(c, x, y, z)) return c;
    return null;
  };
  return { find, minCell };
}

// TASKS.csv #2727 (split from #1846) — Surface query's block-model rows: per hole, the metres inside the model and those at or above a
// cutoff (from sampleModelOnHoles' intervals), with their length-weighted mean. -> [{ hole_id, inM, aboveM, meanAbove }] by aboveM, then inM
export function holesInBlockModel(rows, cutoff = null) {
  const by = new Map();
  for (const r of rows || []) {
    const L = Number(r.to) - Number(r.from), v = Number(r.value);
    if (!(L > 0)) continue;
    const h = by.get(r.hole_id) || by.set(r.hole_id, { hole_id: r.hole_id, inM: 0, aboveM: 0, sumAbove: 0 }).get(r.hole_id);
    h.inM += L;
    if (cutoff != null && Number.isFinite(v) && v >= cutoff) { h.aboveM += L; h.sumAbove += v * L; }
  }
  return [...by.values()].map((h) => ({ hole_id: h.hole_id, inM: h.inM, aboveM: cutoff != null ? h.aboveM : null, meanAbove: h.aboveM > 0 ? h.sumAbove / h.aboveM : null }))
    .sort((a, b) => (b.aboveM ?? 0) - (a.aboveM ?? 0) || b.inM - a.inM);
}

// model: { cells: [{x,y,z,dx,dy,dz,value}] } in project coordinates. Returns { rows, holes, step }.
export function sampleModelOnHoles({ model, collars, survey, desurveyMethod, step }) {
  const { find, minCell } = buildVoxelLookup(model.cells || []);
  const st = step > 0 ? step : Math.max(0.5, minCell / 4);
  const surveyBy = new Map();
  (survey || []).forEach((s) => { if (!surveyBy.has(s.hole_id)) surveyBy.set(s.hole_id, []); surveyBy.get(s.hole_id).push(s); });
  const rows = [];
  let holes = 0;
  for (const c of collars || []) {
    if (![c.x, c.y, c.z].every(Number.isFinite)) continue;
    const t = desurveyHole(c, surveyBy.get(c.hole_id) || [], desurveyMethod);
    if (!t.length) continue;
    const top = t[0].md, bottom = t[t.length - 1].md;
    let cur = null; // open interval
    let hit = false;
    for (let md = top; md < bottom; md += st) {
      const mid = Math.min(bottom, md + st / 2);
      const p = pointOnTrace(t, mid);
      const cell = find(p.x, p.y, p.z);
      const end = Math.min(bottom, md + st);
      if (cell && cur && cur.cell === cell) { cur.to = end; continue; }
      if (cur) { rows.push({ hole_id: c.hole_id, from: +cur.from.toFixed(2), to: +cur.to.toFixed(2), value: cur.cell.value }); cur = null; }
      if (cell && Number.isFinite(cell.value)) { cur = { cell, from: md, to: end }; hit = true; }
    }
    if (cur) rows.push({ hole_id: c.hole_id, from: +cur.from.toFixed(2), to: +cur.to.toFixed(2), value: cur.cell.value });
    if (hit) holes++;
  }
  return { rows, holes, step: st };
}
