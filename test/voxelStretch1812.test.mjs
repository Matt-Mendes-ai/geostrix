// TASKS.csv #1812 / #1781 (review #1646, Kodiak) — a block model with no stops is coloured on its 2-98 % stretch (air left out), its
// legend says where it clips, "minmax" keeps the old range, and Classify works on the cells shown
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { voxelStretch, sortedShownValues } from "../src/lib/voxelStretch.js";
import { colorForVoxelValue, makeVoxelColorResolverRGB, magColor } from "../src/lib/layers.js";
import { legendScale } from "../src/lib/legendScale.js";

// 1,000 rock cells 0..9.99 plus 5 outliers to 23.1 and 200 air cells at -1 (a DCIP3D chargeability saved before air masking)
function model() {
  const cells = [];
  for (let i = 0; i < 1000; i++) cells.push({ value: i / 100 });
  for (const v of [15, 18, 20.7, 22, 23.1]) cells.push({ value: v });
  for (let i = 0; i < 200; i++) cells.push({ value: -1 });
  return { id: "m", name: "chg", cells, min: -1, max: 23.1 };
}

test("#1812 the stretch is the 2nd-98th percentile of the rock cells: air at -1 and the five outliers do not set it", () => {
  const m = model();
  assert.equal(sortedShownValues(m).length, 1005, "air left out");
  const [lo, hi] = voxelStretch(m);
  assert.ok(lo > 0.15 && lo < 0.25 && hi > 9.7 && hi < 9.9, `${lo} ${hi}`);
  assert.equal(voxelStretch({ ...m, stretch: "minmax" }), null);
  assert.equal(voxelStretch({ ...m, stops: [{ value: 0, color: "#000000" }] }), null);
  assert.equal(voxelStretch({ cells: [{ value: 1 }] }), null, "too few values");
});

test("#1812 colours: 9.8 is already the top colour, 23.1 the same; with minmax the old ramp", () => {
  const m = model();
  assert.equal(colorForVoxelValue(m, 23.1), colorForVoxelValue(m, 9.85));
  assert.notEqual(colorForVoxelValue(m, 5), colorForVoxelValue(m, 1));
  const [lo, hi] = voxelStretch(m);
  assert.equal(colorForVoxelValue(m, 5), magColor(5, lo, hi));
  assert.equal(colorForVoxelValue({ ...m, stretch: "minmax" }, 5), magColor(5, -1, 23.1));
  assert.deepEqual(makeVoxelColorResolverRGB(m)(5).join(), magColor(5, lo, hi).replace(/[rgb() ]/g, ""));
});

test("#1812 the legend bar spans the stretch and its ends say they clip", () => {
  const m = model();
  const L = legendScale(m, -1, 23.1);
  assert.equal(L.kind, "ramp");
  assert.ok(L.minLabel.startsWith("≤ ") && L.maxLabel.startsWith("≥ "), `${L.minLabel} / ${L.maxLabel}`);
  assert.ok(L.stretched);
  const cut = legendScale(m, 5, 23.1); // a cutoff above the stretch's low end: that end is the cutoff, not clipped
  assert.equal(cut.minLabel, "5");
  const plain = legendScale({ ...m, stretch: "minmax" }, -1, 23.1);
  assert.deepEqual([plain.minLabel, plain.maxLabel, plain.stretched], ["-1", "23.1", false]);
});

test("#1781 Classify uses the shown cells (air and the Min / Max range left out), positive ones for log, a sample for Jenks", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(g.includes("const breaks = classifyBreaks(shownValues(), classCount, method);"));
  assert.ok(g.includes('let v = Array.from(s).filter((x) => x >= lo && x <= hi && (method !== "log" || x > 0));'));
  assert.ok(g.includes('if (method === "jenks" && v.length > 50000)'));
  assert.ok(g.includes('onUpdate(model.id, { min: v, stretch: "minmax" })'), "typing a range keeps it"); // #1790 — through StopValueInput
});
