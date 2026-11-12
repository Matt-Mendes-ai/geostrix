// TASKS.csv #3008 (WA iron review) — a whole-field estimate's main-thread steps: the top-composite check stops at the first block in reach,
// the points go to the worker as columns, the open's traces are reused for the unsampled drilling
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { topCompositesWithoutBlocks } from "../src/lib/shellSupport.js";
import { packPoints, unpackPoints } from "../src/lib/pointColumns.js";

let seed = 5; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// the check as it was (every cell of the 27 bins, Math.hypot), to compare the answers
function oldTop(composites, cells, cellSize, share = 0.05, min = 3) {
  const sorted = composites.filter((c) => Number.isFinite(c.value)).sort((a, b) => b.value - a.value);
  const n = Math.min(sorted.length, Math.max(min, Math.ceil(share * sorted.length))), reachM = Math.sqrt(3) * cellSize, top = sorted.slice(0, n);
  const unsupported = [];
  for (const c of top) {
    let best = Infinity;
    for (const cell of cells) { const d = Math.hypot(cell.x - c.x, cell.y - c.y, cell.z - c.z); if (d < best) best = d; }
    if (!(best <= reachM)) unsupported.push({ value: c.value, hole_id: c.hole_id, nearestM: unsupported.length < 3 ? best : null });
  }
  return { checked: n, unsupported };
}

test("the top-composite check: the same supported / unsupported answer and the first three's nearest distance", () => {
  for (let t = 0; t < 6; t++) {
    const cells = [], comps = [];
    for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) for (let k = 0; k < 6; k++) if (rnd() < 0.6) cells.push({ x: i * 25, y: j * 25, z: k * 2 });
    for (let q = 0; q < 2000; q++) comps.push({ x: rnd() * 1300 - 150, y: rnd() * 1300 - 150, z: rnd() * 14 - 1, value: rnd() * 60, hole_id: `H${q}` });
    const a = topCompositesWithoutBlocks(comps, cells, 25), b = oldTop(comps, cells, 25);
    assert.equal(a.checked, b.checked);
    assert.deepEqual(a.unsupported.map((u) => u.hole_id), b.unsupported.map((u) => u.hole_id), `set ${t}`);
    a.unsupported.slice(0, 3).forEach((u, i) => assert.ok(Math.abs(u.nearestM - b.unsupported[i].nearestM) < 1e-9));
  }
});

test("7,350 top composites against 300,000 flat cells: well under the 3.3 s it took", () => {
  const cells = []; for (let i = 0; i < 250; i++) for (let j = 0; j < 60; j++) for (let k = 0; k < 20; k++) cells.push({ x: i * 25, y: j * 25, z: k * 2 });
  const comps = Array.from({ length: 147000 }, (_, q) => ({ x: rnd() * 6250, y: rnd() * 1500, z: rnd() * 40, value: rnd() * 60, hole_id: `H${q}` }));
  const t0 = performance.now(); const r = topCompositesWithoutBlocks(comps, cells, 25); const ms = performance.now() - t0;
  assert.equal(r.checked, 7350); assert.ok(ms < 2500, `${ms.toFixed(0)} ms`);
});

test("points as columns: the same objects back (numbers, null, absent fields, strings)", () => {
  const pts = [{ x: 1, y: 2, z: 3, value: 4.5, hole_id: "A", length: null, domain: "OX" }, { x: 5, y: 6, z: 7, value: 0, hole_id: "B", length: 2, domain: null, logFrac: 0.5 }];
  const p = packPoints(pts);
  assert.ok(p.num.x instanceof Float64Array && Array.isArray(p.other.hole_id));
  assert.deepEqual(unpackPoints(structuredClone(p)), pts);
  assert.equal(packPoints(pts), p, "kept per points array: the second run reuses it");
});

test("wired: the client sends columns, the worker unpacks them; the run reuses the open's traces", () => {
  assert.match(readFileSync(new URL("../src/lib/estimationClient.js", import.meta.url), "utf8"), /worker\.postMessage\(\{ kind, packed: packPoints\(points\), opts \}\)/);
  assert.match(readFileSync(new URL("../src/lib/estimation.worker.js", import.meta.url), "utf8"), /const points = e\.data\?\.packed \? unpackPoints\(e\.data\.packed\) : e\.data\?\.points;/);
  assert.match(readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8"), /let pts = known\?\.get\(c\.hole_id\) \|\| null;/);
});

import { estimateBlockModel } from "../src/lib/estimation.js";
import { estimateCheck, swath } from "../src/lib/estimateCheck.js";
import { belowDrilling } from "../src/lib/belowDrilling.js";

test("the estimate / NN join: the merge on the estimator's own order gives the same check as the Map join (shuffled copies)", () => {
  const pts = [];
  for (let h = 0; h < 40; h++) { const x = 1000 + (h % 8) * 30, y = 2000 + Math.floor(h / 8) * 30; for (let k = 0; k < 10; k++) pts.push({ x, y, z: 400 - k * 2 - 1, value: 30 + 30 * rnd(), hole_id: `H${h}`, length: 2 }); }
  const bounds = { xmin: 990, xmax: 1230, ymin: 1990, ymax: 2130, zmin: 375, zmax: 402 };
  const est = estimateBlockModel(pts, { bounds, cellSize: { dx: 10, dy: 10, dz: 2 }, method: "idw2", searchRadius: 25, minSamples: 2, maxSamples: 12, minHoles: 1 });
  const nn = estimateBlockModel(pts, { bounds, cellSize: { dx: 10, dy: 10, dz: 2 }, method: "nn", searchRadius: 25, minSamples: 1, maxSamples: 1, minHoles: 1 });
  assert.ok(est.cells.length > 100 && nn.cells.length >= est.cells.length);
  const fast = estimateCheck(est.cells, nn.cells, pts);
  const shuffle = (a) => a.map((c) => ({ ...c })).sort(() => rnd() - 0.5);
  const slow = estimateCheck(shuffle(est.cells), shuffle(nn.cells), pts); // out of order: the Map path
  assert.equal(fast.estimate.n, slow.estimate.n); assert.ok(Math.abs(fast.estimate.mean - slow.estimate.mean) < 1e-9); assert.ok(Math.abs(fast.nn.mean - slow.nn.mean) < 1e-9);
  assert.equal(swath(est.cells, nn.cells, pts, "x").length > 0, true);
});

test("belowDrilling: the numeric column cache gives the same answer", () => {
  const pts = [{ x: 0, y: 0, z: 100, hole_id: "A" }, { x: 0, y: 0, z: 60, hole_id: "A" }, { x: 50, y: 0, z: 80, hole_id: "B" }];
  const cells = [];
  for (let x = 0; x <= 50; x += 10) for (let z = 40; z <= 100; z += 10) cells.push({ x, y: 0, z, dx: 10, dy: 10, dz: 10, value: 1 });
  const r = belowDrilling(cells, pts, 30);
  // columns x 0-20 see A (deepest 60): blocks below 60 (z + 5 < 60: z 40, 50) -> 2 each = 6; x 30-50 see B (80) (x 30 sees both: lowest 60 -> 2), x 40 / 50 B: z 40-70 -> 4 each
  assert.equal(r.blocks, 6 + 2 + 4 + 4); assert.equal(r.of, cells.length);
});
