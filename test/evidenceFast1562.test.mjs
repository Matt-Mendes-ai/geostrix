// TASKS.csv #1562 — Evidence overlay's Compute froze the window 0.86-1.18 s on Lawyers: bestCutoff counted every cell for each of its 39
// cutoffs. It sorts once and counts by binary search now; these check the counts against the brute-force definition.
import test from "node:test";
import assert from "node:assert/strict";
import { bestCutoff, weights, predictionArea } from "../src/lib/evidence.js";

let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function bruteTable(values, D, valid, direction, steps = 40) {
  const idx = []; for (let k = 0; k < values.length; k++) if (valid[k] && Number.isFinite(values[k])) idx.push(k);
  const N = idx.length, ND = idx.filter((k) => D.has(k)).length, sorted = idx.map((k) => values[k]).sort((a, b) => a - b), table = [];
  for (let s = 1; s < steps; s++) {
    const q = s / steps, cutoff = sorted[Math.floor(q * (sorted.length - 1))];
    let nB = 0, nBD = 0;
    for (const k of idx) { const inB = direction === "increasing" ? values[k] >= cutoff : values[k] <= cutoff; if (inB) { nB++; if (D.has(k)) nBD++; } }
    const w = weights(nB, nBD, N, ND); if (w) table.push({ cutoff, quantile: q, ...w });
  }
  return table;
}

test("bestCutoff gives the brute-force table: ties, missing values, invalid cells, both directions", () => {
  for (const ties of [false, true]) {
    const n = 3000, values = new Float32Array(n), valid = new Uint8Array(n);
    for (let k = 0; k < n; k++) { values[k] = rnd() < 0.15 ? NaN : ties ? Math.round(rnd() * 8) : Math.exp(rnd() * 5); valid[k] = rnd() < 0.9 ? 1 : 0; }
    const D = new Set(); while (D.size < 60) D.add(Math.floor(rnd() * n));
    for (const direction of ["increasing", "decreasing"]) {
      const r = bestCutoff(values, D, valid, { direction });
      assert.deepEqual(r.table, bruteTable(values, D, valid, direction), `${direction}, ties ${ties}`);
      assert.equal(r.nMissing, [...values].filter((v, k) => valid[k] && !Number.isFinite(v)).length);
    }
  }
});

test("predictionArea: the same curve and crossing as counting over plain arrays", () => {
  const n = 2000, score = new Float32Array(n), valid = new Uint8Array(n).fill(1);
  for (let k = 0; k < n; k++) score[k] = rnd() < 0.05 ? NaN : rnd() ** 2;
  const D = new Set(); for (let k = 0; k < n; k++) if (score[k] > 0.7 && rnd() < 0.3) D.add(k);
  const pa = predictionArea(score, D, valid);
  const vals = [...score].filter(Number.isFinite).sort((a, b) => a - b), train = [...D].map((k) => score[k]).filter(Number.isFinite);
  const t100 = vals[Math.floor(0.5 * (vals.length - 1))];
  assert.equal(pa.nCells, vals.length); assert.equal(pa.nTrain, train.length);
  assert.equal(pa.curve[100].t, t100);
  assert.equal(pa.curve[100].area, vals.filter((v) => v >= t100).length / vals.length);
  assert.equal(pa.curve[100].rate, train.filter((v) => v >= t100).length / train.length);
});
