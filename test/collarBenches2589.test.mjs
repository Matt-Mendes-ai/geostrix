// TASKS.csv #2589 — a terrain from the collars of an operating pit: benches drilled on one spot at different RLs went into one surface
// (83 bench holes more than 5 m off it, up to 15.6 m) and the notice said nothing
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarBenches, pickBenchGround, surfaceMisfit } from "../src/lib/collarBenches.js";

// a 10 x 10 grid of collars 20 m apart at RL 300, and a pit corner where three benches were drilled on the same spots at 290 and 280
function pit() {
  const pts = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) pts.push({ x: 1000 + i * 20, y: 2000 + j * 20, z: 300, hole_id: `S${i}_${j}` });
  for (const [i, j] of [[1, 1], [1, 2], [2, 1]]) {
    pts.push({ x: 1000 + i * 20 + 0.4, y: 2000 + j * 20, z: 290, hole_id: `B290_${i}_${j}` });
    pts.push({ x: 1000 + i * 20, y: 2000 + j * 20 + 0.6, z: 280, hole_id: `B280_${i}_${j}` });
  }
  return pts;
}

test("collars stacked at one spot at different RLs are counted, by place; a flat field has none", () => {
  const b = collarBenches(pit());
  assert.equal(b.n, 9); // 3 spots x 3 collars
  assert.equal(b.spots, 3);
  assert.equal(b.maxDz, 20);
  assert.deepEqual(collarBenches(pit().filter((p) => p.z === 300)), { n: 0, spots: 0, maxDz: 0 });
  // 4 m apart in RL is not a bench (the threshold is 5 m), 6 m off in plan is not one spot
  assert.equal(collarBenches([{ x: 0, y: 0, z: 100 }, { x: 0.5, y: 0, z: 104 }]).n, 0);
  assert.equal(collarBenches([{ x: 0, y: 0, z: 100 }, { x: 6, y: 0, z: 120 }]).n, 0);
  assert.equal(collarBenches([{ x: 0, y: 0, z: 100 }, { x: 4, y: 0, z: 120 }]).n, 2);
});

test("the lowest per spot is the latest floor, the highest the nearest to the original ground; 'all' keeps every collar", () => {
  const low = pickBenchGround(pit(), "lowest");
  assert.equal(low.dropped, 6);
  assert.ok(low.points.every((p) => !/^S1_1$|^S1_2$|^S2_1$|^B290/.test(p.hole_id)));
  assert.equal(low.points.filter((p) => /^B280/.test(p.hole_id)).length, 3);
  const high = pickBenchGround(pit(), "highest");
  assert.equal(high.dropped, 6);
  assert.ok(high.points.every((p) => p.z === 300));
  assert.equal(pickBenchGround(pit(), "all").points.length, 106);
});

test("the surface is measured against its own collars: median, worst with its hole, count over the limit, no-ground ones", () => {
  // a flat terrain at 300 over the field (node grid), the last two columns no ground
  const gridW = 11, gridH = 11, elevations = new Array(gridW * gridH).fill(300);
  const bits = new Uint8Array(Math.ceil((gridW * gridH) / 8));
  for (let j = 0; j < gridH; j++) for (const i of [j * gridW + gridW - 2, j * gridW + gridW - 1]) bits[i >> 3] |= 1 << (i & 7);
  const terrain = { bbox: [1000, 2000, 1200, 2200], gridW, gridH, elevations, noDataMask: Buffer.from(bits).toString("base64") };
  const m = surfaceMisfit(pit(), terrain, 5);
  assert.equal(m.median, 0);
  assert.equal(m.worst.dz, -20);
  assert.match(m.worst.id, /^B280_/);
  assert.equal(m.over, 6); // the 290 and 280 benches
  assert.ok(m.noGround >= 1);
});

test("the Terrain pane wires the choice, the bench note and the misfit", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(src, /const picked = pickBenchGround\(collarPts, benches\.n \? benchMode : "all"\);/);
  assert.match(src, /misfitAt: picked\.points, benchNote(, leftOutNote: collarsOutNote\(projectZPoints\.collarsOut\), spacingFit: true)? \}\);/); // #2987 / #3036 — and the collars left out, the grid fitted to the spacing
  assert.match(src, /const m = surfaceMisfit\(misfitAt, built, BENCH_DZ_M\);/);
  assert.match(src, /benches\.n > 0 && \(/);
});
