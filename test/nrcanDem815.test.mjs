// TASKS.csv #815 — NRCan MRDEM-30 / HRDEM terrain: the level choice, the lon/lat node grid in Canada Atlas Lambert, and
// the sampling of a projected window (mean or bilinear, no data, fill only the gaps)
import test from "node:test";
import assert from "node:assert/strict";
import { pickLevel, nodeGrid, sampleWindow } from "../src/lib/nrcanDem.js";
import { pointTransform } from "../src/lib/reproject.js";

test("#815 the coarsest overview whose pixels are at most half the node spacing", () => {
  const levels = [1, 2, 4, 8, 16, 32].map((s) => ({ w: 500000 / s }));
  assert.equal(pickLevel(levels, 1, 30).scale, 8); // 8 m <= 15 m
  assert.equal(pickLevel(levels, 1, 1.5).scale, 1); // finer than any overview: full resolution
  assert.equal(pickLevel(levels, 1, 1000).scale, 32);
  assert.equal(pickLevel([{ w: 100 }, { w: 50 }], 30, 50).scale, 1); // MRDEM: 60 m > 25 m, so 30 m
});

const T = pointTransform(4326, 3979);
const area = { lonMin: -125.12, latMin: 51.78, lonMax: -125.02, latMax: 51.84 }; // Perk-Rocky

test("#815 the node grid in EPSG:3979 matches proj4 node by node and boxes all nodes", () => {
  const g = nodeGrid(area, 11, 7, T);
  const [x, y] = T(area.lonMin + 3 * g.dLon, area.latMax - 2 * g.dLat);
  assert.ok(Math.abs(g.xs[2 * 11 + 3] - x) < 1e-6 && Math.abs(g.ys[2 * 11 + 3] - y) < 1e-6);
  for (let i = 0; i < g.xs.length; i++) assert.ok(g.xs[i] > g.box[0] && g.xs[i] < g.box[2] && g.ys[i] > g.box[1] && g.ys[i] < g.box[3]);
  assert.ok(Math.abs(g.nodeM - Math.min(g.dLon * 111320 * Math.cos(51.81 * Math.PI / 180), g.dLat * 110574)) < 1e-9);
});

// a synthetic DEM window in EPSG:3979: z = 1000 + 0.01 x' + 0.02 y' over the box, in pixels of `px` metres
function planeWindow(g, px, hole = null) {
  const [x0, y0, x1, y1] = g.box;
  const w = Math.ceil((x1 - x0) / px) + 2, h = Math.ceil((y1 - y0) / px) + 2;
  const ox = x0 - px, oy = y1 + px, data = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const X = ox + (c + 0.5) * px, Y = oy - (r + 0.5) * px;
    data[r * w + c] = hole && hole(X, Y) ? -32767 : 1000 + 0.01 * (X - x0) + 0.02 * (Y - y0);
  }
  return { data, w, h, ox, oy, rx: px, ry: -px };
}
const truth = (g, i) => 1000 + 0.01 * (g.xs[i] - g.box[0]) + 0.02 * (g.ys[i] - g.box[1]);

test("#815 sampling reproduces a plane: bilinear (fine nodes) and box mean (coarse nodes)", () => {
  for (const [n, px, how] of [[200, 30, "bilinear"], [60, 8, "mean"]]) {
    const g = nodeGrid(area, n, n, T);
    const out = new Float32Array(n * n).fill(NaN);
    const k = sampleWindow(out, planeWindow(g, px), g);
    assert.equal(k, n * n, how);
    let worst = 0;
    for (let i = 0; i < out.length; i++) worst = Math.max(worst, Math.abs(out[i] - truth(g, i)));
    // a box of whole pixels can sit up to half a pixel off the node: at most px/2 x the gradient (0.03 here)
    assert.ok(worst < (how === "mean" ? 0.5 * px * 0.03 + 0.01 : 0.05), `${how}: worst ${worst}`);
  }
});

test("#815 no data stays a gap, and a second source fills only the gaps (HRDEM first, MRDEM-30 after)", () => {
  const n = 40, g = nodeGrid(area, n, n, T);
  const midX = (g.box[0] + g.box[2]) / 2;
  const lidar = planeWindow(g, 4, (X) => X > midX); // lidar only on the west half
  for (let i = 0; i < lidar.data.length; i++) if (lidar.data[i] > -1000) lidar.data[i] += 5; // tell the sources apart
  const out = new Float32Array(n * n).fill(NaN);
  const a = sampleWindow(out, lidar, g);
  assert.ok(a > 0.3 * n * n && a < 0.7 * n * n, `${a} lidar nodes`);
  for (let i = 0; i < out.length; i++) if (!Number.isNaN(out[i])) {
    assert.ok(g.xs[i] < midX + g.nodeM, "lidar only where flown");
    if (g.xs[i] < midX - g.nodeM) assert.ok(Math.abs(out[i] - truth(g, i) - 5) < 0.07); // (a node at the edge averages its flown half)
  }
  const b = sampleWindow(out, planeWindow(g, 30), g);
  assert.equal(a + b, n * n);
  for (let i = 0; i < out.length; i++) if (g.xs[i] > midX + g.nodeM) assert.ok(Math.abs(out[i] - truth(g, i)) < 0.5, "MRDEM-30 fills the east half");
});
