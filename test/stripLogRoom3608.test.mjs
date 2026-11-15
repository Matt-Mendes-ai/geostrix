// TASKS.csv #3608 (Fireweed rehearsal) — a strip log sent with 'Add to Layout' landed over the section sheet's legend, scale bar and most of its title block (the free-space test looked at map
// frames only). freeSpot already finds the least-covered spot when nothing is free; spotIsFree says it was not, and then the picture goes to a new page of the page's paper.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { freeSpot, spotIsFree } from "../src/lib/layoutPlace.js";

const A4 = { w: 1123, h: 794 };
test("a tall picture beside a title block, a legend and a scale bar finds no free spot; on an empty page it does", () => {
  const furniture = [
    { id: "tb", type: "titleblock", x: 700, y: 300, w: 380, h: 440 },
    { id: "lg", type: "legend", x: 700, y: 40, w: 380, h: 240 },
    { id: "sb", type: "scale", x: 40, y: 700, w: 640, h: 50 },
    { id: "img", type: "image", x: 40, y: 40, w: 640, h: 640 },
  ];
  const w = 400, h = 640, spot = freeSpot(furniture, w, h, A4);
  assert.equal(spotIsFree(furniture, spot, w, h), false);
  const empty = freeSpot([], w, h, A4); assert.equal(spotIsFree([], empty, w, h), true);
});

test("wired: the picture with no free room takes a new page with its own notice, in four languages", () => {
  const src = fs.readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /if \(!spotIsFree\(placedSoFar, spot, w, h\)\) noRoom\.add\(img\.id\)/);
  const key = "The picture has no free room on this page (it would cover the title block, legend, scale bar or text), so it is on a new page, \"{name}\".";
  assert.ok(src.includes('tr("The picture has no free room on this page (it would cover the title block, legend, scale bar or text), so it is on a new page, \\"{name}\\".", { name })'));
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))[key], l);
});
