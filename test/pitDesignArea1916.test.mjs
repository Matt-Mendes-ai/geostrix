// TASKS.csv #1916 — a design area limits the benched design to one part of a shell; the design cell is predicted before the run
import test from "node:test";
import assert from "node:assert/strict";
import { shellFloors, benchedPit, predictDesignCell, benchHeightThatDraws, MAX_DESIGN_CELLS } from "../src/lib/pitDesign.js";

// a shell on a 10 m lattice: a 50 x 50 m floor and, 150 m east, a 30 x 30 m floor, both at 960 under flat ground at 1,000
function twoPits() {
  const pos = [];
  for (let y = -60; y <= 60; y += 10) for (let x = -60; x <= 220; x += 10) {
    const big = Math.abs(x) <= 25 && Math.abs(y) <= 25, small = Math.abs(x - 150) <= 15 && Math.abs(y) <= 15;
    pos.push(500000 + x, 5000000 + y, big || small ? 960 : 1000);
  }
  return shellFloors(Float64Array.from(pos), () => 1000);
}

test("a design area keeps the columns inside it: the small eastern pit alone", () => {
  const s = twoPits();
  const area = [[500100, 4999950], [500200, 4999950], [500200, 5000050], [500100, 5000050]];
  const d = benchedPit(s, { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60, areaPoly: area });
  assert.equal(d.columnsInArea, 9);
  assert.equal(d.partsDropped, 0);
  for (let i = 0; i < d.positions.length; i += 3) if (d.positions[i] - 500000 < 60) assert.ok(d.positions[i + 2] >= 1000 - 1e-9, "nothing designed over the western pit (the eastern walls reach to about x = 92)");
  const all = benchedPit(s, { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60 });
  assert.ok(d.totals.rockT < all.totals.rockT / 2);
  assert.deepEqual(benchedPit(s, { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60, areaPoly: [[600000, 6000000], [600100, 6000000], [600100, 6000100]] }), { failed: "area-empty" });
});

test("the predicted cell matches what a run gets, and says when a face cannot be drawn", () => {
  // Treaty Creek-like: a 3 x 3 km box, 960 m deep, 31.7 m shell cells, 10 m benches at 65 deg with 5 m berms
  const p = predictDesignCell({ boxW: 3000, boxH: 3000, depth: 960, shellCell: 31.7, benchH: 10, berm: 5, batterDeg: 65, maxCells: 250000 });
  assert.ok(p.cell > p.faceRun && !p.facesDrawn, `cell ${p.cell} face ${p.faceRun}`);
  const q = predictDesignCell({ boxW: 3000, boxH: 3000, depth: 960, shellCell: 31.7, benchH: 10, berm: 5, batterDeg: 65 });
  assert.ok(q.cell < p.cell, "the larger budget gives a finer cell");
  const h = benchHeightThatDraws({ boxW: 3000, boxH: 3000, depth: 960, shellCell: 31.7, berm: 5, batterDeg: 65, maxCells: 250000 });
  assert.ok(h >= 15 && h <= 60, `${h} m`);
  // the prediction agrees with a real run on the small test shell (no coarsening there)
  const s = twoPits();
  const d = benchedPit(s, { groundAt: () => 1000, benchH: 10, berm: 5, batterDeg: 60 });
  const pr = predictDesignCell({ boxW: 280, boxH: 120, depth: 40, shellCell: 10, benchH: 10, berm: 5, batterDeg: 60, maxCells: MAX_DESIGN_CELLS });
  assert.ok(Math.abs(pr.cell - d.cell) < 1e-9 && pr.facesDrawn && !d.coarsened);
});
