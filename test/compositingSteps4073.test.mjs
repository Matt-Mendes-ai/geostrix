// TASKS.csv #4073 — Downhole compositing as steps on the shared StepDialog (Data, Rules, Result): every setting is in its step, Export composites (CSV) is the one gold primary,
// Keep as layer stays beside the table, the notes are folded and the description is in Help.
import test from "node:test";
import assert from "node:assert/strict";
import { readSrc, stepSplit, misplaced, localeMissing } from "./helpers/stepSplit.mjs";

const m = readSrc("src/components/CompositingModal.jsx");
const split = stepSplit(m, ["data", "rules", "result"]);
const WHERE = {
  data: ["setSymbol(", "setExtraSyms(", "setIncludeQAQC(", "dupInfo.exactDuplicates"],
  rules: ["setLength(", "setDomainKey(", "setCapValue(", "setMinCoverage(", "setWeightBy(", "setShortEnd(", "setMinEnd(", "<CapAuditHint"],
  result: ["scrollRef", "onClick={keepAsLayer}", "<CsvStampToggle", "onClick: exportCSV", "{kept &&"],
};

test("#4073 every setting of the compositing dialog is in its step", () => assert.deepEqual(misplaced(split, WHERE), []));

test("#4073 on the shared shell: three steps, Export composites (CSV) the one primary", () => {
  assert.ok(m.includes('<StepDialog title={tr("Downhole compositing")}'));
  for (const k of ['tr("Data")', 'tr("Rules")', 'tr("Result")', 'tr("Next: rules")', 'tr("Next: result")', 'tr("Export composites (CSV)")']) assert.ok(m.includes(k), k);
  assert.ok(m.includes("onClick: exportCSV, disabled: results.length === 0"));
  assert.ok(!m.includes("gs-btn--primary") && !m.includes("useFocusTrap") && !m.includes("useEscapeKey"));
  assert.ok(m.includes('<CautionFold>') && m.includes('<MoreFold summary={tr("Fine-tune…")}>'));
});

test("#4073 the description and the Help page link are in the Help card", () => {
  const help = m.slice(m.indexOf("const helpCard"), m.indexOf("const steps = ["));
  assert.ok(help.includes("<details open>") && help.includes('openHelp("downhole-compositing")') && help.includes("Takes every hole with lab assays"));
  assert.ok(m.includes("help={helpCard}"));
});

test("#4073 its new messages are in every language", () => assert.deepEqual(localeMissing(["Next: rules", "Next: result", "Rules", "Result", "Data", "Cautions and details", "Fine-tune…", "Help"]), []));
