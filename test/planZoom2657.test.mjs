// TASKS.csv #2657 — 'Zoom to' on the raster, boundary and claim cards of the Maps tab frames that layer on the Maps plan
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { polylinesBox, viewForBox } from "../src/lib/planZoom.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#2657 a layer's box and the view that frames it", () => {
  assert.deepEqual(polylinesBox([[{ x: 10, y: 20 }, { x: 30, y: 5 }], [{ x: -4, y: 50 }]]), [-4, 5, 30, 50]);
  assert.equal(polylinesBox([]), null);
  const v = viewForBox([400000, 6500000, 404000, 6502000], 800, 600); // 4 x 2 km in 800 x 600 px
  assert.deepEqual([v.cx, v.cy], [402000, 6501000]);
  assert.ok(Math.abs(v.mPerPx - 5 * 1.08) < 1e-9); // width-limited: 4,000 m / 800 px, with the 8 % margin
  assert.ok(Math.abs(viewForBox([0, 0, 0, 0], 800, 600).mPerPx - (200 / 600) * 1.08) < 1e-9); // a point gets 200 m
});

test("#2657 the cards ask, the plan listens", () => {
  assert.match(read("components/MapsPlanView.jsx"), /usePlanZoom\(\(bbox\) => setView\(viewForBox\(bbox, size\.w, size\.h\)\)\)/);
  assert.match(read("modules/RasterModule.jsx"), /onClick=\{\(\) => requestPlanZoom\(r\.bbox\)\}/);
  const g = read("modules/GeophysicsModule.jsx");
  assert.match(g, /onClick=\{\(\) => requestPlanZoom\(polylinesBox\(b\.polylines\)\)\}/);
  assert.match(g, /onClick=\{\(\) => requestPlanZoom\(polylinesBox\(c\.polylines\)\)\}/);
});
