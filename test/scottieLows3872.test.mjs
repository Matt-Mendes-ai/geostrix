// TASKS.csv #3872 (section labels doubled in a PDF), #3725 (legend labels translated twice), #3852 (a big CSV point survey offers 'Keep 1 in n'). Wiring tests
// (the drawing needs a canvas and a DOM): what the code does is checked in the running app, see the notes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3872: no stroked halo on the section's text (it printed each string twice); the labels over the drawing sit on a white box", () => {
  const w = read("../src/components/SectionWindow.jsx");
  assert.doesNotMatch(w, /text \{ paint-order: stroke/, "the global halo rule is gone");
  assert.match(w, /const haloBox = \(text, x, y, size, anchor = "start", key = undefined, w0 = null\) =>/);
  // every label that lies over the drawing: the float labels (collision pass), the hole names, the ground line, the ghost strings, the contact names, the scale bar
  for (const re of [
    /\{haloBox\(l\.text, l\.x, l\.y, l\.size, l\.anchor, undefined, floatWidth\(l\.text, l\.size\)\)\}<text x=\{l\.x\}/,
    /\{haloBox\(tr\("Ground surface \(SRTM\)"\)/,
    /\{haloBox\(c\.unit, sx\(c\.points\[0\]\.l\)/,
    /\{haloBox\(`\$\{m\.toLocaleString\(\)\} m`/,
    /\{haloBox\(`\$\{st\.unit\} — /,
  ]) assert.match(w, re);
  assert.match(w, /fill="#ffffff" fillOpacity="0\.85" \/>\{\/\* TASKS\.csv #3872 — always/, "the hole names' box is always drawn");
});

test("#3725: a legend group labelled at its source is not translated again", () => {
  const o = read("../src/components/ViewportFigureOverlay.jsx");
  assert.ok(!o.includes("tr(it.group)") || o.includes("(it.gtr ? it.group : tr(it.group))"));
  assert.doesNotMatch(o, /[^?:] tr\(g\.label\)/);
  assert.ok(o.includes("(g.translated ? g.label : tr(g.label))"));
  const g = read("../src/lib/legendGroups.js");
  assert.match(g, /key: "assay_unsampled", translated: true/);
  assert.match(g, /key: "imported_surfaces", translated: true/);
  assert.match(g, /\.\.\.\(g\.translated \? \{ gtr: true \} : \{\}\)/, "the rows carry it to the overlay");
  assert.match(read("../src/modules/ViewerModule.jsx"), /groups\.push\(\{ \.\.\.outcrop, translated: true/);
});

test("#3852 (#3808): a CSV over 100,000 readings opens the picker with the same 'Keep 1 in n' as the .xyz route", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /if \(res\.data\.length > THIN_FROM_ROWS\) \{\n\s+openPicker\(tr\("\\"\{name\}\\" has \{n\} readings, and every reading is a point in the 3D view/);
  assert.match(g, /\{ thin: \{ total: res\.data\.length, keepEvery: suggestKeepEvery\(res\.data\.length, undefined, \(layers\.geophys_pts \|\| \[\]\)\.length\) \} \}\);\n\s+return;/);
  // it sits before the rows are parsed into points, and the import applies the thinning for any source
  assert.ok(g.indexOf("res.data.length > THIN_FROM_ROWS") < g.indexOf("const parsed = rowsToGeophysPoints(res.data, cols);"));
  assert.match(g, /const thinBy = !Array\.isArray\(streamedRows\) && xyzPending\.thin\?\.keepEvery > 1 \? xyzPending\.thin\.keepEvery : 1;/);
});
