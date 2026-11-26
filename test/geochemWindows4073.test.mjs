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

// TASKS.csv #4088 — the rest of the row: QAQC, the per-hole grid and Isocon
const qc = read("../src/components/QAQCPanel.jsx");
const hv = read("../src/components/HoleValueGridPanel.jsx");
const iso = read("../src/components/IsoconTool.jsx");

test("QAQC: Data, then a step per check (Standards, Blanks, Duplicates, Method pairs, pXRF vs lab, Totals), Export as each check's one primary, every control still there", () => {
  assert.match(qc, /<StepDialog title=\{tr\("QAQC — lab quality control"\)\}/);
  assert.match(qc, /const stepKeys = \["data", \.\.\.tabs\];/);
  assert.match(qc, /label: tr\("Export current view \(CSV\)"\), onClick: exportCSV, disabled: !exportCount/);
  assert.deepEqual(missing(qc, ["setSymbol(", "setDetectionLimit(", "setBlankMult(", "setBlankThreshold(", "setPerMethod(", "setMethodLimit(", "setDupMin(", "setRepeatedAsDup(", "setSelectedStdId(",
    "setReviewOpen(true)", "<MethodPairsTab", "<OxideTotalsTab", "<QcPairReview", "<CertInputs", "<ControlChart", 'aria-label={tr("Detection limit")}', 'aria-label={tr("Minimum pair mean")}']), []);
  assert.doesNotMatch(qc, /role="dialog"/);
});

test("Grid a per-hole value: What, Where, How on a StepPane, Grid to raster the one action, the result in numbers", () => {
  assert.match(hv, /<StepPane id="maps-hole-value"/);
  for (const k of ['key: "what"', 'key: "where"', 'key: "how"']) assert.ok(hv.includes(k), k);
  assert.match(hv, /action=\{\{ label: tr\("Grid to raster"\), onClick: run/);
  assert.deepEqual(missing(hv, ["setSourceId(", "setCodes(", "setStat(", "setThreshold(", "setPlaceAtChoice(", "setDepthAs(", "setMethod(", "setCell(", "setBlank(", "setLogChoice(", "<StepNumbers"]), []);
});

test("Isocon: Groups, Immobile and Result, Export as the result's primary, 'only samples with every immobile element' in Fine-tune", () => {
  assert.match(iso, /<StepDialog title=\{tr\("Isocon \/ mass-change calculator"\)\}/);
  for (const k of ['key: "groups"', 'key: "immobile"', 'key: "result"']) assert.ok(iso.includes(k), k);
  assert.match(iso, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="isocon">/);
  assert.match(iso, /label: tr\("Export mass-balance table \(CSV\)"\), onClick: exportCSV/);
  assert.deepEqual(missing(iso, ["setFlt(", "addMatches(setPrecursorIds)", "addMatches(setAlteredIds)", "setPrecursorIds(new Set())", "setAlteredIds(new Set())", "setFilterText(", "toggle(immobile, setImmobile, s)", "setCommonOnly(", "<IntervalList"]), []);
});

test("the new labels are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${lang}.json`));
    for (const k of ["Rules", "Limits", "Certificates", "Told apart by", "Reference", "Adjust", "Ties", "Quantile matching", "Fit a line (Huber)", "Distribution", "Cap", "Cut-offs", "Include QC samples"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
