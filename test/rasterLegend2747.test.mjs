// TASKS.csv #2747 (side session 6) — the raster legend: a value raster's ramp carries its unit; a picture raster shows its own colour bar,
// in the 3D figure legend and in the Layout legend
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rasterLegendGroups, legendGroupsToItems } from "../src/lib/legendGroups.js";

const stops = [{ value: 0, color: "#0000ff" }, { value: 1, color: "#ff0000" }];

test("a value raster's ramp says its unit, once", () => {
  const [g] = rasterLegendGroups([{ id: "m", name: "TMI", unit: "nT", colourStops: stops, colourRange: [-300, 900] }]);
  assert.equal(g.label, "TMI (nT)");
  assert.ok(g.ramp);
  const [h] = rasterLegendGroups([{ id: "m", name: "TMI (nT)", unit: "nT", colourStops: stops, colourRange: [0, 1] }]);
  assert.equal(h.label, "TMI (nT)", "not '(nT) (nT)'");
  const [k] = rasterLegendGroups([{ id: "m", name: "Hillshade", colourStops: stops, colourRange: [0, 1] }]);
  assert.equal(k.label, "Hillshade", "no unit known: nothing added");
  const [e] = rasterLegendGroups([{ id: "m", name: "TMI", unit: "nT", colourStops: stops, colourRange: [0, 1], colourStyle: { stretch: "equalise" } }]);
  assert.equal(e.label, "TMI (nT) (equalized)");
});

test("a picture raster with an attached colour bar becomes an image group, and a Layout legend row", () => {
  const src = "data:image/png;base64,AAAA";
  const groups = rasterLegendGroups([{ id: "p", name: "Airborne mag (picture)", legendImage: { dataUrl: src, name: "bar.png" } }, { id: "q", name: "Plain picture" }]);
  assert.deepEqual(groups, [{ key: "raster_p", label: "Airborne mag (picture)", items: [], image: { src } }]);
  assert.deepEqual(legendGroupsToItems(groups), [["Airborne mag (picture)", null, { image: src }]]);
});

test("wired: the 3D figure legend and the Layout legend draw the image", () => {
  const o = readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");
  assert.match(o, /const images = \(legendGroups \|\| \[\]\)\.filter\(\(g\) => g\.image\?\.src\)/);
  assert.match(o, /<img src=\{g\.image\.src\}/);
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /\) : opt\?\.image \? \(/);
  assert.match(m, /<img src=\{opt\.image\}/);
});
