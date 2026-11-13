// TASKS.csv #2846 — a point survey gridded by minimum curvature (and the spline), not only IDW; #2872 — nodes on multiples of the cell, every
// station inside, the equivalent-source region snapped so the spacing is as typed; #2870 — a gravity grid's notice does not offer RTP
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gridSurvey, surveySplineRequest, gridMethodTag } from "../src/lib/surveyGrid.js";
import { idwGrid, snappedGridExtent, snappedNodeRegion } from "../src/lib/idw.js";

// a smooth synthetic field on scattered stations (a deterministic scatter, ~400 m apart over 8 x 6 km)
const field = (x, y) => -50 + 8 * Math.exp(-(((x - 4000) ** 2) + ((y - 3000) ** 2)) / (2 * 900 ** 2)) + 0.001 * x;
const stations = [];
for (let i = 0; i < 300; i++) { const x = 37.3 + ((i * 2654.435) % 8000), y = 11.1 + ((i * 1597.77) % 6000); stations.push({ x, y, value: field(x, y) }); }

test("#2872 the grid's nodes are on multiples of the cell and cover every station", () => {
  const ext = snappedGridExtent({ xmin: 608037.3277, xmax: 702512.4, ymin: 5324335.2, ymax: 5374479.1122 }, 100);
  assert.deepEqual(ext, { xmin: 607950, xmax: 702650, ymin: 5324250, ymax: 5374550 });
  // first node 608,000 E (was the westernmost station + 50 m), the last row below the southernmost station
  assert.equal(ext.xmin + 50, 608000);
  assert.ok(ext.ymin + 50 <= 5324335.2 && ext.xmax - 50 >= 702512.4);
  // a station exactly on a node keeps its node
  assert.deepEqual(snappedGridExtent({ xmin: 1000, xmax: 2000, ymin: 0, ymax: 500 }, 100), { xmin: 950, xmax: 2050, ymin: -50, ymax: 550 });
  // the equivalent-source region: first and last node, so verde's spacing is the cell exactly
  const r = snappedNodeRegion({ xmin: 608037.3, xmax: 658512.4, ymin: 5324335.2, ymax: 5343100.9 }, 100);
  assert.deepEqual(r, [608000, 658600, 5324300, 5343200]);
  assert.ok(Number.isInteger((r[1] - r[0]) / 100) && Number.isInteger((r[3] - r[2]) / 100));
});

test("#2846 minimum curvature of a survey: nodes on round coordinates, close to the field, smoother than IDW", () => {
  const cell = 100, res = gridSurvey(stations, { cell, blank: 1200, method: "mincurv", tension: 0.25 });
  assert.ok(!res.error, res.error);
  assert.equal(res.cellM, 100);
  assert.equal(res.grid.dx, 100);
  assert.equal(Math.abs(res.grid.x0 % 100), 0); assert.equal(Math.abs(res.grid.yTop % 100), 0); // nodes on multiples of the cell
  let worst = 0, n = 0, rough = 0, roughIdw = 0;
  const xs = stations.map((p) => p.x), ys = stations.map((p) => p.y);
  const ext = snappedGridExtent({ xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: Math.min(...ys), ymax: Math.max(...ys) }, cell);
  const idw = idwGrid(stations, { ...ext, cellSize: cell, power: 2, maxDistance: 1200 });
  const at = (g, nx, x0, yTop, x, y) => g[Math.round((yTop - y) / cell) * nx + Math.round((x - x0) / cell)];
  for (let y = 1000; y <= 5000; y += 100) for (let x = 1000; x <= 7000; x += 100) {
    const v = at(res.grid.values, res.grid.nx, res.grid.x0, res.grid.yTop, x, y);
    if (!Number.isFinite(v)) continue;
    worst = Math.max(worst, Math.abs(v - field(x, y))); n++;
    // the second difference along x: IDW's bull's-eyes make it rough
    const l = at(res.grid.values, res.grid.nx, res.grid.x0, res.grid.yTop, x - 100, y), r = at(res.grid.values, res.grid.nx, res.grid.x0, res.grid.yTop, x + 100, y);
    rough += Math.abs(l - 2 * v + r);
    const vi = at(idw.values, idw.gridW, ext.xmin + 50, ext.ymax - 50, x, y), li = at(idw.values, idw.gridW, ext.xmin + 50, ext.ymax - 50, x - 100, y), ri = at(idw.values, idw.gridW, ext.xmin + 50, ext.ymax - 50, x + 100, y);
    roughIdw += Math.abs(li - 2 * vi + ri);
  }
  assert.ok(n > 2000, `${n} nodes compared`);
  assert.ok(worst < 1.5, `worst ${worst}`); // 8 mGal anomaly, stations ~400 m apart
  assert.ok(rough < roughIdw / 3, `curvature ${rough} vs IDW ${roughIdw}`);
  assert.equal(gridMethodTag("mincurv", 0.25), "min. curvature T0.25");
  assert.equal(gridMethodTag("idw"), "IDW");
});

test("#2846 the spline's request carries every station and the snapped node layout", () => {
  const sp = surveySplineRequest(stations, { cell: 100, blank: 1200 });
  assert.equal(sp.request.op, "spline");
  assert.equal(sp.request.x.length, stations.length);
  assert.equal(sp.request.cell, 100);
  assert.equal(Math.abs(sp.request.x0 % 100), 0);
  assert.equal(gridSurvey(stations.slice(0, 2), { cell: 100, blank: 0, method: "mincurv" }).error, "few");
});

test("wiring: the Point survey box offers the methods, grids minimum curvature in a worker, and names the filters a gravity grid takes", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /<option value="idw">\{tr\("IDW"\)\}<\/option><option value="mincurv">\{tr\("Minimum curvature"\)\}<\/option><option value="spline">/);
  assert.match(g, /const job = gridSurveyAsync\(pts, gOpts\);/);
  assert.match(g, /snappedGridExtent\(\{ xmin: arrMin\(xs\)/);
  assert.match(g, /group === "grav" \? tr\("Gridded .*\(derivatives, continuation…\) work on it\."/);
  const w = fs.readFileSync(new URL("../src/lib/surveyGrid.worker.js", import.meta.url), "utf8");
  assert.match(w, /gridSurvey\(e\.data\.pts, e\.data\.opts\)/);
  const e = fs.readFileSync(new URL("../src/components/EqsGridBox.jsx", import.meta.url), "utf8");
  assert.match(e, /\[xmin, xmax, ymin, ymax\] = snappedNodeRegion\(\{ xmin, xmax, ymin, ymax \}, cellM\);/);
});
