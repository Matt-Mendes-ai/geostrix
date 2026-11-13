// TASKS.csv #3060 — a whole-field estimate's last main-thread steps: the estimate's cells built in slices (the window paints between them),
// the nearest-neighbour check model kept as columns (never 627,000 cell objects), joined as columns by the check and the swaths
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { estimateBlockModel } from "../src/lib/estimation.js";
import { cellsFromColumns, cellsFromColumnsSliced, checkColumns } from "../src/lib/estimationCells.js";
import { estimateCheck, swath } from "../src/lib/estimateCheck.js";

// a small synthetic drill pattern: 5 x 5 vertical holes, a sample every 2 m, a grade that rises to the east
const points = [];
for (let h = 0; h < 25; h++) for (let d = 0; d < 20; d++) {
  const x = 10 + (h % 5) * 20, y = 10 + Math.floor(h / 5) * 20, z = 100 - d * 2;
  points.push({ x, y, z, value: 0.1 + x / 100 + ((h * 7 + d * 3) % 5) / 50, hole_id: `H${h}`, length: 2 });
}
const opts = { bounds: { xmin: 0, xmax: 100, ymin: 0, ymax: 100, zmin: 60, zmax: 100 }, cellSize: { dx: 10, dy: 10, dz: 5 }, searchRadius: 40, minSamples: 1, maxSamples: 12, minHoles: 1 };
const est = estimateBlockModel(points, { ...opts, method: "idw", columns: true });
const nn = estimateBlockModel(points, { ...opts, method: "nn", minSamples: 1, maxSamples: 1, columns: true });

test("the cells built in slices are the cells built at once, with a pause between slices", async () => {
  let pauses = 0;
  const sliced = await cellsFromColumnsSliced(est.columns, { slice: 37, pause: async () => { pauses++; } });
  assert.deepEqual(sliced, cellsFromColumns(est.columns));
  assert.equal(pauses, Math.ceil(est.columns.n / 37) - 1);
  assert.ok(est.columns.n > 200, String(est.columns.n));
});

test("a cancelled run stops building and says so", async () => {
  const ac = new AbortController();
  let pauses = 0;
  await assert.rejects(cellsFromColumnsSliced(est.columns, { slice: 10, signal: ac.signal, pause: async () => { if (++pauses === 3) ac.abort(); } }), (e) => e.cancelled === true);
  assert.equal(pauses, 3);
});

test("the check model as columns: the lattice and values only, the same check and swaths as the NN cells", () => {
  const cells = cellsFromColumns(est.columns), nnCells = cellsFromColumns(nn.columns), nnCols = checkColumns(nn.columns);
  assert.deepEqual(Object.keys(nnCols).sort(), ["dx", "dy", "dz", "n", "value", "x", "y", "z"]);
  assert.deepEqual(estimateCheck(cells, nnCols, points), estimateCheck(cellsFromColumns(est.columns), nnCells, points));
  for (const axis of ["x", "y", "z"]) assert.deepEqual(swath(cells, nnCols, points, axis), swath(cellsFromColumns(est.columns), nnCells, points, axis));
  const c = estimateCheck(cells, nnCols, points);
  assert.ok(c.nn.n > 0 && c.nn.n === c.estimate.n, JSON.stringify(c));
});

test("off the merge (blocks out of order), the columns still join through the map", () => {
  const cells = cellsFromColumns(est.columns).reverse(), nnCols = checkColumns(nn.columns);
  const a = estimateCheck(cells, nnCols, points), b = estimateCheck(cellsFromColumns(est.columns), cellsFromColumns(nn.columns), points);
  assert.equal(a.nn.n, b.nn.n); assert.equal(a.estimate.n, b.estimate.n); // the same pairs; the sums only in another order
  for (const k of ["nn", "estimate"]) assert.ok(Math.abs(a[k].mean - b[k].mean) < 1e-12, k);
});

test("wiring: the dialog asks for the NN model as columns and unlogs its values in place; the client builds cells in slices", () => {
  const m = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(m, /signal: ac\.signal, checkOnly: true/);
  assert.match(m, /const nnCheck = method === "nn" \? est\.cells : nnEst\.checkColumns;/); assert.match(m, /nnCells: nnCheck/);
  // the check and the Easting swath worked out in the run, a task each; compositing / placing / the unsampled metres apart
  assert.match(m, /setTimeout\(r, 0\)\); estimateCheck\(est\.cells, nnCheck, points\);\s+await new Promise\(\(r\) => setTimeout\(r, 0\)\); swath\(est\.cells, nnCheck, points, "x"\);/);
  assert.match(m, /setTimeout\(r, 0\)\); \/\/ TASKS\.csv #3060 — compositing, placing the points/);
  assert.match(m, /const v = nnEst\.checkColumns\.value; for \(let i = 0; i < v\.length; i\+\+\) v\[i\] = unlogValue\(v\[i\]\)/);
  const cl = readFileSync(new URL("../src/lib/estimationClient.js", import.meta.url), "utf8");
  assert.match(cl, /cells: await cellsFromColumnsSliced\(columns, \{ signal \}\)/);
  assert.match(cl, /checkOnly \? \{ \.\.\.rest, checkColumns: checkColumns\(columns\) \}/);
});

test("the check and the default swaths are kept per estimate / NN model / points: the render reads what the run worked out", () => {
  const cells = cellsFromColumns(est.columns), nnCols = checkColumns(nn.columns);
  const a = estimateCheck(cells, nnCols, points), s = swath(cells, nnCols, points, "x");
  assert.equal(estimateCheck(cells, nnCols, points), a, "the same object, not worked out again");
  assert.equal(swath(cells, nnCols, points, "x"), s);
  assert.notEqual(swath(cells, nnCols, points, "x", { slices: 6 }), s, "a non-default swath is not cached");
  assert.notEqual(estimateCheck(cells, nnCols, points.slice()), a, "other points: worked out again");
  assert.deepEqual(estimateCheck(cells, nnCols, points.slice()), a);
});
