// TASKS.csv #1051 (review #1016, resource geologist / QP) — check an estimate against its data. Nothing put the
// composite mean, the nearest-neighbour (declustered) mean and the estimate's mean side by side, though they are the
// first numbers a reviewer asks for: on Harry the length-weighted Au composites read 0.0977 ppm, NN 0.0721 and IDW²
// 0.0767 (the drilling clusters in the mineralization, so the composite mean overstates the declustered one by 36 %).
// The NN model is a second pass over the same grid and search (method "nn"); the means here are over the blocks the
// estimate filled, so all three describe the same volume. Pure: no React.

const blockKey = (c) => `${Math.round(c.x * 1000)},${Math.round(c.y * 1000)},${Math.round(c.z * 1000)}`; // same lattice, so mm keys match

// the composite mean, length-weighted (a point without a length counts once)
export function compositeMean(points) {
  let w = 0, s = 0;
  for (const p of points) { if (!Number.isFinite(p.value)) continue; const l = p.length > 0 ? p.length : 1; w += l; s += l * p.value; }
  return w > 0 ? s / w : null;
}

// -> { composites: { mean, n }, nn: { mean, n }, estimate: { mean, n }, departPct, nnVsCompositesPct } — the block
// means are plain means (every block of one model has the same volume), over the blocks both models filled
export function estimateCheck(cells, nnCells, points) {
  const nnBy = new Map();
  for (const c of nnCells) if (Number.isFinite(c.value)) nnBy.set(blockKey(c), c.value);
  let n = 0, se = 0, sn = 0;
  for (const c of cells) {
    if (!Number.isFinite(c.value)) continue;
    const v = nnBy.get(blockKey(c));
    if (v === undefined) continue;
    n++; se += c.value; sn += v;
  }
  const est = n ? se / n : null, nn = n ? sn / n : null, comp = compositeMean(points);
  const pct = (a, b) => (a != null && b != null && b !== 0 ? (100 * (a - b)) / b : null);
  return {
    composites: { mean: comp, n: points.filter((p) => Number.isFinite(p.value)).length },
    nn: { mean: nn, n }, estimate: { mean: est, n },
    departPct: pct(est, nn), nnVsCompositesPct: pct(comp, nn),
  };
}

// a swath plot along one axis ("x" | "y" | "z"): slices of width `width` (default: the extent in ~12 slices, rounded
// to whole blocks), each with the length-weighted composite mean and the NN and estimate block means over the blocks
// both models filled. -> [{ from, to, mid, composite, compositeN, nn, estimate, blocks }]
export function swath(cells, nnCells, points, axis, { width = null, slices = 12 } = {}) {
  const nnBy = new Map();
  for (const c of nnCells) if (Number.isFinite(c.value)) nnBy.set(blockKey(c), c.value);
  const both = [];
  for (const c of cells) { if (!Number.isFinite(c.value)) continue; const v = nnBy.get(blockKey(c)); if (v !== undefined) both.push([c, v]); }
  if (!both.length) return [];
  const d = axis === "x" ? "dx" : axis === "y" ? "dy" : "dz", cell = both[0][0][d] || 1;
  let lo = Infinity, hi = -Infinity;
  for (const [c] of both) { lo = Math.min(lo, c[axis] - c[d] / 2); hi = Math.max(hi, c[axis] + c[d] / 2); }
  const w = width > 0 ? width : Math.max(cell, Math.round((hi - lo) / slices / cell) * cell);
  const n = Math.max(1, Math.ceil((hi - lo) / w - 1e-9));
  const bins = Array.from({ length: n }, (_, i) => ({ from: lo + i * w, to: lo + (i + 1) * w, mid: lo + (i + 0.5) * w, sw: 0, swv: 0, compositeN: 0, se: 0, sn: 0, blocks: 0 }));
  const at = (v) => { const i = Math.floor((v - lo) / w); return i >= 0 && i < n ? bins[i] : null; };
  for (const [c, v] of both) { const b = at(c[axis]); if (b) { b.blocks++; b.se += c.value; b.sn += v; } }
  for (const p of points) {
    if (!Number.isFinite(p.value)) continue;
    const b = at(p[axis]); if (!b) continue;
    const l = p.length > 0 ? p.length : 1; b.sw += l; b.swv += l * p.value; b.compositeN++;
  }
  return bins.map((b) => ({ from: b.from, to: b.to, mid: b.mid, composite: b.sw > 0 ? b.swv / b.sw : null, compositeN: b.compositeN,
    nn: b.blocks ? b.sn / b.blocks : null, estimate: b.blocks ? b.se / b.blocks : null, blocks: b.blocks }));
}

// TASKS.csv #1017 — the swath CSV (was inline in EstimateCheck.jsx): one row per bin, means to 5 significant figures,
// blank where a bin has no composites / blocks; the columns named after the element
export function swathRows(bins, { axis, symbol }) {
  const sig5 = (v) => (v == null ? "" : +v.toPrecision(5));
  return bins.map((b) => ({ axis, from_m: +b.from.toFixed(2), to_m: +b.to.toFixed(2), composites: b.compositeN, [`composite_mean_${symbol}`]: sig5(b.composite),
    blocks: b.blocks, [`nn_mean_${symbol}`]: sig5(b.nn), [`estimate_mean_${symbol}`]: sig5(b.estimate) }));
}
