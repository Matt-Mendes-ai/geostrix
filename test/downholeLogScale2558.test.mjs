// TASKS.csv #2558 — Downhole logs drew a signed density contrast on a log scale by default (102 of 564 negative readings dropped without a
// count), printed its medians as 0, and opened on the evaluated model compared with itself.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { logScaleSuits, allAboveZero, countAtOrBelowZero, sig3, logVsModel } from "../src/lib/downholeLogs.js";

test("a log scale only for values all above zero that span more than a decade", () => {
  assert.equal(logScaleSuits([0.5, 3, 40, 900]), true);
  assert.equal(logScaleSuits([-0.000178, 0.0001, 0.000457]), false, "a signed contrast");
  assert.equal(logScaleSuits([2.6, 2.7, 2.9]), false, "SG: positive but under a decade");
  assert.equal(logScaleSuits([0, 5, 50]), false);
  assert.equal(logScaleSuits([]), false);
  assert.equal(allAboveZero([1, NaN, 2]), true); assert.equal(allAboveZero([1, 0]), false);
  assert.equal(countAtOrBelowZero([-1, 0, 1, NaN]), 2);
});

test("small numbers keep three significant figures", () => {
  assert.equal(sig3(0.000112345), (0.000112).toLocaleString(undefined, { maximumSignificantDigits: 3 }));
  assert.notEqual(sig3(0.000112), "0");
  assert.equal(sig3(NaN), "—");
});

test("the model comparison reports how many pairs the log10 Pearson used, and the plain Pearson", () => {
  const rows = [], model = [];
  for (let i = 0; i < 20; i++) { const v = (i - 6) / 1e4; rows.push({ hole_id: "H", from: i, to: i + 1, values: { L: v } }); model.push({ hole_id: "H", from: i, to: i + 1, value: v * 2 }); }
  const vm = logVsModel(rows, "L", model);
  assert.equal(vm.n, 20);
  assert.equal(vm.nLog, 13, "the 13 pairs above zero");
  assert.ok(Math.abs(vm.rLin - 1) < 1e-9);
});

test("the pane: the log follows the data, counts what it hides, and leaves the evaluated model out of the Log list", () => {
  const p = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const logScale = logChoice === "auto" \? logScaleSuits\(logValues\) : logChoice === "on";/);
  assert.match(p, /tr\("\{k\} of \{n\} readings are zero or negative and are not shown on the log scale\."/);
  assert.match(p, /numericSourceChoices\(\{ layers, customLayers, models: false \}\)\.filter\(\(s\) => s\.layerId == null \|\| !modelIds\.has\(s\.layerId\)\)/);
  assert.match(p, /a: sig3\(vm\.medianLog\), b: sig3\(vm\.medianModel\)/);
});
