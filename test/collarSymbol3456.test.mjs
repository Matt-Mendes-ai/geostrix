// TASKS.csv #3456 / #3457 (Galore Creek review) — the collar map had one symbol: a shape by a collar field of up to 5 values, a size by the value's class
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarShapeFields, collarShapes, collarColouring } from "../src/lib/collarMapStyle.js";
import { dotKey, dotsInView, drawShapedDots, shapePath, SIZE_SCALE } from "../src/lib/planDots.js";

// SYNTHETIC: 32 geotechnical, 12 exploration, 5 condemnation holes (the review's counts) and 8 purposes' worth of other field
const purposes = [...Array(32).fill("Geotechnical"), ...Array(12).fill("Exploration"), ...Array(5).fill("Condemnation")];
const collars = purposes.map((p, i) => ({ hole_id: `H${i}`, x: i * 10, y: 0, attrs: { DH_HOLE_PURPOSE: p, DH_RIG_ID: `R${i % 9}`, TYPE: i % 2 ? "DD" : "RC" } }));

test("shape fields are those of 2-5 values; the commonest value gets the first shape, with its count", () => {
  assert.deepEqual(collarShapeFields(collars).map((f) => [f.key, f.values]), [["DH_HOLE_PURPOSE", 3], ["TYPE", 2]]); // DH_RIG_ID has 9
  const s = collarShapes(collars, "DH_HOLE_PURPOSE");
  assert.deepEqual(s.legend, [{ label: "Geotechnical", shape: 0, count: 32 }, { label: "Exploration", shape: 1, count: 12 }, { label: "Condemnation", shape: 2, count: 5 }]);
  assert.equal(s.shapeOf(collars[40]), 1);
  assert.equal(collarShapes(collars, "DH_RIG_ID"), null); // 9 values: not a shape field
});

test("size by the value's class: the quintile of each hole, five classes, none for a hole with no value", () => {
  const vals = new Map(collars.slice(0, 30).map((c, i) => [c.hole_id, i * 10]));
  const col = collarColouring(collars, { values: vals });
  assert.equal(col.classes, 5);
  assert.deepEqual([0, 29].map((i) => col.classOf(collars[i])), [0, 4]);
  assert.equal(col.classOf(collars[40]), -1);
  assert.deepEqual(SIZE_SCALE.length, 5); assert.ok(SIZE_SCALE.every((v, i) => i === 0 || v > SIZE_SCALE[i - 1]));
});

test("a shaped dot's key groups by colour, shape and size; each group is one path; a ring for no colour", () => {
  const keyOf = (c) => dotKey(c.hole_id === "H0" ? "" : "#2e7d32", c.attrs.TYPE === "DD" ? 1 : 0, c.hole_id === "H1" ? 4 : 2);
  const g = dotsInView(collars.slice(0, 4), keyOf, (x) => x, (y) => y, 1000, 1000, 5);
  assert.deepEqual([...g.keys()].sort(), ["#2e7d32|0|2", "#2e7d32|1|4", "|0|2"].sort().concat(["#2e7d32|1|2"]).sort());
  const calls = [];
  const ctx = new Proxy({}, { get: (_, k) => (k === "beginPath" ? () => calls.push("path") : k === "fill" ? () => calls.push("fill") : k === "stroke" ? () => calls.push("stroke") : () => {}), set: () => true });
  drawShapedDots(ctx, g, { r: 3, halo: false });
  assert.equal(calls.filter((c) => c === "path").length, 4);
  // every shape builds a path without throwing, at its own extent
  const pts = [];
  for (let s = 0; s < 5; s++) shapePath({ rect: (x, y, w, h) => pts.push([s, x, y, w, h]), moveTo: (x, y) => pts.push([s, x, y]), lineTo: (x, y) => pts.push([s, x, y]), arc: (x, y, r) => pts.push([s, x, y, r]), closePath() {} }, s, 10, 10, 4);
  assert.equal(new Set(pts.map((p) => p[0])).size, 5);
});

test("wired: the chip offers Shape by and Size by, the plan draws shaped dots, the legend shows glyphs and sized swatches", () => {
  const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /aria-label=\{tr\("Shape collars by"\)\}/);
  assert.match(p, /tr\("Size by the value's class"\)/);
  assert.match(p, /if \(shapes \|\| sized\) \{/);
  assert.match(p, /<ShapeGlyph shape=\{l\.shape\} \/>/);
  assert.match(p, /width: 9 \* \(sizeBy && colouring\.kind === "number" \? SIZE_SCALE\[li\]/);
});
