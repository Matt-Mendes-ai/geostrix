// TASKS.csv #702 — one ramp for grade models (IDW and geoML), log-spaced over two decades; the probability ramp in Lab
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradeStops, labStopsAt, sequentialStops } from "../src/lib/inversion.js";

test("grade ramp: viridis ends, linear under two decades, log-spaced over", () => {
  const lin = gradeStops(0, 5);
  assert.equal(lin.length, 17);
  assert.equal(lin[0].color, "#440154"); assert.equal(lin[16].color, "#fde725");
  assert.ok(Math.abs(lin[8].value - 2.5) < 1e-9);
  const log = gradeStops(0.01, 10);
  assert.ok(Math.abs(log[8].value - Math.sqrt(0.01 * 10)) < 1e-9);
});

test("grade ramp is not the geophysics ramp", () => {
  assert.notEqual(gradeStops(0, 1)[8].color, sequentialStops(0, 1)[8].color);
});

test("labStopsAt keeps its anchors at their values", () => {
  const p = labStopsAt([{ value: 0, color: "#f4f1de" }, { value: 0.5, color: "#f2b134" }, { value: 0.8, color: "#d9601a" }, { value: 1, color: "#8f1f3d" }]);
  assert.equal(p.length, 17);
  assert.equal(p[0].color, "#f4f1de"); assert.equal(p[8].color, "#f2b134"); assert.equal(p[16].color, "#8f1f3d");
});
