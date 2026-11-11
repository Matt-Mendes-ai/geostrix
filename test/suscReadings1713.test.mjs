// TASKS.csv #1713 — Copley's KT-10 log: 17 negative readings (down to -0.845) and 7 above 10 (max 310, ~570 x the median) went into the
// inversion constraint with nothing said. The hint now counts both; the values are not changed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suscUnitHint, EXTREME_X } from "../src/lib/drillholeConstraints.js";

test("negative and extreme readings are counted beside the unit hint", () => {
  const values = [];
  for (let i = 0; i < 200; i++) values.push(0.3 + (i % 10) * 0.05); // median ~0.53, x10^-3 SI territory
  values.push(-0.845, -0.2, -0.01, 310, 120, "", null);
  const h = suscUnitHint(values);
  assert.equal(h.likely, "e3");
  assert.deepEqual(h.negative, { n: 3, min: -0.845 });
  assert.equal(EXTREME_X, 100);
  assert.deepEqual(h.extreme, { n: 2, max: 310 });
  assert.equal(h.n, 202); // blanks are not readings (they were read as 0 before)
});

test("a clean log reports neither", () => {
  const h = suscUnitHint([0.001, 0.002, 0.003, 0.004]);
  assert.equal(h.negative, null);
  assert.equal(h.extreme, null);
  assert.equal(h.likely, "si");
});

test("the inversion pane shows both", () => {
  const src = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  assert.match(src, /suscHint\.negative && <div/);
  assert.match(src, /suscHint\.extreme && <div/);
});
