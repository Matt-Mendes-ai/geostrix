// TASKS.csv #1795 (review #1646, Kodiak) — the survey planner offers one area per soil grid, and says when a box is mostly empty ground
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sampleAreas, coverage } from "../src/lib/sampleAreas.js";

// seven 1 x 1 km grids, 100 m apart in each, spread over 19 x 31 km, each with its Target name
const names = ["Eclipse", "Lee Side", "North Star", "Agie", "WEST", "SOUTHWEST", "TomCat"];
const origins = [[675000, 5500000], [680000, 5505000], [690000, 5525000], [685000, 5515000], [674000, 5520000], [676000, 5497000], [691000, 5510000]];
const soils = origins.flatMap(([x0, y0], g) => Array.from({ length: 121 }, (_, i) => ({ medium: "soil", x: x0 + 100 * (i % 11), y: y0 + 100 * Math.floor(i / 11), attrs: { Target: names[g] } })));

test("#1795 one area per Target value, the grid's own box (padded 200 m)", () => {
  const r = sampleAreas(soils);
  assert.equal(r.by, "Target");
  assert.equal(r.areas.length, 7);
  const e = r.areas.find((a) => a.name === "Eclipse");
  assert.deepEqual([e.n, e.box], [121, [674800, 5499800, 676200, 5501200]]);
});

test("#1795 with no Target column, spatial clusters (1 km linking) give the same seven areas", () => {
  const plain = soils.map(({ attrs, ...s }) => s);
  const r = sampleAreas(plain);
  assert.equal(r.by, "cluster");
  assert.equal(r.areas.length, 7);
  assert.ok(r.areas.every((a) => a.n === 121));
  assert.equal(sampleAreas(soils.slice(0, 121).map(({ attrs, ...s }) => s)), null, "one grid: no per-grid areas");
});

test("#1795 coverage: a grid's own box is mostly near samples, the box around all seven is not", () => {
  const all = [Math.min(...soils.map((s) => s.x)) - 200, Math.min(...soils.map((s) => s.y)) - 200, Math.max(...soils.map((s) => s.x)) + 200, Math.max(...soils.map((s) => s.y)) + 200];
  const one = sampleAreas(soils).areas[0].box;
  assert.ok(coverage(one, soils) > 0.9, String(coverage(one, soils)));
  assert.ok(coverage(all, soils) < 0.05, String(coverage(all, soils)));
  const p = readFileSync(new URL("../src/components/SurveyPlannerPanel.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("const grids = sampleAreas(pts);") && p.includes("onChange={(e) => pickArea(e.target.value)}"));
});
