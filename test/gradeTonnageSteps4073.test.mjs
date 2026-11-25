// TASKS.csv #4073 — Grade-tonnage as steps on the shared StepDialog (Cutoffs, Report, Result): every setting is in its step, Export CSV is the one gold primary, the cautions and details
// are folded, the not-a-resource wording stays seen first with the exploration-target caution behind Why (and in Help), the dialog is still resizable (StepDialog's panelStyle).
import test from "node:test";
import assert from "node:assert/strict";
import { readSrc, stepSplit, misplaced, localeMissing } from "./helpers/stepSplit.mjs";

const m = readSrc("src/components/GradeTonnageModal.jsx");
const split = stepSplit(m, ["cutoffs", "report", "result"]);
const WHERE = {
  cutoffs: ["setCutoffText(", "setDensity(", "setDensityLayer(", "fillFromLog(", "setAllCodes(", "<AssayStaleBadge", "limited?.active"],
  report: ["setSolidId(", "setInsideMode(", "setByBench(", "setBenchH", "setBenchDatum"],
  result: ["setInterpOnly(", "<svg", "onClick: exportCsv", "NOT_A_RESOURCE", "EXPLORATION_TARGET_CAUTION", "benchRows"],
};

test("#4073 every setting of the grade-tonnage dialog is in its step", () => assert.deepEqual(misplaced(split, WHERE), []));

test("#4073 on the shared shell: three steps, Export CSV the one primary, still resizable", () => {
  assert.ok(m.includes('<StepDialog title={tr("Grade-tonnage: {name}", { name: model.name })}'));
  for (const k of ['tr("Cutoffs")', 'tr("Report")', 'tr("Result")', 'tr("Next: report")', 'tr("Next: result")', 'tr("Export CSV")']) assert.ok(m.includes(k), k);
  assert.ok(m.includes("onClick: exportCsv, disabled: !rows.length"));
  assert.ok(!m.includes("gs-btn--primary") && !m.includes("useFocusTrap") && !m.includes("useEscapeKey"));
  assert.ok(m.includes('panelStyle={{ minWidth: "min(480px, 94vw)", maxWidth: "96vw", resize: "horizontal"'));
});

test("#4073 not a resource estimate: the one sentence seen first, the exploration-target caution behind Why and in Help", () => {
  assert.match(m, /\{tr\(NOT_A_RESOURCE\)\}\{" "\}<MoreFold summary=\{tr\("Why"\)\}[^>]*>\{tr\(EXPLORATION_TARGET_CAUTION\)\}<\/MoreFold>/);
  const help = m.slice(m.indexOf("const helpCard"), m.indexOf("const steps = ["));
  assert.ok(help.includes("<details open>") && help.includes("tr(EXPLORATION_TARGET_CAUTION)") && help.includes('openHelp("grade-tonnage")') && m.includes("help={helpCard}"));
});

test("#4073 its new messages are in every language", () => assert.deepEqual(localeMissing(["Cutoffs", "Next: report", "Next: result", "Report", "Result", "Cautions and details", "Fine-tune…", "Why", "Help"]), []));
