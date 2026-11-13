// TASKS.csv #3083 (split from #2913) — Harry's Au read 44 % <DL in Thresholds and 41 % in Grade stats: Grade stats looked for the
// half-limit floor among its resolved segments, where 12 averages of a '<' row and an overlapping result sat below it. Both tools now
// find it on the file's results (qaqc fileCensoring); Grade stats shows its zeros beside <DL % as Thresholds does
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileCensoring, censoringFloor } from "../src/lib/qaqc.js";
import { harryAssays } from "../src/lib/sampleHarry.js";
import { resolvedSegments, valueIn } from "../src/lib/geochem.js";

test("the floor is found on the rows' results, '<' rows left out, the flagged zeros counted", () => {
  const rows = [
    ...Array.from({ length: 30 }, () => ({ values: { Au: 0.005 } })), // results at half a 0.01 limit
    ...Array.from({ length: 70 }, (_, i) => ({ values: { Au: 0.02 + i * 0.01 } })),
    ...Array.from({ length: 10 }, () => ({ values: { Au: 0.0025 }, qualifiers: { Au: "<" } })), // flagged: not a result
  ];
  const r = fileCensoring(rows, "Au", "ppm", { Au: "ppm" });
  assert.equal(r.floor.floor, 0.005); assert.equal(r.floor.n, 30); assert.equal(r.floor.dl, 0.01);
  assert.equal(r.step, null);
  // surface samples flag '<' through bdl
  const surf = rows.map((s) => (s.qualifiers ? { values: s.values, bdl: ["Au"] } : s));
  assert.equal(fileCensoring(surf, "Au", "ppm", { Au: "ppm" }).floor.floor, 0.005);
  // zeros below the minimum: the reporting step, no floor (#2913)
  const z = [...rows.slice(0, 100), ...Array.from({ length: 30 }, () => ({ values: { Au: 0 } }))];
  const rz = fileCensoring(z, "Au", "ppm", { Au: "ppm" });
  assert.equal(rz.floor, null); assert.equal(rz.step.step, 0.005);
});

test("Harry's Au: one floor for both tools; the counts differ only by the resolved segments", () => {
  const assays = harryAssays(readFileSync(new URL("../sample_data/harry_property/assay_wide.csv", import.meta.url), "utf8")).rows;
  const U = { Au: "ppm" };
  const { floor } = fileCensoring(assays, "Au", "ppm", U);
  assert.equal(floor.floor, 0.005);
  const on = (v) => Math.abs(v - floor.floor) <= floor.floor * 1e-9;
  // Thresholds: the rows ('<' flagged, or on the floor)
  const th = assays.filter((a) => a.qualifiers?.Au === "<" || on(valueIn(a, "Au", "ppm", U))).length;
  assert.equal(th, 2788); assert.equal((100 * th / assays.length).toFixed(1), "44.3");
  // Grade stats: the resolved segments, each metre once
  const segs = resolvedSegments(assays, "Au", "ppm", U);
  const gs = segs.filter((s) => s.lt || on(s.value)).length;
  assert.equal(segs.length, 6138); assert.equal(gs, 2709); assert.equal((100 * gs / segs.length).toFixed(1), "44.1");
  // the old search, on the segments, found no floor: what read 41 %
  assert.equal(censoringFloor(segs.filter((s) => !s.lt).map((s) => s.value)), null);
});

test("wiring", () => {
  const G = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(G, /fileCensoring\(statsAssays, symbol, elementUnits\[symbol\] \|\| "ppm", elementUnits\)\)\.floor/);
  assert.match(G, /zeroN: rs\.reduce\(\(k, r\) => k \+ \(r\.value === 0 \? 1 : 0\), 0\)/);
  assert.match(G, /tr\("\{pct\} \(\{n\} at 0\)"/);
  const T = readFileSync(new URL("../src/components/ThresholdToolkit.jsx", import.meta.url), "utf8");
  assert.match(T, /useMemo\(\(\) => fileCensoring\(data, symbol, unit, units\), \[data, symbol, unit, units\]\)/);
});
