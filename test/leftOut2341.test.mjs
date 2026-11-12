// TASKS.csv #2341 (review #2325) — through the import dialog, the columns not read are named in the notice; an extra field's name is
// pre-filled from the column picked
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { columnsLeftOut } from "../src/lib/viewer/autoExtras.js";

test("the columns with values that no field and no extra field read", () => {
  const headers = ["Hole_ID", "mFrom", "mTo", "Lith1_Code", "Lith1_Strat", "Lith1_Oxidation", "Empty", "_internal"];
  const rows = [{ Hole_ID: "A", mFrom: 0, mTo: 1, Lith1_Code: "CLY", Lith1_Strat: "E3", Lith1_Oxidation: "OX", Empty: "" }];
  assert.deepEqual(columnsLeftOut(headers, rows, ["Hole_ID", "mFrom", "mTo", "Lith1_Code"]), ["Lith1_Strat", "Lith1_Oxidation"]);
  assert.deepEqual(columnsLeftOut(headers, rows, ["Hole_ID", "mFrom", "mTo", "Lith1_Code", "Lith1_Strat", "Lith1_Oxidation"]), []);
});

test("the layer and survey notices name them; the dialog pre-fills the extra field's name", () => {
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /\+ leftOutText\(data, allRows, \[\.\.\.\(sib\?\.codes \|\| \[\]\), \.\.\.\(recCalc \? [^)]*\) : \[\]\)\]\) \/\* #2341; /); // + the Recovery % formula's columns: #2891
  assert.match(u, /tr\("Loaded \{rows\} survey stations from \{fileName\}\.", \{ rows: rows\.length, fileName \}\) \+ leftOutText\(data, allRows/);
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /setAddColumn\(v\); if \(!addName\.trim\(\) \|\| addName === addColumn\) setAddName\(v\);/);
});
