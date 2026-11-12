// TASKS.csv #2260 — the add-evidence list leaves out a custom layer's error columns; a custom field's card says to check its direction,
// and a field of a few whole numbers that it may be a code
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { numericLayerFields, UNCERTAINTY_FIELD, codeLikeField, codesOf } from "../src/lib/evidenceSources.js";

test("TSA_Error and its kin are uncertainty, TSA_Weight1 and a grade are not", () => {
  for (const f of ["TSA_Error", "tsa_err", "Au_SD", "fit residual", "RMSE", "Cu_stdev", "uncertainty"]) assert.ok(UNCERTAINTY_FIELD.test(f), f);
  for (const f of ["TSA_Weight1", "Au_ppm", "ai_Wav_WtMica", "TSA_Mineral1", "Sd_ppm_x", "terror"]) assert.ok(!UNCERTAINTY_FIELD.test(f), f);
  const rows = Array.from({ length: 10 }, (_, i) => ({ hole_id: "H", from: i, to: i + 1, TSA_Error: 100 + i, TSA_Weight1: 0.1 * i, TSA_Mineral1: "Muscovite" }));
  assert.deepEqual(numericLayerFields(rows).filter((f) => !UNCERTAINTY_FIELD.test(f)), ["TSA_Weight1"]);
});

test("weathering classes 1-6 look like a code; a measure, decimals or a single value do not", () => {
  const w = Array.from({ length: 30 }, (_, i) => ({ value: String(1 + (i % 6)) }));
  assert.deepEqual(codeLikeField(w, "value"), { values: [1, 2, 3, 4, 5, 6] });
  assert.equal(codeLikeField(Array.from({ length: 30 }, (_, i) => ({ v: i })), "v"), null); // 30 distinct whole numbers: a measure
  assert.equal(codeLikeField([{ v: 1 }, { v: 2 }, { v: 2.5 }, { v: 1 }, { v: 2 }], "v"), null);
  assert.equal(codeLikeField(Array.from({ length: 9 }, () => ({ v: 3 })), "v"), null);
  assert.equal(codeLikeField([{ v: 1 }, { v: 2 }], "v"), null); // too few
  // the importer's 'Unknown' is no code (#2102), so it never became a 'Distance to logged' card
  assert.deepEqual(codesOf({ value: "Unknown" }), []);
});

test("the pane filters the list and shows the hints on a custom field's card", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /numericLayerFields\(cl\.rows\)\.filter\(\(x\) => !UNCERTAINTY_FIELD\.test\(x\)/);
  assert.match(p, /l\.kind === "numeric" && \/\^custom:\/\.test\(l\.ref \|\| ""\)/);
  assert.match(p, /codeLikeField\(rows, field\)/);
  assert.match(p, /tr\("A field of a custom layer: check that higher means more favourable here, or choose favourable when low\."\)/);
});
