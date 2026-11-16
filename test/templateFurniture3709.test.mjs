// TASKS.csv #3709 — a template saved from a section sheet kept that section's scale bar (marked 200 m: 275 m long at the next
// section's scale), its 'Looking N' label and its legend, linked to nothing; the next section sat beside two legends. What described
// ONE picture now goes with it: the bar back to the starter's untouched 100 m, the label back to the north arrow it replaced, the
// picture's legend dropped, so the next picture ties to them as it does on the starter page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { templateElements, furnitureOfOnePictureReset } from "../src/lib/layoutTitleBlock.js";
import { tieStarterFurniture } from "../src/lib/layoutLinks.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sectionSheet = () => [
  { id: "img1", type: "image", sectionTabId: "s1", sectionAzimuth: 109, worldWidthAtCaptureM: 1000, x: 100, y: 100, w: 600, h: 400 },
  { id: "scale", type: "scale", x: 40, y: 681, meters: 200, pxPerMeter: 0.795, boundTo: "img1" },
  { id: "look_img1", type: "text", x: 940, y: 40, w: 160, text: "Looking N19E", boundTo: "img1" },
  { id: "legend_img1", type: "legend", x: 800, y: 300, items: [["a", "#f00"]], boundViewportId: "img1", loadedItems: [["a", "#f00"]], loadedCapturedAt: 5 },
  { id: "manual", type: "legend", x: 10, y: 10, items: [["x", "#00f"]] },
  { id: "credits", type: "text", x: 40, y: 739, text: "{credits}" },
];

test("saving: the picture's bar, label and legend are reset or left out; a hand-made legend stays", () => {
  const t = templateElements(sectionSheet());
  const byId = Object.fromEntries(t.elements.map((e) => [e.id, e]));
  assert.deepEqual(t.elements.map((e) => e.id).sort(), ["credits", "manual", "north", "scale"]);
  assert.equal(byId.scale.meters, 100); assert.equal(byId.scale.pxPerMeter, undefined); assert.equal(byId.scale.boundTo, null);
  assert.equal(byId.north.type, "north"); assert.equal(byId.north.x, 1017); // the label (940) sat LOOK_SHIFT (77) px left of the arrow it replaced
  assert.equal(t.dropped, 1);
});

test("the next picture ties to the reset furniture, as on the starter page", () => {
  const t = templateElements(sectionSheet()).elements;
  const next = { id: "img2", type: "image", sectionTabId: "s2", sectionAzimuth: 20, worldWidthAtCaptureM: 1500, capturedW: 900, capturedH: 600, x: 100, y: 100, w: 900, h: 600 };
  const tied = tieStarterFurniture([...t, next], next);
  const bar = tied.find((e) => e.id === "scale"), look = tied.find((e) => /^look_/.test(e.id));
  assert.equal(bar.boundTo, "img2"); assert.ok(bar.pxPerMeter > 0);
  assert.match(look.text, /^Looking /); assert.equal(look.boundTo, "img2"); assert.equal(look.text, "Looking N70°W");
});

test("loading a template saved before: an unbound bar with a picture's scale, an orphan label and a picture's legend are repaired", () => {
  const r = furnitureOfOnePictureReset([
    { id: "scale", type: "scale", x: 40, y: 681, meters: 200, pxPerMeter: 0.795, boundTo: null },
    { id: "look_img1", type: "text", x: 940, y: 40, text: "Looking N", boundTo: null },
    { id: "legend_img1", type: "legend", items: [["a", "#f00"]], boundViewportId: null, loadedItems: [["a", "#f00"]], loadedCapturedAt: 5 },
    { id: "legend2", type: "legend", items: [["m", "#000"]], boundViewportId: null },
    { id: "bound", type: "scale", meters: 50, pxPerMeter: 1, boundTo: "vp" }, // a bar bound to a viewport the template keeps: untouched
  ]);
  assert.deepEqual(r.map((e) => [e.id, e.type]), [["scale", "scale"], ["north", "north"], ["legend2", "legend"], ["bound", "scale"]]);
  assert.equal(r[0].meters, 100); assert.equal(r[0].pxPerMeter, undefined);
  assert.equal(r[3].meters, 50);
});

test("a second 'north' is not made when the page already has one", () => {
  const r = furnitureOfOnePictureReset([{ id: "north", type: "north", x: 1000, y: 40 }, { id: "look_x", type: "text", x: 900, y: 40, text: "Looking N", boundTo: null }]);
  assert.deepEqual(r.map((e) => e.id), ["north"]);
});

test("wired: a template's elements pass through the reset when loaded", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /relinkCopies\(furnitureOfOnePictureReset\(tpl\.elements\)\.map\(/);
});
