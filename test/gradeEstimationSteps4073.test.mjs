// TASKS.csv #4073 — Grade estimation → block model as steps on the shared StepDialog (Data, Search, Blocks, Run). Pinned: every setting the dialog had is still in it, in its step;
// the one gold primary is Run, then Add as block model (the Add button of the result is the shell's primary, not a second gold); the cautions and details of a result are in one fold
// and the numbers first; "Not a resource estimate." stays seen first, its reasons behind Why (the AI app access reads the whole paragraph, so it stays in the DOM); the long
// method notes are in Help.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const m = read("src/components/GradeEstimationModal.jsx");
const keys = ["data", "search", "blocks", "run"];
const at = keys.map((k) => m.indexOf(`key: "${k}"`)), end = m.indexOf("return <StepDialog");
const stepOf = (t, from = at[0]) => { const i = m.indexOf(t, from); if (i < 0) return "MISSING"; for (let k = keys.length - 1; k >= 0; k--) if (i >= at[k]) return i < end ? keys[k] : "outside"; return "before"; };

const WHERE = {
  data: ["setSourceKey(", "setSymbol(e.target.value)", "setSetPicked(", "setLogValues(", "setUseComposites(", "setCompositeLength(", "setMinCoverage(", "setCapValue(", "setIncludeQAQC(", "<DomainCaps", "<CapAuditHint", 'tr("Values on the floor")', "<UnsampledChoice", "<GeochemCompositingNote"],
  search: ["setMethod(", "setVgModel(", "setVgNugget", "setSearchRadius(", "setFlatReach(", "setMinSamples(", "setMinHoles(", "setMaxSamples(", "setMaxPerHole(", "The reach of a high-grade composite"],
  blocks: ["setBelowGround(", "setShellPick(", "setPadding(", 'tr("Cell size (m, cubic)")', "setGridMode(", 'tr("Origin {axis}"', "setSamplesFrom(", "setClassifySupport(", "setBlockBudget("],
  run: ["gridPreview &&", "onClick={run}", "cancelRun", "addSupportModel", "addKvModel", "setGtOpen(true)", "<GradeTonnageModal", "<EstimateCheck", "weakFitAsk", 'data-mcp="estimate-result"'],
};

test("#4073 every setting of the grade estimation dialog is in its step", () => {
  for (const [step, tokens] of Object.entries(WHERE)) for (const t of tokens) assert.equal(stepOf(t), step, `${t} should be in ${step}`);
});

test("#4073 on the shared shell: four steps, Run then Add as the one primary, no second gold", () => {
  assert.ok(m.includes('import StepDialog from "./StepDialog.jsx"') && m.includes('<StepDialog title={tr("Grade estimation → block model")}'));
  for (const k of ['tr("Data")', 'tr("Search")', 'tr("Blocks")', 'tr("Run")', 'tr("Next: search")', 'tr("Next: blocks")', 'tr("Next: run")']) assert.ok(m.includes(k), k);
  assert.ok(m.includes("onClick: result && !running ? addToProject : run, disabled: running ? true : result ? false : !canRun"), "Run, then Add as block model");
  assert.ok(m.includes('tr("Run estimation")') && m.includes('tr("Add as block model")') && m.includes('tr("Run again")'));
  assert.equal((m.match(/gs-btn--primary/g) || []).length, 1, "the primary is the shell's; the one left is the weak-fit question, which replaces it while it is asked (gs-primary-alt)");
  assert.ok(/gs-btn--primary[^\n]*gs-primary-alt/.test(m));
  assert.ok(!m.includes("useFocusTrap") && !m.includes("useEscapeKey") && !m.includes("overlay"), "the shell owns Esc, focus and the overlay");
  assert.ok(m.includes("!bounds || overLimit || reachPending || running || !symbol || !uns.ready /* #2417 */"), "Run is held back as before");
});

test("#4073 the result in numbers first, every caution and detail in one fold; Not a resource estimate. one line seen first, its reasons behind Why", () => {
  const r = m.slice(m.indexOf('data-mcp="estimate-result"'));
  const fold = r.indexOf('<CautionFold>');
  assert.ok(fold > 0);
  assert.ok(r.indexOf("{result.supportCounts && result.blocksEstimated > 0 && (() =>") < fold, "the support split before the fold");
  assert.ok(r.indexOf("{result.belowDrilling?.blocks > 0") > fold && r.indexOf("{result.dominatedCells > 0 && (") > fold && r.indexOf("{result.noCodeBlocks > 0") > fold, "the cautions inside it");
  assert.ok(r.indexOf("<EstimateCheck") > fold, "the check after it");
  assert.match(m, /<div data-mcp="estimate-not-resource"[^>]*>\s*<strong>\{tr\("Not a resource estimate\."\)\}<\/strong>\{" "\}<MoreFold summary=\{tr\("Why"\)\}/);
  assert.ok(m.includes("Nothing it produces is a Mineral Resource under NI 43-101 or JORC"), "the whole wording is still in the DOM for the AI app access (useMcpEstimate reads it)");
});

test("#4073 the method notes are in the Help card", () => {
  const help = m.slice(m.indexOf("const helpCard"), m.indexOf("const steps = ["));
  assert.ok(help.includes("<details open>") && help.includes('tr("How it works")'));
  assert.ok(help.includes("Nearest neighbour, inverse distance and moving least squares are complete estimation methods") && help.includes("Nearest-neighbour, inverse-distance, moving-least-squares or ordinary-kriging interpolation"));
  assert.ok(m.includes("help={helpCard}"));
});

test("#4073 its new messages are in every language", () => {
  const keys2 = ["Next: search", "Search", "Next: blocks", "Next: run", "Run again", "Cautions and details", "Why", "Fine-tune…", "Data", "Blocks", "Run"];
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(read(`src/locales/${l}.json`)); assert.deepEqual(keys2.filter((k) => !d[k]), [], l); }
});
