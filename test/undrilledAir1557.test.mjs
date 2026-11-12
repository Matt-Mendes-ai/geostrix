// TASKS.csv #1557 — undrilled zones leave out the blocks above the ground; an upward solve is said
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { undrilledZones } from "../src/lib/undrilledZones.js";

function box(x0, x1, y0, y1, z0, z1) {
  const positions = new Float64Array([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]);
  const indices = new Uint32Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 3, 0, 4, 3, 4, 7]);
  return { positions, indices };
}

test("a shell capped 50 m above a flat ground at 1000 m: the air part is not the unit and makes no zone", () => {
  const unit = box(0, 100, 0, 100, 900, 1050); // 100 m below the ground, 50 m above it
  const holes = [[{ x: 50, y: 50, z: 1000 }, { x: 50, y: 50, z: 850 }]];
  const without = undrilledZones({ solid: unit, traces: holes, coverM: 25, cellM: 5 });
  const withGround = undrilledZones({ solid: unit, traces: holes, coverM: 25, cellM: 5, groundAt: () => 1000 });
  assert.equal(without.unitCells, 20 * 20 * 30);
  assert.equal(withGround.unitCells, 20 * 20 * 20);
  assert.equal(withGround.aboveGroundCells, 20 * 20 * 10);
  assert.ok(withGround.zones.every((z) => z.box[5] <= 1000 + 1e-9), "no zone reaches above the ground");
  assert.ok(without.zones.some((z) => z.box[5] > 1000), "without the ground a zone did");
});

test("a ground of NaN (off the terrain) keeps the block", () => {
  const r = undrilledZones({ solid: box(0, 50, 0, 50, 900, 1000), traces: [], coverM: 10, cellM: 5, groundAt: () => NaN });
  assert.equal(r.unitCells, 10 * 10 * 20);
  assert.equal(r.aboveGroundCells, 0);
});

test("the pane passes the terrain or the collar ground; the planned-hole form warns on an upward solve", () => {
  const pane = readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");
  assert.ok(pane.includes("const onCollars = !terrain && !ug?.underground && collars.some(") && pane.includes("runUndrilledZonesAsync(args, terrain ? { terrain } : onCollars ? { collars } : null)")); // #2249: not when the collars are underground; the worker builds the ground (#2258)
  const form = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.match(form, /setUpward\(dip > 0\);/);
});
