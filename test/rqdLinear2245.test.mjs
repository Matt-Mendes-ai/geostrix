// TASKS.csv #2245 — Downhole logs plotted RQD on a log scale by default (axis to '1.00e+3 %') although LOG_SOURCES says geotech is linear,
// and the 1,000 % reading that stretched it was not flagged
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { numericSourceChoices } from "../src/lib/numericSources.js";

test("RQD and recovery are sources with logScale false and unit %", () => {
  const rows = [26, 90, 100, 100, 1000].map((v, i) => ({ hole_id: "H", from: i, to: i + 1, value: v }));
  const c = numericSourceChoices({ layers: { geotech: rows, recovery: rows }, customLayers: [] });
  assert.deepEqual(c.map((s) => [s.label, s.unit, s.logScale]), [["RQD", "%", false], ["Recovery", "%", false]]);
});

test("the pane opens such a log linear and counts readings above 100 %", () => {
  const src = readFileSync(new URL("../src/components/DownholeLogsPane.jsx", import.meta.url), "utf8");
  assert.match(src, /logChoice === "auto" \? source\?\.logScale !== false && logScaleSuits\(logValues\) : logChoice === "on"/);
  assert.match(src, /source\?\.unit === "%" \? logValues\.filter\(\(v\) => Number\.isFinite\(v\) && v > 100\)\.length : 0/);
  assert.match(src, /tr\("\{n\} reading\(s\) are above 100 %, which a percentage cannot be: check them \(Data QC lists them\)\. They are drawn as logged\."/);
});
