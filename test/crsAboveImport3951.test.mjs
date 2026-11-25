// TASKS.csv #3951 (Matt's first-time test, 2026-11-21: "when I import collar through the let's begin a project dialog box, it doesn't get to the CRS screen
// right away. I have to close the collar import window first.") — the import's column-matching dialog (z-index 62, #3688) stays open while the import asks
// the project-CRS question, and the question's dialog was at 60: it opened BEHIND the import dialog, so the import window had to be closed first. The CRS
// question is now in front of every dialog that can ask it, and the Start dialog (55) stays under all of them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const z = (src, re) => Number((src.match(re) || [])[1]);

test("#3951 the Project coordinate system dialog is above the import's column matching and the assay import (62), and the Start dialog is under them all", () => {
  // TASKS.csv #4073 — the dialog is on the shared StepDialog: its z-index is a constant passed as the shell's zIndex
  const crsSrc = read("../src/components/ProjectCrsModal.jsx");
  assert.match(crsSrc, /zIndex=\{Z_ABOVE_IMPORT\}/);
  const crs = z(crsSrc, /const Z_ABOVE_IMPORT = (\d+);/);
  const mapping = z(read("../src/components/ImportMappingModal.jsx"), /export const Z_IMPORT = (\d+);/); // TASKS.csv #4073 — a StepDialog's zIndex
  assert.match(read("../src/components/ImportMappingModal.jsx"), /zIndex=\{Z_IMPORT\}/);
  const assay = z(read("../src/components/AssayImportModal.jsx"), /const Z_IMPORT = (\d+);/); // TASKS.csv #4073 — a StepDialog's zIndex
  assert.match(read("../src/components/AssayImportModal.jsx"), /zIndex=\{Z_IMPORT\}/);
  const start = z(read("../src/components/StartDialogs.jsx"), /const Z = (\d+);/);
  assert.ok(Number.isFinite(crs) && Number.isFinite(mapping) && Number.isFinite(assay) && Number.isFinite(start), "all four found");
  assert.ok(crs > mapping && crs > assay, `the CRS question (${crs}) must be above the import dialogs (${mapping}, ${assay})`);
  assert.ok(start < Math.min(mapping, assay, crs), "the Start dialog stays under every dialog that opens over it");
  // every request path uses this one dialog: the import asks it through requestProjectCrs, rendered once in App.jsx
  assert.match(read("../src/App.jsx"), /\{crsRequest && <Suspense fallback=\{null\}><ProjectCrsModal /);
});
