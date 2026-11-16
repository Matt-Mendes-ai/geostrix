// TASKS.csv #3871 (Matt, 2026-11-16: "a bunch of steps on the GEM-15 data") — GEM-15 masks water, snow and ice, low-texture cells and cells more than 50 m from GLO-30, and those nodes were
// filled straight from Copernicus GLO-30. The two models differ by metres to tens of metres (GLO-30 is a surface model, heights above EGM2008; GEM-15's bare earth is above EGM96), so
// every gap outline became a vertical step in the terrain and its hillshade. The delta-surface fill: the difference (GEM-15 - GLO-30) on the nodes GEM-15 has is interpolated into the
// gaps (a harmonic fill: each gap node settles to the mean of its neighbours' differences, the valid nodes held), and a gap node is GLO-30 plus that difference. The fill then meets
// GEM-15 at the edge (the geoid difference, about a metre, and a canopy that GLO-30 holds and the bare earth does not, are in the difference, so they are corrected where GEM-15 has data)
// and relaxes to a smooth offset inside a large gap. Pure: grids are row-major Float32Array / Float64Array, NaN = no value.

// The gap nodes' offset field. gem: the primary model (NaN in its gaps), cop: the fill model; -> { delta (Float32Array, NaN where there is no offset to give), nValid, iterations }
export function deltaField(gem, cop, w, h, { sweeps = 80, omega = 1.85 } = {}) {
  const n = w * h, d = new Float32Array(n).fill(NaN);
  let nValid = 0, sum = 0;
  const known = new Uint8Array(n); // 1: a difference measured here
  for (let i = 0; i < n; i++) if (Number.isFinite(gem[i]) && Number.isFinite(cop[i])) { d[i] = gem[i] - cop[i]; known[i] = 1; nValid++; sum += d[i]; }
  if (!nValid) return { delta: d, nValid: 0, iterations: 0 };
  // the starting guess: the mean offset everywhere, then a pull-push fill (coarse levels' means pushed down) so the sweeps below start near the answer
  const mean = sum / nValid;
  pullPush(d, known, w, h, mean);
  // gap nodes the relaxation moves: a node with no GEM-15 value (it may still have no GLO-30 value either: then it is left NaN by the caller)
  const free = [];
  for (let i = 0; i < n; i++) if (!known[i]) free.push(i);
  let it = 0;
  for (; it < sweeps && free.length; it++) {
    let moved = 0;
    for (const i of free) {
      const x = i % w, y = (i - x) / w;
      let s = 0, c = 0;
      if (x > 0) { s += d[i - 1]; c++; } if (x < w - 1) { s += d[i + 1]; c++; }
      if (y > 0) { s += d[i - w]; c++; } if (y < h - 1) { s += d[i + w]; c++; }
      const t = s / c, v = d[i] + omega * (t - d[i]);
      moved = Math.max(moved, Math.abs(v - d[i])); d[i] = v;
    }
    if (moved < 0.002) { it++; break; } // 2 mm
  }
  return { delta: d, nValid, iterations: it };
}

// push-pull: fill d where known = 0 from the mean of coarser levels (2 x 2 blocks of known values, weighted by how many are known); `fallback` where nothing is known at all
function pullPush(d, known, w, h, fallback) {
  const levels = [{ v: d, k: known, w, h }];
  for (;;) {
    const a = levels[levels.length - 1];
    if (a.w <= 2 && a.h <= 2) break;
    const cw = Math.ceil(a.w / 2), ch = Math.ceil(a.h / 2), v = new Float32Array(cw * ch), k = new Float32Array(cw * ch);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const i = y * a.w + x, wt = a.k[i];
      if (wt > 0) { const j = (y >> 1) * cw + (x >> 1); v[j] += a.v[i] * wt; k[j] += wt; }
    }
    for (let j = 0; j < v.length; j++) if (k[j] > 0) v[j] /= k[j];
    levels.push({ v, k, w: cw, h: ch });
  }
  // from the coarsest level down: a node without a value takes its parent's
  for (let l = levels.length - 2; l >= 0; l--) {
    const a = levels[l], p = levels[l + 1];
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
      const i = y * a.w + x;
      if (!(a.k[i] > 0)) { const j = (y >> 1) * p.w + (x >> 1); a.v[i] = p.k[j] > 0 ? p.v[j] : fallback; a.k[i] = p.k[j] > 0 ? 1e-6 : 0; }
    }
  }
  for (let i = 0; i < d.length; i++) if (!Number.isFinite(d[i])) d[i] = fallback;
}

// The gaps of `gem` filled from `cop` plus the interpolated difference. -> { out (new array), filled (nodes filled), plainFilled, delta: { median, min, max } }; a node with no `cop` value stays NaN
export function fillWithDelta(gem, cop, w, h, opts = {}) {
  const n = w * h, out = Float32Array.from(gem);
  const { delta, nValid, iterations } = deltaField(gem, cop, w, h, opts);
  let filled = 0;
  const used = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(out[i]) || !Number.isFinite(cop[i])) continue;
    const d = nValid ? delta[i] : 0;
    out[i] = cop[i] + (Number.isFinite(d) ? d : 0); filled++; used.push(Number.isFinite(d) ? d : 0);
  }
  used.sort((a, b) => a - b);
  return { out, filled, nValid, iterations, delta: used.length ? { median: used[used.length >> 1], min: used[0], max: used[used.length - 1] } : null };
}

// the jump across the seam: for every pair of 4-neighbour nodes with a GEM-15 node on one side and a filled node on the other, |difference|; and, for scale, the same for pairs inside
// the GEM-15 area (its own relief). -> { n, max, median, p90, ownMedian, ownP90 } or null with no seam
export function seamJump(out, gemValid, w, h) {
  const seam = [], own = [];
  const at = (i, j) => { const a = gemValid[i], b = gemValid[j]; if (!Number.isFinite(out[i]) || !Number.isFinite(out[j])) return; const dz = Math.abs(out[i] - out[j]); if (a && b) own.push(dz); else if (a !== b) seam.push(dz); };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (x < w - 1) at(i, i + 1); if (y < h - 1) at(i, i + w); }
  if (!seam.length) return null;
  const q = (a, p) => { a.sort((u, v) => u - v); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
  return { n: seam.length, max: q(seam, 1), median: q(seam, 0.5), p90: q(seam, 0.9), ownMedian: q(own, 0.5), ownP90: q(own, 0.9) };
}
