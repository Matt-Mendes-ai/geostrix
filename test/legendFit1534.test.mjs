// TASKS.csv #1534 — the 3D figure legend ran under the scale-bar card on Lawyers (Mag. susc. and Specific gravity behind it)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/ViewportFigureOverlay.jsx", import.meta.url), "utf8");

test("the legend gives up rows (ramps last) until it ends above the scale bar, and counts them", () => {
  assert.match(s, /const limit = scaleRef\.current \? scaleRef\.current\.getBoundingClientRect\(\)\.top - 6 :/);
  assert.match(s, /setFit\(\(f\) => \(f\.items > 1 \? \{ \.\.\.f, items: f\.items - 1 \} : f\.ramps > 1 \? \{ \.\.\.f, ramps: f\.ramps - 1 \} : f\)\)/);
  assert.match(s, /const hiddenCount = total - shown\.length \+ \(allRamps\.length - ramps\.length\);/);
  assert.match(s, /<div ref=\{scaleRef\} style=\{\{ \.\.\.card, position: "absolute", bottom: 12/);
});

test("hooks sit above the early return, and the reset keys on a string (no update loop)", () => {
  const ret = s.indexOf("if (!config.enabled) return null;");
  for (const h of ["useState({ items: MAX_LEGEND_ITEMS", "new ResizeObserver(", "useLayoutEffect(() => { setFit("]) assert.ok(s.indexOf(h) > 0 && s.indexOf(h) < ret, h);
  assert.match(s, /const legendKey = \(legendGroups \|\| \[\]\)\.map\(/);
  assert.match(s, /\}, \[legendKey, boxH, config\.title, config\.legend, config\.enabled, showScale\]\);/);
});
