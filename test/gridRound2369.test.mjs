// TASKS.csv #2369 (review #2325, WA uranium) — the reference grid on round coordinates of the project, walls as deep as the drilling, the
// whole 'Show grid' row a toggle
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gridSnap, buildGridGroup } from "../src/lib/viewer/gridGroup.js";
import { gridWallHeight } from "../src/lib/viewer/gridDepth.js";

test("the grid's centre and plane snap to multiples of the cell (the review's mean collar 577,011 E / 6,681,766 N / RL 331)", () => {
  const o = { x: 577011.0, y: 6681765.9, z: 331.45 };
  const s = gridSnap(o, 1000);
  assert.ok(Math.abs(o.x + s.dx - 577000) < 1e-6); // 577,000 E
  assert.ok(Math.abs(o.y - s.dz - 6682000) < 1e-6); // 6,682,000 N (scene z is -north)
  assert.ok(Math.abs(o.z + s.y) < 1e-6); // RL 0 at 1 km cells
  const f = gridSnap(o, 50);
  assert.ok(Math.abs(o.z + f.y - 350) < 1e-6); // RL 350 at 50 m cells
  assert.deepEqual(gridSnap(null, 50, 12), { dx: 0, dz: 0, y: 12 });
  const g = buildGridGroup({ visible: true, mode: "ground", size: 12000, divisions: 12 }, { depth: 106, lift: 0, origin: o });
  assert.ok(Math.abs(g.position.x - s.dx) < 1e-6 && Math.abs(g.position.z - s.dz) < 1e-6);
});

test("walls stop a cell below the drilling, not a grid size down", () => {
  assert.equal(gridWallHeight(12000, 12, 106), 1000); // one 1 km cell, not 12 km
  assert.equal(gridWallHeight(1000, 20, 106), 150); // three 50 m cells
  assert.equal(gridWallHeight(1000, 20, 0), 50); // at least one cell
  const p = readFileSync(new URL("../src/modules/viewer/ViewerParts.jsx", import.meta.url), "utf8");
  assert.match(p, /onClick=\{\(\) => setGridConfig\(\(g\) => \(\{ \.\.\.g, visible: !g\.visible \}\)\)\} style=\{\{ flex: 1, cursor: "pointer"/);
});
