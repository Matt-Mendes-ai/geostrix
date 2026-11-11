// TASKS.csv #2439 — a flatter slope above an RL: the pit's walls spread in the cover only
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell } from "../src/lib/pitShell.js";

// a narrow rich body 60 m below the ground (RL 1000), 40 m of barren cover over it
const cells = [];
for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) for (let k = 0; k < 12; k++) { const core = i >= 12 && i < 18 && j >= 12 && j < 18 && k >= 6; cells.push({ x: 5 + i * 10, y: 5 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: core ? 20 : 0 }); }
const econ = { unit: "g/t", element: "Au", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 50 };

test("30° above RL 960 takes more waste than 50° everywhere, and the same as 30° everywhere would not (the ore part keeps 50°)", () => {
  const steep = runPitShell({ ...econ, cells }, { groundAt: () => 1000 });
  const upper = runPitShell({ ...econ, cells, upperSlope: { slopeDeg: 30, rl: 960 } }, { groundAt: () => 1000 });
  const flat = runPitShell({ ...econ, cells, slopeDeg: 30 }, { groundAt: () => 1000 });
  assert.ok(steep.oreT > 0 && upper.oreT > 0);
  assert.ok(upper.wasteT > steep.wasteT * 1.1, `${upper.wasteT} vs ${steep.wasteT}`);
  assert.ok(upper.wasteT < flat.wasteT || upper.oreT !== flat.oreT, `${upper.wasteT} vs ${flat.wasteT}`);
  const same = runPitShell({ ...econ, cells, upperSlope: { slopeDeg: 50, rl: 960 } }, { groundAt: () => 1000 });
  assert.equal(same.wasteT, steep.wasteT); // the same slope above: the same pit
});

test("the pane", () => {
  const p = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(p, /upperSlope: \{ slopeDeg: Number\(f\.upperDeg\), rl: Number\(f\.upperRL\) \}/);
  assert.match(fs.readFileSync("src/lib/pitShell.js", "utf8"), /upper: inputs\.upperSlope \|\| null/);
});
