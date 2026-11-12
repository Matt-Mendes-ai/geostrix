// TASKS.csv #2988 / #2989 (WA iron review) — the Maps plan's collars on a 6,390-hole project: every frame drew every dot with its own
// beginPath / fill / stroke, on or off screen (#2988: 65-470 ms a pan frame), and at Fit the 2.6 px dots' halos merged the 25 m drilling
// into blotches (#2989). Dots are culled to the view and drawn one path per colour; they shrink with the spacing on screen and lose the
// outline below 6 px; boundary lines off the view are skipped; the legend is headed with the element and unit. SYNTHETIC collars.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarSpacing, dotStyle, dotsInView, drawDots, polylineInView } from "../src/lib/planDots.js";

// 6,400 holes on a 25 m pattern in blocks, plus scattered exploration holes 400 m apart
const collars = [];
for (let b = 0; b < 16; b++) for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) collars.push({ hole_id: `B${b}_${i}_${j}`, x: 600000 + (b % 4) * 3000 + 25 * i, y: 7500000 + Math.floor(b / 4) * 3000 + 25 * j });

test("the spacing is the drilling pattern's, and the dot follows it on screen", () => {
  assert.equal(collarSpacing(collars), 25);
  assert.equal(collarSpacing([{ x: 0, y: 0 }]), null);
  // at Fit (13 m a pixel) the holes are ~2 px apart: a small dot, no halo; zoomed in (1 m a pixel): the full dot with its outline
  assert.deepEqual(dotStyle(25, 13), { r: 0.4 * 25 / 13, halo: false }); // 0.77 px: neighbours 1.9 px apart do not touch
  assert.equal(dotStyle(25, 50).r, 0.75); // never under 0.75 px
  assert.deepEqual(dotStyle(25, 1), { r: 2.6, halo: true });
  assert.deepEqual(dotStyle(25, 1, true), { r: 3.6, halo: true });
  assert.equal(dotStyle(null, 13).r, 2.6); // one hole: as before
});

test("only the dots in view are drawn, one path per colour", () => {
  const X = (x) => (x - 600000) / 1, Y = (y) => (7500600 - y) / 1; // 1 m a pixel over the first block
  const groups = dotsInView(collars, (c) => (c.x % 50 === 0 ? "#f00" : "#00f"), X, Y, 800, 600, 4);
  const n = [...groups.values()].reduce((s, a) => s + a.length / 2, 0);
  assert.equal(n, 400); // the first block, not 6,400
  const calls = { beginPath: 0, fill: 0, stroke: 0, arc: 0 };
  const ctx = { moveTo() {}, arc() { calls.arc++; }, beginPath() { calls.beginPath++; }, fill() { calls.fill++; }, stroke() { calls.stroke++; } };
  drawDots(ctx, groups, { r: 2.6, halo: true });
  assert.deepEqual(calls, { beginPath: 2, fill: 2, stroke: 2, arc: 400 });
  const none = { beginPath: 0, fill: 0, stroke: 0, arc: 0 };
  drawDots({ ...ctx, beginPath() { none.beginPath++; }, fill() { none.fill++; }, stroke() { none.stroke++; }, arc() { none.arc++; } }, groups, { r: 1.2, halo: false });
  assert.equal(none.stroke, 0); // no outline when the dots would touch
});

test("a line is skipped when its box misses the view", () => {
  const pl = [{ x: 0, y: 0 }, { x: 10, y: 5 }];
  assert.equal(polylineInView(pl, [5, 0, 20, 20]), true);
  assert.equal(polylineInView(pl, [11, 0, 20, 20]), false);
});

test("wired: the plan uses them, and the legend says what it shows", () => {
  const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(p, /drawDots\(ctx, dotsInView\(collars,/);
  assert.match(p, /if \(pl\.length < 2 \|\| !polylineInView\(pl, viewBox\)\) return;/);
  assert.doesNotMatch(p, /collars\.forEach\(\(c\) => \{\s*if \(!Number\.isFinite\(c\.x\)\) return;/);
  assert.match(p, /tr\("Highest \{el\} in the hole\{u\}", \{ el: key, u \}\)/);
});
