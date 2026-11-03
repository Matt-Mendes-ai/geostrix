// TASKS.csv #1397 — log classes with zeros: zeros in the lowest class, geometric above the smallest positive value
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyBreaks } from "../src/lib/layers.js";

test("#1397: 915 zeros no longer turn 'log' into equal intervals", () => {
  const vals = [...Array(915).fill(0), 0.05, 0.1, 0.2, 1, 2, 10, 28, 100];
  const b = classifyBreaks(vals, 5, "log");
  assert.equal(b.length, 5);
  assert.equal(b[0], 0);
  assert.ok(Math.abs(b[1] - 0.05) < 1e-12, String(b));
  for (let i = 2; i < b.length; i++) assert.ok(Math.abs(b[i] / b[i - 1] - b[2] / b[1]) < 1e-9, "geometric above the zeros");
  assert.deepEqual(classifyBreaks([0.1, 1, 10, 100], 3, "log").map((v) => +v.toPrecision(3)), [0.1, 1, 10]);
  assert.deepEqual(classifyBreaks([-5, -1, 0], 2, "log"), classifyBreaks([-5, -1, 0], 2, "equal"), "nothing positive: equal intervals as before");
});
