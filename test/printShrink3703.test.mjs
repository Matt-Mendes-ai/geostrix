// TASKS.csv #3703 — an element past the right edge of any page with another page after it shrank EVERY page of the PDF / PNG
// (by sheet width / its left edge + 1 px: a title block left at x 1,252 px on an A4 page gave 89.6 %). The #3656 clip box held only
// on the last page. Measured in Electron's printToPDF: contain: strict on the clip box prints every page at true size; and an
// element wholly outside its sheet is not laid out in the print at all. The warnings say plainly what is left out.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { whollyOffSheet, offSheetElements, rectsWhollyOff } from "../src/lib/layoutEdges.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const A4L = { w: 1123, h: 794 };

test("an element wholly outside the sheet, by its box or by where it starts", () => {
  // the rehearsal's title block (content-sized: no stored height) left at x 1,252 when Tabloid became A4
  assert.equal(whollyOffSheet({ type: "titleblock", x: 1252, y: 717, w: 340 }, A4L), true);
  assert.equal(whollyOffSheet({ type: "text", x: 1509, y: 100 }, A4L), true);
  assert.equal(whollyOffSheet({ type: "text", x: 40, y: 800 }, A4L), true); // below the foot
  assert.equal(whollyOffSheet({ type: "rect", x: -300, y: 10, w: 200, h: 50 }, A4L), true); // left of the sheet, by its box
  assert.equal(whollyOffSheet({ type: "rect", x: -100, y: 10, w: 200, h: 50 }, A4L), false); // across the left edge
  assert.equal(whollyOffSheet({ type: "text", x: 1000, y: 100 }, A4L), false); // starts on the sheet: it prints, cut at the edge
  assert.equal(whollyOffSheet({ type: "text", x: -50, y: 100 }, A4L), false); // content-sized, starting left: its size is not known
  assert.equal(whollyOffSheet({ type: "rect", x: 1300, y: 10, w: 50, h: 50, rotation: 90 }, A4L), false); // a turned box may come back
  assert.equal(whollyOffSheet({ type: "arrow", x: 1200, y: 100, angle: 180, length: 300 }, A4L), false); // an arrow can point back in
  assert.equal(whollyOffSheet({ type: "north", x: 1140, y: 40 }, A4L), false); // its captions run a little outside its box
  assert.equal(whollyOffSheet({ type: "north", x: 1200, y: 40 }, A4L), true);
});

test("the export's list marks which elements will not print at all", () => {
  const items = offSheetElements([{ id: "tb", type: "titleblock", x: 1252, y: 717, w: 340 }, { id: "lg", type: "rect", x: 1000, y: 10, w: 300, h: 50 }, { id: "ok", type: "rect", x: 10, y: 10, w: 10, h: 10 }], A4L);
  assert.deepEqual(items.map((it) => [it.id, it.sides, it.out]), [["tb", ["right"], true], ["lg", ["right"], false]]);
});

test("the page on screen: wholly outside only when the element and all its text are off the sheet", () => {
  const sheet = { left: 0, top: 0, right: 1123, bottom: 794 };
  assert.equal(rectsWhollyOff([{ left: 1252, top: 717, right: 1592, bottom: 950 }], sheet), true);
  assert.equal(rectsWhollyOff([{ left: 1252, top: 717, right: 1592, bottom: 950 }, { left: 1100, top: 720, right: 1260, bottom: 730 }], sheet), false);
  assert.equal(rectsWhollyOff([{ left: 1000, top: 10, right: 1300, bottom: 60 }], sheet), false);
  assert.equal(rectsWhollyOff([{ left: 0, top: 0, right: 0, bottom: 0 }], sheet), false); // nothing drawn
});

test("the print root contains every page's clip box and leaves out what is wholly outside the sheet", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  assert.match(l, /<div className="ge-print-clip" style=\{\{ position: "absolute", inset: 0, overflow: "hidden", contain: "strict" \}\}>/);
  assert.match(l, /\{withLiveScaleBars\(pg\.elements\)\.filter\(\(el\) => !whollyOffSheet\(el, pagePx\(f\)\)\)\.map\(/);
});

test("the warnings say plainly what is left out, in every language", () => {
  const l = read("../src/modules/LayoutModule.jsx");
  const keys = [
    "{what} wholly outside the sheet (past the {sides}): not printed",
    "{what} past the {sides}: the part outside is cut off",
    "Some elements reach past the sheet's edge ({list}): what lies outside is left out, and pages print at true size. Export anyway?",
    "This element lies wholly outside the sheet (past its {sides}): it is left out of the export. Move it back onto the sheet, or delete it.",
    "Part of this element reaches past the sheet's {sides}: that part is left out of the export, the rest prints. Move it, or make it smaller.",
  ];
  for (const k of keys) {
    assert.ok(l.includes(JSON.stringify(k)), k);
    for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k}`);
  }
  assert.doesNotMatch(l, /will be cut off in the export/); // the old wording, which did not say every page was reduced
});
