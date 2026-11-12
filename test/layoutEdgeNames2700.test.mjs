// TASKS.csv #2700 — the export's 'past the edge' confirm names each element (its kind and caption) and the side of the sheet it crosses
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offSheetElements, rectSidesPast, elementCaption } from "../src/lib/layoutEdges.js";

const A4P = { w: 794, h: 1123 };

test("each element past the edge comes with the sides it crosses and a caption", () => {
  const els = [
    { id: "n", type: "north", x: 1000, y: 40 },
    { id: "r", type: "rect", x: 600, y: 1100, w: 300, h: 100 },
    { id: "t", type: "text", x: 900, y: 100, text: "Drill plan of the {{hole_id}} area, 2024 programme" },
    { id: "l", type: "legend", x: -20, y: 400, label: "Lithology" },
  ];
  assert.deepEqual(offSheetElements(els, A4P).map((e) => [e.id, e.sides, e.caption]), [
    ["n", ["right"], ""],
    ["r", ["right", "bottom"], ""],
    ["t", ["right"], "Drill plan of the area,…"],
    ["l", ["left"], "Lithology"],
  ]);
});

test("the on-screen rects: the sides any of them cross, in a fixed order", () => {
  const sheet = { left: 10, top: 20, right: 1133, bottom: 814 };
  assert.deepEqual(rectSidesPast([{ left: 950, top: 40, right: 1004, bottom: 110 }, { left: 954, top: 800, right: 1140, bottom: 830 }], sheet), ["right", "bottom"]);
  assert.deepEqual(rectSidesPast([{ left: 5, top: 10, right: 50, bottom: 60 }], sheet), ["left", "top"]);
  assert.deepEqual(rectSidesPast([{ left: 50, top: 50, right: 60, bottom: 60 }], sheet), []);
});

test("a caption is short and leaves placeholders out", () => {
  assert.equal(elementCaption({ text: "  {crs}  Map  " }), "Map");
  assert.equal(elementCaption({}), "");
});

test("wired: the confirm says 'Legend \"…\" past the right edge'", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /tr\("\{what\} past the \{sides\}", \{ what: it\.caption \?/);
  assert.match(m, /tr\("on \{page\}: \{list\}", \{ page: o\.name, list: o\.items\.map\(namePast\)\.join\(", "\) \}\)/);
  for (const k of ["left edge", "top edge", "right edge", "bottom edge"]) assert.match(m, new RegExp(`tr\\("${k}"\\)`));
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["left edge", "top edge", "right edge", "bottom edge", "Image"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
