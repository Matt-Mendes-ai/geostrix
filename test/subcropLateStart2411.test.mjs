// TASKS.csv #2411 (WA uranium) / #2570 (WA lithium) — Subcrop from collars: a hole whose log starts below the collar is not under cover:
// left out and counted. And #2087 (Woodjam): an NCR precollar (no core recovered) is cover since #2046, so TF24-126 gives UTG at 150.6 m.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarSubcrop, LATE_START_M } from "../src/lib/collarSubcrop.js";

const collar = (id, x) => ({ hole_id: id, x, y: 0, z: 300, azimuth: 0, dip: -90, length: 100 });

test("#2087 — NCR 0-150.6 m then UTG: the point is UTG under 150.6 m of cover, not NCR at 0", () => {
  const out = collarSubcrop({ collars: [{ ...collar("TF24-126", 0), length: 300 }], survey: [], litho: [{ hole_id: "TF24-126", from: 0, to: 150.6, value: "NCR" }, { hole_id: "TF24-126", from: 150.6, to: 200, value: "UTG" }] });
  assert.deepEqual(out.map((p) => [p.hole_id, p.unit, p.cover]), [["TF24-126", "UTG", 150.6]]);
});

test("a log starting 35 m down (an unlogged precollar) or 17.5 m down (a bench hole logged only in pegmatite) is left out and reported", () => {
  const litho = [
    { hole_id: "OK1", from: 0, to: 5, value: "OVB" }, { hole_id: "OK1", from: 5, to: 30, value: "SAN" }, // cover then rock: a subcrop point
    { hole_id: "OK2", from: 0.4, to: 20, value: "CLY" }, // starts within a metre: from the collar
    { hole_id: "PC1", from: 35.3, to: 40, value: "LIG" }, // precollar
    { hole_id: "BH1", from: 17.5, to: 25, value: "P" }, // bench hole
  ];
  const report = { lateStart: [] };
  const out = collarSubcrop({ collars: ["OK1", "OK2", "PC1", "BH1"].map((h, i) => collar(h, i * 10)), survey: [], litho, report });
  assert.deepEqual(out.map((p) => [p.hole_id, p.unit, p.cover]), [["OK1", "SAN", 5], ["OK2", "CLY", 0.4]]);
  assert.deepEqual(report.lateStart, [{ hole_id: "PC1", logStart: 35.3, unit: "LIG" }, { hole_id: "BH1", logStart: 17.5, unit: "P" }]);
  assert.equal(LATE_START_M, 1);
  // with no report object nothing breaks
  assert.equal(collarSubcrop({ collars: [collar("PC1", 0)], survey: [], litho }).length, 0);
});

test("the notice says how many and how deep, and the left-out count excludes them", () => {
  const p = readFileSync(new URL("../src/components/SurfaceMappingPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /const rep = \{ lateStart: \[\] \};/);
  assert.match(p, /hole\(s\) whose log starts below the collar \(\{a\}–\{b\} m down/);
  assert.match(p, /const skipped = collars\.length - pts\.length - rep\.lateStart\.length;/);
});
