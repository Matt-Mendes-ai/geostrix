// TASKS.csv #2482 — Export PDF checks every page for elements past the sheet's edge, not only the one on screen; #2309 — on the page on
// screen an element's text counts too; #1773 — the confirm says which kinds of element
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { offSheetElements, offSheetPages, rectsPastSheet } from "../src/lib/layoutEdges.js";

const A4L = { w: 1123, h: 794 }, A4P = { w: 794, h: 1123 };

test("a landscape page switched to portrait: the starter arrow at x 1000 and a half-out rectangle are past the edge", () => {
  const els = [
    { id: "north", type: "north", x: 1000, y: 40 },
    { id: "r", type: "rect", x: 600, y: 300, w: 300, h: 100 },
    { id: "t", type: "text", x: 100, y: 100, text: "a long title that may run" }, // sized by its content: only its start is checked
    { id: "v", type: "viewport", x: 40, y: 40, w: 700, aspect: 2 },
  ];
  assert.deepEqual(offSheetElements(els, A4P).map((e) => e.id), ["north", "r"]);
  assert.deepEqual(offSheetElements(els, A4L), []);
  assert.deepEqual(offSheetElements([{ id: "d", type: "north", x: 1000, y: 40, decl: { convergence: 1 } }], A4L).map((e) => e.id), ["d"]); // the 170 px diagram
});

test("every page but the one on screen, with its name", () => {
  const pages = [
    { id: "p1", name: "Page 1", elements: [{ id: "x", type: "rect", x: 2000, y: 0, w: 10, h: 10 }] },
    { id: "p2", name: "Portrait", elements: [{ id: "north", type: "north", x: 1000, y: 40 }], format: "a4-portrait" },
    { id: "p3", name: "Fine", elements: [{ id: "r", type: "rect", x: 10, y: 10, w: 10, h: 10 }] },
  ];
  const r = offSheetPages(pages, "p1", (pg) => (pg.format === "a4-portrait" ? A4P : A4L));
  assert.deepEqual(r, [{ index: 2, name: "Portrait", items: [{ id: "north", type: "north" }] }]);
});

test("#2309 — a caption past the sheet counts although the element's own box is inside", () => {
  const sheet = { left: 0, top: 0, right: 1123, bottom: 794 };
  assert.equal(rectsPastSheet([{ left: 950, top: 40, right: 1004, bottom: 110 }, { left: 954, top: 140, right: 1140, bottom: 150 }], sheet), true);
  assert.equal(rectsPastSheet([{ left: 950, top: 40, right: 1004, bottom: 110 }], sheet), false);
  assert.equal(rectsPastSheet([{ left: 0, top: 0, right: 0, bottom: 0 }], sheet), false);
});

test("wired into the export's pre-flight", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /rectsPastSheet\(\[e, \.\.\.e\.querySelectorAll\("text"\)\]\.map\(\(n\) => n\.getBoundingClientRect\(\)\), r\)/);
  assert.match(m, /if \(layoutPrintRequest\.kind !== "png"\) for \(const o of offSheetPages\(layoutPages, activeLayoutPageId,/);
  assert.match(m, /Elements reach past the sheet's edge and will be cut off in the export: \{list\}\. Export anyway\?/);
});
