// TASKS.csv #2383 (review #2325, WA uranium) — a GemPy run's bar stops pretending a percentage after 10 s and shows the time elapsed
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rampProgress } from "../src/lib/taskSlot.js";

test("a ramp for 10 s, then indeterminate with the seconds elapsed", () => {
  const a = rampProgress({ label: "Stack", pct: 8, onCancel: 1 }, 3);
  assert.ok(a.pct > 8 && a.pct <= 90 && !a.indeterminate && a.onCancel === 1);
  const b = rampProgress({ label: "Stack", pct: 90, onCancel: 1 }, 74.4);
  assert.deepEqual({ ind: b.indeterminate, s: b.elapsedS, c: b.onCancel, l: b.label }, { ind: true, s: 74, c: 1, l: "Stack" });
});

test("the run uses it and records its solve time; the status bar shows the time", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /rampProgress\(cur, \(Date\.now\(\) - rampStarted\) \/ 1000\)/);
  assert.match(m, /solveSeconds: Math\.round\(baseSolveSeconds \* 10\) \/ 10/);
  const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(app, /taskProgress\.indeterminate && taskProgress\.elapsedS != null/);
});
