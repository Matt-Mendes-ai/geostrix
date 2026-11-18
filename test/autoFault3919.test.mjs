// TASKS.csv #3919 — the guided Faults tool's quick first model (src/lib/auto/autoFault.js): the engine's time said before the run, and the picks
// declustered (one per depth bin per hole) until the run fits about two minutes. Synthetic holes and picks.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { faultPlan, declusterPicks, QUICK_SHARE, minutesOf } from "../src/lib/auto/autoFault.js";
import { GEMPY_WORK_BUDGET, GEMPY_REF_SECONDS_PER_EVAL } from "../src/lib/gempyLimits.js";

// 7 x 4 vertical holes 28 m apart, `per` picks a hole every 7 m (about WA lode gold's FZ: 616 picks in 28 holes)
function project(per = 22) {
  const collars = [], picks = [];
  for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) {
    const hole_id = `F${i}-${j}`; collars.push({ hole_id, x: i * 28, y: j * 28, z: 300 });
    for (let k = 0; k < per; k++) picks.push({ hole_id, depth: 20 + k * 7, dip: 60, azimuth: 120, value: "FZ" });
  }
  return { collars, picks };
}

test("a big pick set: the full run's time, and a quick model that fits the budget with every hole kept", () => {
  const p = faultPlan(project());
  assert.equal(p.ok, true);
  assert.equal(p.all.n, 616);
  assert.ok(p.all.seconds > 5 * 60, String(p.all.seconds)); // the run Main timed at 6+ minutes
  assert.ok(p.quick && p.quick.n >= 28 && p.quick.n < 616);
  assert.ok(p.quick.seconds <= QUICK_SHARE * GEMPY_WORK_BUDGET * GEMPY_REF_SECONDS_PER_EVAL + 1e-9);
  assert.equal(new Set(p.quick.rows.map((r) => r.hole_id)).size, 28); // at least one pick in every hole
  assert.ok(minutesOf(p.quick.seconds) <= 2);
});

test("a small pick set needs no quick model; too few holes is a verdict", () => {
  assert.equal(faultPlan(project(2)).quick, null);
  const two = project(); two.picks = two.picks.filter((q) => q.hole_id === "F0-0" || q.hole_id === "F0-1");
  assert.equal(faultPlan(two).ok, false);
});

test("declustering keeps the middle pick of each depth bin, per hole", () => {
  const picks = [0, 1, 2, 3, 4, 10, 11].map((d) => ({ hole_id: "A", depth: d })).concat([{ hole_id: "B", depth: 50 }]);
  assert.deepEqual(declusterPicks(picks, 5).map((p) => `${p.hole_id}${p.depth}`), ["A2", "A11", "B50"]);
});

test("wired: the second question in the shell, the Faults modes and the structural run's rows hook", () => {
  const rd = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(rd("src/modules/viewer/guided/GuidedTool.jsx"), /tool\.modes && value \? tool\.modes\(ctx, value\)/);
  assert.match(rd("src/modules/viewer/guided/GuidedTool.jsx"), /tool\.run\(api, value, ctx, p\.auto\.values\)/);
  const tools = rd("src/modules/viewer/guided/guidedTools.js");
  assert.match(tools, /api\.runStructuralModel\(value, values\?\.rows \? \{ rows: values\.rows \} : undefined\)/);
  assert.match(rd("src/modules/viewer/modellingRuns.js"), /let rows = \(opts\.rows \|\| layers\.structure \|\| \[\]\)\.filter/);
});
