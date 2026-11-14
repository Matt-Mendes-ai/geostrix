// TASKS.csv #3373 — 'Re-snapshot with the text at print size' grew a section picture in place under its bound legend and over its bound
// scale bar: they now move with its new edge, as when a plot scale is picked (#2483 followResize)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { followResize } from "../src/lib/layoutPlace.js";

const PX = 96 / 25.4;
// SYNTHETIC page: the review's section at 60.8 x 167.6 mm, its legend right of it, its scale bar under it, a title above
const sec = { id: "s1", type: "image", x: 40, y: 80, w: 60.8 * PX, h: 167.6 * PX, aspect: 60.8 / 167.6 };
const els = [sec,
  { id: "leg", type: "legend", x: 40 + 60.8 * PX + 16, y: 80, w: 170, h: 200, boundViewportId: "s1", items: [] },
  { id: "bar", type: "scale", x: 40, y: 80 + 167.6 * PX + 12, w: 200, h: 40, boundTo: "s1" },
  { id: "ttl", type: "title", x: 40, y: 20, w: 400, text: "Section" }];

test("the re-drawn picture (77.7 x 184.4 mm) moves its legend and scale bar with its new edges", () => {
  const upd = { ...sec, w: 77.7 * PX, h: 184.4 * PX, aspect: 77.7 / 184.4, src: "data:new" };
  const out = followResize(els, "s1", upd);
  const byId = Object.fromEntries(out.map((e) => [e.id, e]));
  assert.equal(byId.s1.src, "data:new");
  assert.ok(byId.leg.x >= byId.s1.x + byId.s1.w, `legend right of the picture: ${byId.leg.x} >= ${byId.s1.x + byId.s1.w}`);
  assert.ok(byId.bar.y >= byId.s1.y + byId.s1.h, `scale bar under it: ${byId.bar.y} >= ${byId.s1.y + byId.s1.h}`);
  assert.deepEqual([byId.ttl.x, byId.ttl.y], [40, 20], "an unbound element stays");
});

test("wired in the re-snapshot path", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /setElements\(\(els\) => \[\.\.\.next\.values\(\)\]\.reduce\(\(acc, upd\) => followResize\(acc, upd\.id, upd\), els\)\);/);
  assert.doesNotMatch(m, /setElements\(\(els\) => els\.map\(\(el\) => next\.get\(el\.id\) \|\| el\)\);/);
});
