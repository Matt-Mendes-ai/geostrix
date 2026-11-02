import test from "node:test";
import assert from "node:assert/strict";
import { tieStarterFurniture, withLiveScaleBars } from "../src/lib/layoutLinks.js";
import { DEFAULT_LAYOUT_ELEMENTS } from "../src/lib/projectFields.js";

const view = { id: "v", type: "viewport", w: 700, h: 400, capW: 700, capH: 400, worldHeightAtTarget: 20000, cameraAzimuthDeg: 30, planView: true, trueScale: true };
test("#1320 the first view takes the starter bar and north arrow, and the bar's label matches its length", () => {
  const page = tieStarterFurniture([...DEFAULT_LAYOUT_ELEMENTS, view], view);
  const bar = page.find((e) => e.type === "scale");
  assert.equal(bar.boundTo, "v");
  assert.equal(bar.pxPerMeter, 400 / 20000);
  assert.ok(bar.meters >= 5000 && bar.meters <= 20000, String(bar.meters));
  assert.equal(page.find((e) => e.type === "north").rotation, 30);
  const live = withLiveScaleBars(page).find((e) => e.type === "scale");
  assert.equal(live.meters, bar.meters); // stable once tied
});
test("#1320 the second view leaves them on the first; a section snapshot takes the bar but no north", () => {
  const once = tieStarterFurniture([...DEFAULT_LAYOUT_ELEMENTS, view], view);
  const other = { ...view, id: "w", cameraAzimuthDeg: 90, worldHeightAtTarget: 100 };
  const twice = tieStarterFurniture([...once, other], other);
  assert.equal(twice.find((e) => e.type === "scale").boundTo, "v");
  assert.equal(twice.find((e) => e.type === "north").rotation, 30);
  const img = { id: "i", type: "image", w: 700, h: 400, worldWidthAtCaptureM: 1400 };
  const page = tieStarterFurniture([...DEFAULT_LAYOUT_ELEMENTS, img], img);
  assert.equal(page.find((e) => e.type === "scale").boundTo, "i");
  assert.equal(page.find((e) => e.type === "north").rotation, undefined);
});
test("#1320 a bar the user added or retyped stays free; a view with no scale changes no bar", () => {
  const added = { id: "s", type: "scale", meters: 100, pxPerMeter: 1.8 };
  assert.equal(tieStarterFurniture([added, view], view)[0], added);
  const typed = { id: "s", type: "scale", meters: 250 };
  assert.equal(tieStarterFurniture([typed, view], view)[0], typed);
  const stock = { id: "s", type: "scale", meters: 100 };
  const noScale = { id: "v", type: "image", w: 700, h: 400 };
  assert.equal(tieStarterFurniture([stock, noScale], noScale)[0], stock);
});
