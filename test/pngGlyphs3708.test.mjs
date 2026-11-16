// TASKS.csv #3708 — a PNG of a collar table at 150 dpi lost parts of digits ('TS17-003 ... 1535.7' unreadable, 'TS17-005' read
// 'TS17-00'); at 300 dpi small nicks. The PDF's own text was right: PDF.js drew the embedded TrueType fonts through the browser's
// text engine (FontFace), which clipped glyphs at the reduced size. Measured in the app's own PDF.js on the app's own print of a
// Letter collar table: pixels that differ from a 600 dpi render shrunk to 150 dpi: 1,046 with the default, 10 with
// disableFontFace: true (glyphs drawn from the font's outlines); a 300 dpi render shrunk to 150 dpi: 0. The PNG export reads its
// page with that option; other PDF readers (the section georeferencer) are as they were.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("openPdf passes options to getDocument, after its own defaults", () => {
  const p = read("../src/lib/pdfPages.js");
  assert.match(p, /export async function openPdf\(bytes, options = \{\}\)/);
  assert.match(p, /enableXfa: false, stopAtErrors: false, \.\.\.options,/);
});

test("the PNG export reads its page with disableFontFace; the georeferencer does not", () => {
  assert.match(read("../src/modules/LayoutModule.jsx"), /const doc = await openPdf\(bytes, \{ disableFontFace: true/);
  assert.doesNotMatch(read("../src/components/SectionGeorefModal.jsx"), /disableFontFace/);
});
