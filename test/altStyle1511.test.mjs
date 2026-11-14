// TASKS.csv #1511 — one table per alteration style: an Alteration import can name its style, so Oxidation's 'Pchy' and
// Silicification's 'Pchy' stay two categories; and Alteration maps an intensity column.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { alterationStyleFromName, styledAltValue, normInterval } from "../src/lib/viewer/importHelpers.js";
import { TARGET_SCHEMAS, guessMapping } from "../src/lib/layers.js";

test("the style is read from a file name that names one, never from a generic alteration log", () => {
  assert.equal(alterationStyleFromName("Oxidation.csv"), "Oxidation");
  assert.equal(alterationStyleFromName("Silicification.csv (3 more queued)"), "Silicification");
  assert.equal(alterationStyleFromName("40958Z_sericite_log.xlsx"), "Sericite");
  assert.equal(alterationStyleFromName("Alteration.csv"), "");
  assert.equal(alterationStyleFromName("alt.csv"), "");
  assert.equal(alterationStyleFromName(""), "");
  assert.equal(styledAltValue("Oxidation", "Pchy"), "Oxidation: Pchy");
  assert.equal(styledAltValue("  ", "Pchy"), "Pchy");
});

test("Alteration maps an intensity column (kept as logged text)", () => {
  const headers = ["Hole_ID", "From", "To", "Alt_Code", "Alt_Intensity"];
  const m = guessMapping("alt", headers);
  assert.equal(m.intensity, "Alt_Intensity");
  assert.ok(TARGET_SCHEMAS.alt.fields.some((f) => f.key === "intensity" && !f.required));
  const r = normInterval({ Hole_ID: "H1", From: "1", To: "2", Alt_Code: "Pchy", Alt_Intensity: "W" }, m, []);
  assert.equal(r.intensity, "W");
});

test("the importer prefixes the codes of a styled Alteration file; the dialog offers the style", () => {
  const p = fs.readFileSync("src/modules/viewer/importPipelineImpl.js", "utf8");
  assert.match(p, /const altStyle = target === "alt" \? String\(data\.altStyle \?\? alterationStyleFromName\(fileName\)\)\.trim\(\) : "";/);
  assert.match(p, /if \(altStyle\) \{ r\.value = styleCode\(r\.value\); r\.alt_style = altStyle;/);
  const d = fs.readFileSync("src/components/ImportMappingModal.jsx", "utf8");
  assert.match(d, /modal\.target === "alt" && \(/);
  assert.match(d, /value=\{modal\.altStyle \?\? alterationStyleFromName\(modal\.fileName\)\}/);
});
