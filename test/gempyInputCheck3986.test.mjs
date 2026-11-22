// TASKS.csv #3986 — the input check before a GemPy solve: duplicates and near-duplicates removed per surface and fault, a later surface's points
// on an earlier one's removed, under two points left out, a surface with no orientation given the nearest measured one, and what still risks a
// singular matrix kept for a short failure line. Made-up points.
import test from "node:test";
import assert from "node:assert/strict";
import { checkStackInputs, dedupe, lineSpread, anyFix, isSingularError } from "../src/lib/gempyInputCheck.js";

const P = (x, y, z) => ({ x, y, z });
const O = (x, y, z, dip = 30, azimuth = 90) => ({ x, y, z, dip, azimuth });

test("#3986 near-duplicates within the tolerance are one point; the spread off a straight line", () => {
  assert.equal(dedupe([P(0, 0, 0), P(0.2, 0, 0), P(5, 0, 0), P(5, 0, 0)], 0.5).removed, 2);
  assert.ok(lineSpread([P(0, 0, 0), P(10, 10, 0), P(20, 20, 0), P(30, 30, 0)]) < 1e-6);
  assert.ok(lineSpread([P(0, 0, 0), P(10, 0, 0), P(0, 10, 0), P(10, 10, 5)]) > 1);
});

test("#3986 the fixes: duplicates, shared points, too few points, a borrowed orientation; each said", () => {
  const specs = [
    { label: "Unit A", points: [P(0, 0, 100), P(0.1, 0, 100), P(100, 0, 90), P(0, 100, 95)], orientations: [O(50, 50, 95), O(50, 50, 95)] },
    { label: "Unit B", points: [P(100, 0, 90) /* on Unit A's */, P(300, 0, 50), P(300, 200, 40)], orientations: [] },
    { label: "Unit C", points: [P(900, 900, 0)], orientations: [O(900, 900, 0)] },
    { label: "Fault 1", fault: true, points: [P(0, 50, 100), P(200, 50, 100)], orientations: [O(100, 50, 100, 60, 0)] },
  ];
  const r = checkStackInputs(specs);
  assert.deepEqual(r.fixes.dupes, [{ label: "Unit A", n: 1 }]);
  assert.equal(r.fixes.orientationDupes, 1);
  assert.deepEqual(r.fixes.shared, [{ label: "Unit B", other: "Unit A", n: 1 }]);
  assert.deepEqual(r.fixes.dropped, [{ label: "Unit C", n: 1 }]);
  assert.deepEqual(r.fixes.borrowed, [{ label: "Unit B" }]);
  const b = r.specs.find((s) => s.label === "Unit B");
  assert.equal(b.points.length, 2);
  assert.deepEqual([b.orientations[0].dip, b.orientations[0].azimuth, b.orientations[0].x], [30, 90, 300]); // Unit A's dip, on B's nearest point
  assert.deepEqual(r.specs.map((s) => s.label), ["Unit A", "Unit B", "Fault 1"]);
  assert.equal(specs[0].points.length, 4, "the input specs are not changed");
  assert.ok(anyFix(r.fixes));
});

test("#3986 what still risks a singular matrix: two surfaces within a few metres, points on one line with no orientation", () => {
  const r = checkStackInputs([
    { label: "Top", points: [P(0, 0, 10), P(100, 0, 10), P(0, 100, 10)], orientations: [O(0, 0, 10)] },
    { label: "Base", points: [P(0, 0, 7), P(100, 0, -50), P(0, 100, -40)], orientations: [O(0, 0, -40)] },
  ]);
  assert.deepEqual(r.risks.map((k) => [k.kind, k.label, k.other]), [["close", "Base", "Top"]]);
  const line = checkStackInputs([{ label: "Thin", points: [P(0, 0, 0), P(10, 10, 0), P(20, 20, 0)], orientations: [] }], { needOrientation: false });
  assert.deepEqual(line.risks.map((k) => k.kind), ["onALine"]);
  assert.ok(!anyFix(line.fixes));
  assert.ok(isSingularError("GemPy could not solve this model: Singular matrix"));
  assert.ok(!isSingularError("out of memory"));
});
