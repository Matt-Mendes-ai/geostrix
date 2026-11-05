// TASKS.csv #1519 — large Geochem plots draw their points on one canvas image; high values drawn last
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/GeochemPlot.jsx", import.meta.url), "utf8");

test("above the threshold the points are one embedded image; below, vector circles", () => {
  assert.match(src, /export const CANVAS_FROM = 4000;/);
  assert.match(src, /if \(ordered\.length <= CANVAS_FROM \|\| typeof document === "undefined"\) return ordered\.map\(/);
  assert.ok(src.includes("cv.toBlob(") && src.includes("fr.readAsDataURL(blob)") && !src.includes("cv.toDataURL("), "encoded off the main thread");
  assert.match(src, /renderPointsImage\(packPoints\(ordered, colorBy\), \{ W, H \}\)/, "drawn and encoded in a worker");
  const w = readFileSync(new URL("../src/lib/geochemPoints.worker.js", import.meta.url), "utf8");
  assert.match(w, /new OffscreenCanvas\(W \* k, H \* k\)/); assert.match(w, /convertToBlob\(\{ type: "image\/png" \}\)/);
  assert.equal((src.match(/useMemo\(\(\) => pointsLayer\(pts, colorBy\), \[pts, colorBy\]\)/g) || []).length, 2, "binary and ternary plots");
});

test("drawing order: ascending by the colour's value, missing values first", () => {
  // the same rule as orderForDrawing, run on plain data
  const body = src.slice(src.indexOf("export function orderForDrawing"), src.indexOf("function pointsLayer"));
  const orderForDrawing = new Function(`${body.replace("export ", "")}; return orderForDrawing;`)();
  const pts = [5, null, 0.1, 9, 2].map((v, i) => ({ i, p: { sample: { v } } }));
  const out = orderForDrawing(pts, (s) => s.v ?? -Infinity).map((q) => q.p.sample.v);
  assert.deepEqual(out, [null, 0.1, 2, 5, 9]);
  assert.equal(orderForDrawing(pts, null), pts);
});

test("GeochemModule gives the element colour a rank", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /fn\.rank = colorMode === "element" && colorEl \?/);
  assert.match(g, /const colorBy = useMemo\(\(\) => \{ const fn = \(sample\) => \{/, "one colour function per colour choice");
  assert.match(g, /const plottedCount = useMemo\(/, "the plotted count is not re-projected every render");
});
