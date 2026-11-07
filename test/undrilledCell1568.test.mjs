// TASKS.csv #1568 — the auto block size: the finest that fits the block budget, from half the coverage distance up.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaultCellSize } from "../src/lib/undrilledZones.js";

// only the box of the positions matters to the size
const boxOf = (dx, dy, dz) => [0, 0, 0, dx, dy, dz];

test("a district-size unit (5.3 x 6.2 x 0.9 km) with 25 m coverage gets about 25 m blocks, not 50 m", () => {
  const c = defaultCellSize(boxOf(5300, 6200, 900), 25);
  assert.ok(c >= 12.5 && c <= 26, `block ${c} m`);
  const n = Math.ceil(5300 / c) * Math.ceil(6200 / c) * Math.ceil(900 / c);
  assert.ok(n <= 2_000_000, `${n} blocks`);
});

test("a small unit gets half the distance or finer; a huge one stays within the budget", () => {
  assert.ok(defaultCellSize(boxOf(500, 500, 200), 25) <= 12.5);
  const c = defaultCellSize(boxOf(40000, 40000, 2000), 25);
  assert.ok(Math.ceil(40000 / c) ** 2 * Math.ceil(2000 / c) <= 2_000_000, `block ${c}`);
});

test("the pane says when the blocks are coarser than the distance", () => {
  const s = fs.readFileSync("src/components/UndrilledZonesPane.jsx", "utf8");
  assert.match(s, /result\.cellM > result\.coverM && <div/);
});
