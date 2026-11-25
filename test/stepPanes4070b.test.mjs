// TASKS.csv #4070 — six more 3D Modelling panes as steps (Matt's layout C, "steps, like the Guide", 2026-11-24): Vein / dyke, Alteration, Implicit surface,
// Structural modelling, Grade estimation and Lithology groups, each with the shared StepPane: the question, the action as the one gold primary, a Result in
// numbers where a run lands, Fine-tune for the rest. The numbers each Result shows (lib/paneSteps.js) and the reachable set: every setting and tool a pane
// offered before the steps is still in it (a step, the Result step or Fine-tune), so nothing was lost in the move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runResult, stackResult, veinResult, alterationResult } from "../src/lib/paneSteps.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs";

const panes = modellingPanesSource();
const block = (id) => { const a = panes.indexOf(`{toolPane === "${id}" && (<>`); const b = panes.indexOf("{toolPane === ", a + 10); return panes.slice(a, b > a ? b : undefined); };
const reachable = (b, list) => assert.deepEqual(list.filter((k) => !b.includes(k)), []);

test("Result of the surface tools: the newest run (its surfaces share runId), the median typical miss, the worst, the contacts left out; the stack's own is looked up by its contacts", () => {
  const mk = (run, name, type, typ, worst, left = 0, of = 10) => ({ name, type, params: { runId: run, contactFit: { points: of, typicalMissM: typ, worstMissM: worst }, ...(left ? { contactsWithoutSurface: { left, of } } : {}) } });
  const list = [mk("a", "Top of A", "stratigraphic_contact", 9, 99), mk("b", "Structure: FZ", "fault", 1, 4), mk("b", "Structure: FZ2", "fault", 3, 12, 2, 20)];
  const r = runResult(list);
  assert.deepEqual([r.runId, r.n, r.typicalMissM, r.worstMissM, r.left, r.of], ["b", 2, 1, 12, 2, 30]);
  assert.equal(stackResult(list).runId, "a", "the stack looks for a stratigraphic contact");
  assert.equal(runResult([{ name: "shell", params: { tool: "numeric grade shell" } }]), null);
});

test("Result of the Vein / dyke pane: the newest landing's walls and solid share one record", () => {
  const p = (extra) => ({ tool: "vein/dyke (midplane + thickness field)", target: "Vn1", generatedAt: "t2", intercepts: 12, trueThicknessMeanM: 1.5, trueThicknessMinM: 0.4, trueThicknessMaxM: 3.1, dip: 61.2, dipDir: 133,
    shape: "planar", attitudeSource: "fitted to intercept midpoints", contactResidualRmsM: 0.21, ...extra });
  const s = [{ name: "old", params: p({ generatedAt: "t1", intercepts: 5 }) }, { name: "fw", params: p({}) }, { name: "hw", params: p({}) }, { name: "solid", params: p({ pinchOut: true }) }, { name: "other", params: { tool: "numeric grade shell" } }];
  const r = veinResult(s);
  assert.deepEqual([r.key, r.target, r.surfaces, r.intercepts, r.meanM, r.shape, r.rmsM], ["t2", "Vn1", 3, 12, 1.5, "planar", 0.21]);
  assert.equal(r.pinchOut, true);
  assert.equal(veinResult([{ name: "x", params: {} }]), null);
});

test("Result of the Alteration pane: samples inside, the shares far from the logs and beyond the drilling (null when not measured), the closure", () => {
  const s = [{ params: { tool: "alteration halo (indicator envelope)", target: "SER", generatedAt: "t1", samplePoints: 900, alteredSamplePoints: 120, farFromLogs: { share: 0.08 }, beyondDrilling: { share: 0.6 }, closure: "artificial", cellSizeM: 12, searchRadiusM: 90 } },
    { params: { tool: "unit body (indicator envelope)", target: "BAS", generatedAt: "t2", samplePoints: 50, alteredSamplePoints: 10, farFromLogs: { share: 0 }, closure: "natural" } }];
  const a = alterationResult(s.slice(0, 1));
  assert.deepEqual([a.key, a.samples, a.altered, a.farShare, a.beyondShare, a.closure, a.cellM, a.searchM], ["t1", 900, 120, 0.08, 0.6, "artificial", 12, 90]);
  const b = alterationResult(s);
  assert.deepEqual([b.target, b.farShare, b.beyondShare], ["BAS", 0, null]);
  assert.equal(alterationResult([]), null);
});

test("Vein / dyke: one step, Build vein as the action, the numbers in Result; the cell, search and attitude settings in Fine-tune", () => {
  const b = block("vein");
  assert.match(b, /paneHeader\("Vein \/ dyke modelling", Waves, "model", true/);
  assert.match(b, /<StepPane id="vein" label=\{tr\("Vein \/ dyke modelling"\)\}/);
  assert.ok(b.includes('key: "vein"'));
  assert.match(b, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="vein">/);
  reachable(b, ["runVeinModel(veinTarget)", "setVeinTarget(", "setVeinCellSize(", "setVeinSearchRadius(", "setVeinDip(", "setVeinDipDir(", "veinResult(implicitSurfaces)", 'tr("Cell size (m)")', 'tr("Search (m)")', 'tr("Dip (°)")', 'tr("Dip dir (°)")',
    "The list holds the Veins log", "Set your vein codes' role to cross-cutting"]);
});

test("Alteration: one step (the layer and its intensity floor, the code), Build halo as the action, the numbers in Result; the cell and search in Fine-tune", () => {
  const b = block("alteration");
  assert.match(b, /<StepPane id="alteration" label=\{tr\("Alteration modelling"\)\}/);
  assert.ok(b.includes('key: "code"'));
  assert.match(b, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="alteration">/);
  reachable(b, ["runAlterationModel(alterationTarget", "setAltSource(", "setAlterationTarget(", "setAlterationCellSize(", "setAlterationSearchRadius(", "altSourceCodes.map", "altGroups.map", "altVocabFields", "altNumericFields",
    'tr("Alteration layer")', 'tr("Intensity field")', 'tr("Only where")', "alterationResult(implicitSurfaces)", "unloggedZero"]);
});

test("Implicit surface: one step (the unit), Run as the action, the surfaces of the run in Result; the drawn contacts and the sensitivity spread in Fine-tune", () => {
  const b = block("implicit");
  assert.match(b, /<StepPane id="implicit" label=\{tr\("Implicit surface"\)\}/);
  assert.ok(b.includes('key: "unit"'));
  assert.match(b, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="implicit">/);
  reachable(b, ["runImplicitModel(implicitTarget)", "setImplicitTarget(", "setIncludeSectionContacts(", "setSensOpen(", "setSensSigmaPos", "setSensSigmaDeg", "setSensN(", "setSensBudget(", "Run with sensitivity spread",
    "ensemble:", "{leftOutNote}", "clusterNote(true)", "runResult(implicitSurfaces)", "optgroup label={tr(\"Modelling codes\")}"]);
});

test("Structural modelling: one step (the structure type), Run as the action, the run's numbers in Result; the picks' own checks in Fine-tune", () => {
  const b = block("structural");
  assert.match(b, /<StepPane id="structural" label=\{tr\("Structural modelling"\)\}/);
  assert.ok(b.includes('key: "type"'));
  assert.match(b, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="structural">/);
  reachable(b, ["runStructuralModel(structuralTarget)", "setStructuralTarget(", "setCoreOrientOpen(true)", "setStereonetOpen(true)", "setTadpoleOpen(true)", "betaReferenceCounts(", "<AlphaOnlyHint", "runResult(implicitSurfaces)"]);
});

test("Grade estimation: one step, the estimation as the action; Grade x thickness, the variogram, the tonnage and block calculators in Fine-tune", () => {
  const b = block("gradeEst");
  assert.match(b, /<StepPane id="estimation" label=\{tr\("Grade estimation"\)\}/);
  assert.match(b, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="estimation">/);
  reachable(b, ["setGradeEstOpen(true)", "setGtOpen(true)", "setVariogramOpen(true)", "<GradeTonnageLauncher", "<BlockCalculatorLauncher", "<GradeThicknessModal"]);
});

test("Lithology groups: one step (which codes belong together), + New group as the action, the suggestions and the groups' list as they were", () => {
  const b = block("groups");
  assert.match(b, /<StepPane id="groups" label=\{tr\("Lithology groups"\)\}/);
  assert.ok(b.includes('key: "groups"'));
  reachable(b, ["askPrompt(", "addLithoGroup(", "removeLithoGroup(", "updateLithoGroup(", "setExpandedLithoGroupId(", "caseVariantGroups(", "subdivisionGroups(", "groupOverlaps(", "<LithoSuggestBox", "No groups yet."]);
});

test("the six panes' new strings are in every language", async () => {
  const { readFileSync } = await import("node:fs");
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Which structure type?", "Which unit's top?", "Which codes belong together?", "Fill a block model from the assays?", "True thickness, mean", "True thickness, range", "Dip / dip direction",
      "Contact misfit (RMS)", "Samples inside", "Far from the logs", "Envelope", "Closed by the search wall", "Closed naturally", "Cell / search", "Planar", "Curved"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
