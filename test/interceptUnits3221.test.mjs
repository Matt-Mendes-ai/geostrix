// TASKS.csv #3221 (review #3195, Galore Creek) — 'Show as %' left the cut-off and 'Including at' boxes in ppm and the CuEq column in ppm,
// and cutting on CuEq flipped Cu back to ppm ('Avg CuEq (%) 2.846' beside 'Avg Cu (ppm) 21090')
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toDisplay, fromDisplay } from "../src/lib/displayUnits.js"; // TASKS.csv #3236 — the boxes convert through it

const s = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
// the two conversions, evaluated from the source with pct on and off
const conv = (pct) => new Function("conv", "toDisplay", "fromDisplay", "unit", "shownUnit", `${s.match(/const toStored = [^\n]*;/)[0]} return { toStored, shownBox };`)(pct, toDisplay, fromDisplay, "ppm", pct ? "%" : null);

test("typed in % and stored in ppm, the box showing what was typed", () => {
  const on = conv(true), off = conv(false);
  assert.equal(on.toStored(0.2), 2000); assert.equal(on.toStored(0.07), 700); assert.equal(on.shownBox(700), 0.07);
  assert.equal(on.shownBox(on.toStored(0.123456)), 0.123456);
  assert.equal(off.toStored(2000), 2000); assert.equal(off.shownBox(2000), 2000);
});

test("wiring: both boxes, their headings, the equivalent and the element's own column", () => {
  assert.match(s, /value=\{shownBox\(cutoff\)\} onChange=\{\(e\) => \{ setCutoff\(toStored\(Number\(e\.target\.value\) \|\| 0\)\)/);
  assert.match(s, /value=\{includeCutoff === "" \? "" : shownBox\(Number\(includeCutoff\)\)\}/);
  assert.match(s, /setIncludeCutoff\(e\.target\.value === "" \? "" : String\(toStored\(Number\(e\.target\.value\)\)\)\)/);
  assert.match(s, /tr\("\{symbol\}Eq \(\{unit\}\)", \{ symbol, unit: dispUnit/);
  assert.match(s, /\+dg\(v\)\.toPrecision\(4\)/);
  assert.match(s, /s === symbol && pct \? dispUnit : elementUnits\[s\]/);
  assert.match(s, /\(s === symbol \? dg\(r\.extras\[s\]\) : r\.extras\[s\]\)/);
  assert.doesNotMatch(s, /The cutoff stays in ppm\./);
});
