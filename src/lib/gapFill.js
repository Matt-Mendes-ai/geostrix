// TASKS.csv #3871 (Matt, 2026-11-16: "a bunch of steps on the GEM-15 data") — GEM-15 masks water, snow and ice, low-texture cells and cells more than 50 m from GLO-30, and those nodes were
// filled straight from Copernicus GLO-30. The two models differ by metres to tens of metres (GLO-30 is a surface model, heights above EGM2008; GEM-15's bare earth is above EGM96), so
// every gap outline became a vertical step in the terrain and its hillshade. The delta-surface fill: the difference (GEM-15 - GLO-30) on the nodes GEM-15 has is interpolated into the
// gaps (a harmonic fill: each gap node settles to the mean of its neighbours' differences, the valid nodes held), and a gap node is GLO-30 plus that difference. The fill then meets
// GEM-15 at the edge (the geoid difference, about a metre, and a canopy that GLO-30 holds and the bare earth does not, are in the difference, so they are corrected where GEM-15 has data)
// and relaxes to a smooth offset inside a large gap. Pure: grids are row-major Float32Array / Float64Array, NaN = no value.

// The gap nodes' offset field. gem: the primary model (NaN in its gaps), cop: the fill model; -> { delta (Float32Array, NaN where there is no offset to give), nValid, iterations }
// TASKS.csv #3946 (Matt's first-time test: "still have steps in the GEM-15", a 1064 x 2049 grid with 32 % of its nodes filled) — the fill started from a pull-push guess in which a gap node
// took its coarser parent's value as it was (constant 2^k x 2^k blocks), then relaxed it for at most 80 sweeps. On a 2 M-node grid with gaps hundreds of nodes wide that is far from
// settled: on a synthetic grid of that size the result sat up to 20 m (3 m on average) from the settled one, and the blocks' straight edges stayed in the terrain. Now a coarse-to-fine
// solve: the known differences are averaged up a pyramid of 2 x 2 levels; the coarsest level is relaxed until it settles; each finer level starts its gap nodes from a BILINEAR sample of
// the level above (no blocks) and is relaxed in turn. `sweeps` caps the finest level's sweeps; `iterations` is the sweeps done there.
export function deltaField(gem, cop, w, h, { sweeps = 80, omega = 1.85 } = {}) {
  const n = w * h, d = new Float32Array(n).fill(NaN);
  let nValid = 0, sum = 0;
  const known = new Uint8Array(n); // 1: a difference measured here
  for (let i = 0; i < n; i++) if (Number.isFinite(gem[i]) && Number.isFinite(cop[i])) { d[i] = gem[i] - cop[i]; known[i] = 1; nValid++; sum += d[i]; }
  if (!nValid) return { delta: d, nValid: 0, iterations: 0 };
  const mean = sum / nValid;
  // the pyramid: level 0 is the grid; a coarser node is the mean of its known children, known when any child is
  const levels = [{ v: d, k: known, w, h }];
  while (levels[levels.length - 1].w > 24 || levels[levels.length - 1].h > 24) {
    const a = levels[levels.length - 1], cw = Math.ceil(a.w / 2), ch = Math.ceil(a.h / 2), v = new Float32Array(cw * ch), c = new Float32Array(cw * ch), k = new Uint8Array(cw * ch);
    for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) { const i = y * a.w + x; if (a.k[i]) { const j = (y >> 1) * cw + (x >> 1); v[j] += a.v[i]; c[j]++; } }
    for (let j = 0; j < v.length; j++) { if (c[j]) { v[j] /= c[j]; k[j] = 1; } else v[j] = NaN; }
    levels.push({ v, k, w: cw, h: ch });
  }
  // the coarsest level: the mean where nothing is known, then relaxed until it settles
  const top = levels[levels.length - 1];
  for (let j = 0; j < top.v.length; j++) if (!top.k[j]) top.v[j] = mean;
  relax(top, 4000, omega);
  // down the pyramid: a gap node starts from the level above, sampled bilinearly (a fine node (x, y) sits at (x - 0.5) / 2 in the coarse level's node coordinates), then relaxed
  let iterations = 0;
  for (let l = levels.length - 2; l >= 0; l--) {
    const a = levels[l], p = levels[l + 1];
    for (let y = 0; y < a.h; y++) {
      const fy = Math.min(p.h - 1, Math.max(0, (y - 0.5) / 2)), y0 = Math.min(p.h - 2 < 0 ? 0 : p.h - 2, Math.floor(fy)), ty = p.h > 1 ? fy - y0 : 0, y1 = Math.min(p.h - 1, y0 + 1);
      for (let x = 0; x < a.w; x++) {
        const i = y * a.w + x; if (a.k[i]) continue;
        const fx = Math.min(p.w - 1, Math.max(0, (x - 0.5) / 2)), x0 = Math.min(p.w - 2 < 0 ? 0 : p.w - 2, Math.floor(fx)), tx = p.w > 1 ? fx - x0 : 0, x1 = Math.min(p.w - 1, x0 + 1);
        const t0 = p.v[y0 * p.w + x0] + (p.v[y0 * p.w + x1] - p.v[y0 * p.w + x0]) * tx, t1 = p.v[y1 * p.w + x0] + (p.v[y1 * p.w + x1] - p.v[y1 * p.w + x0]) * tx;
        a.v[i] = t0 + (t1 - t0) * ty;
      }
    }
    const it = relax(a, l === 0 ? sweeps : 60, omega);
    if (l === 0) iterations = it;
  }
  return { delta: d, nValid, iterations };
}

// over-relaxed Gauss-Seidel on a level's gap nodes (each settles to the mean of its 4 neighbours; known nodes held), at most `max` sweeps, stopping when no node moves 2 mm. -> sweeps done
function relax(a, max, omega) {
  const { v, k, w, h } = a, free = [];
  for (let i = 0; i < v.length; i++) if (!k[i]) free.push(i);
  if (!free.length) return 0;
  const f = Int32Array.from(free);
  let it = 0;
  for (; it < max; it++) {
    let moved = 0;
    for (let q = 0; q < f.length; q++) {
      const i = f[q], x = i % w, y = (i - x) / w;
      let s = 0, c = 0;
      if (x > 0) { s += v[i - 1]; c++; } if (x < w - 1) { s += v[i + 1]; c++; }
      if (y > 0) { s += v[i - w]; c++; } if (y < h - 1) { s += v[i + w]; c++; }
      if (!c) continue;
      const t = v[i] + omega * (s / c - v[i]), m = Math.abs(t - v[i]);
      if (m > moved) moved = m;
      v[i] = t;
    }
    if (moved < 0.002) return it + 1; // 2 mm
  }
  return it;
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
