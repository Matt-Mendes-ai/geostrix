// TASKS.csv #2511 — Best intercepts' own table shows the unsampled metres in the Length column, gives grade × length its unit, and prints
// the grade column with one number of decimals
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interceptSampledM, interceptGradeLength } from "../src/lib/geochem.js";

test("the review's CLDD002: 27.02 m with 23.79 m sampled; grade x length over the sampled metres", () => {
  const r = { length: 27.02, unsampledM: 3.23, avgGrade: 2.379 };
  assert.ok(Math.abs(interceptSampledM(r) - 23.79) < 1e-9);
  assert.ok(Math.abs(interceptGradeLength(r) - 2.379 * 23.79) < 1e-9); // 56.6, not 64.3 (#2475)
});

test("wired in the dialog", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /\{r\.unsampledM > 0\.05 \? tr\("\{len\} \(\{s\} sampled\)", \{ len: r\.length\.toFixed\(2\), s: interceptSampledM\(r\)\.toFixed\(2\) \}\) : r\.length\.toFixed\(2\)\}<\/td>/);
  assert.match(b, /tr\("Grade × length \(\{unit\} × m\)", \{ unit: dispUnit \}\) \/\* #2511/);
  assert.match(b, /\{gradeCol\(dg\(r\.avgGrade\)\)\}/);
  assert.match(b, /Math\.max\(0, Math\.min\(4, 3 - Math\.floor\(Math\.log10\(hi\)\)\)\)/);
});
