// TASKS.csv #1746 (review #1645, Copley) — 'log10(value + 1)' barely transforms Au in g/t: 99 % of Copley's Au is below 0.08 g/t, where
// log10(x + 1) is about 0.43 x. A 'log10(value), zeros at half the smallest value' transform is offered, and the + 1 one says when it
// is nearly linear.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyValueTransform, VALUE_TRANSFORMS } from "../src/lib/variogram.js";

const au = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.07, 0.08, 0.4, 2.5].map((value, i) => ({ x: i, y: 0, z: 0, value }));

test("log10(value + 1) on small values is nearly linear, and reports its 95th percentile", () => {
  const r = applyValueTransform(au, "log");
  const v = r.points.map((p) => p.value);
  assert.ok(Math.abs(v[3] / au[3].value - 0.4343) < 0.01, "0.43 x at 0.02 g/t");
  assert.ok(r.p95 < 2.5 && r.p95 >= 0.4, "p95 " + r.p95);
});

test("log10(value) with a floor spreads the small values and keeps zeros finite", () => {
  const r = applyValueTransform(au, "logfloor");
  assert.equal(r.floor, 0.0025, "half the smallest positive value");
  const v = r.points.map((p) => p.value);
  assert.ok(v.every(Number.isFinite));
  assert.equal(v[0], Math.log10(0.0025), "a zero goes to the floor");
  assert.ok(v[7] - v[1] > 1, "0.005 to 0.08 g/t is more than a log unit apart (with + 1 it was 0.03)");
  assert.deepEqual(applyValueTransform([{ value: 0 }, { value: 0 }], "logfloor"), { points: [], capValue: null, floor: null }, "no positive value: nothing to log");
});

test("the transform is listed and the panel names the case", () => {
  assert.equal(VALUE_TRANSFORMS.logfloor.label, "log10(value), zeros at half the smallest value");
  const m = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /result\.transform === "log" && result\.tP95 != null && result\.tP95 < 0\.2 && <div role="note"/);
  assert.match(m, /result\.transform === "logfloor" && result\.tFloor != null/);
  assert.match(m, /\(result\.transform === "log" \|\| result\.transform === "logfloor"\) && tr\(" In particular, do not quote this sill/);
});
