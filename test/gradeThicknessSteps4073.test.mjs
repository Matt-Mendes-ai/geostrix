// TASKS.csv #4073 — Grade × thickness as steps on the shared StepDialog (Intercepts, Estimate [plan view only], Result): every setting is in its step, Estimate GT and thickness is the
// one primary of its step, Show on the Maps plan the one of the Result, "Not a resource estimate." one line with its reasons behind Why, the view notes in Help.
import test from "node:test";
import assert from "node:assert/strict";
import { readSrc, stepSplit, misplaced, localeMissing } from "./helpers/stepSplit.mjs";

const m = readSrc("src/components/GradeThicknessModal.jsx");
const split = stepSplit(m, ["intercepts", "estimate", "result"]);
const WHERE = {
  intercepts: ["setGtView(", "setAsOxide(", "setCutoff(", "setMinLength(", "setDilution(", "setUnitCode("],
  estimate: ["setCell(", "setDensity(", 'tr("GT cut-off ({u})"', "setMethod(", "Estimate GT and thickness"],
  result: ["onClick={exportCsv}", "onClick={exportGridCsv}", "onClick={exportGridTiff}", "gtContourLayer", "showOnPlan", "<LongSectionGT", "Not a resource estimate"],
};

test("#4073 every setting of the grade × thickness dialog is in its step", () => assert.deepEqual(misplaced(split, WHERE), []));

test("#4073 on the shared shell: the plan view has three steps, the long section two; one primary per step", () => {
  assert.ok(m.includes("<StepDialog title={title}") && m.includes("const steps = isLong ? [intercepts, result] : [intercepts, estimate, result];"));
  for (const k of ['tr("Intercepts")', 'tr("Estimate")', 'tr("Result")', 'tr("Next: estimate")', 'tr("Next: result")']) assert.ok(m.includes(k), k);
  assert.ok(m.includes("onClick: () => { setRunMethod(method); setRun((n) => n + 1); setStepAt(2); }, disabled: !canEstimate"), "Estimate, then the result");
  assert.ok(m.includes('{ label: tr("Show on the Maps plan"), onClick: showOnPlan, disabled: !totals?.holes?.length }'));
  assert.ok(!m.includes("gs-btn--primary") && !m.includes("useFocusTrap") && !m.includes("useEscapeKey"));
});

test("#4073 Not a resource estimate. one line, the reasons behind Why; the view notes in Help", () => {
  assert.match(m, /<b>\{tr\("Not a resource estimate\."\)\}<\/b>\{" "\}<MoreFold summary=\{tr\("Why"\)\}/);
  const help = m.slice(m.indexOf("const helpCard"), m.indexOf("const intercepts"));
  assert.ok(help.includes("<details open>") && help.includes("For a steep vein or lode") && help.includes('openHelp("grade-thickness")') && m.includes("help={helpCard}"));
});

test("#4073 its new messages are in every language", () => assert.deepEqual(localeMissing(["Next: estimate", "Next: result", "Intercepts", "Estimate", "Result", "Why", "Help"]), []));
