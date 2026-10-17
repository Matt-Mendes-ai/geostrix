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
