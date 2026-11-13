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

test("#2481 the printed (atlas) strip log: a long track name on two lines, and its log axis without exponents", async () => {
  const { buildStripLogSvgMarkup } = await import("../src/lib/striplogSvg.js");
  const collars = [{ hole_id: "U1", x: 0, y: 0, z: 100, azimuth: 0, dip: 90, length: 40 }];
  const assays = [0, 10, 20, 30].map((f, i) => ({ hole_id: "U1", from: f, to: f + 10, values: { Gamma_eU3O8_cased: [11, 140, 2300, 7464][i] } }));
  const { svg } = buildStripLogSvgMarkup({ holeId: "U1", collars, layers: {}, assays, assaySymbols: ["Gamma_eU3O8_cased"], elementUnits: { Gamma_eU3O8_cased: "ppm" } });
  assert.ok(!/\d\.?\d*e[+-]\d/.test(svg.replace(/<defs>[\s\S]*?<\/defs>/g, "").replace(/<style>[\s\S]*?<\/style>/g, "")), "no exponent notation printed");
  assert.match(svg, /log 11–7500/);
  const head = svg.match(/<text [^>]*font-weight="600"[^>]*>(<tspan[\s\S]*?)<title>/);
  assert.ok(head, "the long header is drawn as tspans");
  assert.equal((head[1].match(/<tspan /g) || []).length, 2);
});
