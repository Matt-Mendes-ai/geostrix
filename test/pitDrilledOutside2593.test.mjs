// TASKS.csv #2593 — assays inside the pit and outside the block model are drilled rock, counted and named, not 'undrilled'
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell } from "../src/lib/pitShell.js";
import { drilledOutsideModel } from "../src/lib/pitDrilledOutside.js";

const econ = { unit: "%", element: "Cu", price: 4, priceUnit: "lb", recovery: 90, miningCost: 2, processingCost: 10, density: 2.7, slopeDeg: 45 };
// a rich 60 x 60 x 60 m model block at x 500-560, ground RL 1000; the pit around it spreads outside the model (its walls)
const cells = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) for (let k = 0; k < 6; k++) cells.push({ x: 505 + i * 10, y: 505 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: 3 });
const vertical = (x, y) => [{ x, y, z: 1000, md: 0 }, { x, y, z: 800, md: 200 }];

test("samples in the pit wall outside the model are counted; in the model, under the pit or beyond it they are not", () => {
  const r = runPitShell({ ...econ, cells }, { groundAt: () => 1000 });
  assert.ok(r.oreT > 0 && r.barrenShare > 0.02, String(r.barrenShare));
  const traces = new Map([["IN", vertical(530, 530)], ["WALL", vertical(580, 530)], ["FAR", vertical(2000, 2000)]]);
  const samples = [];
  for (let d = 0; d < 60; d += 2) {
    samples.push({ hole_id: "IN", from: d, to: d + 2, value: 3 });
    samples.push({ hole_id: "WALL", from: d, to: d + 2, value: d < 10 ? 2 : 0.01 }); // 20 m east of the model: inside the pit's wall near the top
    samples.push({ hole_id: "FAR", from: d, to: d + 2, value: 5 });
  }
  const o = drilledOutsideModel(cells, samples, traces, { positions: r.positions, indices: r.indices, cellM: r.cell[0] }, r.cutoff);
  assert.ok(o, "a result");
  assert.equal(o.holes, 1, JSON.stringify(o)); // only WALL: IN is in the model, FAR is outside the pit
  assert.ok(o.samples > 0 && o.samples < 30, String(o.samples)); // the wall's upper part only (the pit narrows with depth)
  assert.equal(o.metres, 2 * o.samples);
  assert.equal(o.oreHoles, 1); assert.equal(o.oreMetres, 10); // the 0-10 m at 2 % (the cut-off is ~0.07 % Cu)
  assert.deepEqual(o.holeIds, ["WALL"]);
});

test("a sample beyond the end of its trace has no place and is not counted", () => {
  const r = runPitShell({ ...econ, cells }, { groundAt: () => 1000 });
  const stub = new Map([["WALL", [{ x: 580, y: 530, z: 1000, md: 0 }]]]); // one survey station: a one-point trace
  const o = drilledOutsideModel(cells, [{ hole_id: "WALL", from: 10, to: 12, value: 2 }], stub, { positions: r.positions, indices: r.indices, cellM: r.cell[0] }, r.cutoff);
  assert.equal(o, null);
});

test("nothing to test: no samples, no pit mesh, no model", () => {
  assert.equal(drilledOutsideModel(cells, [], new Map(), { positions: [1], indices: [0] }, 1), null);
  assert.equal(drilledOutsideModel([], [{ hole_id: "a", from: 0, to: 1, value: 1 }], new Map(), { positions: [1], indices: [0] }, 1), null);
  assert.equal(drilledOutsideModel(cells, [{ hole_id: "a", from: 0, to: 1, value: 1 }], new Map(), null, 1), null);
});

test("the pane says it in place of 'undrilled' and keeps it with the pit", () => {
  const p = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(p, /res\.outside\?\.samples > 0/);
  assert.match(p, /drilledOutsideModel: \{ samples: outside\.samples/);
  assert.match(p, /if \(element && assays\.length\) \{/); // #3003 (6): computed with any assays (was only with > 2 % of the pit outside the model)
});
