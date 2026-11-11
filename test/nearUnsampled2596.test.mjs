// TASKS.csv #2596 (review #2486, WA lithium) — a third of the pit-grade blocks (10.4 of 31.9 Mt) had never-sampled drilling as their nearest
// metre of hole. The estimate now flags each block whose nearest drilled metre has no sample of the element, and Pit shell reports the share.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { makePointIndex } from "../src/lib/nearestIndex.js";
import { unsampledDrillPoints, sampledByHole } from "../src/lib/insideSampling.js";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { cellsFromColumns } from "../src/lib/estimationCells.js";
import { runPitShell } from "../src/lib/pitShell.js";

test("#2596: the point index gives the true nearest distance within a radius", () => {
  let seed = 5; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pts = Array.from({ length: 400 }, () => ({ x: 1000 + rnd() * 300, y: 2000 + rnd() * 300, z: rnd() * 100 }));
  const idx = makePointIndex(pts, 20);
  for (let k = 0; k < 60; k++) {
    const q = { x: 950 + rnd() * 400, y: 1950 + rnd() * 400, z: -50 + rnd() * 200 };
    const brute = Math.min(...pts.map((p) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)));
    const r = 80;
    assert.equal(idx.nearest(q.x, q.y, q.z, r), brute <= r ? brute : Infinity);
    assert.equal(idx.anyWithin(q.x, q.y, q.z, brute + 1e-6), true);
    assert.equal(idx.anyWithin(q.x, q.y, q.z, brute - 1e-6), false);
  }
  assert.equal(makePointIndex([], 10).nearest(0, 0, 0, 5), Infinity);
});

test("#2596: the unsampled drilled points are the metres no sample covers (holes never assayed included)", () => {
  const trace = (id, x) => ({ hole_id: id, pts: [{ md: 0, x, y: 0, z: 100 }, { md: 20, x, y: 0, z: 80 }] });
  const sampled = sampledByHole([{ hole_id: "A", from: 4, to: 8, value: 1 }, { hole_id: "A", from: 8, to: 12, value: 0 }]);
  const u = unsampledDrillPoints([trace("A", 0), trace("B", 50)], sampled, 2);
  const a = u.filter((p) => p.x === 0).map((p) => +(100 - p.z).toFixed(3));
  assert.deepEqual(a, [1, 3, 13, 15, 17, 19]); // 4-12 m sampled (a 0 is a sample)
  assert.equal(u.filter((p) => p.x === 50).length, 10, "a hole with no assay at all is all unsampled");
  assert.equal(unsampledDrillPoints([trace("B", 50)], sampled, 2, { xmin: 0, xmax: 10, ymin: -1, ymax: 1, zmin: 0, zmax: 200 }).length, 0, "outside the box");
});

test("#2596: a block is flagged when unsampled drilling is nearer than its nearest sample, in cells and in columns alike", () => {
  // hole A at x = 0 sampled from RL 100 to 0; hole B at x = 60 drilled but never sampled
  const samples = [];
  for (let z = 99; z > 0; z -= 2) samples.push({ hole_id: "A", x: 0, y: 0, z, value: 1, length: 2 });
  const unsampledPoints = [];
  for (let z = 99; z > 0; z -= 2) unsampledPoints.push({ x: 60, y: 0, z });
  const opts = { bounds: { xmin: -10, xmax: 70, ymin: -10, ymax: 10, zmin: 0, zmax: 100 }, cellSize: 10, method: "idw2", searchRadius: 100, unsampledPoints };
  const r = estimateBlockModel(samples, opts);
  const at = (x) => r.cells.filter((c) => Math.abs(c.x - x) < 1e-6);
  assert.ok(at(5).every((c) => !c.nearUnsampled), "next to the sampled hole");
  assert.ok(at(55).every((c) => c.nearUnsampled), "next to the unsampled hole: its grade came from 55 m away");
  assert.equal(r.nearUnsampledBlocks, r.cells.filter((c) => c.nearUnsampled).length);
  const rc = estimateBlockModel(samples, { ...opts, columns: true });
  assert.deepEqual(cellsFromColumns(rc.columns).map((c) => !!c.nearUnsampled), r.cells.map((c) => !!c.nearUnsampled));
  // off when no unsampled points are given
  const off = estimateBlockModel(samples, { ...opts, unsampledPoints: undefined });
  assert.ok(off.cells.every((c) => c.nearUnsampled === undefined) && off.nearUnsampledBlocks === undefined);
});

test("#2596: Pit shell counts the ore in those blocks, the solve unchanged; the flag rides to the workers and the panes", () => {
  const econ = { unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45 };
  const body = (flaggedCols) => {
    const cells = [];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 10; k++) cells.push({ x: 500 + i * 10, y: 500 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: 1.5, ...(i < flaggedCols ? { nearUnsampled: true } : {}) });
    return cells;
  };
  const ground = () => 1000;
  const none = runPitShell({ ...econ, cells: body(0) }, { groundAt: ground });
  assert.equal(none.oreNearUnsampledShare, 0);
  const third = runPitShell({ ...econ, cells: body(4) }, { groundAt: ground });
  assert.ok(third.oreNearUnsampledShare > 0.25 && third.oreNearUnsampledShare < 0.4, String(third.oreNearUnsampledShare));
  assert.equal(third.oreT, none.oreT); assert.equal(third.money, none.money);
  for (const f of ["src/lib/pitShellClient.js", "src/lib/pitSeriesClient.js"]) assert.match(fs.readFileSync(f, "utf8"), /columns\.nearUnsampled\[i\] = c\.nearUnsampled \? 1 : 0/, f);
  for (const f of ["src/lib/pitShell.worker.js", "src/lib/pitSeries.worker.js"]) assert.match(fs.readFileSync(f, "utf8"), /nearUnsampled: c\.nearUnsampled\?\.\[i\] === 1/, f);
  const pane = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(pane, /nearUnsOre = nearUnsP > 0\.2/);
  assert.match(pane, /oreNearUnsampledShare: \+\(r\.oreNearUnsampledShare \|\| 0\)\.toFixed\(3\)/);
  const est = fs.readFileSync("src/components/GradeEstimationModal.jsx", "utf8");
  assert.match(est, /\.\.\.\(unsPts\.length \? \{ unsampledPoints: unsPts \} : \{\}\)/);
  assert.match(est, /sampledByHole\(resolvedSegments\(runAssays, symbol, unit, elementUnits\)\)/, "barren-filled metres count as sampled");
});
