// TASKS.csv #2665 — an optional limit: the pit no further than N m in plan from the block model's columns
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell, runPitSeries } from "../src/lib/pitShell.js";

const econ = { unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45 };
// a 60 x 60 m column of rich ore from 40 m to 100 m deep under flat ground: its 45° walls reach far beyond the model's footprint
const body = () => {
  const cells = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (let k = 0; k < 10; k++) cells.push({ x: 505 + i * 10, y: 505 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: k < 4 ? 0 : 20 });
  return cells;
};
const ground = () => 1000;

test("no limit: as before; a limit keeps the pit's columns within it, and a block whose wall would cross it stays in the ground", () => {
  const free = runPitShell({ ...econ, cells: body() }, { groundAt: ground });
  assert.equal(free.limitM, null); assert.equal(free.limitedCols, 0);
  assert.ok(free.oreT > 0);
  const out = (r) => r.rockOutsideBlockModelShare ?? r.outsideShare ?? null;
  const tight = runPitShell({ ...econ, cells: body(), limitM: 20 }, { groundAt: ground });
  assert.equal(tight.limitM, 20);
  assert.ok(tight.limitedCols > 0);
  assert.ok(tight.oreT < free.oreT, `${tight.oreT} vs ${free.oreT}`); // the deepest ore needs walls beyond 20 m
  assert.ok(tight.wasteT < free.wasteT);
  if (out(free) != null) assert.ok(out(tight) < out(free));
  const zero = runPitShell({ ...econ, cells: body(), limitM: 0 }, { groundAt: ground });
  assert.ok(zero.empty || zero.oreT <= tight.oreT, JSON.stringify(Object.keys(zero))); // at 0 m no 45° wall fits: an empty pit
  // a limit wide enough changes nothing
  const wide = runPitShell({ ...econ, cells: body(), limitM: 500 }, { groundAt: ground });
  assert.equal(wide.oreT, free.oreT); assert.equal(wide.limitedCols, 0);
});

test("the series takes the limit from the inputs; the pane saves it and says it", () => {
  const r = runPitSeries({ ...econ, cells: body(), limitM: 20 }, [0.8, 1], { groundAt: ground });
  const free = runPitSeries({ ...econ, cells: body() }, [0.8, 1], { groundAt: ground });
  const big = (s) => [...s.runs].reverse().find((x) => x.oreT > 0);
  assert.ok(big(r).oreT < big(free).oreT);
  const p = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(p, /\.\.\.\(f\.limitM !== "" && f\.limitM != null && Number\(f\.limitM\) >= 0 \? \{ limitM: Number\(f\.limitM\) \} : \{\}\)/);
  assert.match(p, /field\("limitM", tr\("Keep within \(m of the block model\)"\)/);
  assert.match(p, /res\.limitM != null && <div style=\{note\}>/);
});
