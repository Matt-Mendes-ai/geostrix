// TASKS.csv #3182 (#3028 (8), review #2876 WA iron) — the drill plan's grid caption and first northing label touched the frame
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// the component file is JSX: read the helper's source and evaluate it (it uses no JSX)
const src = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
const body = src.slice(src.indexOf("export const GRID_INSET"), src.indexOf("// gridCaption (#2301)"));
const { GRID_INSET, gridLabelPlace } = new Function(`${body.replace(/export /g, "")}; return { GRID_INSET, gridLabelPlace };`)();

test("a northing label near the top edge sits below its line; others above it, inset from the left", () => {
  assert.deepEqual(gridLabelPlace({ px: 5, label: "7,400,000 N" }, "y", 9, 760, 480), { x: GRID_INSET, y: 15, anchor: "start" });
  assert.deepEqual(gridLabelPlace({ px: 200, label: "7,395,000 N" }, "y", 9, 760, 480), { x: GRID_INSET, y: 198, anchor: "start" });
});

test("an easting label that would run off the right edge ends at its line", () => {
  assert.equal(gridLabelPlace({ px: 100, label: "600,000 E" }, "x", 9, 760, 480).anchor, "start");
  const r = gridLabelPlace({ px: 740, label: "640,000 E" }, "x", 9, 760, 480);
  assert.equal(r.anchor, "end"); assert.equal(r.x, 738);
});

test("wiring: both label sets and the caption use it", () => {
  assert.equal((src.match(/gridLabelPlace\(t, "[xy]", gf, d\.w, d\.h\)/g) || []).length, 2);
  assert.match(src, /boxed\("cap", cap, d\.w - GRID_INSET, d\.h - GRID_INSET, "end"\)/);
});
