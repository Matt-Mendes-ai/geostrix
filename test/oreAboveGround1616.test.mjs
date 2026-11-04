// TASKS.csv #1616 — ore-grade blocks wholly above the ground are counted, so the pit can say what it left in the air
import test from "node:test";
import assert from "node:assert/strict";
import { runPitShell } from "../src/lib/pitShell.js";

test("blocks above the ground are counted as left out; blocks straddling it keep their part below", () => {
  const cells = [];
  // 10 m cubes; flat ground at 545 through the collars; the body (grade 5) at k = 2..5, so k = 5 (550-560) is wholly above the
  // ground (4 columns = 4 blocks of 10 x 10 x 10 x 2.5 t) and k = 4 (540-550) straddles it
  for (let k = 0; k < 6; k++) for (let j = 0; j < 11; j++) for (let i = 0; i < 11; i++) {
    const body = k >= 2 && i >= 5 && i <= 6 && j >= 5 && j <= 6;
    cells.push({ x: 1000 + i * 10 + 5, y: 2000 + j * 10 + 5, z: 500 + k * 10 + 5, dx: 10, dy: 10, dz: 10, value: body ? 5 : 0 });
  }
  const collars = [{ x: 1000, y: 2000, z: 545 }, { x: 1110, y: 2000, z: 545 }, { x: 1000, y: 2110, z: 545 }, { x: 1110, y: 2110, z: 545 }];
  const r = runPitShell({ cells, unit: "g/t", element: "Au", price: 80, priceUnit: "g", recovery: 100, miningCost: 2, processingCost: 5, density: 2.5, slopeDeg: 45, revenueFactor: 1, size: null }, { collars });
  assert.equal(r.groundSource, "collars");
  assert.equal(r.oreAboveGroundBlocks, 4, "the 550-560 layer of the 2 x 2 body");
  assert.ok(Math.abs(r.oreAboveGroundT - 4 * 1000 * 2.5) < 1e-6);
  // the layer that straddles the ground (540-550) is not counted as above: its part below is in the pit's ore
  assert.ok(r.oreT > 0);
});
