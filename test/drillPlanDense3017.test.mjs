// TASKS.csv #3017 (review #2876, WA iron) — the Layout drill plan of 6,390 holes printed its 25 m drilled blocks as pale blotches: each collar's
// white outline painted over the one before. The Maps plan's rule (#2989) on the sheet: a symbol no wider than 0.8 of the holes' spacing in
// pixels (at least 0.75 px), an outline only from 6 px apart, a no-value ring unfilled when dense
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarSpacing } from "../src/lib/planDots.js";

const MM = 96 / 25.4;
// a block of holes 25 m apart, on the sheet at a scale of 1 : denom (px = m / denom * 1000 mm * MM)
const block = (denom) => { const pts = []; for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) pts.push({ x: (i * 25 / denom) * 1000 * MM, y: (j * 25 / denom) * 1000 * MM }); return pts; };
const rule = (pts, rMm = 0.8) => { const gap = collarSpacing(pts); const halo = !(gap < 6), cap = gap > 0 ? Math.max(0.75, 0.4 * gap) : Infinity; return { gap, halo, r: Math.min(rMm * MM, cap) }; };

test("1 : 100,000 and 1 : 200,000: the holes are under 1 px apart, so the dots are small and have no outline", () => {
  for (const denom of [100000, 200000]) {
    const r = rule(block(denom));
    assert.ok(r.gap < 1, `${denom}: ${r.gap}`);
    assert.equal(r.halo, false);
    assert.equal(r.r, 0.75);
  }
});

test("1 : 5,000: the holes are 19 px apart: the full 0.8 mm dot with its white outline, as before", () => {
  const r = rule(block(5000));
  assert.ok(r.gap > 18 && r.gap < 20, String(r.gap));
  assert.equal(r.halo, true);
  assert.equal(r.r, 0.8 * MM);
});

test("the drawing caps the radius, drops the outline and leaves a no-value ring unfilled when dense", () => {
  const g = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(g, /const gap = collarSpacing\(d\.holes\.filter\(\(hh\) => hh\.inside\)\.map\(\(hh\) => \(\{ x: hh\.ax, y: hh\.ay \}\)\)\);/);
  assert.match(g, /return \{ halo: !\(gap < 6\), cap: gap > 0 \? Math\.max\(0\.75, 0\.4 \* gap\) : Infinity \};/);
  assert.match(g, /const hollowFill = dense\.halo \? "#ffffff" : "none";/);
  assert.match(g, /r=\{r\} fill=\{s\.colour\} stroke=\{dense\.halo \? "#ffffff" : "none"\}/);
});
