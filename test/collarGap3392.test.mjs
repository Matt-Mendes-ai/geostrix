// TASKS.csv #3392 (#3368) — with no terrain, samples drawn on the collar surface far from every collar are counted and the farthest named in the notice. SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarGapStats, FAR_FROM_COLLAR_M } from "../src/lib/viewer/surfacePlacement.js";
const collars = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
test("far samples are counted, the farthest named; flat and own-z samples are not on the collar surface", () => {
  const placed = [{ x: 10, y: 10, zCollars: true }, { x: 800, y: 0, zCollars: true }, { x: 0, y: 2000, zCollars: true }, { x: 5000, y: 5000, zFlat: true }, { x: 1, y: 1, z: 5 }];
  const g = collarGapStats(placed, collars);
  assert.equal(FAR_FROM_COLLAR_M, 500);
  assert.equal(g.far, 2); assert.equal(g.of, 3); assert.ok(Math.abs(g.maxM - 1900) < 1e-6);
  assert.equal(collarGapStats([{ x: 1, y: 1, z: 5 }], collars), null); assert.equal(collarGapStats(placed, []), null);
});
test("a big file is sampled (at most 2,000 distances) and the count scaled", () => {
  const placed = Array.from({ length: 10000 }, () => ({ x: 9000, y: 0, zCollars: true }));
  const g = collarGapStats(placed, collars);
  assert.equal(g.far, 10000); assert.equal(g.of, 10000);
});
test("wired: the hook adds collarGap, the notice names it", () => {
  const h = fs.readFileSync(new URL("../src/modules/viewer/useSurfacePlacement.js", import.meta.url), "utf8"), n = fs.readFileSync(new URL("../src/modules/viewer/SurfacePlacementNotices.jsx", import.meta.url), "utf8");
  assert.ok(h.includes("collarGap: collarGapStats(placedSurfaceSamples, collars)") && n.includes("counts.collars > 0 && counts.collarGap?.far > 0"));
});
