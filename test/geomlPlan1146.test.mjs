// TASKS.csv #1146 — a geoML run sized before it is sent: small projects untouched, large ones focused on the unit, then coarsened.
import test from "node:test";
import assert from "node:assert/strict";
import { planDomain, planGrade, trainSeconds, roughTime, holeRuns, pointsAtSpacing, INDUCING_CAP, POINT_BUDGET, INDUCING_BUDGET, COMPOSITE_BUDGET } from "../src/lib/geomlPlan.js";

const FAST = { trainSpacing: 10, inducingSpacing: 80, iterations: 150 };

// n holes in a row, `step` m apart, each `len` m long; `withUnit` of them (from the start) log unit U
function project(n, { step = 100, len = 600, withUnit = 0, x0 = 0 } = {}) {
  const collars = [], intervals = [];
  for (let i = 0; i < n; i++) {
    const id = `H${x0}_${i}`;
    collars.push({ hole_id: id, x: x0 + i * step, y: 0 });
    intervals.push({ hole_id: id, from: 0, to: len, value: i < withUnit ? "U" : "ROCK" });
  }
  return { collars, intervals };
}
const merge = (...ps) => ({ collars: ps.flatMap((p) => p.collars), intervals: ps.flatMap((p) => p.intervals) });

test("#1146 the time model reproduces what was measured", () => {
  assert.ok(Math.abs(trainSeconds(1461, 407, 300) - 81) < 1); // Harry: 300 iterations 81 s
  assert.ok(trainSeconds(24218, 3027, 150) > 8 * 3600); // Treaty Creek Fast: about 10 hours
  assert.equal(roughTime(40), "about a minute"); // English without a dictionary
  assert.equal(roughTime(300), "about 5 min");
  assert.equal(roughTime(36000), "about 10 h");
});

test("#1146 a small project goes exactly as asked", () => {
  const p = project(20, { withUnit: 3 });
  const plan = planDomain({ ...p, targets: new Set(["U"]), ...FAST });
  assert.equal(plan.holeIds, null);
  assert.equal(plan.focused, false);
  assert.equal(plan.factor, 1);
  assert.deepEqual([plan.trainSpacing, plan.inducingSpacing], [10, 80]);
  assert.equal(plan.points, 1200);
});

test("#1146 a large project with a local unit: only the holes near it, spacing as asked", () => {
  const local = project(30, { step: 30, withUnit: 5 }); // 870 m long, the unit in the first 5
  const far = project(370, { step: 30, x0: 50000 });
  const plan = planDomain({ ...merge(local, far), targets: new Set(["U"]), ...FAST });
  assert.equal(plan.focused, true);
  assert.equal(plan.nHoles, 30);
  assert.equal(plan.totalHoles, 400);
  assert.equal(plan.factor, 1);
  assert.equal(plan.points, 1800);
  assert.equal(plan.wanted.points, 24000); // what it would have been: stated
  assert.ok(plan.wanted.seconds > 3600 && plan.seconds < 300, `${plan.wanted.seconds} -> ${plan.seconds}`);
  assert.ok(plan.holeIds.has("H0_0") && !plan.holeIds.has("H50000_0"));
});

test("#1146 a unit logged everywhere: nothing to focus on, so the spacing coarsens to the budget", () => {
  const p = project(398, { step: 50, withUnit: 398 });
  const plan = planDomain({ ...p, targets: new Set(["U"]), ...FAST });
  assert.equal(plan.focused, false);
  assert.ok(plan.factor > 1);
  assert.ok(plan.points <= POINT_BUDGET + 1 && plan.inducing <= INDUCING_BUDGET + 1, JSON.stringify(plan));
  assert.ok(plan.trainSpacing > 10 && plan.inducingSpacing > 80);
  assert.ok(plan.trainSpacing / plan.inducingSpacing - 10 / 80 < 0.01); // both coarsen together
});

test("#1146 focused and still too big: both; left-out codes do not count; a unit in no located hole is not focused", () => {
  const big = project(200, { step: 4, withUnit: 100, len: 800 });
  const far = project(198, { x0: 90000 });
  const plan = planDomain({ ...merge(big, far), targets: new Set(["U"]), ...FAST });
  assert.ok(plan.focused && plan.factor > 1 && plan.points <= POINT_BUDGET + 1);
  const cased = { collars: [{ hole_id: "A", x: 0, y: 0 }], intervals: [{ hole_id: "A", from: 0, to: 100000, value: "OB" }, { hole_id: "A", from: 0, to: 100, value: "U" }] };
  assert.equal(planDomain({ ...cased, targets: new Set(["U"]), exclude: new Set(["OB"]), ...FAST }).factor, 1);
  const noCollar = { collars: project(398).collars, intervals: [...project(398).intervals, { hole_id: "GONE", from: 0, to: 10, value: "U" }] };
  assert.equal(planDomain({ ...noCollar, targets: new Set(["U"]), ...FAST }).focused, false);
});

test("#1146 grade: composites lengthen only when over budget", () => {
  const few = planGrade({ samples: [{ from: 0, to: 20000 }], composite: 5, inducing: 200, iterations: 150 });
  assert.deepEqual([few.composite, few.composites, few.factor], [5, 4000, 1]);
  assert.ok(few.seconds > 60 && few.seconds < 200); // Woodjam: ~100 s of training
  const many = planGrade({ samples: [{ from: 0, to: 200000 }], composite: 5, inducing: 200, iterations: 150 });
  assert.equal(many.wanted.composites, 40000);
  assert.equal(many.composite, 25);
  assert.ok(many.composites <= COMPOSITE_BUDGET);
});

// TASKS.csv #1158 — every contact and short run adds a point at any spacing: what the plan used to miss
test("#1158 runs and contacts: adjacent other rock merges, thin runs still count, a run of unit in other rock is two contacts", () => {
  const iv = [
    { hole_id: "A", from: 0, to: 100, value: "R1" }, { hole_id: "A", from: 100, to: 200, value: "R2" }, { hole_id: "A", from: 200, to: 201, value: "U" }, { hole_id: "A", from: 201, to: 400, value: "R1" },
    { hole_id: "B", from: 0, to: 50, value: "R1" },
  ];
  const r = holeRuns(iv, new Set(["U"]));
  assert.equal(r.contacts, 2);
  assert.deepEqual(r.lengths.sort((a, b) => a - b), [1, 50, 199, 200]);
  assert.equal(pointsAtSpacing(r, 100), 2 + 1 + 1 + 2 + 2, "two contacts, a point for each short run");
  assert.equal(holeRuns([{ hole_id: "A", from: 9, to: 10, value: "U" }, { hole_id: "A", from: 0, to: 9, value: "R" }], new Set(["U"])).contacts, 1, "sorted by depth first");
});

test("#1158 a unit of many thin runs is seen for what it builds, and capped; a clean unit is not", () => {
  const collars = [], intervals = [];
  for (let i = 0; i < 300; i++) {
    collars.push({ hole_id: `H${i}`, x: i * 50, y: 0 });
    for (let d = 0; d < 800; d += 40) intervals.push({ hole_id: `H${i}`, from: d, to: d + 40, value: d % 80 ? "U" : "R" });
  }
  const p = planDomain({ collars, intervals, targets: new Set(["U"]), ...FAST });
  assert.ok(p.factor > 1, "the metres alone are over budget");
  assert.ok(p.contacts > 5000, String(p.contacts));
  assert.ok(p.inducingBuilt > 5000, "the spacing cannot bring this down: the old plan called it 500");
  assert.equal(p.capped, true);
  assert.equal(p.inducing, INDUCING_CAP);
  assert.ok(p.points > POINT_BUDGET, "the real count, not the budget");
  assert.ok(p.secondsNoCap > 20 * p.seconds);
  const clean = planDomain({ ...project(20, { withUnit: 3 }), targets: new Set(["U"]), ...FAST });
  assert.equal(clean.capped, false);
  assert.equal(clean.contacts, 0);
});
