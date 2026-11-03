// TASKS.csv #1570 (review #1497, Lawyers) — an estimate restricted to a solid is gridded over the solid, not the district
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overlapBox, cellToFit } from "../src/lib/estimationMeta.js";

test("overlapBox: the shared part of two boxes, null when apart", () => {
  const district = { xmin: 0, xmax: 5300, ymin: 0, ymax: 6200, zmin: 900, zmax: 1800 };
  const shell = { xmin: 1000, xmax: 1400, ymin: 2000, ymax: 2300, zmin: 1500, zmax: 1900 };
  assert.deepEqual(overlapBox(shell, district), { xmin: 1000, xmax: 1400, ymin: 2000, ymax: 2300, zmin: 1500, zmax: 1800 });
  assert.equal(overlapBox(shell, { ...district, xmin: 9000, xmax: 9500 }), null);
});

test("at the 200,000-block budget the shell's box takes 10 m blocks where the district needed ~53 m", () => {
  const pad = (b, p) => ({ xmin: b.xmin - p, xmax: b.xmax + p, ymin: b.ymin - p, ymax: b.ymax + p, zmin: b.zmin - p, zmax: b.zmax + p });
  const shell = pad({ xmin: 1000, xmax: 1400, ymin: 2000, ymax: 2300, zmin: 1500, zmax: 1800 }, 25);
  const n = (b, c) => ["x", "y", "z"].reduce((t, k) => t * Math.max(1, Math.round((b[`${k}max`] - b[`${k}min`]) / c)), 1);
  assert.ok(n(shell, 10) <= 200000, `${n(shell, 10)} blocks at 10 m`);
  const district = pad({ xmin: 0, xmax: 5300, ymin: 0, ymax: 6200, zmin: 900, zmax: 1800 }, 25);
  assert.ok(cellToFit(district, 200000, 10) > 45);
});

test("the dialog grids over the restricting solid and says so", () => {
  const src = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("const gridBox = shellBox ? (drillBox ? overlapBox(shellBox, drillBox) || shellBox : shellBox) : drillBox;"));
  assert.ok(src.includes('gridFrom: shellBox ? `box of the restricting solid "${shellBox.name}" within the drilling`'));
});
