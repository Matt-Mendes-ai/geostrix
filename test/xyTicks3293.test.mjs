// TASKS.csv #3293 (reopened, Scottie Gold) — the X-Y plot's log ticks and its Y / X numbers in plain digits
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fmtTick } from "../src/lib/numberFormat.js";
import { axisFig } from "../src/lib/numberFormat.js";

test("the decades of a log axis read 10, 100, 1000, 10000: no '1e+3' beside '100'", () => {
  assert.deepEqual([0.01, 0.1, 1, 10, 100, 1000, 10000, 100000].map(fmtTick), ["0.01", "0.1", "1", "10", "100", "1000", "10000", "100000"]);
});
test("what was already right stays: zero, a wavelength axis, a very small or very large tick", () => {
  assert.equal(fmtTick(0), "0");
  assert.equal(fmtTick(2190), "2190"); assert.equal(fmtTick(2215.5), "2215.5");
  assert.equal(fmtTick(0.0001), "1e-4");
  assert.equal(fmtTick(1e7), "1e+7");
  assert.equal(fmtTick(16.666666666666668), "16.67");
});
test("a median Y / X of 1,570 is written 1570", () => {
  assert.equal(axisFig(1570.3), "1570"); assert.equal(axisFig(0.0123456), "0.0123");
  const g = fs.readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /m: Number\.isFinite\(xyStat\.medianRatio\) \? axisFig\(xyStat\.medianRatio\)/);
});
