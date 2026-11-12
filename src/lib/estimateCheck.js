// TASKS.csv #1051 (review #1016, resource geologist / QP) — check an estimate against its data. Nothing put the
// composite mean, the nearest-neighbour (declustered) mean and the estimate's mean side by side, though they are the
// first numbers a reviewer asks for: on Harry the length-weighted Au composites read 0.0977 ppm, NN 0.0721 and IDW²
// 0.0767 (the drilling clusters in the mineralization, so the composite mean overstates the declustered one by 36 %).
// The NN model is a second pass over the same grid and search (method "nn"); the means here are over the blocks the
// estimate filled, so all three describe the same volume. Pure: no React.

const blockKey = (c) => `${Math.round(c.x * 1000)},${Math.round(c.y * 1000)},${Math.round(c.z * 1000)}`; // same lattice, so mm keys match
// TASKS.csv #2547 — the estimate / NN join, built once per pair of models and shared by the check and the three swaths (it was rebuilt four
// times, each with 190,000 string keys), keyed by the lattice index from the first block (both models share the lattice); a model whose
// blocks are not on one lattice falls back to the mm string key
const joinCache = new WeakMap();
function joined(cells, nnCells) {
  let byNn = joinCache.get(cells);
  if (byNn?.nn === nnCells) return byNn.pairs;
  const o = cells.find((c) => Number.isFinite(c.value)) || nnCells[0];
  const ok = o && [o.dx, o.dy, o.dz].every((v) => v > 0);
  const idx = (c) => {
    const i = Math.round((c.x - o.x) / o.dx), j = Math.round((c.y - o.y) / o.dy), k = Math.round((c.z - o.z) / o.dz);
    if (Math.abs(c.x - o.x - i * o.dx) > 1e-3 || Math.abs(c.y - o.y - j * o.dy) > 1e-3 || Math.abs(c.z - o.z - k * o.dz) > 1e-3 || Math.abs(i) > 99999 || Math.abs(j) > 99999 || Math.abs(k) > 99999) return null;
    return ((k + 100000) * 200001 + (j + 100000)) * 200001 + (i + 100000); // z, then y, then x: the estimator's own loop order (#3008)
  };
  // TASKS.csv #3008 (WA iron review) — both models come from the same z / y / x loop (the NN pass is a second run over the same grid), so
  // their blocks are already in ascending lattice order: a merge in one pass, no Map of 627,000 keys (1.0 s on the main thread after a
  // whole-field run). Any block off the lattice, or out of order, falls back to the Map join below.
  if (ok) {
    const keysOf = (arr) => { const out = new Float64Array(arr.length); let last = -Infinity; for (let q = 0; q < arr.length; q++) { const c = arr[q]; if (!Number.isFinite(c.value)) { out[q] = NaN; continue; } const k = idx(c); if (k == null || k <= last) return null; out[q] = last = k; } return out; };
    const ka = keysOf(cells), kb = ka && keysOf(nnCells);
    if (ka && kb) {
      const pairs = [];
      let b = 0;
      for (let a = 0; a < cells.length; a++) {
        const k = ka[a]; if (k !== k) continue; // NaN: no value
        while (b < nnCells.length && !(kb[b] >= k)) b++; // NaN entries are skipped too
        if (b < nnCells.length && kb[b] === k) pairs.push([cells[a], nnCells[b].value]);
      }
      joinCache.set(cells, { nn: nnCells, pairs });
      return pairs;
    }
  }
  const nnBy = new Map();
  let lattice = ok;
  if (lattice) for (const c of nnCells) { if (!Number.isFinite(c.value)) continue; const k = idx(c); if (k == null) { lattice = false; break; } nnBy.set(k, c.value); }
  if (!lattice) { nnBy.clear(); for (const c of nnCells) if (Number.isFinite(c.value)) nnBy.set(blockKey(c), c.value); }
  const pairs = [];
  for (const c of cells) { if (!Number.isFinite(c.value)) continue; const v = nnBy.get(lattice ? idx(c) : blockKey(c)); if (v !== undefined) pairs.push([c, v]); }
  joinCache.set(cells, { nn: nnCells, pairs });
  return pairs;
}

// the composite mean, length-weighted (a point without a length counts once)
export function compositeMean(points) {
  let w = 0, s = 0;
  for (const p of points) { if (!Number.isFinite(p.value)) continue; const l = p.length > 0 ? p.length : 1; w += l; s += l * p.value; }
  return w > 0 ? s / w : null;
}

// -> { composites: { mean, n }, nn: { mean, n }, estimate: { mean, n }, departPct, nnVsCompositesPct } — the block
// means are plain means (every block of one model has the same volume), over the blocks both models filled
export function estimateCheck(cells, nnCells, points) {
  let n = 0, se = 0, sn = 0;
  for (const [c, v] of joined(cells, nnCells)) { n++; se += c.value; sn += v; } // #2547 — the shared join
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
  const both = joined(cells, nnCells); // #2547 — the shared join
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
