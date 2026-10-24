// TASKS.csv #851 — the evidence overlay: the grid, the three evidence kinds (raster sampling, distance transform,
// point IDW), fuzzy memberships and operators, weights of evidence against a textbook count table and a synthetic
// deposit set (best cutoff, posterior summing back to the known deposits), and the prediction-area point
import test from "node:test";
import assert from "node:assert/strict";
import { evidenceGrid, cellXY, rasterEvidence, distanceEvidence, pointEvidence, membership, fuzzyCombine, weights, bestCutoff, posterior, predictionArea, trainingCells, sampleValues, quantile } from "../src/lib/evidence.js";

test("#851 the grid: from a terrain (coarsened to the cell cap) or from an extent", () => {
  const g = evidenceGrid({ terrain: { bbox: [0, 0, 1000, 500], gridW: 101, gridH: 51 }, maxCells: 2000 });
  assert.deepEqual([g.nx, g.ny, g.coarsened, g.dx, g.dy, g.from], [51, 26, 2, 20, 20, "terrain"]);
  assert.deepEqual(cellXY(g, 0), [0, 500]);
  const e = evidenceGrid({ extent: [100, 100, 1100, 600], cellSize: 50 });
  assert.deepEqual([e.nx, e.ny, e.x0, e.yTop, e.dx], [20, 10, 125, 575, 50]);
  assert.equal(evidenceGrid({}), null);
});

test("#851 raster evidence samples a value grid bilinearly and is NaN outside it", () => {
  const g = { nx: 3, ny: 1, x0: 5, yTop: 5, dx: 10, dy: 10 };
  const raster = { nx: 2, ny: 1, x0: 0, yTop: 5, dx: 10, dy: 10, values: [10, 30] }; // centres at x = 0 and 10
  const v = rasterEvidence(g, raster);
  assert.equal(v[0], 20, "x = 5 is halfway: 20");
  assert.equal(v[1], 30, "x = 15 clamps to the last column's half-cell");
  assert.ok(Number.isNaN(v[2]), "x = 25 is outside");
});

test("#851 distance evidence equals the Euclidean distance to a point and to a line, also on non-square cells", () => {
  const g = { nx: 21, ny: 11, x0: 0, yTop: 100, dx: 10, dy: 10 };
  const d = distanceEvidence(g, [[[100, 50]]]);
  for (let k = 0; k < d.length; k++) { const [x, y] = cellXY(g, k); assert.ok(Math.abs(d[k] - Math.hypot(x - 100, y - 50)) < 1e-3, `cell ${k}`); } // float32 output
  const g2 = { nx: 21, ny: 11, x0: 0, yTop: 100, dx: 10, dy: 5 };
  const d2 = distanceEvidence(g2, [[[0, 100], [200, 100]]]); // the top row is the line
  for (let k = 0; k < d2.length; k++) { const [, y] = cellXY(g2, k); assert.ok(Math.abs(d2[k] - (100 - y)) < 1e-6); }
  assert.ok(Number.isNaN(distanceEvidence(g, [])[0]), "no features: no evidence");
});

test("#851 point evidence: exact at a point, inverse-distance between, NaN beyond the reach", () => {
  const g = { nx: 5, ny: 1, x0: 0, yTop: 0, dx: 100, dy: 100 };
  const v = pointEvidence(g, [{ x: 0, y: 0, value: 1 }, { x: 200, y: 0, value: 3 }], { maxDistance: 150 });
  assert.equal(v[0], 1); assert.equal(v[2], 3); assert.ok(Math.abs(v[1] - 2) < 1e-9, "halfway: the mean");
  assert.equal(v[3], 3, "100 m past the last point: that point alone");
  assert.ok(Number.isNaN(v[4]), "200 m from the nearest point, beyond the 150 m reach");
});

test("#851 memberships and the fuzzy operators", () => {
  const m = membership(Float32Array.from([0, 5, 10, 20, NaN]), { shape: "increasing", low: 0, high: 10 });
  assert.deepEqual(Array.from(m.slice(0, 4)), [0, 0.5, 1, 1]); assert.ok(Number.isNaN(m[4]));
  const d = membership(Float32Array.from([0, 500, 1000]), { shape: "decreasing", low: 0, high: 1000 });
  assert.deepEqual(Array.from(d), [1, 0.5, 0]);
  const A = Float32Array.from([0.2]), B = Float32Array.from([0.5]);
  const f = (op, gm) => fuzzyCombine([A, B], op, gm)[0];
  assert.ok(Math.abs(f("and") - 0.2) < 1e-6 && Math.abs(f("or") - 0.5) < 1e-6 && Math.abs(f("product") - 0.1) < 1e-6 && Math.abs(f("sum") - 0.6) < 1e-6);
  assert.ok(Math.abs(f("gamma", 0.9) - Math.pow(0.6, 0.9) * Math.pow(0.1, 0.1)) < 1e-6);
  assert.ok(Number.isNaN(fuzzyCombine([A, Float32Array.from([NaN])], "and")[0]));
});

test("#851 weights of evidence against a count table", () => {
  const w = weights(200, 15, 1000, 20);
  assert.ok(Math.abs(w.wPlus - Math.log((15 / 20) / (185 / 980))) < 1e-9);
  assert.ok(Math.abs(w.wMinus - Math.log((5 / 20) / (795 / 980))) < 1e-9);
  assert.ok(Math.abs(w.C - (w.wPlus - w.wMinus)) < 1e-12 && w.studC > 3);
  assert.equal(weights(200, 20, 1000, 20), null, "every deposit inside the pattern: an infinite weight is refused");
});

test("#851 synthetic deposits in the east: the best cutoff, a positive W+, the posterior summing to the deposits, the P-A point", () => {
  const g = { nx: 100, ny: 100, x0: 0, yTop: 990, dx: 10, dy: 10 }, n = 10000;
  let s = 5; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const ev = new Float32Array(n), valid = new Uint8Array(n).fill(1);
  for (let k = 0; k < n; k++) ev[k] = cellXY(g, k)[0] + 100 * rnd();
  const pts = Array.from({ length: 25 }, () => ({ x: 700 + 290 * rnd(), y: 10 + 970 * rnd() }));
  const D = trainingCells(g, pts, valid);
  assert.ok(D.size >= 20);
  const bc = bestCutoff(ev, D, valid, { direction: "increasing" });
  assert.ok(bc.best.quantile >= 0.6 && bc.best.wPlus > 0 && bc.best.wMinus < 0 && bc.best.studC > 3, JSON.stringify(bc.best));
  const post = posterior([{ values: ev, cutoff: bc.best.cutoff, direction: "increasing", wPlus: bc.best.wPlus, wMinus: bc.best.wMinus }], valid, bc.N, bc.ND);
  assert.ok(Math.abs(post.expected - bc.ND) < 1e-6, "one layer: the posterior sums back to the known deposits");
  assert.ok(Math.abs(post.ratio - 1) < 1e-6);
  assert.ok(post.prob[cellXY(g, 0)[0] === 0 ? 0 : 0] < post.prob[99], "west below east");
  const pa = predictionArea(post.prob, D, valid);
  assert.ok(pa.point && Math.abs(pa.point.rate + pa.point.area - 1) < 0.02 && pa.point.nd > 1.5, JSON.stringify(pa.point));
  assert.ok(pa.curve.every((c, i) => i === 0 || c.area <= pa.curve[i - 1].area + 1e-12), "area falls as the threshold rises");
});

test("#851 sample values: an element's robust z within its medium, a pathfinder index as the mean z", () => {
  const S = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 0, medium: i % 2 ? "soil" : "stream sediment", values: { Cu: 30 + (i % 7), Mo: 2 + (i % 3), Au: 5 } }));
  S[0].values.Cu = 3000;
  const units = { Cu: "ppm", Mo: "ppm", Au: "ppb" };
  const z = sampleValues(S, { kind: "element", symbol: "Cu" }, units);
  assert.ok(z[0].value > 3 && Math.abs(z[1].value) < 2);
  const ix = sampleValues(S, { kind: "index", preset: "porphyry" }, units);
  assert.ok(ix.every((p) => Number.isFinite(p.value)), "Au is constant (MAD 0, no z) but Cu and Mo give the mean");
  assert.ok(Math.abs(quantile([1, 2, 3, 4, 5], 0.5) - 3) < 1e-12);
});
