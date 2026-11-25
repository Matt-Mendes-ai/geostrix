// TASKS.csv #4073 — the import pop-ups as StepDialog steps (Matt: "I like the way the cross section pop up window was restyled. We should do similar for all
// pop up windows"): the Start dialog (Ground, then your data), the column matching (Columns, Options) and the assay import (Columns, Elements, Values).
// Each keeps its stacking level (the CRS question above the imports, the Start dialog under them, #3951), its gold Import on every step with Enter
// accepting the guesses (#3533), the warnings it had in sight, and every control it had. Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const missing = (s, list) => list.filter((k) => !s.includes(k));
const keys = (s) => [...s.matchAll(/\{ key: "([a-z]+)", label: /g)].map((m) => m[1]);

const D = {
  StartDialogs: { steps: ["ground", "data"], reach: ["onFiles={onGroundFiles}", "onFiles={importFiles}", "setNoDrill(", "setStartOptOut(", '"data-start-next": ""', '"data-start-done": ""', "onClick: next", "onClick: finish",
    'cancelLabel={tr("Close")}', "zIndex={Z}", '"data-start-dialog": step', "onDrop: (e) => { e.preventDefault(); e.stopPropagation(); }"] },
  ImportMappingModal: { steps: ["columns", "options"], reach: ["setTarget(e.target.value)", "setMapping(", "<CoordSetsNote", "<CollarElevationChoice", "<LogChannelsBox", "<MineralPercentBox", "<RowFilterBox", "<SourceCrsField",
    "azimuthRef: k", "localGridOn", "onClick={() => setAt(1)}", 'page={modal.target === "sg" ? "import-density" : "import-drillholes"}', "onClick: onCommit, disabled: blocked", "zIndex={Z_IMPORT}"] },
  AssayImportModal: { steps: ["columns", "elements", "values"], reach: ["setMapping(key, e.target.value)", "qc: { ...modal.qc, [key]: e.target.value }", "extraCols:", "setMethod(e.target.value)", "<RowFilterBox", "setAll(true)", "setAll(false)",
    "toggleEl(e.symbol)", "setHeader(e.symbol, ev.target.value)", "setCustomUnit(", "setUnit(e.symbol, ev.target.value)", "setKeepOxide(", "removeEl(e.symbol)", "addOthers(", "onClick={addElement}", "onClick={onQcLinks}",
    "setUnits(", "setAllOxide(true)", "overLimitCodes:", 'negativeMode: "bdl"', 'negativeMode: "missing"', 'zeroMode: "bdl"', 'zeroMode: "real"', 'blankMode: "missing"', 'blankMode: "bdl"', "keepRepeats:", "numberedRepeats:",
    'page="import-assays"', "onClick: onCommit, disabled: busyOrWaiting", "zIndex={Z_IMPORT}"] },
};

for (const [f, d] of Object.entries(D)) {
  test(`${f}: a StepDialog (${d.steps.join(", ")}) with everything it had`, () => {
    const s = read(f);
    assert.match(s, /import StepDialog from "\.\/StepDialog\.jsx";/);
    assert.match(s, /return <StepDialog title=\{heading\}/, "the dialog's name is seen (a const, not a tooltip)");
    assert.deepEqual(keys(s).filter((k) => d.steps.includes(k)), d.steps, "its steps, in order");
    assert.deepEqual(missing(s, d.reach), [], "every control and action is still reachable");
    assert.ok(!/useEscapeKey\(|useFocusTrap\(/.test(s), "Escape and the focus trap are StepDialog's");
  });
}

test("the import dialogs: Import on every step, Enter takes it, and what needs a look elsewhere is said where you are", () => {
  const m = read("ImportMappingModal"), a = read("AssayImportModal");
  assert.equal((m.match(/primary: importPrimary/g) || []).length, 2);
  assert.equal((a.match(/primary: importPrimary/g) || []).length, 3);
  for (const s of [m, a]) assert.match(s, /attrs: \{ "data-autofocus": ""/);
  assert.match(m, /\{optionLooks > 0 && <div role="status"/);
  assert.match(a, /\{looksLine\(0\)\}[\s\S]*\{looksLine\(1\)\}[\s\S]*\{looksLine\(2\)\}/);
  // the warnings that were in sight stay on the first step: the lab file on the pXRF button, the required columns, the station table
  const first = (s) => s.slice(s.indexOf('{ key: "columns"'), s.indexOf("{ key: ", s.indexOf('{ key: "columns"') + 10));
  assert.match(first(a), /labLike\?\.looksLikeLab/);
  assert.match(first(m), /missingRequired\.length > 0 && \(/);
  assert.match(first(m), /looksLikeStationTable/);
  for (const s of [m, a]) assert.match(s, /const Z_IMPORT = 62;/);
});
