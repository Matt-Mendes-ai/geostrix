// TASKS.csv #2047 (review #2013, Woodjam) — a unit body whose grid limit coarsens the cell past the thickest logged run of the code
// is said BEFORE the run (with Run anyway), not after 129 s of interpolation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bodyCellPastRuns, autoBodyParams } from "../src/lib/viewer/geomath.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("only a coarsened cell thicker than the thickest run, with runs known", () => {
  // Woodjam BX: 15 runs, median 0.5 m, 3.5 m at most -> auto 0.5 m cells, coarsened to 43.2 m by the grid limit
  const runs = [0.3, 0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.6, 0.8, 1, 1.2, 2, 3, 3.5];
  const autoB = autoBodyParams(runs, { cell: 10, radius: 50, spacing: 100 });
  assert.equal(autoB.maxRunM, 3.5);
  assert.deepEqual(bodyCellPastRuns(43.2, autoB, true), { cell: 43.2, maxRunM: 3.5 });
  assert.equal(bodyCellPastRuns(43.2, autoB, false), null, "a typed (not coarsened) cell is the user's choice");
  assert.equal(bodyCellPastRuns(3, autoB, true), null, "coarsened but still thinner than the thickest run");
  assert.equal(bodyCellPastRuns(43.2, { cell: 10, radius: 50, fromRuns: false }, true), null, "no runs known (a halo)");
  assert.equal(bodyCellPastRuns(43.2, null, true), null);
});

test("the run asks before the grid, stops with an info notice on Cancel, and keeps the error path for real failures", () => {
  const r = read("src/modules/viewer/modellingRuns.js");
  const ask = r.indexOf("const past = isCode ? bodyCellPastRuns(cell, autoB, coarsened) : null;");
  const grid = r.indexOf('const grid = await runEstimation("dense", gridPts');
  assert.ok(ask > 0 && grid > ask, "asked before the interpolation");
  assert.match(r, /if \(!window\.confirm\(`\$\{msg\}\n\n\$\{tr\("OK runs it anyway; Cancel stops here\."\)\}`\)\) \{ const stop = new Error\(msg\); stop\.stopped = true; throw stop; \}/);
  assert.match(r, /e\?\.stopped \? infoNotice\(tr\("Unit body not built: \{v\}", \{ v: e\.message \}\)\)/);
});
