// TASKS.csv #3866 (Scottie Gold review) — the Best intercepts table on the sheet: rows and the 'Including' column 1.4 mm past the frame, 'Length' left-aligned on one page and right-aligned on
// the others, a last page of two rows. (The 'grades are uncut' note was already added by #3747.) Synthetic.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { continuationRanges } from "../src/lib/interceptTable.js";
import { tableTextFit } from "../src/lib/collarTable.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const page = { w: 794, h: 1123 };

test("a last page of a few rows takes rows from the page before; a full last page is left", () => {
  const cap = continuationRanges(0, 10000, page)[0][1]; // the rows a fresh page holds
  assert.ok(cap > 20, `${cap}`);
  const counts = continuationRanges(0, 2 * cap + 2, page).map(([a, b]) => b - a);
  assert.equal(counts.reduce((a, b) => a + b, 0), 2 * cap + 2, "every intercept once");
  assert.ok(Math.min(...counts) >= 5, `${counts}`);
  assert.ok(Math.abs(counts.at(-1) - counts.at(-2)) <= 1, `the last two pages share: ${counts}`);
  assert.ok(counts.every((n) => n <= cap), "no page past what a page holds");
  const ranges = continuationRanges(0, 2 * cap + 2, page);
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i][0], ranges[i - 1][1], "contiguous");
  const full = continuationRanges(0, 2 * cap, page).map(([a, b]) => b - a);
  assert.deepEqual(full, [cap, cap], "a full last page is left as it is");
});

test("the text is fitted with 1.5 % of slack: a table that just fits the measure is shrunk a little", () => {
  const measure = (t, px) => t.length * px * 0.5; // a monospaced stand-in
  const cols = ["Hole", "From", "Including"], rows = [["SR23-236", "137.30", "2.00 m @ 99.5 g/t"]];
  const need = (fs) => { const pad = Math.round(fs * 0.5); return cols.reduce((t, c, j) => t + Math.max(measure(c, fs), measure(rows[0][j], fs)) + 2 * pad, 0); };
  const fs0 = 10, exact = need(fs0);
  assert.equal(tableTextFit({ columns: cols, parts: [rows], fsPx: fs0, widthPx: exact, measure }).shrunk, true, "it fits to the pixel on paper terms but the real text is wider");
  assert.equal(tableTextFit({ columns: cols, parts: [rows], fsPx: fs0, widthPx: exact * 1.02, measure }).shrunk, false);
  const r = tableTextFit({ columns: cols, parts: [rows], fsPx: fs0, widthPx: exact, measure });
  assert.ok(need(r.fs) * 1.015 <= exact + 0.5 && r.fits);
});

test("wiring: the intercept table sets each column's alignment; the sheet honours it", () => {
  const b = read("../src/components/BestIntercepts.jsx"), l = read("../src/modules/LayoutModule.jsx");
  assert.match(b, /const align = columns\.map\(\(_, j\) => \(j === 0 \|\| \(incOn && j === columns\.length - 1\) \? "left" : "right"\)\);/);
  assert.match(b, /source: "static", align, x: plan\.x/);
  assert.match(l, /el\.align\?\.\[j\] \? el\.align\[j\] === "right"/);
});
