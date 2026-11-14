// TASKS.csv #2134 (review #2013, Layout) — Legend 'Load from view': the frame test covers surface samples and map layers, a one-class
// map layer is keyed by its name, and a legend that cannot fit stops at the sheet's edge and counts what it left out.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { frameTest, samplesInFrame, mapLayersInFrame } from "../src/lib/legendFrame.js";
import { legendFit } from "../src/lib/legendFit.js";
import { mapLayerLegendGroups } from "../src/lib/legendGroups.js";
const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// 1,000 m frame centred at (1000, 1000), 600 x 600 page px (as in legendCap1633)
const vp = { type: "viewport", src: "x", planView: true, trueScale: true, targetWorld: { x: 1000, y: 1000 }, worldHeightAtTarget: 1000, w: 600, h: 600, cameraAzimuthDeg: 0 };
const T = frameTest(vp);

test("only a top-down true-scale frame has a test; samples inside it are kept", () => {
  assert.equal(frameTest({ ...vp, planView: false }), null);
  const s = [{ x: 1100, y: 900, medium: "rock" }, { x: 9000, y: 9000, medium: "soil" }];
  assert.deepEqual(samplesInFrame(T, s).map((r) => r.medium), ["rock"]);
  assert.equal(samplesInFrame(null, s).length, 2); // no frame test: the whole view, as before
});

const line = (x0, y0, x1, y1, RL) => ({ parts: [[[x0, y0], [x1, y1]]], attributes: { RL } });
const ip = { id: "ip", name: "Proposed IP lines", geomType: "polyline", styleField: "RL", categories: [{ value: "1200", color: "#f00" }], features: [line(8000, 0, 8000, 3000, 1200)] };
test("a map layer with no feature in the frame is left out; a line crossing it with no vertex inside is kept", () => {
  assert.equal(mapLayersInFrame(T, [ip]).length, 0);
  const crossing = { ...ip, features: [line(1000, -2000, 1000, 4000, 1200)] }; // both ends 3 km outside, through the middle
  assert.equal(mapLayersInFrame(T, [crossing]).length, 1);
});
test("a polygon the frame sits inside is kept; categories narrow to those inside, with their counts there", () => {
  const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  const geo = { id: "g", name: "Bedrock", geomType: "polygon", styleField: "UNIT", categories: [{ value: "Nicola", color: "#0a0" }, { value: "Takla", color: "#a00" }],
    features: [{ parts: [ring(-5000, -5000, 5000, 5000)], attributes: { UNIT: "Nicola" } }, { parts: [ring(20000, 20000, 21000, 21000)], attributes: { UNIT: "Takla" } }] };
  const [g] = mapLayersInFrame(T, [{ ...geo, allCategories: geo.categories }]);
  assert.deepEqual(g.categories.map((c) => [c.value, c.count]), [["Nicola", 1]]);
  // narrowed to one class by the frame, the unit keeps its own name (not the layer's)
  assert.deepEqual(mapLayerLegendGroups([g])[0].items.map((r) => r[0]), ["Nicola"]);
});
test("a one-class layer is keyed by its name; bare-number classes say the attribute", () => {
  assert.deepEqual(mapLayerLegendGroups([ip])[0].items.map((r) => r[0]), ["Proposed IP lines"]);
  const two = { ...ip, categories: [{ value: "1200", color: "#f00" }, { value: "1400", color: "#00f" }] };
  assert.deepEqual(mapLayerLegendGroups([two])[0].items.map((r) => r[0]), ["RL 1200", "RL 1400"]);
});
test("legendFit holds the columns to the room on the right and counts the rows left out", () => {
  const items = Array.from({ length: 81 }, (_, i) => [`unit ${i}`, "#888"]);
  const opts = { rowH: () => 17, labelW: () => 60, pageW: 1123, pageH: 794 };
  const wide = legendFit(items, { ...opts, x: 40, y: 80 });
  assert.equal(wide.left, 0); // room for 3 columns of 40 rows
  const right = legendFit(items, { ...opts, x: 800, y: 80 }); // the reviewer's case: 4 columns ran past the sheet
  assert.equal(right.cols, 1);
  assert.ok(right.left > 0 && right.shown + right.left === 81 && right.shown * 17 <= 794 - 80 - 30 - 40, JSON.stringify(right));
});
test("wired: both legend paths pass the frame; the notice counts the assumed holes; the legend renders the fitted rows", () => {
  assert.equal((m.match(/frame: (only\.length === 1 \? frameTest\(only\[0\]\) : null|frameTest\(vp\))/g) || []).length, 2);
  assert.match(m, /\.\.\.mapLayerLegendGroups\(shownMapLayers\)/);
  assert.match(m, /holeAttitudeAssumed\(c, surveyed\.has\(c\.hole_id\) \? \[\{\}\] : \[\]\)/);
  assert.match(m, /const legendRow = \(\[name, color, opt\], i\) =>/); // #3395: the rows grouped (a heading with its first row)
  assert.match(m, /pageW: pagePx\(pageFormatOf\(page\)\)\.w/);
  assert.match(m, /assayLegendGroups\(\{ assays: inFrame\(assays\)/);
  assert.match(m, /numericLayerLegendGroups\(\{ layers: frameLayers,/);
});
