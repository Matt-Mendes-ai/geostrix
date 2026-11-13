// TASKS.csv #2905 (WA iron review) — a stack of units thinner than the model's vertical cell is said to be unresolvable BEFORE the solve,
// with the Explicit route; the out-of-order line counts the Model area's holes only. (The 2.5D layer-cake solver is a NEEDS DECISION.)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { medianStackThickness, stackCellCheck } from "../src/lib/stackResolution.js";

// three flat strands 5 m apart under four holes
const pile = (gap) => ["HNAM", "TNAM", "ONAM"].map((u, k) => ({ meshName: u, points: ["A", "B", "C", "D"].map((h, i) => ({ hole_id: h, z: 430 - k * gap + i * 0.2 })) }));

test("the median drop from one top to the next in a hole", () => {
  assert.equal(medianStackThickness(pile(5)), 5);
  assert.equal(medianStackThickness(pile(20)), 20);
  assert.equal(medianStackThickness([pile(5)[0]]), null, "one unit: nothing to measure");
  // a hole missing the next unit gives no thickness; two contacts of a unit in one hole: its highest top
  const specs = [{ points: [{ hole_id: "A", z: 100 }, { hole_id: "A", z: 90 }, { hole_id: "B", z: 100 }, { hole_id: "C", z: 100 }] }, { points: [{ hole_id: "A", z: 94 }, { hole_id: "B", z: 92 }, { hole_id: "C", z: 93 }] }];
  assert.equal(medianStackThickness(specs), 7);
});

test("unresolved only when the units are thinner than the vertical cell", () => {
  assert.deepEqual(stackCellCheck(pile(5), 18), { thick: 5, dz: 18 });
  assert.equal(stackCellCheck(pile(20), 18), null);
  assert.equal(stackCellCheck(pile(5), 0), null);
  assert.equal(stackCellCheck(pile(5).slice(0, 1), 18), null);
});

test("wiring: the warning before the solve, and the order check on the Model area's holes", () => {
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /const thin = specs\.length > 1 && !cakeRun \? stackCellCheck\(specs, cm\[2\]\) : null;/);
  assert.match(r, /const holes = traces\.filter\(\(t\) => t\.pts\?\.length && \(modelArea !== "checked" \|\| visibleHoles\?\.\[t\.hole_id\] !== false\)\)/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(Object.keys(JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))).some((k) => k.startsWith("Warning: the units are about {t} m thick")), l);
});
