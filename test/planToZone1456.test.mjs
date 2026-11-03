// TASKS.csv #1456 — from an undrilled zone to a planned hole; the add form's target stays on the hole and is drilled past
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("an undrilled zone row hands its centre to the planned-hole form", () => {
  const uz = read("src/components/UndrilledZonesPane.jsx");
  assert.match(uz, /\{onPlanTo && <button onClick=\{\(\) => onPlanTo\(z\.target \|\| z\.centre\)\}/); // #1724 — the point farthest from the drilling
  assert.match(uz, /let lastResult = null;/);
  const vm = read("src/modules/ViewerModule.jsx");
  assert.match(vm, /onPlanTo=\{\(c\) => \{ setPlanTarget\(\{ x: c\.x, y: c\.y, z: c\.z \}\); setToolPane\("plan"\); \}\}/);
  assert.match(vm, /<PlannedHoleAddForm presetTarget=\{planTarget\}/);
});

test("the form keeps the target on the hole and solves past it", () => {
  const f = read("src/components/PlannedHoleParts.jsx");
  assert.match(f, /const PAST_TARGET_M = 30;/);
  assert.match(f, /length: Math\.round\(\(distance \+ PAST_TARGET_M\) \* 10\) \/ 10/);
  assert.match(f, /\.\.\.\(targetReady \? \{ target: \{ x: Number\(target\.x\), y: Number\(target\.y\), z: Number\(target\.z\) \}, pastTargetM: PAST_TARGET_M \} : \{\}\)/);
  // the hole's own Target panel reads hole.target and hole.pastTargetM
  const panel = read("src/components/PlannedHoleTargeting.jsx");
  assert.match(panel, /const target = hole\.target \|\| null;/);
  assert.match(panel, /hole\.pastTargetM/);
});
