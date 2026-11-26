// TASKS.csv #4073 (Main's list, side 4) — the three crowded Geochem windows on StepDialog: Surface QA/QC, Level surveys and Grade statistics.
// The reachable set of each: every tool and setting the window offered before the steps is still in it (a step, a fold, the one gold primary).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const qaqc = read("../src/components/SurfaceQaqcPanel.jsx");
const level = read("../src/components/LevellingPanel.jsx");
const stats = read("../src/components/GradeStatistics.jsx");
const missing = (text, list) => list.filter((k) => !text.includes(k));

test("Surface QA/QC: Data, Rules and one step per check, the report as the last step's one gold primary, and every control is still there", () => {
  assert.match(qaqc, /<StepDialog title=\{tr\("Surface QA\/QC"\)\}/);
  for (const k of ['["data", tr("Data")]', '["rules", tr("Rules")]', '["batches"', '["standards"', '["blanks"', '["duplicates"', '["limits"']) assert.ok(qaqc.includes(k), k);
  assert.match(qaqc, /label: tr\("QC report \(CSV\)"\), onClick: exportReport/);
  assert.deepEqual(missing(qaqc, ["addCertificates", "setSettings({ batchBy", "settings.targets", "settings.blankMultiple", "settings.rpd", "settings.pairFloorMultiple",
    "setStdCode", "setCrmCertificate(std.code", "setSymbol(", 'aria-label={tr("Control chart")}', 'aria-label={tr("Original against duplicate")}', "setSurfaceQc(", "Remove QC results"]), []);
  assert.doesNotMatch(qaqc, /role="tablist"/, "the old tab strip is gone");
  assert.match(qaqc, /<DialogHelpCard page="qaqc"/);
});

test("Level surveys: Surveys, Ties and Result, Write as the one primary, the method choices and the distance in Fine-tune", () => {
  assert.match(level, /<StepDialog title=\{tr\("Level surveys"\)\}/);
  for (const k of ['key: "surveys"', 'key: "ties"', 'key: "result"']) assert.ok(level.includes(k), k);
  assert.match(level, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="levelling">/);
  assert.match(level, /label: tr\("Write \{col\}"[^}]*\}\), onClick: write/);
  assert.deepEqual(missing(level, ["setMedium", "setSymbol", "setColumn", "setRefPick", "setSurPick", "setRadiusM", 'setMethodPick(e.target.checked ? "huber"', 'setMethodPick(e.target.checked ? "quantile"',
    "TieScatterPlot", "levellingPreview", "writeLevelled"]), []);
});

test("Grade statistics: Data, Distribution, Cap and Cut-offs, Export as the one primary, Log scale and Length-weight in Fine-tune", () => {
  assert.match(stats, /<StepDialog title=\{tr\("Grade statistics"\)\}/);
  for (const k of ['key: "data"', 'key: "distribution"', 'key: "cap"', 'key: "cutoffs"']) assert.ok(stats.includes(k), k);
  assert.match(stats, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="grade-stats">/);
  assert.match(stats, /label: tr\("Export statistics \(CSV\)"\), onClick: exportCSV/);
  assert.deepEqual(missing(stats, ["setSource(", "setSymbolRaw(", "setDisplayUnit(symbol", "setDomainKey(e.target.value)", "setLogScale(e.target.checked)", "setLengthWeighted(e.target.checked)",
    "setIncludeQAQC(e.target.checked)", "setCapTest(", "setCutText(", "setAlsoSyms(", "addCutoff(", "markOverLimit", "setDrawAll(true)", "<Histogram", "<BoxPlots", "<ProbPlot", "<MetalAtRiskTable"]), []);
  assert.doesNotMatch(stats, /role="dialog"/, "StepDialog owns the dialog role, Escape and the focus trap");
});

test("the new labels are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${lang}.json`));
    for (const k of ["Rules", "Limits", "Certificates", "Told apart by", "Reference", "Adjust", "Ties", "Quantile matching", "Fit a line (Huber)", "Distribution", "Cap", "Cut-offs", "Include QC samples"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
