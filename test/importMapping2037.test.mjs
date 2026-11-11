// TASKS.csv #2037 — the assay / pXRF import waits for the hole, from and to columns (and a long file's analyte and value), and says so in
// the dialog
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the Import button is disabled until the interval columns are mapped, with the reason beside it", () => {
  const a = readFileSync(new URL("../src/components/AssayImportModal.jsx", import.meta.url), "utf8");
  assert.match(a, /const unmapped = \[\["hole_id", tr\("Hole ID"\)\], \["from", tr\("From"\)\], \["to", tr\("To"\)\], \.\.\.\(modal\.format === "long" \? \[\["analyte", tr\("Analyte"\)\], \["value", tr\("Value"\)\]\] : \[\]\)\]/);
  assert.match(a, /disabled=\{!!modal\.busy \|\| !scan \|\| checkedCount === 0 \|\| unmapped\.length > 0\}/);
  assert.match(a, /tr\("Map the \{cols\} column\(s\) to import\.", \{ cols: unmapped\.join\(", "\) \}\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Map the {cols} column(s) to import.", "Analyte", "Hole ID", "From", "To", "Value"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
