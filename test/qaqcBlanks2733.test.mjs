// TASKS.csv #2733 — QAQC Blanks: no 0.1 pre-fill when the element has no detection limit; the blanks are listed, not judged, until a
// threshold is entered, and the note says so in the element's unit
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankRows } from "../src/lib/qaqc.js";

test("no threshold: nothing is flagged; a threshold flags the values above it", () => {
  const assays = [
    { hole_id: "BLANK-1", sample_type: "blank", from: 0, to: 1, values: { Au: 0.02 } },
    { hole_id: "BLANK-2", sample_type: "blank", from: 0, to: 1, values: { Au: 0.4 } },
  ];
  assert.deepEqual(blankRows(assays, "Au", { Au: "ppm" }, null).map((b) => b.flagged), [false, false]);
  assert.deepEqual(blankRows(assays, "Au", { Au: "ppm" }, 0.1).map((b) => b.flagged), [false, true]);
});

test("wired: empty by default, the note, a dash in the Flag column, translated words", () => {
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /const \[blankThreshold, setBlankThreshold\] = useState\(null\);/);
  assert.doesNotMatch(q, /useState\(0\.1\)/);
  assert.match(q, /value=\{blankThreshold \?\? ""\}/);
  assert.match(q, /\(blankByMethod \? b\.limit : blankLimit\) == null \? "—"/); // #2772 — a row judged per method reads its own limit
  const key = "No threshold set, so the {n} blank(s) are listed but not judged. Enter a threshold in {unit}, or set {symbol}'s detection limit to judge them against a multiple of it.";
  assert.ok(q.includes(`tr(${JSON.stringify(key)}`));
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of [key, "⚠ contaminated", "ok"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
