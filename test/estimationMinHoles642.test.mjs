// TASKS.csv #642 — "min holes" with a per-hole cap: beside a hole, the 16 nearest samples all came from it
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateBlockModel, selectUsed, perHoleCap } from "../src/lib/estimation.js";

// vertical holes composited every 2 m, value = a per-hole constant
const hole = (id, x, y, value, n = 60) => Array.from({ length: n }, (_, i) => ({ x, y, z: 1000 - 1 - 2 * i, value, hole_id: id, length: 2 }));

test("selectUsed caps each hole at ceil(maxSamples / minHoles), nearest first", () => {
  const c = [...Array(10)].map((_, i) => ({ d2: i, hole_id: "A" })).concat([{ d2: 50, hole_id: "B" }, { d2: 60, hole_id: "B" }]);
  assert.equal(perHoleCap(16, 1), Infinity);
  assert.equal(perHoleCap(16, 2), 8);
  assert.equal(selectUsed(c, 4, 1).length, 4);
  const u = selectUsed(c, 10, 2);
  assert.deepEqual(u.map((d) => d.hole_id).join(""), "AAAAABB");
});

test("a block beside one hole with another inside the search is estimated from both", () => {
  const pts = [...hole("A", 0, 0, 100), ...hole("B", 60, 0, 300)];
  const bounds = { xmin: -10, xmax: 10, ymin: -10, ymax: 10, zmin: 940, zmax: 960 };
  const r = estimateBlockModel(pts, { bounds, cellSize: { dx: 20, dy: 20, dz: 20 }, method: "idw2", searchRadius: 100, maxSamples: 16, minHoles: 2, lengthWeight: false });
  assert.equal(r.cells.length, 1, "was 0: the 16 nearest all came from hole A");
  const c = r.cells[0];
  assert.equal(c.nHoles, 2);
  assert.ok(c.value > 100 && c.value < 200, String(c.value)); // pulled up by B, still dominated by the near hole
});

test("min holes 2 still leaves a block with only one hole in reach empty", () => {
  const pts = [...hole("A", 0, 0, 100), ...hole("B", 500, 0, 300)];
  const bounds = { xmin: -10, xmax: 10, ymin: -10, ymax: 10, zmin: 940, zmax: 960 };
  const r = estimateBlockModel(pts, { bounds, cellSize: { dx: 20, dy: 20, dz: 20 }, searchRadius: 100, minHoles: 2 });
  assert.equal(r.cells.length, 0);
});

test("the indexed search picks exactly the brute-force capped selection", () => {
  // eight holes on a jittered grid, values varying down each hole
  const pts = [];
  for (let k = 0; k < 8; k++) {
    const x = (k % 4) * 70 + (k * 13) % 17, y = Math.floor(k / 4) * 80 + (k * 7) % 11;
    for (let i = 0; i < 50; i++) pts.push({ x, y, z: 1000.3 - 2.07 * i - 0.013 * k, value: 10 + k * 20 + i, hole_id: `H${k}` });
  }
  const R = 120, maxSamples = 12, minHoles = 3;
  const bounds = { xmin: -20, xmax: 240, ymin: -20, ymax: 110, zmin: 900, zmax: 1000 };
  const res = estimateBlockModel(pts, { bounds, cellSize: { dx: 20, dy: 20, dz: 20 }, method: "idw2", searchRadius: R, maxSamples, minHoles, lengthWeight: false });
  assert.ok(res.cells.length > 50);
  let checked = 0;
  for (const c of res.cells) {
    const cand = pts.map((p) => ({ d2: (p.x - c.x) ** 2 + (p.y - c.y) ** 2 + (p.z - c.z) ** 2, value: p.value, hole_id: p.hole_id }))
      .filter((d) => d.d2 <= R * R).sort((a, b) => a.d2 - b.d2);
    const used = selectUsed(cand, maxSamples, minHoles);
    let sw = 0, sv = 0;
    for (const d of used) { const w = 1 / d.d2; sw += w; sv += w * d.value; }
    assert.ok(Math.abs(sv / sw - c.value) < 1e-9, `${c.value} vs ${sv / sw}`);
    assert.equal(c.nHoles, new Set(used.map((d) => d.hole_id)).size);
    checked++;
  }
  assert.ok(checked > 50);
});

// TASKS.csv #676 — a block that passes "min 2 holes" while one hole carries ~all the weight is counted
test("#676 blocks where one hole carries >= 95 % of the weight are counted as effectively single-hole", async () => {
  const { estimateBlockModel, DOMINANT_SHARE } = await import("../src/lib/estimation.js");
  assert.equal(DOMINANT_SHARE, 0.95);
  const pts = [];
  for (let i = 0; i < 60; i++) pts.push({ x: 1, y: 0, z: -2 * i - 1, value: 100, hole_id: "A", length: 2 });
  for (let i = 0; i < 60; i++) pts.push({ x: 60, y: 0, z: -2 * i - 1, value: 300, hole_id: "B", length: 2 });
  const res = estimateBlockModel(pts, { bounds: { xmin: -1, xmax: 1, ymin: -1, ymax: 1, zmin: -61, zmax: -59 }, cellSize: { dx: 2, dy: 2, dz: 2 }, method: "idw2", searchRadius: 100, minSamples: 1, maxSamples: 16, minHoles: 2 });
  assert.equal(res.cells.length, 1);
  assert.equal(res.cells[0].nHoles, 2, "it passes the hole rule");
  assert.ok(res.cells[0].value < 101, `value ${res.cells[0].value}`);
  assert.equal(res.dominatedCells, 1);
  assert.equal(res.singleHoleCells, 0);
  // halfway between the two holes neither dominates
  const mid = estimateBlockModel(pts, { bounds: { xmin: 29.5, xmax: 31.5, ymin: -1, ymax: 1, zmin: -61, zmax: -59 }, cellSize: { dx: 2, dy: 2, dz: 2 }, method: "idw2", searchRadius: 100, minSamples: 1, maxSamples: 16, minHoles: 2 });
  assert.equal(mid.dominatedCells, 0);
});

// TASKS.csv #934 — a kriged block reads its dominant hole from the kriging weights; it used Math.pow(d2, null / 2) = 1,
// i.e. sample lengths, so a block next to one hole with a second hole 60 m away never counted as dominated
test("#934 ordinary kriging counts a block one hole dominates, from its kriging weights", async () => {
  const { estimateBlockModel } = await import("../src/lib/estimation.js");
  const pts = [];
  for (let i = 0; i < 8; i++) pts.push({ x: 1, y: 0, z: -i * 2 - 1, value: 2 + 0.1 * i, hole_id: "A", length: 2 });
  for (let i = 0; i < 8; i++) pts.push({ x: 60, y: 0, z: -i * 2 - 1, value: 0.2, hole_id: "B", length: 2 });
  const variogram = { model: "spherical", nugget: 0.05, sill: 1, range: 40 };
  const res = estimateBlockModel(pts, { bounds: { xmin: -5, xmax: 5, ymin: -5, ymax: 5, zmin: -5, zmax: 5 }, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "ok", searchRadius: 100, maxSamples: 16, minHoles: 2, variogram });
  assert.equal(res.cells[0].nHoles, 2);
  assert.equal(res.dominatedCells, 1);
  // halfway between the holes neither dominates
  const mid = estimateBlockModel(pts, { bounds: { xmin: 25.5, xmax: 35.5, ymin: -5, ymax: 5, zmin: -5, zmax: 5 }, cellSize: { dx: 10, dy: 10, dz: 10 }, method: "ok", searchRadius: 100, maxSamples: 16, minHoles: 2, variogram });
  assert.equal(mid.dominatedCells, 0);
});
