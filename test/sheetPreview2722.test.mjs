// TASKS.csv #2722 (split from #2625) — 'Correlate sheets between holes' wrote the codes straight away: a wrong match could only be seen after
// it had re-coded the runs. A 'Preview the sheets in 3D' toggle now draws the runs of each matched sheet in its own colour on the holes,
// from the same computation the write uses, and writes nothing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");

test("one computation for the preview and the write", () => {
  assert.match(src, /const computeSheets = \(\) => \{/);
  assert.equal((src.match(/computeSheets\(\)/g) || []).length, 2, "the write and the preview");
  assert.match(src, /const \{ rows, assign, msgs \} = computeSheets\(\);/);
  assert.match(src, /for \(const sh of res\.sheets\) for \(const run of sh\.runs\) preview\.push\(\{ hole_id: run\.hole_id, from: run\.from, to: run\.to, sheet: sh\.n, code: base \}\);/);
  assert.match(src, /return \{ rows, assign, msgs, preview \};/);
});

test("the preview writes nothing, is drawn coloured by sheet, and is dropped when the codes or the attitude change or the codes are written", () => {
  const i = src.indexOf("if (sheetPreview) { setSheetPreview(null); return; }"), j = src.indexOf("}}", i);
  assert.ok(i > 0);
  assert.doesNotMatch(src.slice(i, j), /setModellingCodes/);
  assert.match(src, /selectionOverlay\(sheetPreview, view\.traces\.current, \(q\) => sheetColour\(q\.sheet\)\)/);
  assert.match(src, /useEffect\(\(\) => \{ setSheetPreview\(null\); \}, \[numberCodes, sheetAtt, litho\]\);/);
  assert.match(src, /setSheetMsg\(msgs\.join\(" "\)\); setSheetPreview\(null\);/);
});

test("neighbouring sheets never share a colour", async () => {
  // the palette is exported from the component file; read it without React by evaluating the two lines
  const pal = src.match(/const SHEET_COLOURS = (\[[^\]]+\]);/)[1];
  const colours = JSON.parse(pal);
  assert.equal(new Set(colours).size, colours.length, "ten distinct hues");
  const sheetColour = (n) => colours[(Math.max(1, n) - 1) % colours.length];
  for (let n = 1; n < 40; n++) assert.notEqual(sheetColour(n), sheetColour(n + 1));
  assert.match(src, /export const sheetColour = \(n\) => SHEET_COLOURS\[\(Math\.max\(1, n\) - 1\) % SHEET_COLOURS\.length\];/);
});
