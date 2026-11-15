// TASKS.csv #3525 — the same density table gave two layers: dropped on the 3D view it kept method / low_recovery / comment as extra fields; through
// + Add layer > Specific gravity the dialog opened with none and the notice said "3 column(s) of the file were not imported". The dialog now opens with the same
// extra fields (each removable), for every layer a table can fill except collars, surveys, mag-susc logs and a custom layer.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { autoExtraFields, dialogExtraFields, columnsLeftOut } from "../src/lib/viewer/autoExtras.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const sg = Papa.parse(read("../sample_data/yk_macpass/sg.csv"), { header: true, skipEmptyLines: true });
const MAPPING = { hole_id: "hole_id", from: "from", to: "to", value: "sg" };

test("the Macpass density table: the dialog opens with method, low_recovery and comment, as the drop route keeps them", () => {
  const dialog = dialogExtraFields("sg", sg.meta.fields, sg.data, MAPPING);
  const drop = autoExtraFields(sg.meta.fields, sg.data, MAPPING);
  assert.deepEqual(dialog.customFields, drop, "the same fields as a drop");
  assert.deepEqual(dialog.customFields.map((f) => f.column), ["method", "low_recovery", "comment"]);
  assert.equal(dialog.customFields.find((f) => f.column === "method").type, "category");
});

test("nothing is left out unnamed any more: the notice's 'not imported' list is empty once the dialog's fields are in", () => {
  const { customFields } = dialogExtraFields("sg", sg.meta.fields, sg.data, MAPPING);
  const used = [...Object.values(MAPPING), ...customFields.map((f) => f.column)];
  assert.deepEqual(columnsLeftOut(sg.meta.fields, sg.data, used), []);
  assert.deepEqual(columnsLeftOut(sg.meta.fields, sg.data, Object.values(MAPPING)), ["method", "low_recovery", "comment"], "before: three columns dropped");
});

test("collars, surveys, mag-susc logs and a custom layer are left as they were; a per-row CRS column is never an extra", () => {
  for (const t of ["collars", "survey", "magsusc", "custom", "", undefined]) assert.deepEqual(dialogExtraFields(t, sg.meta.fields, sg.data, MAPPING), {}, String(t));
  const rows = [{ hole_id: "A", from: 0, to: 1, sg: 2.7, epsg: 26909 }];
  assert.deepEqual(dialogExtraFields("sg", ["hole_id", "from", "to", "sg", "epsg"], rows, MAPPING, ["epsg"]), {});
  assert.deepEqual(dialogExtraFields("sg", ["hole_id", "from", "to", "sg"], rows, MAPPING), {}, "a table with only its own columns has no extras");
});

test("wired: the file dialog, the queued dialog and the database dialog all open with them", () => {
  const p = read("../src/modules/viewer/importPipelineImpl.js");
  assert.match(p, /dialogExtraFields\(target, headers, data, mapping, \[perRowEpsgCol\]\) \/\* #3525 \*\//);
  assert.match(p, /dialogExtraFields\(target, headers, data, mapping, \[guessColumn\(headers, EPSG_COL_ALIASES\)\]\) \/\* #3525 \*\//);
  assert.match(p, /setImportModal\(\{ dbSource, \.\.\.\(codeGuess \? \{ valueGuess: codeGuess \} : \{\}\), \.\.\.dialogExtraFields\(target, headers, rows, mapping, \[perRowEpsgCol\]\)/);
});
