// TASKS.csv #3899 (Text and Help batch, T3) — the warnings that protect a reader from a wrong conclusion. The rewording of #3899 shortens every message, and a shorter
// message must not lose the one thing it is there to say. Each entry names the file that shows the warning and the words ALL of which must still sit together in
// ONE of that file's translated strings (case and spacing ignored). A rewording that drops one fails here: fix the wording, or, if the warning moved or its point is now
// made in other words, change this list in the same commit and say why. Words of an entry are the warning's own key terms, not a whole sentence.
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trStringsOf } from "../scripts/word-count.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, " ");

// [warning, file under src/, [words that must all be in one string]]
export const PROTECTIVE = [
  // no density, so no tonnes
  ["no density, so no tonnes (grade-tonnage)", "components/GradeTonnageModal.jsx", ["no density", "no tonnes"]],
  ["no density in the project: a tonnage rests on an assumed one (Data QC)", "lib/dataQcCoverage.js", ["no density", "tonnage", "assume"]],
  // not a resource estimate
  ["not a resource estimate (estimation)", "components/GradeEstimationModal.jsx", ["not a resource estimate"]],
  ["not a Mineral Resource under NI 43-101 or JORC (estimation)", "components/GradeEstimationModal.jsx", ["mineral resource", "43-101", "jorc"]],
  ["not a resource estimate (grade-thickness)", "components/GradeThicknessModal.jsx", ["not a resource estimate"]],
  ["not a resource estimate (long section)", "components/LongSectionGT.jsx", ["not a resource estimate"]],
  ["not a resource estimate (predictive targeting)", "components/PredictivePanel.jsx", ["not a resource estimate"]],
  ["not a Mineral Resource (predictive targeting)", "components/PredictivePanel.jsx", ["mineral resource", "43-101"]],
  // TASKS.csv #3962 (P1) — probable grade along the planned holes: targeting, a range from the spacing only, a prediction
  ["not a resource estimate (probable grade)", "components/ProbableGradePanel.jsx", ["not a resource estimate"]],
  ["not a Mineral Resource under NI 43-101 or JORC (probable grade)", "components/ProbableGradePanel.jsx", ["mineral resource", "43-101", "jorc"]],
  ["the range comes from the spacing and the variogram only (probable grade)", "components/ProbableGradePanel.jsx", ["spacing of the holes", "variogram only", "geology"]],
  ["a prediction from nearby holes, not a measurement (probable grade)", "components/ProbableGradePanel.jsx", ["prediction", "not a measurement"]],
  ["beyond the drilling: no prediction (a planned hole's row)", "components/PlannedHoleParts.jsx", ["beyond the drilling", "no prediction"]],
  ["a picture of where the grade is, not a resource estimate (guided tool)", "modules/viewer/guided/guidedTools.js", ["not a resource estimate"]],
  // extrapolated, or held by one hole
  ["blocks that rest on one hole or are extrapolated (pit shell)", "components/PitShellPane.jsx", ["one hole", "extrapolated"]],
  ["in effect a single-hole estimate (estimation)", "components/GradeEstimationModal.jsx", ["single-hole estimate"]],
  ["the surface is extrapolated beyond its inputs", "components/ExplicitSurfacePanel.jsx", ["extrapolated"]],
  ["blocks informed by one hole, or extrapolated, are not an intercept (planned hole)", "components/PlannedHoleParts.jsx", ["one hole", "extrapolated"]],
  ["below the depth of investigation the cells are extrapolated, not data (DC / IP)", "components/DcipPanel.jsx", ["extrapolat", "not seen by the data"]],
  // a cap at or below the cut-off
  ["the cap is not above the cut-off, so the shell has nothing to enclose", "modules/viewer/ShellCapNote.jsx", ["not above", "cut-off", "cap"]],
  ["no sample reaches the cutoff once capped", "modules/viewer/modellingRuns.js", ["capped", "cutoff", "cap"]],
  // a plane that is the shape of the drilling
  ["the plane is the shape of the drilling (estimation)", "components/GradeEstimationModal.jsx", ["shape of the drilling"]],
  ["the plane is the shape of the drilling (trends)", "components/TrendsPanel.jsx", ["shape of the drilling"]],
  // an assumed elevation
  ["no collar elevation: an ASSUMED elevation (Data QC)", "lib/dataQC.js", ["assumed elevation"]],
  ["collars placed at an ASSUMED elevation (import)", "modules/viewer/importPipelineImpl.js", ["assumed", "elevation"]],
  ["collar elevations that are not ground (assumed at import, or suspect)", "lib/collarLevelsText.js", ["assumed at import", "suspect"]],
  // rows left out
  ["rows left out at import (Data QC coverage)", "lib/dataQcCoverage.js", ["row", "left out", "at import"]],
  ["rows marked not current are left out", "components/RowFilterBox.jsx", ["row", "left out"]],
  ["rows with a blank code are skipped (import mapping)", "components/ImportMappingModal.jsx", ["blank", "rows", "skipped"]],
];

const cache = new Map();
const stringsIn = (rel) => { if (!cache.has(rel)) cache.set(rel, trStringsOf(path.join(SRC, rel)).map((x) => norm(x.text))); return cache.get(rel); };

test("#3899 each protective warning still carries its key words, in the file that shows it", () => {
  for (const [name, file, words] of PROTECTIVE) {
    const strings = stringsIn(file);
    assert.ok(strings.length, `${file}: no translated strings found (moved or renamed? update test/protectiveWarnings3899.test.mjs)`);
    const ok = strings.some((s) => words.every((w) => s.includes(norm(w))));
    assert.ok(ok, `"${name}": no string in ${file} holds all of [${words.join(" | ")}]. A rewording dropped what the warning is for.`);
  }
});

test("#3899 the list covers the seven protections of the plan, and no entry is vacuous", () => {
  const text = PROTECTIVE.map((e) => e[0]).join(" ; ").toLowerCase();
  for (const k of ["no density", "resource estimate", "extrapolated", "cap", "shape of the drilling", "assumed elevation", "rows left out"]) assert.ok(text.includes(k), `no entry for: ${k}`);
  for (const [name, , words] of PROTECTIVE) assert.ok(words.length && words.every((w) => w.length >= 3), name);
  assert.equal(new Set(PROTECTIVE.map((e) => e[0])).size, PROTECTIVE.length, "duplicate entry name");
});
