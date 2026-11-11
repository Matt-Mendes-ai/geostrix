// TASKS.csv #2402 — a point survey's card printed a total field as 'values 5.739e+4 to 5.757e+4 nT' and the stretch option rounded its limits
// to 3 figures ('57400 to 57500' for 57,407.15 to 57,529.76): the anomaly of a total field is in its last digits
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rangeText } from "../src/lib/layers.js";

test("at least the units of the larger end; small values keep their figures", () => {
  assert.equal(rangeText(57392.27, 57571.35), "57,392 to 57,571");
  assert.deepEqual(rangeText(57407.15, 57529.76, true), ["57,407", "57,530"]);
  assert.equal(rangeText(0.000123, 0.00456), "0.000123 to 0.00456");
  assert.equal(rangeText(14.9, 5444.6), "14.9 to 5,445");
  assert.equal(rangeText(57400.2, 57400.7), "57,400 to 57,401"); // the two ends still read apart
  assert.equal(rangeText(57400.21, 57400.24), "57,400.21 to 57,400.24"); // more figures when they would read alike
});

test("the card and the stretch option use it", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /v2: Number\.isFinite\(sv\.min\) \? rangeText\(sv\.min, sv\.max\)/);
  assert.match(src, /const lim = r \? rangeText\(r\[0\], r\[1\], true\) : null;/);
});
