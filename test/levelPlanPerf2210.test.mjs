// TASKS.csv #2210 (review #2174, WA gold) — the level plan: rows indexed by hole for the pierce-point lookups, and the whole-hole trace
// paths kept while their points are the same
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupByHole, pathCache } from "../src/lib/levelPlan.js";

test("groupByHole keeps each hole's rows in order", () => {
  const rows = [{ hole_id: "A", from: 0 }, { hole_id: "B", from: 0 }, { hole_id: "A", from: 5 }];
  const m = groupByHole(rows);
  assert.deepEqual(m.get("A").map((r) => r.from), [0, 5]);
  assert.equal(m.get("B").length, 1);
  assert.equal(groupByHole(null).size, 0);
});

test("pathCache reuses a path while the points are the same and redraws when they move", () => {
  let calls = 0;
  const toPath = (pts) => { calls++; return pts.map(([x, y]) => `${x},${y}`).join(" "); };
  const c = pathCache();
  const d1 = c("H1", [[0, 0], [10, 5]], toPath);
  const d2 = c("H1", [[0, 0], [10, 5]], toPath); // a new array with the same points (the next RL's payload)
  assert.equal(d1, d2); assert.equal(calls, 1);
  const d3 = c("H1", [[0, 0], [10, 6]], toPath); // a desurvey change moved the end point
  assert.equal(d3, "0,0 10,6"); assert.equal(calls, 2);
  c("H2", [[0, 0], [10, 6]], toPath); assert.equal(calls, 3);
});

test("the level plan uses both", () => {
  const v = readFileSync(new URL("../src/modules/viewer/levelPlanBuild.js", import.meta.url), "utf8"); // #3137 — the build moved here
  assert.match(v, /pc\.ivBy = groupByHole\(prims\.intervals\.filter\(\(iv\) => !\(iv\.to - iv\.from < 1e-6\)\)\); pc\.ptBy = groupByHole\(prims\.points\.filter\(\(pt\) => pt\.assay\)\);/); // #2982 — grouped once per plan cache
  assert.doesNotMatch(v, /pc\.logs = intervals\.filter\(/);
  const w = readFileSync(new URL("../src/components/LevelPlanWindow.jsx", import.meta.url), "utf8");
  assert.match(w, /ctxCache\(h\.hole_id, h\.context, path\)/); // #2982 — joined into one path
  assert.match(w, /const ctxCache = useMemo\(\(\) => pathCache\(\), \[frame\]\);/);
});
