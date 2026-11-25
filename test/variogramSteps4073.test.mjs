// TASKS.csv #4073 — the Variogram dialog as steps on the shared StepDialog (Data, Model, Run): every setting it had is in its step, the one gold primary is Compute variogram,
// "This is a diagnostic, not an estimator." stays seen first with its reasons behind Why, the result's cautions are in one fold, the description is in Help.
import test from "node:test";
import assert from "node:assert/strict";
import { readSrc, stepSplit, misplaced, localeMissing } from "./helpers/stepSplit.mjs";

const m = readSrc("src/components/VariogramModal.jsx");
const split = stepSplit(m, ["data", "model", "run"]);
const WHERE = {
  data: ["setSymbol(", "setCompositeLength(", "setMinCoverage(", "setDomainKey(", "setDomainValue(", "setSamplesFrom(", "<UnsampledChoice"],
  model: ["setTransform(", "setEstimator(", "setLagDistance(", "setNLags(", "setLagTolerance(", "setHoleMode(", "setModel(", "setDirectional(", "setInPlane("],
  run: ["onClick={runBoth}", "vgClient.current.cancel()", "<svg", "result.fit", "Cautions and details"],
};

test("#4073 every setting of the variogram dialog is in its step", () => assert.deepEqual(misplaced(split, WHERE), []));

test("#4073 on the shared shell: three steps, Compute variogram the one primary", () => {
  assert.ok(m.includes('<StepDialog title={tr("Variogram — spatial continuity")}'));
  for (const k of ['tr("Data")', 'tr("Model")', 'tr("Run")', 'tr("Next: model")', 'tr("Next: run")', 'tr("Compute variogram")']) assert.ok(m.includes(k), k);
  assert.ok(m.includes("onClick: run, disabled: !canRun") && m.includes("const canRun = !(running || !symbols.length || !uns.ready);"));
  assert.ok(!m.includes("gs-btn--primary") && !m.includes("useFocusTrap") && !m.includes("useEscapeKey"));
});

test("#4073 a diagnostic, not an estimator: one line seen first, the reasons behind Why; the result's cautions in one fold; the description in Help", () => {
  assert.match(m, /<b>\{tr\("This is a diagnostic, not an estimator\."\)\}<\/b>\{" "\}<MoreFold summary=\{tr\("Why"\)\}/);
  assert.ok(m.includes("It does") && m.includes("Fitting here changes no estimate already run."), "the whole wording is kept");
  const r = m.slice(m.indexOf("{result && plot && ("));
  assert.ok(r.indexOf('<MoreFold summary={tr("Cautions and details")}>') < r.indexOf("<svg"), "the cautions fold, then the plot and the numbers");
  const help = m.slice(m.indexOf("const helpCard"), m.indexOf("const steps = ["));
  assert.ok(help.includes("<details open>") && help.includes("Experimental variogram + fitted nugget / sill / range") && m.includes("help={helpCard}"));
});

test("#4073 its new messages are in every language", () => assert.deepEqual(localeMissing(["Next: model", "Next: run", "Data", "Model", "Run", "Why", "Cautions and details", "Fine-tune…", "How it works"]), []));
