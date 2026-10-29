// TASKS.csv #1069 / #1088 (review #1016) — composite / intercept CSV grades keep 6 significant figures (not 3 decimals);
// the 3D View's raster and boundary trash icons ask first. (Both live inside components: pinned from the source.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("#1069 no grade is written with toFixed(3) in the composite / intercept exports", () => {
  // #1083 — the rows moved into lib/drillReportExport.js; the dialogs only call it
  for (const f of ["components/CompositingModal.jsx", "components/BestIntercepts.jsx", "lib/drillReportExport.js"]) {
    const s = src(f);
    assert.ok(!/avgGrade\.toFixed\(|extras\[s\]\.toFixed\(|v\.toFixed\(3\)/.test(s), f);
  }
  assert.match(src("lib/drillReportExport.js"), /export const sig6 = \(v\) => \(Number\.isFinite\(v\) \? \+v\.toPrecision\(6\) : ""\)/);
  const sig6 = (v) => (Number.isFinite(v) ? +v.toPrecision(6) : "");
  assert.equal(sig6(0.000437), 0.000437); // a Mo % grade: was "0.000"
  assert.equal(sig6(12345.678), 12345.7);
});

test("#1088 the raster and boundary trash icons confirm", () => {
  const v = src("modules/ViewerModule.jsx");
  assert.ok(!/iconAction\(\(\) => removeRaster\(r\.id\)/.test(v));
  assert.ok(!/iconAction\(\(\) => removeBoundary\(b\.id\)/.test(v));
  assert.match(v, /iconAction\(\(\) => \{ if \(confirmDestructive\(tr\("Remove raster/);
});
