// TASKS.csv #2120 — a Pit area: only the blocks inside a closed design string are priced, so one prospect gets its own grid
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell } from "../src/lib/pitShell.js";
import { ringContains } from "../src/lib/polygonRings.js";

test("two prospects 3 km apart: the whole model's grid vs the area's", () => {
  const cells = [];
  for (const ox of [0, 3000]) for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) for (let k = 0; k < 6; k++) cells.push({ x: ox + 5 + i * 10, y: 5 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: 2 });
  const econ = { unit: "g/t", element: "Au", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45, maxCells: 200000 };
  const ring = [[-20, -20], [100, -20], [100, 100], [-20, 100]];
  const inArea = cells.filter((c) => ringContains(ring, [c.x, c.y]));
  assert.equal(inArea.length, 384);
  const one = runPitShell({ ...econ, cells: inArea }, { groundAt: () => 1000 });
  assert.equal(one.cell[0], 10); // the block size, not a coarsened cell
  assert.equal(one.parts?.pits?.length ?? 1, 1);
});

test("the pane", () => {
  const p = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(p, /const areas = useMemo\(\(\) => designStrings\.filter\(\(s\) => s\.closed && s\.vertices\.length > 2 && !s\.stopeRun\)/);
  assert.match(p, /job\.current = runPitShellAsync\(mIn, runInputs, terrain, \(phases\) => setBusy\(phases\), collars, byIn(, alsoIn(, penModels)?)?\);/ /* alsoIn: #2995; penModels: #2986 part 2 */);
  assert.match(p, /pitArea: area\.name/);
});
