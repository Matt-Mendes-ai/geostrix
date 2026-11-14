// TASKS.csv #3374 — a split collar table with two collar fields ran its right half 86 mm off the sheet: the text is sized so both halves fit
// the frame (down to 5 pt), and the export's pre-flight measures a table's cells
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tableTextFit, splitTableRows } from "../src/lib/collarTable.js";

// a stand-in for canvas measureText: 0.55 em a character, headings 0.6
const measure = (t, px, bold) => t.length * px * (bold ? 0.6 : 0.55);
const columns = ["Hole", "Easting", "Northing", "Elev. (m)", "Azimuth (grid)", "Dip", "Depth (m)", "DH_AREA", "DH_HOLE_PURPOSE"];
// SYNTHETIC: 70 holes with a 13-character area and an 11-character purpose
const rows = Array.from({ length: 70 }, (_, i) => [`GC23-${String(900 + i).padStart(4, "0")}`, "350809", "6333840", "812", "065", "-75", "694.2", "CENTRAL ZONE", "EXPLORATION"]);
const parts = splitTableRows(rows, 2);
const px = (pt) => (pt * 96) / 72;

test("two halves that do not fit at 7 pt are sized down to fit the frame", () => {
  const widthPx = 714 - 12; // an A4 portrait frame less its padding
  const f = tableTextFit({ columns, parts, fsPx: px(7), widthPx, gap: 14, minPx: px(5), measure });
  assert.equal(f.shrunk, true);
  // the width at the size chosen
  const need = (fs) => parts.length * columns.reduce((t, h, j) => t + Math.max(measure(h, fs, true), ...rows.map((r) => measure(r[j], fs, false))) + 2 * Math.round(fs * 0.5), 0) + 14;
  if (f.fits) assert.ok(need(f.fs) <= widthPx + 0.5, `${need(f.fs)} <= ${widthPx}`);
  assert.ok(f.fs >= px(5) && f.fs < px(7));
});

test("a table that fits keeps its size; one too wide even at 5 pt says so", () => {
  assert.deepEqual(tableTextFit({ columns: columns.slice(0, 7), parts: [rows.map((r) => r.slice(0, 7))], fsPx: px(7), widthPx: 1000, measure }), { fs: px(7), shrunk: false, fits: true });
  const f = tableTextFit({ columns, parts, fsPx: px(7), widthPx: 300, gap: 14, minPx: px(5), measure });
  assert.deepEqual([f.shrunk, f.fits, f.fs], [true, false, px(5)]);
});

test("wired: the table's text, its halves, the badge, the pre-flight, a title named", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /const textFit = tableTextFit\(\{ columns, parts: tableParts, fsPx: fsSet, widthPx: frameW, gap: 14, minPx: printPx\(5\), measure: measureTableText\(FONT\) \}\);/);
  assert.match(m, /const fs = textFit\.fs, cell = /);
  assert.match(m, /width: tableParts\.length > 1 \? \(textFit\.shrunk \? "auto" : "50%"\)/);
  assert.match(m, /e\.querySelectorAll\("text, td, th"\)/);
  assert.match(m, /const ELEMENT_KIND_NAMES = \{ title: "Title"/);
  assert.match(m, /\{selected && !print && textFit\.shrunk && \(/);
});
