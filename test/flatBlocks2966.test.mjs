// TASKS.csv #2966 (review #2876, WA iron) — one >= 55 % Fe body read 1.86 Mm³ (cells), 1.65 Mm³ (the shell) and 1.55 Mm³ (Undrilled zones)
// with no word on why, and Undrilled zones re-blocked a body of 10 x 10 x 4 m cells as 7.5 m cubes. Now a shell of a block model's range is
// tested on its own cells by default, a block height can be typed, and the pane says which volume is which.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { undrilledZones, undrilledBlockCount, shellOwnCells, shellCellsVolume } from "../src/lib/undrilledZones.js";

function box(x0, x1, y0, y1, z0, z1) {
  const positions = new Float64Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]);
  return { positions, indices };
}

test("#2966 a block height of its own: flat blocks, the same body volume", () => {
  const solid = box(0, 200, 0, 200, 400, 420); // 200 x 200 x 20 m: 800,000 m³
  const cubes = undrilledZones({ solid, traces: [], coverM: 15, cellM: 10 });
  const flat = undrilledZones({ solid, traces: [], coverM: 15, cellM: 10, cellZM: 4 });
  assert.equal(cubes.cellZM, 10); assert.equal(flat.cellZM, 4);
  assert.equal(flat.block.resolution[2] > cubes.block.resolution[2], true, "more, thinner levels");
  assert.ok(Math.abs(flat.unitCells * flat.cellVolume - 800000) < 1, `flat blocks hold the body: ${flat.unitCells * flat.cellVolume}`);
  // the box snapped to whole blocks plus one each side: x, y 0..200 -> -10..210 at 10 m = 22 blocks; z 400..420 -> 396..424 at 4 m = 7 levels
  assert.equal(undrilledBlockCount(solid.positions, 10, 4), 22 * 22 * 7, "counted with the height");
  assert.ok(undrilledBlockCount(solid.positions, 10, 4) > undrilledBlockCount(solid.positions, 10));
});

test("#2966 a shell of a block model's range: its own cells, and the cells' volume beside the shell's", () => {
  const solid = box(0, 200, 0, 200, 400, 420);
  // as lib/voxelShell.js saves it: cellVolumeM3 is the sum over the cells in the range (4,649 cells of 400 m³), found live
  const shell = { ...solid, params: { model: "Fe IDW2", cellsInRange: 4649, cellVolumeM3: 4649 * 400, latticeSpacingM: [10, 10, 4], largestBodyOnly: false, keptShareOfRange: 1 } };
  assert.deepEqual(shellOwnCells(shell), { cellM: 10, cellZM: 4 });
  assert.equal(shellOwnCells({ ...solid, params: {} }), null, "not a range shell: cubes as before");
  const v = shellCellsVolume(shell);
  assert.equal(v.volumeM3, 4649 * 400, "the review's 1.86 Mm³ of cells");
  const kept = shellCellsVolume({ ...shell, params: { ...shell.params, largestBodyOnly: true, keptShareOfRange: 0.9 } });
  assert.ok(Math.abs(kept.volumeM3 - 4649 * 400 * 0.9) < 1e-6 && kept.cells === Math.round(4649 * 0.9), "the largest body only");
  const vs = fs.readFileSync(new URL("../src/lib/voxelShell.js", import.meta.url), "utf8");
  assert.match(vs, /cellsInside\+\+; cellVolumeM3 \+= c\.dx \* c\.dy \* c\.dz;/, "the shell saves the cells' total volume");
});

test("#2966 the pane: the height field, the shell's own cells by default, the three volumes said", () => {
  const p = fs.readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('aria-label={tr("Block height (m)")}'));
  assert.ok(p.includes("const own = useMemo(() => shellOwnCells(unit), [unit]);"));
  assert.ok(p.includes("cellZM: cellZ > 0 ? cellZ : 0 /* #2966 */"));
  assert.ok(p.includes("Three volumes of the same body:"));
  const s = fs.readFileSync(new URL("../src/lib/surfaceSolids.js", import.meta.url), "utf8");
  assert.ok(s.includes("nz = Math.max(1, Math.round((zmax - zmin) / cz))"));
});
