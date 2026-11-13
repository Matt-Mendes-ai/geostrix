// TASKS.csv #1480 — Atlas strip logs with assay tracks ('PAD34-003 with Zn').
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStripLogSvgMarkup } from "../src/lib/striplogSvg.js";

const collars = [{ hole_id: "H1", length: 100 }, { hole_id: "H2", length: 50 }];
const layers = { litho: [{ hole_id: "H1", from: 0, to: 100, value: "LMST" }, { hole_id: "H2", from: 0, to: 50, value: "SLST" }] };
const assays = [
  { hole_id: "H1", from: 10, to: 12, values: { Zn: 0.5 } },
  { hole_id: "H1", from: 12, to: 14, values: { Zn: 12.3 } },
  { hole_id: "H1", from: 110, to: 112, values: { Zn: 2 } }, // below the collar length: the log extends
  { hole_id: "H1", from: 20, to: 20, values: { Zn: 99 }, source: "pXRF" }, // a screening reading, not drawn
];
const units = { Zn: "%", Pb: "%" };

test("an assay track per chosen element: bars on this hole's log range, the range under the track, pXRF left out", () => {
  const plain = buildStripLogSvgMarkup({ holeId: "H1", collars, layers });
  const out = buildStripLogSvgMarkup({ holeId: "H1", collars, layers, assays, assaySymbols: ["Zn"], elementUnits: units });
  assert.ok(out.width > plain.width, "one more column");
  assert.match(out.svg, />Zn \(%\)</);
  const bars = out.svg.match(/fill="#c9863d"/g) || [];
  assert.equal(bars.length, 3, "the three lab intervals, not the pXRF reading");
  assert.match(out.svg, />0<\/text>[^]*>5<\/text>[^]*>10<\/text>[^]*>15<\/text>/); // #3024: 0.5-12.3 spans under two decades: a linear axis with ticks (was 'log 0.50–12')
  assert.ok(!/99 %/.test(out.svg));
  assert.ok(out.height > plain.height, "the log runs to the deepest assay (112 m)");
});

test("a chosen element the hole has no assays of is still a column, saying so; at most five (#3024; was three); none chosen = as before", () => {
  const out = buildStripLogSvgMarkup({ holeId: "H2", collars, layers, assays, assaySymbols: ["Zn", "Pb"], elementUnits: units });
  assert.match(out.svg, /no Zn assays/);
  assert.match(out.svg, />Pb \(%\)</);
  const six = buildStripLogSvgMarkup({ holeId: "H1", collars, layers, assays, assaySymbols: ["Zn", "Pb", "Cu", "Ag", "As", "Sb"], elementUnits: units });
  assert.ok(/>As \(/.test(six.svg) && !/>Sb \(/.test(six.svg), "the fifth drawn, the sixth not");
  assert.equal(buildStripLogSvgMarkup({ holeId: "H1", collars, layers, assays }).svg, buildStripLogSvgMarkup({ holeId: "H1", collars, layers }).svg);
});

test("wired: the Atlas dialog's three selects, passed through atlas.js, the project's assays from Layout", () => {
  const m = readFileSync(new URL("../src/components/GenerateAtlasModal.jsx", import.meta.url), "utf8");
  assert.match(m, /aria-label=\{tr\("Assay track \{n\}", \{ n: k \+ 1 \}\)\}/);
  assert.match(m, /generateAtlasPages\(\{ mode, items: \[chosen\[i\]\], [^}]*assayTracks(, lithoPatterns)? \}\)/); // lithoPatterns: #1995
  const a = readFileSync(new URL("../src/lib/atlas.js", import.meta.url), "utf8");
  assert.match(a, /buildStripLogDataUrl\(\{ holeId, collars, layers, legendOverride, (lithoPatterns, )?\.\.\.\(assayTracks \|\| \{\}\) \}\)/);
  const l = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(l, /assays=\{assays\} assayElements=\{assayElements\}/);
});
