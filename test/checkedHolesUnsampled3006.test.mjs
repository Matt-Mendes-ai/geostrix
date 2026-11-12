// TASKS.csv #3006 (WA iron review) — 'Samples from: the checked holes' made every unchecked hole 'never assayed' (the barren option then wrote
// 0 % over its assayed drilling); the never-assayed holes, the barren fill and the unsampled-drilling flag are taken over the holes the run uses
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { unassayedHoles, fillUnsampled } from "../src/lib/unsampledFill.js";
import { restrictRowsToHoles } from "../src/lib/modelArea.js";

const collars = ["A", "B", "C", "D"].map((h, i) => ({ hole_id: h, x: i * 50, y: 0, z: 400, azimuth: 0, dip: 90, max_depth: 40 }));
const assays = collars.flatMap((c) => [0, 10, 20, 30].map((f) => ({ hole_id: c.hole_id, from: f, to: f + 10, values: { Fe: 40 } })));
const checked = new Set(["A", "B"]), sub = assays.filter((a) => checked.has(a.hole_id)), u = { Fe: "%" };

test("2 checked + 2 unchecked assayed holes: the unchecked are not 'never assayed' once the collars are the run's", () => {
  assert.equal(unassayedHoles(sub, collars, "Fe", "%", u).length, 2, "the bug: all collars against the checked holes' assays");
  const runCollars = collars.filter((c) => checked.has(c.hole_id));
  assert.equal(unassayedHoles(sub, runCollars, "Fe", "%", u).length, 0);
  const f = fillUnsampled(sub, runCollars, "Fe", "%", u, 0, { alsoUnassayed: true });
  assert.equal(f.unassayedHoles || 0, 0); assert.equal(f.filledM, 0, "nothing barren-filled: the two run holes are fully assayed");
  assert.deepEqual(restrictRowsToHoles(collars, { C: false, D: false }).map((c) => c.hole_id), ["A", "B"], "the Grade shell's area: unchecked holes are { id: false }");
});

test("the Estimation dialog, the Grade shell panel and its run pass the run's holes", () => {
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /const runCollars = useMemo\(\(\) => \(samplesFrom === "checked" && checkedHoleIds\?\.size \? collars\.filter\(\(c\) => checkedHoleIds\.has\(c\.hole_id\)\) : collars\)/);
  assert.match(e, /useUnsampled\("estimate", \{ assays: srcAssays, collars: runCollars/);
  assert.match(e, /const traces = runCollars\.map\(/);
  assert.match(readFileSync(new URL("../src/components/UnsampledChoice.jsx", import.meta.url), "utf8"), /useUnsampled\("gradeShell", \{ assays: rows, collars: runCollars,/);
  assert.match(readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8"), /resolveUnsampled\("gradeShell", \{ assays: srcAssays, collars: inArea \? restrictRowsToHoles\(collars, visibleHoles\) : collars/);
});
