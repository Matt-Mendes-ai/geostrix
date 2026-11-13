// TASKS.csv #2481 (the rest of it) and #2142 — a strip log's long track name on two lines and its axis numbers without exponents; a section
// snapshot's title not cut at the top edge when its text is scaled up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { headerLines, sigText } from "../src/lib/stripHeader.js";

test("#2481 a track name too long for its track goes on two lines, at the ': ' when both halves fit", () => {
  assert.deepEqual(headerLines("Gamma: eU3O8_cased_ppm", 82), ["Gamma:", "eU3O8_cased_ppm"]);
  assert.deepEqual(headerLines("Au (ppm)", 82), ["Au (ppm)"]);
  assert.deepEqual(headerLines("Strat unit", 82), ["Strat unit"]);
  // no ': ' — the separator nearest the middle
  assert.deepEqual(headerLines("magnetic_susceptibility_si", 82), ["magnetic_", "susceptibility_si"]);
  // nothing to break at: left whole (it is cut, as before, but its <title> has the full name)
  assert.deepEqual(headerLines("averyveryverylongnamewithoutseparators", 82), ["averyveryverylongnamewithoutseparators"]);
});

test("#2481 axis numbers to n figures never print in exponent notation", () => {
  assert.equal(sigText(7464, 3), "7460");
  assert.equal(sigText(12345678, 3), "12300000");
  assert.equal(sigText(0.000123456, 2), "0.00012");
  assert.equal(sigText(2.5, 3), "2.5");
  assert.equal(sigText("x", 3), "x");
  const src = readFileSync(new URL("../src/components/StripLog.jsx", import.meta.url), "utf8");
  assert.ok(!/\.toPrecision\(/.test(src), "StripLog formats its numbers through sigText");
  assert.match(src, /headerLines\(t\.label, TRACK_W - 8\)/);
});

test("#2142 the section's title sits inside its SVG: the viewBox grows upward by what the scaled title needs", () => {
  const src = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");
  assert.match(src, /topExtra = Math\.max\(0, Math\.ceil\(fs\(12\) \+ 4 - titleY\)\)/);
  assert.match(src, /viewBox=\{`0 \$\{-topExtra\} \$\{W\} \$\{totalH \+ topExtra\}`\}/);
  assert.match(src, /<text x=\{PAD\} y=\{titleY\}/);
  // the arithmetic: at text scale 2 with three subtitle lines the title would be above the old top edge
  const PAD = 60, fs = (n) => n * 2, titleY = PAD - fs(22) - 2 * fs(12), topExtra = Math.max(0, Math.ceil(fs(12) + 4 - titleY));
  assert.ok(titleY - fs(12) < 0 && titleY - fs(12) + topExtra >= 0);
  const fs1 = (n) => n, t1 = PAD - fs1(22);
  assert.equal(Math.max(0, Math.ceil(fs1(12) + 4 - t1)), 0, "at the default scale nothing changes");
});
