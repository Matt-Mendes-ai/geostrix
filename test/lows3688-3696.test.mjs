// TASKS.csv #3688 / #3696 (rehearsal round 3) — (3688) a file dropped while the Data QC window was open opened its import dialog UNDERNEATH it (both at z-index 60; the import dialog is earlier in the page): the import
// dialogs are now above (62). (3696) the Macpass README said 'three files' above a table of four CSV files: it says four files made from three source tables (wording to be agreed with the data's owner).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
test("#3688 the import dialogs sit above Data QC and the other dialogs", () => {
  assert.match(read("../src/lib/modalStyles.js"), /export const overlay = \{[^}]*zIndex: 60/);
  assert.match(read("../src/components/ImportMappingModal.jsx"), /export const Z_IMPORT = 62;[\s\S]*zIndex=\{Z_IMPORT\}/); // #4073 — a StepDialog's zIndex
  assert.match(read("../src/components/AssayImportModal.jsx"), /const Z_IMPORT = 62;[\s\S]*zIndex=\{Z_IMPORT\}/); // #4073 — a StepDialog's zIndex
  // TASKS.csv #4073 — Data QC is a StepDialog without a zIndex: StepDialog's overlay is the common one (60), under the import dialogs (62)
  const qc = read("../src/components/DataQCModal.jsx");
  assert.match(qc, /return <StepDialog title=\{heading\} onClose=\{onCancel\}/);
  assert.doesNotMatch(qc, /zIndex=/, "Data QC keeps the common overlay (60)");
  assert.match(read("../src/components/StepDialog.jsx"), /<div style=\{zIndex != null \? \{ \.\.\.overlay, zIndex \} : overlay\}/);
});
test("#3696 the Macpass README names four files and three source tables, and no longer says 'three files'", () => {
  const r = read("../sample_data/yk_macpass/README.md");
  assert.doesNotMatch(r, /\bthree files\b/i); assert.match(r, /These four CSV files, made from three tables of the dataset/); assert.match(r, /The four files are redistributed with Fireweed's written permission/);
  for (const f of ["collars.csv", "survey.csv", "assays.csv", "sg.csv"]) assert.ok(r.includes(`\`${f}\``), f);
  assert.doesNotMatch(r, /#\d{3,}|Side \d/, "no backlog numbers in a public file");
});
