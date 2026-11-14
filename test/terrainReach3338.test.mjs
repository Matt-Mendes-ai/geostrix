// TASKS.csv #3338 (Galore Creek review) — Terrain from the collars drew 41.5 km² of ground in alpine relief, 61 % of it more than 500 m from any
// collar (2.4 km at most), and said 'no ground is invented across gaps in the data': the long-edge limit is 10 x the median edge (6.3 km
// there). The project's terrain now blanks the nodes further than a reach from every point (auto, or typed in metres), and the message says
// how far the ground reaches from its nearest point.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { terrainFromPoints, REACH_SPACINGS, REACH_FLOOR_M } from "../src/lib/terrainFromPoints.js";
import { decodeNoDataMask, isNoData } from "../src/lib/demFill.js";
const masked = (t) => { const m = t.noDataMask ? decodeNoDataMask(t.noDataMask) : null; return (k) => !!m && isNoData(m, k); };

// one drilled cluster (25 collars in 1.5 km) and 10 far-flung areas of 1-6 holes over 10 km, as on Galore
const pts = [];
let s = 11;
const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
for (let i = 0; i < 25; i++) pts.push({ x: 10000 + r() * 1500, y: 20000 + r() * 1500, z: 900 + r() * 200 });
for (const [ax, ay] of [[14000, 20500], [10500, 24000], [7000, 18000], [13000, 16500], [16000, 23500], [8000, 23000], [12000, 26000], [17000, 18000], [6000, 21000], [15000, 27000]]) {
  const n = 1 + Math.floor(r() * 6);
  for (let k = 0; k < n; k++) pts.push({ x: ax + r() * 300, y: ay + r() * 300, z: 500 + r() * 1000 });
}
// the hand measure: every ground node's distance to its nearest point
const reachOf = (t) => {
  const [x0, , x1, y1] = t.bbox, dx = (x1 - x0) / (t.gridW - 1), dy = (y1 - t.bbox[1]) / (t.gridH - 1);
  let max = 0;
  const off = masked(t);
  for (let j = 0; j < t.gridH; j++) for (let i = 0; i < t.gridW; i++) {
    if (off(j * t.gridW + i)) continue;
    const px = x0 + i * dx, py = y1 - j * dy;
    let d = Infinity;
    for (const p of pts) d = Math.min(d, Math.hypot(p.x - px, p.y - py));
    if (d > max) max = d;
  }
  return max;
};

test("without a reach the ground runs kilometres from any point, and the stats say how far", () => {
  const t = terrainFromPoints({ points: pts }, { gridMax: 120, spacingFit: true });
  assert.equal(t.stats.reachM, null);
  assert.ok(t.stats.reachMaxM > 2000, `${t.stats.reachMaxM}`);
  assert.ok(Math.abs(t.stats.reachMaxM - reachOf(t)) < 1, "matches a brute-force nearest-point search");
  assert.ok(t.stats.reachMedianM > 0 && t.stats.reachMedianM < t.stats.reachMaxM);
});

test("auto: five spacings, at least two nodes and 500 m; every node left is within it", () => {
  const t = terrainFromPoints({ points: pts }, { gridMax: 120, spacingFit: true, reach: "auto" });
  assert.equal(t.stats.reachM, Math.max(REACH_SPACINGS * t.stats.spacingM, 2 * t.stats.cellM, REACH_FLOOR_M));
  assert.ok(t.stats.beyondReach > 0);
  assert.ok(reachOf(t) <= t.stats.reachM + 1e-6);
  assert.ok(t.stats.reachMaxM <= t.stats.reachM);
});

test("a typed reach; every point keeps its ground", () => {
  const t = terrainFromPoints({ points: pts }, { gridMax: 120, spacingFit: true, reach: 1000 });
  assert.equal(t.stats.reachM, 1000);
  assert.ok(reachOf(t) <= 1000 + 1e-6);
  const [x0, , x1, y1] = t.bbox, dx = (x1 - x0) / (t.gridW - 1), dy = (y1 - t.bbox[1]) / (t.gridH - 1);
  const off = masked(t);
  for (const p of pts) { // the four nodes of each point's cell hold ground
    const i = Math.min(t.gridW - 2, Math.floor((p.x - x0) / dx)), j = Math.min(t.gridH - 2, Math.floor((y1 - p.y) / dy));
    for (const k of [j * t.gridW + i, j * t.gridW + i + 1, (j + 1) * t.gridW + i, (j + 1) * t.gridW + i + 1]) assert.ok(!off(k), `node by ${p.x},${p.y}`);
  }
});

test("soil lines 200 m apart with samples every 25 m keep the ground between their lines under auto", () => {
  const soil = [];
  for (let l = 0; l < 8; l++) for (let k = 0; k < 60; k++) soil.push({ x: 1000 + k * 25, y: 5000 + l * 200, z: 300 + k * 0.5 + l });
  const t = terrainFromPoints({ points: soil }, { gridMax: 120, spacingFit: true, reach: "auto" });
  assert.equal(t.stats.beyondReach, 0);
});

test("the message no longer says no ground is invented; it says the reach, and the reach is set in the Terrain pane", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.ok(!g.includes("so no ground is invented across gaps in the data"));
  assert.match(g, /tr\("The ground reaches up to \{max\} m from its nearest point \(median \{med\} m\): beyond the points it is the triangles' guess\."/);
  assert.match(g, /reach: Number\(reachText\) > 0 \? Number\(reachText\) : "auto"/);
  assert.match(g, /aria-label=\{tr\("Ground reaches at most \(m from a sample or collar\)"\)\}/);
});
