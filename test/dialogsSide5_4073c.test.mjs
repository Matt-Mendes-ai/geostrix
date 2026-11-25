// TASKS.csv #4073 (round 2) — five more pop-ups as StepDialog steps (Matt: "I like the way the cross section pop up window was restyled. We should do
// similar for all pop up windows"; "too wordy … cut, don't just cap"): Data QC (Issues, Limits), the assay Style dialog (Markers, Classes), Boundary
// intercepts (one step), the Project report (one step) and the Block calculator (Models, Formula, Result). Each is a StepDialog whose name is a const
// (seen, not a tooltip), with every control and action it had, its long texts in a Help card where it had any, and its protective lines on the step
// where they matter. Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../src/components/${f}.jsx`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const missing = (s, list) => list.filter((k) => !s.includes(k));
const keys = (s) => [...s.matchAll(/\{ key: "([a-z]+)", label: tr\(/g)].map((m) => m[1]);
// the source of one step: from its key to the next step (or the end of the list)
const stepOf = (s, key) => { const a = s.indexOf(`{ key: "${key}"`), b = s.indexOf("{ key: ", a + 10); return s.slice(a, b > a ? b : s.indexOf("\n  ];", a)); };

const D = {
  DataQCModal: { steps: ["issues", "limits"], help: true,
    reach: ["toggleSeverity(sev)", "setCategoryFilter(e.target.value)", "setHideChecked(e.target.checked)", "openDataTable(qcTableRequest(issue))", "onZoomHole(issue.holeId)", "toggleChecked(issue)",
      "applyDensity(t, dMax)", "applyDensity(dMin, t)", "setDoglegWarn(v)", "setTerrainThreshold(v)", "onClick={requestCollarZFromTerrain}", "onClick={snapToTerrain}", "onClick={exportIssues}",
      "onClick: check", 'openHelp("data-qc")', "onClick={() => setAt(1)}", "overlayProps={backdropProps(onCancel)}", 'cancelLabel={tr("Close")}', "Ctrl+Z undoes it."],
    seen: { limits: ["A density outside this range is left out of the tonnage mean."], issues: ["Checking {n} holes…", "No issues match the current filters."] } },
  AssayStyleModal: { steps: ["markers", "classes"], help: true,
    reach: ["commit({ ...local, color: e.target.value })", "commit({ ...local, shape: e.target.value })", "opacity: Number(e.target.value)", "sizeMult: Number(e.target.value)", 'minCutoff: v == null ? "" : v',
      "onClick={addBreak}", "addOffer(o.value)", "onClick={roundAll}", 'setCutoff(v == null ? "" : String(v))', "onClick={addCutoff}", "updateBreak(i, { color: e.target.value })", "updateBreak(i, { label: e.target.value })",
      "updateBreak(i, { max: v ?? 0 })", "removeBreak(i)", "onClick={reset}", "onClick: onClose", "overlayProps={backdropProps(onClose)}"],
    seen: { classes: ["likely half a detection limit, not a measured grade", "Data range: <{dl} ({n} below detection)"] } },
  BoundaryInterceptsModal: { steps: ["intercepts"], help: true,
    reach: ["handlers.current.onToggle(i.id)", "handlers.current.onToggleSoft(i.id)", "handlers.current.onToggleInSet?.(editingId, i.id)", 'setLayerFilter(e.target.value); setUnitFilter("all");', "setUnitFilter(e.target.value)",
      "setHoleFilter(e.target.value)", "setEditingSetId(e.target.value)", "onRenameSet?.(editingSet.id, n.trim())", "onDeleteSet?.(editingSet.id)", "setNewSetName(e.target.value)", 'e.key === "Enter" && newSetName.trim() && onAddSet',
      "onSetMembership?.(editingSet.id, shown.map((i) => i.id), true)", "onSetMembership?.(editingSet.id, shown.map((i) => i.id), false)", "setLimit((l) => l + INTERCEPT_PAGE)", "onClick: exportCsv, disabled: !intercepts.length",
      "{promptEl}", "overlayProps={backdropProps(onCancel)}", 'cancelLabel={tr("Close")}'],
    seen: { intercepts: ["{intercepts} total{v}{v2}.", "Untick a pick to leave it out; click its circle to make it soft.", "The intercepts themselves are untouched."] } },
  ProjectReportModal: { steps: ["report"], help: false,
    reach: ["onClick: exportCSV, disabled: empty", '<StatCard label={tr("Drillholes")}', '<StatCard label={tr("Total metres")}', '<StatCard label={tr("Surface samples")}', '<StatCard label={tr("Layers with data")}',
      "<MiniTable rows={report.assayStats} />", "<MiniTable rows={report.surfaceStats} />", "overlayProps={backdropProps(onClose)}", 'cancelLabel={tr("Close")}'],
    seen: { report: ["Length-weighted mean; QAQC inserts excluded{v}; all domains combined, not composited or capped.", "Import drillholes or surface samples to generate a report."] } },
  BlockCalculatorModal: { steps: ["models", "formula", "result"], help: true,
    reach: ["setInputs((cur) => cur.map((y) => (y.key === x.key ? { ...y, var: v } : y)))", "setInputs((cur) => cur.filter((y) => y.key !== x.key))", "add([m])", "add(set)", "setFormula(e.target.value)", "onClick: run, disabled: !ready",
      "acRef.current?.abort()", "setName(e.target.value)", "setUnit(e.target.value)", "setLikeFirst(e.target.checked)", "onClick: addModel, disabled: !canAdd", 'openHelp("block-calculator")', "error={error}", "disabled: !namesOk"],
    seen: { result: ["blocks left out: a model the formula reads has no value there.", "blocks left out: the formula gives no number there", "It is a snapshot: it does not change when its inputs do.", "State the unit of the new value first"] } },
};

for (const [f, d] of Object.entries(D)) {
  test(`${f}: a StepDialog (${d.steps.join(", ")})${d.help ? " with a Help card" : ""}, and everything it had`, () => {
    const s = read(f);
    assert.match(s, /import StepDialog from "\.\/StepDialog\.jsx";/);
    assert.match(s, /return <StepDialog title=\{heading\}/, "the dialog's name is seen (a const, not a tooltip)");
    assert.match(s, /const heading = tr\("/);
    assert.deepEqual(keys(s), d.steps, "its steps, in order");
    if (d.help) { assert.match(s, /const help = \(\n\s*<details open>/, "the long explanations in the Help card (folded for the word count)"); assert.match(s, /help=\{help\}/); }
    assert.deepEqual(missing(s, d.reach), [], "every control and action is still reachable");
    for (const [step, lines] of Object.entries(d.seen)) assert.deepEqual(missing(stepOf(s, step), lines), [], `the protective lines stay seen on ${step}`);
    assert.ok(!/useEscapeKey\(|useFocusTrap\(/.test(s), "Escape and the focus trap are StepDialog's");
    assert.ok(!/<div style=\{overlay\}|className="gs-btn gs-btn--primary"/.test(s), "no overlay or gold button of its own: StepDialog draws them");
  });
}

test("Data QC stays on the common overlay (60), under the import dialogs (62); the Block calculator still does not close from the backdrop", () => {
  assert.doesNotMatch(read("DataQCModal"), /zIndex=/, "no zIndex prop");
  assert.doesNotMatch(read("BlockCalculatorModal"), /backdropProps/);
});

test("the long texts moved into the Help cards, not into tooltips", () => {
  const q = read("DataQCModal"), a = read("AssayStyleModal"), b = read("BoundaryInterceptsModal"), c = read("BlockCalculatorModal");
  const card = (s) => s.slice(s.indexOf("const help = ("), s.indexOf("</details>", s.indexOf("const help = (")));
  for (const t of ["It fixes nothing: correct the source and run it again.", "raise the top for massive sulphide", "Deviated holes bend 3–7° per 30 m"]) { assert.ok(card(q).includes(t), t); assert.ok(!q.includes(`title={tr("${t}`), t); }
  for (const t of ["keeping the same 'bigger = higher grade' relationship", "Recategorize: instead of one flat colour", "so none disappears", "Default classes: the 50th, 90th and 97.5th percentiles"]) assert.ok(card(a).includes(t) || a.slice(0, a.indexOf("const help = (")).includes(t), t);
  assert.match(card(a), /\{\(major \|\| logLims \|\| basisText\) && !local\.breaks\.some\(\(b\) => b\.seeded === false\)/);
  for (const t of ["the control points the implicit-modelling tools read", "a GemPy nugget tolerance", "Sets are saved with the project and exclude nothing"]) assert.ok(card(b).includes(t), t);
  assert.doesNotMatch(b, /<MoreFold/);
  for (const t of ["is left out, not set to zero", "How to write a formula", "GeoStrix proposes no price, recovery or penalty", "<li>Cu + Au * k</li>"]) assert.ok(card(c).includes(t), t);
});
