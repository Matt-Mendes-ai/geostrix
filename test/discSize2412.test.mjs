// TASKS.csv #2412 (review #2325) — outcrop discs sized from the readings' spacing, and a slider ceiling that grows with the set's extent
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultDiscSize, discSizeMax } from "../src/lib/outcropDiscSize.js";

const grid = (n, step) => Array.from({ length: n * n }, (_, k) => ({ x: (k % n) * step, y: Math.floor(k / n) * step }));

test("a quarter of the median spacing, rounded to 5 m: 250 m on the review's 1 km spacing, 25 m on a 100 m prospect", () => {
  assert.equal(defaultDiscSize(grid(5, 1000)), 250);
  assert.equal(defaultDiscSize(grid(5, 100)), 25);
  assert.equal(defaultDiscSize(grid(5, 8)), 5); // never below 5
  assert.equal(defaultDiscSize([{ x: 1, y: 1 }]), 25); // one place: the old default
  assert.equal(defaultDiscSize([]), 25);
});

test("the ceiling: 200 m, or a tenth of the extent, or the size itself", () => {
  assert.equal(discSizeMax(grid(5, 100)), 200);
  assert.equal(discSizeMax(grid(11, 1000)), 1000); // a 10 km block
  assert.equal(discSizeMax(grid(2, 10), 350), 350);
});

test("the import sets it and the slider uses the ceiling", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /\.\.\.\(p\.typed \? \{\} : \{ size: defaultDiscSize\(rows\) \}\)/);
  assert.match(p, /max=\{discSizeMax\(s\.rows, s\.size\)/);
});
