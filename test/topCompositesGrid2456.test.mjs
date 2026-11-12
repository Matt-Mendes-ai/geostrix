// TASKS.csv #2456 (review #2325, WA uranium) — after 'Fit to the checked holes' the estimate warned '269 of the 294 highest
// composites have no estimated block within a cell of them (… nearest block 348 m)': most of them lay outside the grid it was asked
// to fill. Only composites inside the grid (plus one cell) are checked now, and the ones outside are counted apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { topCompositesWithoutBlocks } from "../src/lib/shellSupport.js";

// a 100 x 100 x 50 m grid of 10 m blocks, all estimated; 20 composites inside, 20 higher ones 400 m east, outside the grid
const cells = [];
for (let x = 5; x < 100; x += 10) for (let y = 5; y < 100; y += 10) for (let z = 5; z < 50; z += 10) cells.push({ x, y, z });
const inside = Array.from({ length: 20 }, (_, i) => ({ x: 10 + i * 4, y: 50, z: 25, value: 10 + i, hole_id: "IN" }));
const outside = Array.from({ length: 20 }, (_, i) => ({ x: 500, y: 50, z: 25 + i, value: 900 + i, hole_id: "OUT" }));
const bounds = { xmin: 0, xmax: 100, ymin: 0, ymax: 100, zmin: 0, zmax: 50 };

test("composites outside the grid are not reported as unsupported", () => {
  const before = topCompositesWithoutBlocks([...inside, ...outside], cells, 10, { share: 0.25 });
  assert.ok(before.unsupported.length >= 10 && before.unsupported.every((u) => u.hole_id === "OUT"), "without bounds: the outside composites fail");
  const now = topCompositesWithoutBlocks([...inside, ...outside], cells, 10, { share: 0.25, bounds });
  assert.equal(now.unsupported.length, 0, "every checked composite has a block");
  assert.equal(now.checked, 5, "the top quarter of the 20 composites inside");
  assert.equal(now.outsideGrid, 10, "the top quarter of all 40 lies outside");
});

test("a composite just past the edge (within one cell) is still checked", () => {
  const edge = [{ x: 105, y: 50, z: 25, value: 50 }, ...inside];
  const r = topCompositesWithoutBlocks(edge, cells, 10, { share: 0.05, min: 3, bounds });
  assert.equal(r.outsideGrid, 0);
  assert.equal(r.checked, 3);
});

test("without bounds the result keeps its old shape", () => {
  assert.equal("outsideGrid" in topCompositesWithoutBlocks(inside, cells, 10), false);
});

test("the dialog passes the grid and says how many lie outside", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /topCompositesWithoutBlocks\(points, est\.cells, Math\.max\(cell3\.dx, cell3\.dy, cell3\.dz\), \{ bounds \}\)/);
  assert.match(m, /result\.topUnsupported\.outsideGrid > 0 && <div/);
  assert.match(m, /"\{n\} more of the highest composites lie outside this grid and were not checked\."/);
});
