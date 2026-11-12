// TASKS.csv #2356 — a large element suite no longer fills Best intercepts with 'Also show' tick boxes: above 16 other elements only the
// ticked ones are listed, the rest in an 'Add an element' list. (Correlation's All / None already exist since #1678.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");

test("the compact form above ALSO_MAX other elements", () => {
  assert.match(b, /const ALSO_MAX = 16;/);
  assert.match(b, /\(symbols\.length - 1 > ALSO_MAX \? extraSymbols\.filter\(\(s\) => s !== symbol\) : symbols\.filter\(\(s\) => s !== symbol\)\)\.map/);
  assert.match(b, /<select aria-label=\{tr\("Add an element"\)\} value="" onChange=\{\(e\) => \{ if \(e\.target\.value\) toggleExtraSymbol\(e\.target\.value\); \}\}/);
});

test("Correlation keeps its All / None", () => {
  const c = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.match(c, /tr\("All"\)/);
  assert.match(c, /tr\("None"\)/);
});
