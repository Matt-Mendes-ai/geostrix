// TASKS.csv #2483 (3) — a section snapshot resized to a plot scale grew over its own bound scale bar (and legend)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { followResize } from "../src/lib/layoutPlace.js";

const img = { id: "sec", type: "image", x: 40, y: 60, w: 700, h: 395, aspect: 700 / 395 };
const bar = { id: "bar", type: "scale", x: 40, y: 470, w: 260, h: 50, boundTo: "sec" };
const legend = { id: "legend_sec", type: "legend", x: 756, y: 60, boundViewportId: "sec", items: [["Basalt", "#336"]] };
const other = { id: "t", type: "text", x: 40, y: 600, w: 200 };
const loose = { id: "bar2", type: "scale", x: 40, y: 700, boundTo: "elsewhere" };

test("the bound bar below and the bound legend right of it move with the new edges; the rest stay", () => {
  const out = followResize([img, bar, legend, other, loose], "sec", { w: 900, h: 900 / img.aspect });
  const by = Object.fromEntries(out.map((e) => [e.id, e]));
  assert.equal(by.sec.w, 900);
  const dy = Math.round(60 + 900 / img.aspect - (60 + 395));
  assert.equal(by.bar.y, 470 + dy, "the bar keeps its gap under the image");
  assert.equal(by.bar.x, 40);
  assert.equal(by.legend_sec.x, 756 + 200, "the legend keeps its gap right of it");
  assert.equal(by.legend_sec.y, 60);
  assert.equal(by.t, other, "an unbound element is not moved");
  assert.equal(by.bar2, loose);
});

test("a shrink moves them back up / left; a bound element over the image is not moved", () => {
  const out = followResize([img, bar, legend], "sec", { w: 350, h: 350 / img.aspect });
  assert.equal(out.find((e) => e.id === "bar").y, 470 + Math.round(60 + 350 / img.aspect - 455));
  assert.equal(out.find((e) => e.id === "legend_sec").x, 756 - 350);
  const inside = { id: "bar3", type: "scale", x: 100, y: 100, boundTo: "sec" };
  assert.deepEqual(followResize([img, inside], "sec", { w: 900, h: 500 })[1], inside);
  assert.equal(followResize([bar], "nope", { w: 1 }).length, 1, "no such element: unchanged");
});

test("wiring: the plot scale resizes through followResize", () => {
  const s = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(s, /onResize=\{\(next\) => setElements\(\(els\) => followResize\(els, sel\.id, next\)\)\}/);
  assert.match(s, /\(onResize \|\| updateSelected\)\(\{ w, h: w \//);
});
