// TASKS.csv #1594 — readable labels when two values differ only past the 9th digit, and log-normal classes for a skewed positive model.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyBreaks, readableValues } from "../src/lib/layers.js";

test("the last stop and the max (the same number twice) no longer force 17 digits", () => {
  assert.deepEqual(readableValues([0.0000603, 0.0177, 0.08805871226408922, 0.08805871226408925]), [0.0000603, 0.0177, 0.0881, 0.0881]);
  assert.deepEqual(readableValues([1.0001, 1.0002]), [1.0001, 1.0002]); // still as many digits as needed to tell real values apart
});

let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const skewed = Array.from({ length: 20000 }, () => Math.exp(-6.5 + 1.2 * Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd())));

test("log-normal: five distinct classes on an MVI-like positive skewed model; 'normal' merges some there", () => {
  const ln = classifyBreaks(skewed, 5, "lognormal");
  assert.equal(ln.length, 5);
  assert.ok(ln.every((v, i) => i === 0 || v > ln[i - 1]));
  assert.ok(classifyBreaks(skewed, 5, "normal").length < 5);
});

test("log-normal with zeros falls back to the normal method; both editors offer it", () => {
  const withZero = [0, ...skewed];
  assert.deepEqual(classifyBreaks(withZero, 5, "lognormal"), classifyBreaks(withZero, 5, "normal"));
  for (const f of ["src/components/NumericSymbologyEditor.jsx", "src/modules/GeophysicsModule.jsx"]) assert.match(fs.readFileSync(f, "utf8"), /<option value="lognormal">/);
});
