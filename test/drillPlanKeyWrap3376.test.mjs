// TASKS.csv #3376 — the drill plan's grade key no wider than the frame allows (its title and note wrapped), placed clear of the holes'
// traces as well as their collars, and saying when every corner still holds a hole
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { wrapKeyText, planPoints, emptiestCorner } from "../src/lib/drillPlan.js";

const NOTE = "cut-off 7000 ppm (the P90), at most 2 m internal dilution; classes: 50th / 75th / 90th percentile of the plan's holes";

test("the review's note wraps to the width given, at '; ' first", () => {
  const charPx = 9 * 0.5, maxPx = Math.min(480 * 0.45, 70 * 96 / 25.4) - 16; // a 480 px frame, 9 px text
  const lines = wrapKeyText(NOTE, maxPx, charPx);
  assert.ok(lines.length >= 3, lines.join(" | "));
  for (const l of lines) assert.ok(l.length * charPx <= maxPx || !l.includes(" "), `${l} (${l.length * charPx} > ${maxPx})`);
  assert.equal(lines.join(" "), NOTE, "nothing lost");
  assert.ok(lines.some((l) => l.endsWith("dilution;")), "a break at '; '");
  assert.deepEqual(wrapKeyText("", 100, 5), []);
  assert.deepEqual(wrapKeyText("Cu best intercept", 1000, 5), ["Cu best intercept"]);
});

test("the corner is chosen by traces too: a collar-free corner crossed by a trace is not empty", () => {
  // SYNTHETIC 400 x 300 frame: hole A collared bottom-left, its trace running up into the top-left corner; hole B bottom-right
  const holes = [{ id: "A", inside: true, ax: 30, ay: 280, bx: 30, by: 20 }, { id: "B", inside: true, ax: 380, ay: 280, bx: 360, by: 270 }];
  const byCollar = emptiestCorner(holes, 400, 300, 120, 60);
  assert.deepEqual([byCollar.x, byCollar.y], [6, 6], "by collars alone the top left looks empty");
  const pts = planPoints(holes);
  const byTrace = emptiestCorner(holes, 400, 300, 120, 60, pts);
  assert.equal(byTrace.under, 0);
  assert.deepEqual([byTrace.x, byTrace.y], [400 - 120 - 6, 6], "the top right is the one clear corner");
  // a surveyed path's points count too
  const curved = [{ id: "C", inside: true, ax: 200, ay: 150, bx: 210, by: 160, path: [[200, 150], [150, 100], [60, 30], [20, 20], [210, 160]] }];
  assert.ok(planPoints(curved).some((p) => p.x < 100 && p.y < 60));
  // every corner held: under > 0
  const full = [[20, 20], [380, 20], [20, 280], [380, 270]].map(([x, y], i) => ({ id: `H${i}`, inside: true, ax: x, ay: y }));
  assert.ok(emptiestCorner(full, 400, 300, 120, 60, planPoints(full)).under > 0);
});

test("wired: the key wraps to min(45 % of the frame, 70 mm), steps down once, and the sidebar says what it covers", () => {
  const d = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(d, /const maxKeyW = Math\.max\(150, Math\.min\(g\.w \* 0\.45, 70 \* MM_PX\)\);/);
  assert.match(d, /const pts = planPoints\(\[\.\.\.g\.holes, \.\.\.planned\]\);/);
  assert.match(d, /if \(keyBox\.under > 0 && fontPx > printPx\(5\)\)/);
  assert.match(d, /fontWeight=\{i >= keyBox\.bold \? 400 : 600\}/);
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /\{dd\.keyBox\?\.under > 0 && \(/);
});
