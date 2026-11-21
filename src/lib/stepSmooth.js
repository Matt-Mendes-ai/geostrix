// TASKS.csv #3950 (Matt, after #3946: an optional smoothing pass for GEM-15's own steps) — GEM-15 has straight-edged steps on flat, low-texture ground (snow, ice; cut blocks and
// buildings in its surface band): two locally flat sides, a jump of metres to tens of metres across one 15 m source pixel, running straight along the grid for tens of metres. This
// finds those steps and feathers them over a wider span: the height difference stays (which plateau is right cannot be known), the cliff becomes a gentle ramp, and every other detail
// in the window is kept. Real relief is left alone: a step counts only where both sides are locally flat with the same tilt (not a slope, a ridge or a cliff on a hillside) and where it
// runs straight for at least `minRun` lines. Pure: a row-major Float32Array, NaN = no value (a window that touches one is skipped). Off by default; the caller says what changed.

const SPAN = 7; // a 15 m step sampled bilinearly on ~3 m nodes ramps over about 7 nodes: from p - 2 to p + 5

// one axis: s = the stride along the profile (1: along x, w: along y), t = the stride across (the run's direction)
function axisPass(z, w, h, s, t, nL, nP, o) {
  const { flat, minJump, minRun } = o;
  const at = (L, p) => (s === 1 ? L * w + p : p * w + L); // node of line L (row or column), position p along it
  const J = new Float32Array(nL * nP); // the jump at (L, p) (NaN: not a candidate)
  J.fill(NaN);
  for (let L = 0; L < nL; L++) for (let p = 8; p < nP - 11; p++) {
    const i = at(L, p), zl0 = z[i - 8 * s], zl1 = z[i - 2 * s], zr0 = z[i + 5 * s], zr1 = z[i + 11 * s];
    const sl = (zl1 - zl0) / 6, sr = (zr1 - zr0) / 6;
    if (!(Math.abs(sl) <= flat && Math.abs(sr) <= flat && Math.abs(sl - sr) <= flat / 2)) continue; // NaN fails too
    const j = zr0 - zl1 - ((sl + sr) / 2) * SPAN;
    if (Math.abs(j) >= minJump) J[L * nP + p] = j;
  }
  // the local peak along the profile (a step ramps over a few positions: keep its strongest)
  const keep = new Uint8Array(nL * nP);
  for (let L = 0; L < nL; L++) for (let p = 0; p < nP; p++) {
    const v = J[L * nP + p]; if (!Number.isFinite(v)) continue;
    let peak = true;
    for (let q = Math.max(0, p - 3); q <= Math.min(nP - 1, p + 3) && peak; q++) { const u = J[L * nP + q]; if (q !== p && Number.isFinite(u) && Math.sign(u) === Math.sign(v) && (Math.abs(u) > Math.abs(v) || (Math.abs(u) === Math.abs(v) && q < p))) peak = false; }
    keep[L * nP + p] = peak ? 1 : 0;
  }
  // runs across the lines: a peak continues one in the previous line within a position, with the same sign
  const run = new Int32Array(nL * nP).fill(-1), start = [], len = [];
  for (let L = 0; L < nL; L++) for (let p = 0; p < nP; p++) {
    const k = L * nP + p; if (!keep[k]) continue;
    let r = -1;
    if (L > 0) for (const q of [p, p - 1, p + 1]) { const kk = (L - 1) * nP + q; if (q >= 0 && q < nP && keep[kk] && run[kk] >= 0 && Math.sign(J[kk]) === Math.sign(J[k])) { r = run[kk]; break; } }
    if (r < 0) { r = start.length; start.push(L); len.push(0); }
    run[k] = r; len[r]++;
  }
  // feather the long runs: within [a - F, b + F] the step's narrow ramp (a..b) is swapped for a wide one; nothing changes outside it; a run's ends taper over 3 lines
  const corr = new Float32Array(z.length);
  let steps = 0, strength = 0;
  const counted = new Uint8Array(start.length);
  for (let L = 0; L < nL; L++) for (let p = 0; p < nP; p++) {
    const k = L * nP + p, r = run[k]; if (r < 0 || len[r] < minRun) continue;
    if (!counted[r]) { counted[r] = 1; steps++; }
    const pos = L - start[r], taper = Math.min(1, (pos + 1) / 3, (len[r] - pos) / 3), j = J[k] * taper;
    strength += Math.abs(J[k]);
    const a = p - 2, b = p + 5;
    // the widest feather (4..12 nodes each side, aiming at ~15°) whose two side segments are still flat and have values: it never reaches onto a real slope
    let F = Math.max(4, Math.min(12, Math.round(Math.abs(J[k]) / (o.rampPerNode * 2))));
    for (; F >= 4; F--) {
      const A0 = a - F, B0 = b + F; if (A0 < 0 || B0 >= nP) continue;
      let ok = true; for (let q = A0; q <= B0; q++) if (!Number.isFinite(z[at(L, q)])) { ok = false; break; }
      if (ok && Math.abs(z[at(L, a)] - z[at(L, A0)]) / F <= flat && Math.abs(z[at(L, B0)] - z[at(L, b)]) / F <= flat) break;
    }
    if (F < 4) continue;
    const A = a - F, B = b + F;
    for (let q = A; q <= B; q++) {
      const narrow = Math.min(1, Math.max(0, (q - a) / (b - a))), wide = (q - A) / (B - A);
      corr[at(L, q)] += j * (wide - narrow);
    }
  }
  for (let i = 0; i < z.length; i++) if (corr[i]) z[i] += corr[i];
  return { steps, strength };
}

// z: heights (Float32Array, NaN = none), w x h nodes, nodeM: the node spacing in metres. -> { out (a new array), changed, maxM, medianM, steps } (steps: straight step runs feathered)
// options: flatDeg (a side counts as flat up to this slope, default 5°), minJump (m, default 1), minRun (lines, default 8)
export function smoothSteps(z, w, h, { nodeM = 3, flatDeg = 5, minJump = 1, minRun = 8, axes = "xy" } = {}) { // axes: "x" or "y" alone, for measuring
  const out = Float32Array.from(z);
  const o = { flat: Math.tan((flatDeg * Math.PI) / 180) * nodeM, minJump, minRun, rampPerNode: Math.tan((15 * Math.PI) / 180) * nodeM }; // the wide ramp aims at ~15° or less
  const none = { steps: 0, strength: 0 };
  const ax = axes.includes("x") ? axisPass(out, w, h, 1, w, h, w, o) : none; // steps across x (lines are rows)
  const ay = axes.includes("y") ? axisPass(out, w, h, w, 1, w, h, o) : none; // then across y (lines are columns)
  const d = [];
  let maxM = 0;
  for (let i = 0; i < z.length; i++) { const c = Math.abs(out[i] - z[i]); if (c >= 0.01) { d.push(c); if (c > maxM) maxM = c; } }
  d.sort((a, b) => a - b);
  return { out, changed: d.length, maxM, medianM: d.length ? d[d.length >> 1] : 0, steps: ax.steps + ay.steps, strength: ax.strength + ay.strength };
}

// the steps the pass would feather, without changing anything (for measuring): -> { steps, strength (the sum of their jumps, m) }
export function stepStrength(z, w, h, opts = {}) {
  const copy = Float32Array.from(z), nodeM = opts.nodeM ?? 3, flatDeg = opts.flatDeg ?? 5;
  const o = { flat: Math.tan((flatDeg * Math.PI) / 180) * nodeM, minJump: opts.minJump ?? 1, minRun: opts.minRun ?? 8, rampPerNode: Math.tan((15 * Math.PI) / 180) * nodeM };
  const ax = axisPass(copy, w, h, 1, w, h, w, o), ay = axisPass(Float32Array.from(z), w, h, w, 1, w, h, o);
  return { steps: ax.steps + ay.steps, strength: ax.strength + ay.strength };
}
