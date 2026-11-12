// TASKS.csv #2755 (split from #2419) — Grade × thickness on the Maps plan: the per-hole totals of 3D Modelling > Grade × thickness in plan
// (lib/accumulation.js holeTotals, not computed a second time) as graduated circles, and the GT contour as a map layer. SYNTHETIC holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gtRadius, gtLegend, joinSegments, gtContourLayer } from "../src/lib/planGt.js";
import { planGrid, contourSegments } from "../src/lib/accumulation.js";

test("circle area in proportion to GT; 0 is a hollow ring; the legend's three circles", () => {
  assert.equal(gtRadius(100, 100), 11);
  assert.ok(Math.abs(gtRadius(25, 100) - 5.5) < 1e-9); // a quarter of the GT, a quarter of the area: half the radius
  assert.equal(gtRadius(0, 100), null);
  assert.equal(gtRadius(5, 0), null);
  assert.deepEqual(gtLegend(37).map((l) => l.gt), [20, 5, 1]); // 37 -> 20 (1-2-5), a quarter -> 5, a sixteenth -> 1
  assert.ok(gtLegend(37)[0].r < 11); // 20 of a 37 maximum
});

test("contour segments joined into lines; a ring closes on itself", () => {
  // a square ring of 4 segments, given out of order and reversed
  const segs = [[1, 0, 1, 1], [0, 0, 1, 0], [0, 1, 0, 0], [1, 1, 0, 1], [5, 5, 6, 5]];
  const lines = joinSegments(segs);
  assert.equal(lines.length, 2);
  const ring = lines.find((l) => l.length === 5);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test("the GT contour of a planGrid estimate as a polyline map layer (English attributes, the project CRS)", () => {
  const pts = [{ x: 0, y: 0, gt: 0 }, { x: 100, y: 0, gt: 0 }, { x: 0, y: 100, gt: 0 }, { x: 100, y: 100, gt: 0 }, { x: 50, y: 50, gt: 10, thicknessM: 2 }];
  const grid = planGrid(pts.map((p) => ({ ...p, thicknessM: p.thicknessM || 0 })), { cell: 10, radius: 80, pad: 0 });
  const segs = contourSegments(grid, grid.gt, 5);
  assert.ok(segs.length > 4);
  const L = gtContourLayer(segs, { level: 5, label: "m·ppm", symbol: "U", cellM: grid.cell });
  assert.equal(L.geomType, "polyline");
  assert.equal(L.name, "GT 5 m·ppm contour (U)");
  assert.deepEqual(L.features[0].attributes, { GT: 5, unit: "m·ppm", element: "U" });
  assert.ok(L.features.length < segs.length); // joined
  assert.ok(L.bbox[0] > 0 && L.bbox[2] < 100); // around the 50 / 50 hole
  assert.equal(gtContourLayer([], { level: 5, label: "m%", symbol: "U" }), null);
});

test("the modal sends holeTotals' per-hole totals and adds the contour; the plan draws and clears them", () => {
  const m = readFileSync(new URL("../src/components/GradeThicknessModal.jsx", import.meta.url), "utf8");
  assert.match(m, /showGtOnPlan\(\{ symbol: ox \? ox\.oxide : symbol, label: gtLabel,[^]*?holes: \[\.\.\.totals\.holes\.filter\(\(h\) => Number\.isFinite\(h\.x\)\), \.\.\.totals\.zeros\]/);
  assert.match(m, /gtContourLayer\(contour, \{ level: gtc, label: gtLabel, symbol: ox \? ox\.oxide : symbol, cellM: grid\?\.cell \}\); if \(l\) \{ addMapLayer\(l\);/);
  const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(p, /const gtPlan = usePlanGt\(\);/);
  assert.match(p, /const r = gtRadius\(h\.gt, gtMax\);/);
  assert.match(p, /onClick=\{\(\) => showGtOnPlan\(null\)\}/);
  assert.match(p, /measuring, mPts, gtPlan, gtMax\]\);/);
});
