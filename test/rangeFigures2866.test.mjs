// TASKS.csv #2866 (review GSC geophysics) — the colour bar's numbers rounded small values away: 0.000478 read '0', 0.000574 '0.001'
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rangeValueText } from "../src/lib/rasterColour.js";
test("4 significant figures", () => {
  const plain = (s) => s.replace(/[\u202f\u00a0,]/g, "");
  assert.equal(plain(rangeValueText(0.000478)), "0.000478");
  assert.equal(plain(rangeValueText(0.000574)), "0.000574");
  assert.equal(plain(rangeValueText(-0.00435)), "-0.00435");
  assert.equal(plain(rangeValueText(7.034)), "7.034");
  assert.equal(plain(rangeValueText(567.94)), "567.9");
  assert.equal(plain(rangeValueText(-224.76)), "-224.8");
  assert.equal(rangeValueText(0), "0"); assert.equal(rangeValueText(NaN), "—"); assert.equal(rangeValueText(null), "—");
  assert.ok(fs.readFileSync(new URL("../src/components/RasterColourControls.jsx", import.meta.url), "utf8").includes("const fmt = rangeValueText;"));
});
