// TASKS.csv #1556 / #1555 (review #1497, Lawyers) — weights of evidence with missing evidence (a cell with no value is
// neither B nor not-B and adds a weight of 0), the membership floor and log ramp that stop one evidence vetoing a cell,
// and the prediction-area crossing that is reported as a step when no threshold reaches it
import test from "node:test";
import assert from "node:assert/strict";
import { membership, fuzzyCombine, bestCutoff, posterior, predictionArea } from "../src/lib/evidence.js";

// a 100 x 100 grid: a deposit belt in the east (x >= 70); the "drill grade" evidence has a value only in a 20-cell-wide
// strip of drilled ground (x 60..79) and NaN everywhere else, as a drill layer does beyond its reach
function world() {
  const nx = 100, ny = 100, n = nx * ny;
  let s = 11; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const survey = new Float32Array(n), drill = new Float32Array(n), valid = new Uint8Array(n).fill(1), D = new Set();
  for (let k = 0; k < n; k++) {
    const x = k % nx;
    survey[k] = x + 30 * rnd(); // everywhere: rises eastwards, noisy
    drill[k] = x >= 60 && x < 80 ? (x >= 70 ? 2 : 0.5) + rnd() : NaN; // drilled strip only, high over the belt
  }
  for (let i = 0; i < 60; i++) { const x = 70 + Math.floor(30 * rnd()), y = Math.floor(ny * rnd()); D.add(y * nx + x); } // deposits across the whole belt, drilled or not
  return { nx, ny, n, survey, drill, valid, D };
}

test("#1556 a cell with no value is not 'outside the pattern': the drill layer's weights come from the drilled cells and the undrilled east keeps the survey's posterior", () => {
  const w = world();
  const bs = bestCutoff(w.survey, w.D, w.valid), bd = bestCutoff(w.drill, w.D, w.valid);
  assert.equal(bs.nMissing, 0); assert.equal(bd.N, 2000, "the drill layer is weighed on its 2,000 drilled cells"); assert.equal(bd.nMissing, 8000);
  assert.ok(bd.best && bd.best.wPlus > 0 && bd.best.wMinus < 0, JSON.stringify(bd.best));
  const N = w.n, ND = w.D.size;
  const post = posterior([
    { values: w.survey, cutoff: bs.best.cutoff, direction: "increasing", wPlus: bs.best.wPlus, wMinus: bs.best.wMinus },
    { values: w.drill, cutoff: bd.best.cutoff, direction: "increasing", wPlus: bd.best.wPlus, wMinus: bd.best.wMinus },
  ], w.valid, N, ND);
  assert.equal(post.missingCells, 8000);
  const pSurveyOnly = posterior([{ values: w.survey, cutoff: bs.best.cutoff, direction: "increasing", wPlus: bs.best.wPlus, wMinus: bs.best.wMinus }], w.valid, N, ND);
  // an undrilled cell in the belt (x = 90): the drill layer adds 0, so it scores exactly what the survey alone gives
  const k90 = 50 * w.nx + 90, k20 = 50 * w.nx + 20;
  assert.ok(Math.abs(post.prob[k90] - pSurveyOnly.prob[k90]) < 1e-6, "missing drill evidence adds nothing");
  assert.ok(post.prob[k90] > post.prob[k20], "the undrilled east still outranks the west");
  // a drilled cell in the belt (x = 75) takes W+ on top of the survey
  const k75 = 50 * w.nx + 75;
  assert.ok(post.prob[k75] > post.prob[k90], "drilled and high: above the undrilled belt");
  // the old reading (NaN = not in the pattern = W-) would have pushed every undrilled cell below the drilled low ground
  const k65 = 50 * w.nx + 65; // drilled, low grade: takes W-
  assert.ok(post.prob[k90] > post.prob[k65], "an undrilled belt cell is not punished like a drilled barren one");
});

test("#1555 the membership floor keeps a vetoed cell ranked; the log ramp spreads a lognormal grade", () => {
  const A = Float32Array.from([0, 5, 10]), B = Float32Array.from([10, 10, 10]);
  const plain = fuzzyCombine([membership(A, { low: 0, high: 10 }), membership(B, { low: 0, high: 10 })], "gamma", 0.9);
  assert.equal(plain[0], 0, "a 0 membership zeroes the gamma score");
  const mA = membership(A, { low: 0, high: 10, floor: 0.01 }), mB = membership(B, { low: 0, high: 10, floor: 0.01 });
  assert.ok(Math.abs(mA[0] - 0.01) < 1e-6 && Math.abs(mA[2] - 0.99) < 1e-6 && Math.abs(mA[1] - 0.5) < 1e-6, [...mA].join());
  const floored = fuzzyCombine([mA, mB], "gamma", 0.9);
  assert.ok(floored[0] > 0 && floored[0] < floored[1] && floored[1] < floored[2], "ranked, not vetoed");
  const dec = membership(Float32Array.from([0, 1000]), { shape: "decreasing", low: 0, high: 1000, floor: 0.01 });
  assert.ok(Math.abs(dec[0] - 0.99) < 1e-6 && Math.abs(dec[1] - 0.01) < 1e-6);
  // log ramp 1 -> 100 ppm: 10 ppm sits halfway; a linear ramp would put it at 0.09; 0 ppm is below the low point
  const lg = membership(Float32Array.from([0, 1, 10, 100, 1000]), { low: 1, high: 100, log: true });
  assert.deepEqual([...lg].map((v) => +v.toFixed(3)), [0, 0, 0.5, 1, 1]);
  const lgDec = membership(Float32Array.from([0, 10]), { shape: "decreasing", low: 1, high: 100, log: true });
  assert.deepEqual([...lgDec].map((v) => +v.toFixed(3)), [1, 0.5], "a 0 on a decreasing log ramp is fully favourable");
});

test("#1555 the P-A crossing is a step, not an interpolated point, when 98% of the cells tie at 0", () => {
  const n = 10000, score = new Float32Array(n), valid = new Uint8Array(n).fill(1), D = new Set();
  for (let k = 0; k < n; k++) score[k] = k < 9800 ? 0 : (k - 9800) / 200; // 98 % at exactly 0, 2 % ramping up
  for (let k = 0; k < 50; k++) D.add(k * 150); // occurrences spread over the whole grid: 2 of 50 land in the top 2 %
  const pa = predictionArea(score, D, valid);
  assert.equal(pa.point, null, "no threshold gives '50% in 50% of the area'");
  assert.ok(pa.step && pa.step.below.area === 1 && pa.step.below.rate === 1, JSON.stringify(pa.step));
  assert.ok(pa.step.above.area <= 0.02 + 1e-9, "the next threshold up keeps 2 % of the area");
  // a continuous score crosses between two close thresholds and still gets its interpolated point
  const cont = new Float32Array(n); for (let k = 0; k < n; k++) cont[k] = k / n;
  const D2 = new Set(); for (let k = 0; k < 50; k++) D2.add(9000 + k * 20);
  const pa2 = predictionArea(cont, D2, valid);
  assert.ok(pa2.point && !pa2.step && Math.abs(pa2.point.rate + pa2.point.area - 1) < 0.02 && pa2.point.nd > 5, JSON.stringify(pa2.point));
});
