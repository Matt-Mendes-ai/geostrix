// TASKS.csv #1772 (review #1645, Copley) — an atlas strip log no longer lands on the template's map: the elements it covers give way
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./helpers/viteUrlLoader.mjs", import.meta.url);
const { placeStripLog, makeRoomForStripLog } = await import("../src/lib/atlas.js");

const page = { w: 1123, h: 794 };
const meet = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) + 0.5 && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y) + 0.5;

test("#1772 the Copley template: the map ran to x 1011 under a log at 959; the map and the title are narrowed, nothing overlaps", () => {
  const template = [
    { id: "t", type: "text", x: 40, y: 12, w: 1043, h: 28 },
    { id: "vp", type: "viewport", x: 40, y: 50, w: 971, h: 700, fixedScale: 5000 },
    { id: "nb", type: "northArrow", x: 960, y: 60, w: 40, h: 50 },
  ];
  const box = placeStripLog(template, 0.22, page);
  assert.ok(box.x > 900 && box.x < 960, JSON.stringify(box));
  const r = makeRoomForStripLog(template, box);
  const vp = r.elements.find((e) => e.id === "vp");
  assert.equal(vp.x, 40); assert.equal(vp.w, box.x - 12 - 40);
  assert.equal(vp.fixedScale, 5000, "the scale is kept");
  assert.ok(r.elements.every((e) => !meet(e, box)), "nothing under the log");
  const nb = r.elements.find((e) => e.id === "nb");
  assert.deepEqual([nb.x, nb.w], [box.x - 12 - 40, 40], "the north arrow, too small to narrow, moved aside whole");
  assert.equal(r.elements.find((e) => e.id === "t").w, 1043, "the title above the log's top is left alone");
  assert.deepEqual([r.narrowed, r.overlapping], [2, 0]);
});

test("#1772 an element that can neither keep 40 % of its width nor move is left and counted; a log on the left pushes elements right", () => {
  const stuck = [{ id: "s", x: 120, y: 100, w: 150, h: 60 }]; // a log at x 100-400 over it: no room to its left on the page
  const r = makeRoomForStripLog(stuck, { x: 100, y: 40, w: 300, h: 714 }, { pageW: 500 }); // no room on either side of the log
  assert.deepEqual([r.narrowed, r.overlapping, r.elements[0]], [0, 1, stuck[0]], "cannot narrow or move: left and counted");
  const left = makeRoomForStripLog([{ id: "m", x: 40, y: 50, w: 1000, h: 600 }], { x: 40, y: 40, w: 200, h: 714 });
  assert.deepEqual([left.elements[0].x, left.elements[0].w], [252, 788]);
  const clear = makeRoomForStripLog([{ id: "c", x: 40, y: 50, w: 500, h: 600 }], { x: 900, y: 40, w: 180, h: 714 });
  assert.deepEqual([clear.narrowed, clear.overlapping], [0, 0]);
});

test("#1772 a north arrow (saved with no width, drawn 54 x 70) in the log's column moves to the side with room, never narrowed", () => {
  const r = makeRoomForStripLog([{ id: "n", type: "north", x: 1000, y: 40, w: 0 }], { x: 710, y: 40, w: 373, h: 714 }, { pageW: 1123 });
  assert.deepEqual([r.elements[0].x, r.elements[0].w, r.narrowed, r.overlapping], [710 - 12 - 54, 0, 1, 0]);
});

test("#1772 the atlas page applies it and the modal says what it did", () => {
  const a = readFileSync(new URL("../src/lib/atlas.js", import.meta.url), "utf8");
  assert.ok(a.includes("({ elements, narrowed, overlapping } = makeRoomForStripLog(elements, box, { pageW: (page || {}).w || 1123 }));"));
  const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.ok(m.includes("the template's elements beside it were narrowed on {n} page(s)"));
});
