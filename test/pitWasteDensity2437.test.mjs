// TASKS.csv #2437 — an optional waste density: ore blocks at the ore density, every other rock at the waste density, in the shell and the benches
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell } from "../src/lib/pitShell.js";
import { benchedPit, shellFloors } from "../src/lib/pitDesign.js";

const econ = { unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45 };
// a 120 x 120 m body 100 m thick under 20 m of barren cover (blocks of grade 0 in the model) and flat ground at RL 1000
const body = () => {
  const cells = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 12; k++) cells.push({ x: 500 + i * 10, y: 500 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: k < 2 ? 0 : 1.5 });
  return cells;
};
const ground = () => 1000;

test("blank waste density: the same pit as before; a waste density changes the waste tonnes only, at the volume's ratio", () => {
  const one = runPitShell({ ...econ, cells: body() }, { groundAt: ground });
  const same = runPitShell({ ...econ, cells: body(), wasteDensity: 2.7 }, { groundAt: ground });
  assert.equal(same.oreT, one.oreT); assert.equal(same.wasteT, one.wasteT); assert.equal(same.money, one.money);
  // a lighter waste: the ore keeps its tonnes and grade; if the pit is the same cells, the waste tonnes scale by 1.9 / 2.7
  const light = runPitShell({ ...econ, cells: body(), wasteDensity: 1.9 }, { groundAt: ground });
  assert.ok(light.oreT >= one.oreT - 1e-6, `${light.oreT} vs ${one.oreT}`);
  assert.ok(Math.abs(light.meanGrade - 1.5) < 1e-9);
  if (light.blocks === one.blocks) assert.ok(Math.abs(light.wasteT / one.wasteT - 1.9 / 2.7) < 1e-4, String(light.wasteT / one.wasteT));
  assert.ok(light.money > one.money); // lighter waste costs less to move
});

test("benchedPit: ore tonnes at the ore density, the rest of each bench at the waste density", () => {
  // a square shell 60 m deep (as test/pitDesign1874): ore (grade 2) in the bottom 30 m of the 90 x 90 m floor, barren model blocks above
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1000);
  const shell = shellFloors(Float64Array.from(pos), () => 1000);
  const cells = [];
  for (let x = -65; x <= 65; x += 10) for (let y = -65; y <= 65; y += 10) for (let z = 945; z < 1000; z += 10) cells.push({ x: 500000 + x, y: 5000000 + y, z, dx: 10, dy: 10, dz: 10, value: z < 970 ? 2 : 0 });
  const opts = { groundAt: () => 1000, cells, cutoff: 1, benchH: 10, berm: 5, batterDeg: 60 };
  const a = benchedPit(shell, { ...opts, density: 2.7 });
  const b = benchedPit(shell, { ...opts, density: 2.7, wasteDensity: 1.8 });
  assert.ok(a && b && !a.failed && !b.failed, JSON.stringify(a?.failed || b?.failed));
  assert.ok(a.totals.oreT > 90 * 90 * 25 * 2.7 && a.totals.wasteT > 0, `${a.totals.oreT} / ${a.totals.wasteT}`); // ore under the floor is not in the design: the 30 m above it is
  assert.ok(Math.abs(b.totals.oreT - a.totals.oreT) < 1e-6, "the ore keeps its density");
  assert.ok(Math.abs(b.totals.wasteT - (a.totals.wasteT * 1.8) / 2.7) < 1e-3 * a.totals.wasteT, `${b.totals.wasteT} vs ${a.totals.wasteT}`);
  assert.ok(Math.abs(b.totals.rockT - (b.totals.oreT + b.totals.wasteT)) < 1e-6);
  assert.ok(Math.abs(b.totals.meanGrade - a.totals.meanGrade) < 1e-9);
});

test("the pane, the design, the nested series and the dump carry it", () => {
  const pane = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(pane, /field\("wasteDensity", tr\("Waste density \(t\/m³\)"\)/);
  assert.match(pane, /Number\(f\.wasteDensity\) > 0 \? \{ wasteDensity: Number\(f\.wasteDensity\) \} : \{\}/);
  assert.match(fs.readFileSync("src/components/PitDesignPane.jsx", "utf8"), /wasteDensity: Number\(pit\.params\?\.inputs\?\.wasteDensity\) \|\| null/);
  assert.match(fs.readFileSync("src/components/NestedPitsPane.jsx", "utf8"), /tr\("\{o\} ore, \{w\} waste"/);
  assert.match(fs.readFileSync("src/components/DumpPane.jsx", "utf8"), /Use the pit's waste density, \{v\}/);
  assert.equal(fs.readFileSync("src/lib/pitShell.js", "utf8").match(/wasteDensity: inputs\.wasteDensity/g).length, 4);
});
