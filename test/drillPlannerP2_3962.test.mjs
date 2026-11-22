// TASKS.csv #3962 P2 — a suggested drill program (design.md 1.3-1.5): pads, candidates, cost from the drill rates, the four rules, greedy
// selection "as if drilled", the limits, the diminishing-returns line. Synthetic data only: a Gaussian field drilled by straight holes.
import test from "node:test";
import assert from "node:assert/strict";
import { normalStream, cholesky } from "../src/lib/drillPlanner/gaussian.js";
import { fitGradeModel, predictHole, holeSteps } from "../src/lib/drillPlanner/holePrediction.js";
import { padsFromCollars, candidateHoles, insideRuns, holeCost, ruleValue, selectProgram, PROGRAM_DEFAULTS } from "../src/lib/drillPlanner/program.js";
import { variogramModelValue } from "../src/lib/variogram.js";
import { plannedTrace } from "../src/lib/plannedTrace.js";

const VG = { model: "spherical", nugget: 0.1, sill: 1, range: 60 };
const cov = (h) => (h <= 1e-9 ? 1 : 1 - variogramModelValue(h, VG));
const hole = (x, y, az = 90, dip = -75, length = 90) => ({ x, y, z: 500, azimuth: az, dip, length });
const centresOf = (h, step) => { const tr = plannedTrace(h), s = tr[0], e = tr[tr.length - 1], L = e.md; return holeSteps(tr, step).map((a) => { const t = (a + step / 2) / L; return { x: s.x + (e.x - s.x) * t, y: s.y + (e.y - s.y) * t, z: s.z + (e.z - s.z) * t }; }); };
function field(seed) {
  const holes = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) holes.push({ id: `D${i}${j}`, ...hole(i * 50, j * 50) });
  const pts = [], owner = [];
  holes.forEach((h) => centresOf(h, 3).forEach((p) => { pts.push(p); owner.push(h.id); }));
  const n = pts.length, K = new Float64Array(n * n);
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const c = cov(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z)); K[i * n + j] = c; K[j * n + i] = c; }
  const { L } = cholesky(K, n, 1e-9), e = normalStream(seed), w = Float64Array.from({ length: n }, () => e());
  const composites = pts.map((p, i) => { let s = 0; for (let k = 0; k <= i; k++) s += L[i * n + k] * w[k]; return { ...p, value: Math.exp(0.2 + 0.9 * s), hole_id: owner[i] }; });
  const collars = holes.map((h) => ({ hole_id: h.id, x: h.x, y: h.y, z: h.z }));
  return { composites, collars };
}
const drilledOf = (composites) => ({ x: Float64Array.from(composites, (p) => p.x), y: Float64Array.from(composites, (p) => p.y), z: Float64Array.from(composites, (p) => p.z), ids: composites.map((p) => p.hole_id) });
const RULES = { cutoff: 1.5, minLength: 3, maxInternalDilution: 3 };

test("pads: drilled collars within 10 m are one pad, its centre their mean; others their own", () => {
  const pads = padsFromCollars([{ hole_id: "A", x: 0, y: 0, z: 100 }, { hole_id: "B", x: 6, y: 0, z: 102 }, { hole_id: "C", x: 40, y: 0, z: 100 }]);
  assert.equal(pads.length, 2);
  assert.deepEqual(pads[0].holes, ["A", "B"]);
  assert.ok(Math.abs(pads[0].x - 3) < 1e-9 && Math.abs(pads[0].z - 101) < 1e-9 && pads[0].isNew === false);
});

test("candidates: every pad x azimuth x dip; with a target, only holes that cross it for the minimum length, cut 30 m past it", () => {
  const pads = [{ id: "p1", x: 0, y: 0, z: 0 }, { id: "p2", x: 100, y: 0, z: 0 }];
  const all = candidateHoles(pads, { azimuths: [0, 90, 180, 270], dips: [-60, -80], maxLength: 200 });
  assert.equal(all.candidates.length, 16);
  assert.ok(all.candidates.every((c) => c.length === 200 && c.inside === null));
  // a target: a slab 50-80 m below the collars, east of x = 20
  const insideOf = (trace) => { const rows = []; const a = trace[0], e = trace[trace.length - 1], L = e.md; let prev = null;
    for (let md = 0; md <= L; md += 1) { const t = md / L, x = a.x + (e.x - a.x) * t, z = a.z + (e.z - a.z) * t, inside = x > 20 && z < -50 && z > -80;
      if (prev && prev.inside === inside) prev.to = md; else { prev = { from: md, to: md, inside }; rows.push(prev); } } return insideRuns(rows); };
  const t = candidateHoles(pads, { azimuths: [0, 90, 180, 270], dips: [-60, -80], maxLength: 200, insideOf, minLength: 5 });
  assert.ok(t.candidates.length > 0 && t.outside > 0 && t.candidates.length + t.outside === 16);
  for (const c of t.candidates) {
    assert.ok(c.inside.length && c.inside.reduce((s, [a, b]) => s + b - a, 0) >= 5);
    assert.equal(c.length, Math.min(200, Math.ceil(c.inside[c.inside.length - 1][1] + 30)));
  }
});

test("cost: metres x the type's rate (else the default), per hole, per NEW pad once; no rate: per metre", () => {
  const c = { length: 200 };
  const rates = { "": 100, RC: 80, __perHole: 1000, __perPad: 5000 };
  assert.deepEqual(holeCost(c, rates, { type: "RC" }), { cost: 200 * 80 + 1000, money: true });
  assert.deepEqual(holeCost(c, rates, { type: "DD" }), { cost: 200 * 100 + 1000, money: true });
  assert.equal(holeCost(c, rates, { padIsNew: true }).cost, 200 * 100 + 1000 + 5000);
  assert.equal(holeCost(c, rates, { padIsNew: true, padUsed: true }).cost, 200 * 100 + 1000);
  assert.deepEqual(holeCost(c, {}, {}), { cost: 200, money: false });
});

test("rules: 'learn' depends only on where a hole goes, never on the grades; balanced is P50 + kappa x spread", () => {
  const { composites } = field(5);
  const shuffled = composites.map((p, i) => ({ ...p, value: composites[(i * 7919) % composites.length].value }));
  const a = fitGradeModel(composites), b = fitGradeModel(shuffled);
  b.vg = a.vg; // the same variogram: only the values differ
  const tr = plannedTrace(hole(75, 75, 45, -60, 120));
  const pa = predictHole(a, tr, RULES), pb = predictHole(b, tr, RULES);
  assert.ok(Math.abs(ruleValue("learn", pa) - ruleValue("learn", pb)) < 1e-9);
  assert.ok(Math.abs(ruleValue("balanced", pa, 0.5) - (pa.gt[1] + 0.5 * (pa.gt[2] - pa.gt[0]))) < 1e-12);
  assert.equal(ruleValue("hit", pa), pa.pHit);
  assert.equal(ruleValue("metal", pa), pa.gtMean);
});

test("as if drilled: once a hole is chosen, a hole beside it is worth far less ('learn'), so the program spreads out", () => {
  const { composites } = field(6);
  const model = fitGradeModel(composites);
  // two pads 15 m apart between the drilled lines, the same direction: near twins
  const pads = [{ id: "a", x: 120, y: 70, z: 500 }, { id: "b", x: 135, y: 70, z: 500 }, { id: "c", x: 25, y: 120, z: 500 }]; // c: another gap between the drilled holes
  const { candidates } = candidateHoles(pads, { azimuths: [0], dips: [-70], maxLength: 120 });
  const alone = Object.fromEntries(candidates.map((c) => [c.pad, ruleValue("learn", predictHole(model, c.trace, RULES, { realizations: 60 }))]));
  const r = selectProgram(model, candidates, RULES, { rule: "learn", runs: 60, limits: { maxHoles: 2, perPad: 1 } });
  assert.equal(r.chosen.length, 2);
  const first = r.chosen[0].pad, second = r.chosen[1].pad;
  assert.notDeepEqual([first, second].sort(), ["a", "b"], `the near twin was not taken second (${first}, ${second}; alone: ${JSON.stringify(alone)})`);
});

test("the greedy program: limits (holes, holes per pad, metres, budget), costs that add up, twins skipped, the same answer every run", () => {
  const { composites, collars } = field(7);
  const model = fitGradeModel(composites);
  const pads = [...padsFromCollars(collars).slice(0, 8), { id: "new1", x: 75, y: 75, z: 500, isNew: true, holes: [] }];
  const { candidates } = candidateHoles(pads, { azimuths: [0, 60, 90, 120, 180, 240, 300], dips: [-55, -70, -75], maxLength: 150 }); // 90 / -75: down a drilled hole
  const rates = { "": 120, __perHole: 2000, __perPad: 10000 };
  const opts = { rule: "balanced", runs: 40, minSpacing: 12, rates, pads: Object.fromEntries(pads.map((p) => [p.id, p])), drilled: drilledOf(composites), limits: { maxHoles: 6, perPad: 2, maxMetres: 800, budget: 120000 } };
  const r = selectProgram(model, candidates, RULES, opts);
  assert.ok(r.chosen.length >= 2 && r.chosen.length <= 6, `${r.chosen.length} holes`);
  const byPad = new Map(); for (const h of r.chosen) byPad.set(h.pad, (byPad.get(h.pad) || 0) + 1);
  assert.ok([...byPad.values()].every((n) => n <= 2));
  assert.ok(r.chosen[r.chosen.length - 1].cumMetres <= 800 && r.chosen[r.chosen.length - 1].cumCost <= 120000);
  let sum = 0; r.chosen.forEach((h) => { sum += h.cost; assert.ok(Math.abs(h.cumCost - sum) < 1e-6); });
  const newPadHoles = r.chosen.filter((h) => h.pad === "new1");
  if (newPadHoles.length) assert.equal(newPadHoles[0].cost, newPadHoles[0].length * 120 + 2000 + 10000, "the new pad paid once, by its first hole");
  if (newPadHoles.length > 1) assert.equal(newPadHoles[1].cost, newPadHoles[1].length * 120 + 2000);
  assert.ok(r.counts.twins > 0, "a hole down a drilled one is a twin, skipped");
  for (const h of r.chosen) assert.ok(h.facts && (h.facts.nearestHole === null || /^D\d\d$/.test(h.facts.nearestHole)) && h.facts.pHit >= 0);
  // the diminishing-returns line: every hole above it scores at least a quarter of the first, the one under it less
  r.chosen.forEach((h, i) => assert.equal(i < r.line, h.score >= PROGRAM_DEFAULTS.lineShare * r.chosen[0].score, `hole ${i}`));
  assert.deepEqual(selectProgram(model, candidates, RULES, opts).chosen.map((h) => h.id), r.chosen.map((h) => h.id));
});

test("a budget laptop's time: about 400 candidates and a 10-hole program", () => {
  const { composites, collars } = field(8);
  const model = fitGradeModel(composites);
  const pads = padsFromCollars(collars);
  const { candidates } = candidateHoles(pads, { azimuths: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330], dips: [-50, -65], maxLength: 200 });
  const t0 = Date.now();
  const r = selectProgram(model, candidates.slice(0, 400), RULES, { rule: "balanced", minSpacing: 12, drilled: drilledOf(composites), limits: { maxHoles: 10, perPad: 2 } });
  const ms = Date.now() - t0;
  assert.ok(r.chosen.length === 10, `${r.chosen.length}`);
  assert.ok(ms < 30000, `${ms} ms for ${Math.min(400, candidates.length)} candidates`); // design.md 2.2: under 10 s on a budget laptop; CI has headroom
  console.log(`program: ${Math.min(400, candidates.length)} candidates, ${r.counts.scored} scored, ${r.counts.twins} twins, 10 holes in ${ms} ms`);
});

import { programCsvText } from "../src/lib/drillPlanner/programExport.js";
import { readFileSync } from "node:fs";
const { pageById } = await import("../src/help/content.js");

test("the CSV: one row per hole, the line, English reasons, and the provenance header (not a resource, per-hole grade x metres only)", () => {
  const { composites, collars } = field(9);
  const model = fitGradeModel(composites);
  const pads = padsFromCollars(collars).slice(0, 6);
  const { candidates } = candidateHoles(pads, { azimuths: [0, 90, 180, 270], dips: [-60], maxLength: 120 });
  const r = selectProgram(model, candidates, RULES, { rule: "balanced", runs: 30, minSpacing: 12, drilled: drilledOf(composites), rates: { "": 150 }, limits: { maxHoles: 4 } });
  const rows = r.chosen.map((h) => ({ h, pred: predictHole(model, candidates.find((c) => c.id === h.id).trace, RULES) }));
  const text = programCsvText({ rows, names: rows.map((_, i) => `D5${i}`), above: r.line, money: true, cur: "$", unit: "g/t", type: "RC", why: () => "Between holes, 30 m from D11: a 60 % chance of an intercept.", padName: (id) => `pad ${id}`,
    rule: "balanced", ruleName: "Balanced", kappa: 0.5, source: { element: "Au" }, model, rules: RULES, step: 2, target: null, version: "0.0.0", epsg: 28351 });
  const lines = text.split(/\r?\n/);
  assert.match(lines[0], /^# GeoStrix exploration output — not a Mineral Resource estimate/);
  assert.ok(lines.some((l) => /^# Rule: Balanced \(kappa 0\.5\), per \$/.test(l)));
  assert.ok(lines.some((l) => /^# Per-hole grade x metres only: no tonnes, no contained metal/.test(l)));
  const head = lines.find((l) => !l.startsWith("#"));
  for (const c of ["order", "suggested_name", "azimuth_grid", "cost_$", "cumulative_cost_$", "p_hit", "grade_x_m_p10_g/t", "grade_x_m_p90_g/t", "above_line", "why"]) assert.ok(head.split(",").includes(c), c);
  assert.equal(lines.filter((l) => l && !l.startsWith("#")).length, rows.length + 1);
});

test("the Drill program card and the section's wiring: cautions in view, the pane's own title, ViewerModule untouched, project data in English", () => {
  const p = pageById("drill-program");
  assert.equal(p.area, "Targeting"); assert.equal(p.title, "Drill program");
  const c = p.cautions.join(" | ").toLowerCase();
  assert.match(c, /not a resource estimate/); assert.match(c, /no tonnes/); assert.match(c, /a suggestion, not an optimum/);
  assert.ok(p.keys.every((k) => p.fields.some((f) => f.name === k)));
  const section = readFileSync(new URL("../src/components/DrillProgramSection.jsx", import.meta.url), "utf8");
  assert.match(section, /undoCheckpoint\?\.\(\);[\s\S]*addPlannedHole[\s\S]*undoCheckpoint\?\.\(trRaw\("Add the suggested drill program"\)\)/, "one Undo step");
  assert.match(section, /nextHoleId\(/, "the project's own hole series");
  assert.match(section, /notes: english\(/, "a hole's note is project data: English");
  assert.match(section, /runProgram\(\{ kind: "program"/); // the first pass split over workers (speed)
  assert.match(readFileSync(new URL("../src/components/ProbableGradePanel.jsx", import.meta.url), "utf8"), /<DrillProgramSection /);
  assert.doesNotMatch(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /DrillProgram|drillPlanner/);
});

import { scoreCandidates } from "../src/lib/drillPlanner/program.js";
test("speed: the first pass split over workers (scoreCandidates on shares) gives exactly the same program as one worker", () => {
  const { composites, collars } = field(10);
  const model = fitGradeModel(composites);
  const pads = padsFromCollars(collars);
  const { candidates } = candidateHoles(pads.slice(0, 10), { azimuths: [0, 90, 180, 270], dips: [-55, -75], maxLength: 150 });
  const opts = { rule: "balanced", minSpacing: 12, drilled: drilledOf(composites), rates: { "": 100 }, limits: { maxHoles: 6, perPad: 2 } };
  const one = selectProgram(model, candidates, RULES, opts);
  const shares = [[], [], []]; candidates.forEach((c, i) => shares[i % 3].push(c));
  const prescored = Object.assign({}, ...shares.map((s) => JSON.parse(JSON.stringify(scoreCandidates(model, s, RULES, opts))))); // as it crosses from a worker
  const split = selectProgram(model, candidates, RULES, { ...opts, prescored });
  assert.deepEqual(split.chosen.map((h) => [h.id, h.score]), one.chosen.map((h) => [h.id, h.score]));
  assert.deepEqual(split.counts, one.counts);
});

test("speed: the k-nearest search finds exactly the composites the full search finds, sorted and cut", async () => {
  const { composites } = field(11);
  const model = fitGradeModel(composites);
  const { holePosterior: hp } = await import("../src/lib/drillPlanner/holePrediction.js");
  hp(model, plannedTrace(hole(80, 60, 45, -60, 150)), { step: 3 }); // builds the index
  const idx = model._idx, e = normalStream(12);
  for (let t = 0; t < 300; t++) {
    const x = 250 * Math.abs(e()) - 25, y = 200 * Math.abs(e()) - 25, z = 500 - 90 * Math.abs(e()), R = 10 + 80 * Math.abs(e()), k = 1 + (t % 20);
    const full = idx.near(x, y, z, R).sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, k).map((p) => p[1]);
    const fast = idx.nearestK(x, y, z, R, k).map((p) => p[1]);
    assert.deepEqual(fast, full, `point ${t}`);
  }
});
