// TASKS.csv #3411 (review #3374) — 'Two table columns side by side' is not offered (the box is disabled, and says why) when its two halves
// cannot fit the doubled frame even at 5 pt; it used to offer itself and say so under the frame afterwards. SYNTHETIC collars.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarTableCells, splitHalvesFit } from "../src/lib/collarTable.js";

const measure = (text, px) => String(text).length * px * 0.55;
const base = ["Hole", "Easting", "Northing", "Elev. (m)", "Azimuth (grid)", "Dip", "Depth (m)"];
const collars = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ hole_id: `DH-${String(i + 1).padStart(3, "0")}`, x: 500000 + i, y: 5500000 + i * 3, z: 350 + i / 10, azimuth: 90, dip: -60, length: 150 + i, attrs: extra }));

test("the cells are the printed text, the marks counted: one array per collar, the extra columns last", () => {
  const rows = collarTableCells(collars(1, { Programme: "2024 infill" }), ["Programme"]);
  assert.deepEqual(rows[0], ["DH-001", "500000", "5500000", "350.0‡", "90*", "60*", "150.0", "2024 infill"]);
});

test("the halves of a plain table fit an A4-wide frame; with a very long text column they do not, even at 5 pt", () => {
  const A4w = 794, w2 = Math.min(A4w - 80, 520 * 2) - 12;
  const plain = splitHalvesFit({ columns: base, rows: collarTableCells(collars(60)), fontPt: 7, widthPx: w2, measure });
  assert.equal(plain.fits, true);
  const longText = "A very long programme or tenement description that no column of a half-page table can carry";
  const columns = [...base, "Programme", "Tenement"], rows = collarTableCells(collars(60, { Programme: longText, Tenement: longText }), ["Programme", "Tenement"]);
  const wide = splitHalvesFit({ columns, rows, fontPt: 7, widthPx: w2, measure });
  assert.equal(wide.fits, false);
  assert.ok(wide.fs <= 5 * 96 / 72 + 0.01, "it went down to the smallest size before giving up");
});

test("the Layout sidebar disables the box and says why, from the same fit the render uses", () => {
  const l = fs.readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(l, /const noSplit = sel\.split !== 2 && !splitHalvesFit\(\{ columns: tableCols, rows: collarTableCells\(/);
  assert.match(l, /<input type="checkbox" disabled=\{noSplit\} checked=\{sel\.split === 2\}/);
  assert.match(l, /\{noSplit && <div role="note"/);
  assert.match(l, /measure: measureTableText\(layoutFontStack\(sel\.fontFamily\)\)/);
});
