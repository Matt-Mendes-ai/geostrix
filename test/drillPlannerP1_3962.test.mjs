// TASKS.csv #3962 P1 — probable grade along a planned hole (Review data\Drill planner\design.md, sections 1.1, 1.2 and 6).
// Synthetic data only: a Gaussian field with a known variogram, drilled by straight synthetic holes.
import test from "node:test";
import assert from "node:assert/strict";
import { fitNormalScore } from "../src/lib/drillPlanner/normalScore.js";
import { normInv, normalStream, cholesky, forwardSolve, backSolve } from "../src/lib/drillPlanner/gaussian.js";
import { seriesIntercepts } from "../src/lib/drillPlanner/seriesIntercepts.js";
import { fitGradeModel, holePosterior, predictHole, holeSteps } from "../src/lib/drillPlanner/holePrediction.js";
import { computeBestIntercepts } from "../src/lib/geochem.js";
import { variogramModelValue } from "../src/lib/variogram.js";
import { plannedTrace } from "../src/lib/plannedTrace.js";

const VG = { model: "spherical", nugget: 0.1, sill: 1, range: 60 };
const cov = (h) => (h <= 1e-9 ? 1 : 1 - variogramModelValue(h, VG));
const grade = (y) => Math.exp(0.2 + 0.9 * y); // a lognormal grade (g/t) from the Gaussian truth

// a straight hole's composite centres (vertical-ish, dip -70) every `step` metres
const hole = (x, y, az = 0, dip = -70, length = 100) => ({ x, y, z: 500, azimuth: az, dip, length });
const centres = (h, step) => { const tr = plannedTrace(h); return holeSteps(tr, step).map((a) => { const L = tr[tr.length - 1].md; const t = (a + step / 2) / L; return { x: tr[0].x + (tr[tr.length - 1].x - tr[0].x) * t, y: tr[0].y + (tr[tr.length - 1].y - tr[0].y) * t, z: tr[0].z + (tr[tr.length - 1].z - tr[0].z) * t }; }); };

// one joint unconditional simulation of the truth at every point (Cholesky of the full covariance)
function simulate(points, seed) {
  const n = points.length, K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const c = cov(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y, points[i].z - points[j].z)); K[i * n + j] = c; K[j * n + i] = c; }
  const { L } = cholesky(K, n, 1e-9), e = normalStream(seed), w = Float64Array.from({ length: n }, () => e()), out = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k <= i; k++) s += L[i * n + k] * w[k]; out[i] = s; }
  return out;
}

test("normal scores: ties share a score, the transform is monotone, the back-transform returns the composites and stops at the highest", () => {
  const ns = fitNormalScore([5, 1, 1, 3, 2, 8, 1, 4]);
  assert.equal(ns.forward(1), ns.forward(1));
  assert.ok(ns.forward(1) < ns.forward(2) && ns.forward(2) < ns.forward(8));
  for (const v of [1, 2, 3, 4, 5, 8]) assert.ok(Math.abs(ns.back(ns.forward(v)) - v) < 1e-9, `${v}`);
  assert.equal(ns.back(10), 8, "never above the highest composite");
  assert.equal(ns.back(-10), 1);
  assert.ok(Math.abs(normInv(0.975) - 1.959964) < 1e-5 && Math.abs(normInv(0.5)) < 1e-12);
});

test("a realization's intercepts follow Best intercepts' rules exactly (cut-off, internal dilution with the bridged average, minimum length, unsampled gaps)", () => {
  const draw = normalStream(7);
  for (let k = 0; k < 300; k++) {
    const n = 40, step = 2, tops = Float64Array.from({ length: n }, (_, i) => i * step);
    const vals = Float64Array.from({ length: n }, () => { const u = draw(); return u > 1.6 ? NaN : Math.max(0, Math.exp(u) - 0.5); });
    const rules = { cutoff: 0.5 + (k % 5) * 0.4, maxInternalDilution: [0, 2, 4, 6][k % 4], minLength: [0, 2, 6][k % 3] };
    const rows = []; for (let i = 0; i < n; i++) if (Number.isFinite(vals[i])) rows.push({ hole_id: "H", from: tops[i], to: tops[i] + step, values: { Au: vals[i] } });
    const ref = computeBestIntercepts(rows, "Au", "ppm", { Au: "ppm" }, rules);
    const mine = seriesIntercepts(tops, step, vals, rules);
    assert.equal(mine.count, ref.length, `count, case ${k}`);
    if (ref.length) {
      const b = ref[0];
      assert.ok(Math.abs(mine.best.from - b.from) < 1e-9 && Math.abs(mine.best.to - b.to) < 1e-9, `best ${k}: ${mine.best.from}-${mine.best.to} vs ${b.from}-${b.to}`);
      assert.ok(Math.abs(mine.best.grade - b.avgGrade) < 1e-9, `grade ${k}`);
    }
  }
});

// a small drilled field: 6 x 5 holes on a 40 m grid
function field(seed, extraHoles = []) {
  const holes = []; for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) holes.push(hole(i * 40, j * 40, 90, -75, 90));
  const step = 3, pts = [], owner = [];
  holes.forEach((h, k) => centres(h, step).forEach((p) => { pts.push(p); owner.push(k); }));
  const extra = []; extraHoles.forEach((h, k) => centres(h, step).forEach((p) => { extra.push(p); owner.push(holes.length + k); }));
  const truth = simulate([...pts, ...extra], seed);
  const composites = pts.map((p, i) => ({ ...p, value: grade(truth[i]), hole_id: `D${owner[i]}` }));
  return { composites, extraTruth: Array.from(truth.slice(pts.length)).map(grade), step };
}

test("the joint posterior is simple kriging: each point's mean and variance equal a direct solve on the same composites", () => {
  const { composites } = field(11);
  const model = fitGradeModel(composites, { model: "spherical" });
  assert.ok(!model.error, JSON.stringify(model.error));
  const tr = plannedTrace(hole(100, 60, 30, -60, 60));
  const post = holePosterior(model, tr, { step: 3, maxData: 1e9, perPoint: 1e9, searchRadius: model.vg.range });
  assert.ok(post.m > 0);
  // the direct solve at the first point in reach, on every composite within the range of any hole point (what the union holds when uncapped)
  const d = model.data, R = model.vg.range, c = model.centre;
  const P = holeSteps(tr, 3).map((a) => { const t = (a + 1.5) / tr[tr.length - 1].md; return [tr[0].x + (tr[tr.length - 1].x - tr[0].x) * t - c.x, tr[0].y + (tr[tr.length - 1].y - tr[0].y) * t - c.y, tr[0].z + (tr[tr.length - 1].z - tr[0].z) * t - c.z]; });
  const used = []; for (let q = 0; q < d.x.length; q++) if (P.some(([x, y, z]) => Math.hypot(d.x[q] - x, d.y[q] - y, d.z[q] - z) <= R)) used.push(q);
  const vg = model.vg, cv = (h) => (h <= 1e-9 ? 1 : 1 - variogramModelValue(h, vg));
  const n = used.length, K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i * n + j] = i === j ? 1 : cv(Math.hypot(d.x[used[i]] - d.x[used[j]], d.y[used[i]] - d.y[used[j]], d.z[used[i]] - d.z[used[j]]));
  const { L } = cholesky(K, n);
  const j0 = post.inReach.indexOf(1), [x, y, z] = P[j0];
  const k = Float64Array.from(used, (q) => cv(Math.hypot(d.x[q] - x, d.y[q] - y, d.z[q] - z)));
  const w = backSolve(L, n, forwardSolve(L, n, k));
  let mean = 0, red = 0; for (let i = 0; i < n; i++) { mean += w[i] * d.ns[used[i]]; red += w[i] * k[i]; }
  assert.ok(Math.abs(post.mean[0] - mean) < 1e-8, `${post.mean[0]} vs ${mean}`);
  assert.ok(Math.abs(post.variance[0] - (1 - red)) < 1e-8, `${post.variance[0]} vs ${1 - red}`);
});

test("realizations reproduce the posterior: their mean and spread along the hole match it", () => {
  const { composites } = field(12);
  const model = fitGradeModel(composites);
  const tr = plannedTrace(hole(60, 20, 90, -75, 90));
  const post = holePosterior(model, tr, { step: 3 });
  const e = normalStream(3), m = post.m, R = 4000, sum = new Float64Array(m), sq = new Float64Array(m);
  for (let r = 0; r < R; r++) {
    const z = Float64Array.from({ length: m }, () => e());
    for (let a = 0; a < m; a++) { let s = post.mean[a]; for (let b = 0; b <= a; b++) s += post.L[a * m + b] * z[b]; sum[a] += s; sq[a] += s * s; }
  }
  for (let a = 0; a < m; a++) {
    const mu = sum[a] / R, v = sq[a] / R - mu * mu;
    assert.ok(Math.abs(mu - post.mean[a]) < 0.06, `mean ${a}`);
    assert.ok(Math.abs(v - post.variance[a]) < 0.08 + 0.1 * post.variance[a], `variance ${a}: ${v} vs ${post.variance[a]}`);
  }
});

test("a hole far from the drilling gets no prediction, not the average; a hole through a composite honours it", () => {
  const { composites } = field(13);
  const model = fitGradeModel(composites);
  const far = predictHole(model, plannedTrace(hole(5000, 5000)), { cutoff: 1, maxInternalDilution: 3, minLength: 3 }, { step: 3 });
  assert.equal(far.beyond, true);
  // a planned hole along a drilled one: the band is tight around the drilled grades
  const twin = predictHole(model, plannedTrace(hole(80, 40, 90, -75, 90)), { cutoff: 1, maxInternalDilution: 3, minLength: 3 }, { step: 3 });
  const drilled = composites.filter((p) => p.hole_id === "D11").map((p) => p.value);
  assert.equal(twin.beyond, false);
  const spread = twin.band.p90.map((v, i) => v - twin.band.p10[i]);
  const med = spread.slice().sort((a, b) => a - b)[spread.length >> 1];
  const free = predictHole(model, plannedTrace(hole(100, 100, 0, -60, 90)), { cutoff: 1, maxInternalDilution: 3, minLength: 3 }, { step: 3 });
  const fs = free.band.p90.map((v, i) => v - free.band.p10[i]).sort((a, b) => a - b)[free.band.p90.length >> 1];
  assert.ok(drilled.length > 10 && med < fs, `twin ${med} narrower than between holes ${fs}`);
});

test("calibration: about 80 % of the true grades fall inside their P10-P90, and about 80 % of the holes' true best intercept inside its band", () => {
  // 24 planned holes between and around the drilling; their truth simulated jointly with the drilling, then hidden
  const planned = []; for (let k = 0; k < 24; k++) planned.push(hole(20 + (k % 6) * 40, 20 + Math.floor(k / 6) * 40, (k * 47) % 360, -55 - (k % 3) * 10, 75));
  let inside = 0, total = 0, gtIn = 0, gtN = 0;
  for (const seed of [21, 22, 23]) {
    const { composites, extraTruth, step } = field(seed, planned);
    const model = fitGradeModel(composites);
    let off = 0;
    for (const h of planned) {
      const tr = plannedTrace(h), n = holeSteps(tr, step).length, truth = extraTruth.slice(off, off + n); off += n;
      const rules = { cutoff: 1.5, maxInternalDilution: 3, minLength: 3 };
      const p = predictHole(model, tr, rules, { step, realizations: 300 });
      if (p.beyond) continue;
      const tops = holeSteps(tr, step);
      p.band.md.forEach((md, j) => { const i = tops.findIndex((a) => Math.abs(a + step / 2 - md) < 1e-6); total++; if (truth[i] >= p.band.p10[j] && truth[i] <= p.band.p90[j]) inside++; });
      const t = seriesIntercepts(Float64Array.from(tops), step, Float64Array.from(truth), rules);
      gtN++; const g = t.best ? t.best.gt : 0; if (g >= p.gt[0] - 1e-9 && g <= p.gt[2] + 1e-9) gtIn++;
    }
  }
  const share = inside / total, gtShare = gtIn / gtN;
  assert.ok(share > 0.7 && share < 0.9, `point coverage ${share.toFixed(3)} of ${total}`);
  assert.ok(gtShare > 0.65 && gtShare < 0.95, `best-intercept coverage ${gtShare.toFixed(3)} of ${gtN}`);
});

test("the same hole gives the same prediction (seeded); P(hit) and the bands are in order; a budget laptop's time", () => {
  const { composites } = field(31);
  const model = fitGradeModel(composites);
  const rules = { cutoff: 1.5, maxInternalDilution: 3, minLength: 3 };
  const tr = plannedTrace(hole(60, 60, 45, -60, 120));
  const a = predictHole(model, tr, rules), b = predictHole(model, tr, rules);
  assert.deepEqual(a, b);
  assert.ok(a.pHit >= 0 && a.pHit <= 1);
  for (const k of ["length", "gt", "totalM"]) assert.ok(a[k][0] <= a[k][1] && a[k][1] <= a[k][2], k);
  a.band.md.forEach((_, j) => assert.ok(a.band.p10[j] <= a.band.p50[j] && a.band.p50[j] <= a.band.p90[j]));
  // design.md 2.2: 50 holes x 200 realizations under 5 s on a budget laptop; here with 3 m composites, 150 m holes
  const t0 = Date.now();
  for (let k = 0; k < 50; k++) predictHole(model, plannedTrace(hole((k % 7) * 30, (k % 5) * 35, k * 29, -60, 150)), rules, { step: 2 });
  const ms = Date.now() - t0;
  assert.ok(ms < 15000, `${ms} ms for 50 holes`);
});

import { estimateSources, freshSource, predictionRecord, predictionState, holeGeometryKey, suggestedCutoff, modelStamp } from "../src/lib/drillPlanner/predictionInputs.js";
import { readFileSync } from "node:fs";

test("the settings come from Grade estimation's runs, newest first; an element with none gets Grade estimation's opening defaults", () => {
  const vm = [
    { id: "a", name: "Au OK 1", source: "estimate-ok", params: { element: "Au", unit: "ppm", compositeLengthM: 3, composited: true, minCoverage: 0.6, capValue: 30, searchRadiusM: 120, searchTrend: { name: "T", dip: 40, dipAzimuth: 90, pitch: 90, ratios: { max: 3, int: 2, min: 1 } }, variogram: { model: "exponential" } } },
    { id: "kv", name: "Au OK 1 — kriging variance", source: "kriging-variance", params: { element: "Au" } },
    { id: "b", name: "Cu IDW", source: "estimate-idw2", params: { element: "Cu", unit: "%", compositeLengthM: null } },
  ];
  const s = estimateSources(vm);
  assert.deepEqual(s.map((x) => x.id), ["b", "a"]);
  assert.equal(s[1].compositeLengthM, 3); assert.equal(s[1].capValue, 30); assert.equal(s[1].vgModel, "exponential"); assert.equal(s[1].searchTrend.name, "T");
  assert.equal(s[0].compositeLengthM, 2, "not composited: 2 m composites for the planner");
  assert.deepEqual([freshSource("Ag").compositeLengthM, freshSource("Ag").minCoverage, freshSource("Ag").capValue], [2, 0.5, null]);
  assert.equal(suggestedCutoff([0, 0.1, 0.2, 0.5, 1, 2, 3, 4, 50]), 3);
});

test("a prediction is frozen on the hole: moved holes are said, drilled holes keep theirs, and the record is compact", () => {
  const { composites } = field(41);
  const model = fitGradeModel(composites);
  const h = { id: "p1", ...hole(60, 60, 45, -60, 90) };
  const rules = { cutoff: 1.5, minLength: 3, maxInternalDilution: 3 };
  const pred = predictHole(model, plannedTrace(h), rules, { step: 3 });
  const src = freshSource("Au", "g/t");
  const rec = predictionRecord(pred, { source: src, model, rules, hole: h, stamp: modelStamp(src, model, composites.map((p) => p.value)), date: "2026-11-22T12:00:00.000Z" });
  assert.equal(rec.geometry, holeGeometryKey(h));
  assert.equal(predictionState({ ...h, prediction: rec }), "current");
  assert.equal(predictionState({ ...h, dip: -55, prediction: rec }), "moved");
  assert.equal(predictionState({ ...h, dip: -55, asDrilledHoleId: "D7", prediction: rec }), "kept");
  assert.equal(predictionState(h), "none");
  assert.ok(JSON.stringify(rec).length < 12000, `${JSON.stringify(rec).length} characters on the hole`);
  assert.equal(rec.band.md.length, pred.band.md.length);
  assert.equal(modelStamp(src, model, composites.map((p) => p.value)), rec.stamp, "the same data and settings give the same stamp");
});

test("the panel loads with the pane (not at start), runs in a worker, keeps its cautions in view, and ViewerModule is untouched", () => {
  const parts = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.match(parts, /lazyModal\(\(\) => import\("\.\/ProbableGradePanel\.jsx"\)\)/);
  assert.match(parts, /lazyModal\(\(\) => import\("\.\/ProbableGradePlot\.jsx"\)\)/);
  const panel = readFileSync(new URL("../src/components/ProbableGradePanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /runPlanner\(/);
  assert.doesNotMatch(panel, /from "\.\.\/lib\/drillPlanner\/holePrediction\.js"/, "the model's maths stay in the worker's chunk");
  assert.match(readFileSync(new URL("../src/lib/drillPlanner/drillPlannerClient.js", import.meta.url), "utf8"), /new Worker\(new URL\("\.\/drillPlanner\.worker\.js", import\.meta\.url\)/);
  for (const w of ["not a resource estimate", "variogram only", "not a measurement"]) assert.ok(panel.toLowerCase().includes(w), w);
  assert.doesNotMatch(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /ProbableGrade|drillPlanner/);
});
