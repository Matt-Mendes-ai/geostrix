// TASKS.csv #2606 — adding an oblique 3D viewport to a drill-plan page turned the page's north arrow 45 degrees and rewrote the title
// block's Scale to the oblique view's estimate; the arrow and the scale now stay with the map.
import test from "node:test";
import assert from "node:assert/strict";
import { tieStarterFurniture } from "../src/lib/layoutLinks.js";
import { pageScaleText } from "../src/lib/layoutGeometry.js";

const plan = { id: "dp", type: "drillplan", scale: 25000, x: 40, y: 40, w: 600, h: 400 };
const oblique = { id: "vp", type: "viewport", src: "data:image/png;base64,x", planView: false, trueScale: false, cameraAzimuthDeg: 45, worldHeightAtTarget: 3000, capturedW: 800, capturedH: 600, w: 400, h: 300 };
const north = { id: "north", type: "north", x: 700, y: 40 };

test("the north arrow stays with the drill plan when an oblique view is added", () => {
  const out = tieStarterFurniture([plan, north, oblique], oblique);
  const n = out.find((e) => e.id === "north");
  assert.equal(n.rotation, undefined); assert.equal(n.boundTo, undefined);
  // on a page without a map, an oblique view still takes it (as before)
  const alone = tieStarterFurniture([north, oblique], oblique).find((e) => e.id === "north");
  assert.equal(alone.boundTo, "vp");
});

test("the page's scale is the drill plan's, not the oblique estimate", () => {
  assert.equal(pageScaleText([plan, oblique]), `1 : ${(25000).toLocaleString()}`);
  assert.match(pageScaleText([oblique]), /oblique view/);
});
