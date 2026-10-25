// TASKS.csv #894 — terrain from survey points or contour lines (lib/terrainFromPoints.js)
import test from "node:test";
import assert from "node:assert/strict";
import { terrainFromPoints, densify, guessXYZ } from "../src/lib/terrainFromPoints.js";
import { decodeNoDataMask, isNoData } from "../src/lib/demFill.js";

let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const nodeXY = (t, i, j) => { const [x0, y0, x1, y1] = t.bbox; return [x0 + (i * (x1 - x0)) / (t.gridW - 1), y1 - (j * (y1 - y0)) / (t.gridH - 1)]; };

test("a plane from scattered points comes back exactly; row 0 is north; the grid keeps the area's aspect", () => {
  const plane = (x, y) => 100 + 0.1 * x + 0.2 * y;
  const pts = [[0, 0], [1000, 0], [0, 600], [1000, 600]].map(([x, y]) => ({ x, y, z: plane(x, y) }));
  for (let i = 0; i < 400; i++) { const x = rnd() * 1000, y = rnd() * 600; pts.push({ x, y, z: plane(x, y) }); }
  const t = terrainFromPoints({ points: pts }, { gridMax: 100 });
  assert.equal(t.gridW, 100); assert.equal(t.gridH, 60);
  assert.deepEqual(t.bbox, [0, 0, 1000, 600]);
  const m = decodeNoDataMask(t.noDataMask);
  let worst = 0, data = 0;
  for (let j = 0; j < t.gridH; j++) for (let i = 0; i < t.gridW; i++) {
    const k = j * t.gridW + i; if (isNoData(m, k)) continue;
    const [x, y] = nodeXY(t, i, j); worst = Math.max(worst, Math.abs(t.elevations[k] - plane(x, y))); data++;
  }
  assert.ok(worst < 1e-9, `max error ${worst}`);
  assert.ok(data / (t.gridW * t.gridH) > 0.9, "most of a well-covered box has data");
  assert.ok(Math.abs(t.elevations[0] - plane(0, 600)) < 1e-9, "node 0 is the north-west corner");
  assert.equal(t.stats.flatPct, 0);
});

test("two survey patches 3 km apart: no ground is invented between them", () => {
  const pts = [];
  for (let i = 0; i < 300; i++) { pts.push({ x: rnd() * 500, y: rnd() * 500, z: 50 }); pts.push({ x: 3500 + rnd() * 500, y: rnd() * 500, z: 80 }); }
  const t = terrainFromPoints({ points: pts }, { gridMax: 200 });
  const m = decodeNoDataMask(t.noDataMask);
  assert.ok(isNoData(m, Math.round(t.gridH / 2) * t.gridW + Math.round(t.gridW / 2)), "the middle of the gap is no-data");
  assert.ok(t.stats.longDropped > 0);
  assert.ok(t.stats.filledCount > 0 && t.stats.filledPct > 0 && Math.abs(t.stats.fillValue - 65) < 15);
});

test("contours of a cone: densified, heights between the contours, the flat top reported", () => {
  const lines = [];
  for (let c = 1; c <= 10; c++) { const R = 500 - c * 45, l = []; for (let a = 0; a <= 64; a++) { const th = (a / 64) * 2 * Math.PI; l.push({ x: R * Math.cos(th), y: R * Math.sin(th), z: c * 10 }); } lines.push(l); }
  const t = terrainFromPoints({ lines }, { gridMax: 101 });
  assert.ok(t.stats.points > t.stats.given, "contours densified");
  // on the x axis at r = 275 (between the 50 m contour at r 275 and...): heights fall with the radius
  const at = (x, y) => { const [x0, , , y1] = t.bbox; const dx = (t.bbox[2] - x0) / (t.gridW - 1), dy = (y1 - t.bbox[1]) / (t.gridH - 1); return t.elevations[Math.round((y1 - y) / dy) * t.gridW + Math.round((x - x0) / dx)]; };
  const z300 = at(300, 0), z150 = at(150, 0);
  assert.ok(z300 > 40 && z300 < 50, `r 300 -> ${z300}`); // between the 40 m (r 320) and 50 m (r 275) contours
  assert.ok(z150 > z300, "higher towards the top");
  assert.ok(t.stats.flatPct > 0, "the top inside the last contour is flat and counted");
  const m = decodeNoDataMask(t.noDataMask);
  assert.ok(isNoData(m, 0), "the corner outside the outer contour is no-data");
});

test("densify, column guessing and the refusals", () => {
  const d = densify([[{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 10 }]], 2.5);
  assert.deepEqual(d.map((p) => p.x), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(d.map((p) => p.z), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual(guessXYZ(["Point", "Easting", "Northing", "Elevation (m)"]), { x: "Easting", y: "Northing", z: "Elevation (m)" });
  assert.deepEqual(guessXYZ(["X", "Y", "RL"]), { x: "X", y: "Y", z: "RL" });
  assert.equal(guessXYZ(["a", "b"]).z, null);
  assert.throws(() => terrainFromPoints({ points: [{ x: 0, y: 0, z: 1 }, { x: 1, y: 1, z: 2 }] }), /At least 3 points/);
  assert.throws(() => terrainFromPoints({ points: [0, 1, 2, 3].map((i) => ({ x: i, y: 0, z: i })) }), /on a line/);
});
