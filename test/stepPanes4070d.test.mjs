// TASKS.csv #4070 part 3 — the Targeting and Mine Design side panels as steps (Matt's layout C, "steps, like the Guide", 2026-11-24): Undrilled zones, Evidence overlay,
// Planned holes (Targeting) and (Mine Design's four, in their own commit), each with the shared
// StepPane: the question, the action as the one gold primary, a Result in numbers, Fine-tune (and Details) for the rest. The reachable set: every setting and tool a
// pane offered before the steps is still in it (a step, the Result step, a fold), so nothing was lost in the move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { undrilledNumbers } from "../src/lib/paneSteps.js";

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
const reachable = (src, list, who) => assert.deepEqual(list.filter((k) => !src.includes(k)), [], who);

test("Result of Undrilled zones: the share covered, the open volume without the gaps left out, the zones, the holes counted", () => {
  const r = { unitCells: 1000, coveredCells: 640, cellVolume: 8, uncoveredCells: 360, ignored: { cells: 10, zones: 3 }, zones: [{}, {}], holes: { drilled: 12, planned: 2 } };
  const n = undrilledNumbers(r);
  assert.equal(n.coveredPct, 64);
  assert.equal(n.unitV, 8000);
  assert.equal(n.openV, (360 - 10) * 8, "the gaps under the minimum are left out of the open volume, as the pane's own sentence says");
  assert.deepEqual([n.zones, n.ignoredZones, n.drilled, n.planned], [2, 3, 12, 2]);
  assert.equal(undrilledNumbers(null), null);
  assert.equal(undrilledNumbers({ unitCells: 0 }), null);
});

test("Undrilled zones: two steps (the unit, how near is covered), Find as the action, the numbers in Result; the block, gaps and the three counting choices in Fine-tune", () => {
  const s = read("src/components/UndrilledZonesPane.jsx");
  assert.match(s, /<StepPane id="undrilled" label=\{tr\("Undrilled zones"\)\}/);
  for (const k of ['key: "unit"', 'key: "cover"']) assert.ok(s.includes(k), k);
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="undrilled">/);
  assert.match(s, /action=\{\{ label: busy \? tr\("Measuring…"\) : tr\("Find undrilled zones"\), onClick: run, disabled: !unit \|\| busy \|\| !\(coverM > 0\) \}\}/);
  reachable(s, ["setUnitId(", "setCoverM(", "setCellText(", "setCellZText(", "setMinText(", "setInsideOnly(", "setAssayedOnly(", "setWithPlanned(", "runUndrilledZonesAsync(", "onPlanTo(", "Add the zones to the 3D view", "Plan a hole to here",
    "undrilledNumbers(result)", "<StepNumbers", "OPEN_ROUTE", "supportText", 'unit.type === "geophysical_shell"'], "Undrilled zones");
});

test("Evidence overlay: three steps (the area, what counts as evidence, the known occurrences), Compute as the action, the score's numbers in Result; the cell, level, combine rule and the details in folds", () => {
  const s = read("src/components/EvidenceOverlayPane.jsx");
  assert.match(s, /<StepPane id="evidence" label=\{tr\("Evidence overlay"\)\}/);
  for (const k of ['key: "area"', 'key: "evidence"', 'key: "occurrences"']) assert.ok(s.includes(k), k);
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="evidence">/);
  assert.match(s, /<MoreFold summary=\{tr\("Details"\)\} data-fine-tune="evidence-details">/);
  assert.match(s, /action=\{\{ label: tr\("Compute"\), onClick: compute, disabled: !grid \|\| !layers\.length \}\}/);
  reachable(s, ["setGridArea(", "setGridCell(", "setLevelAt(0", "setLevelAt(2", "setGridBox(", "setOperator(", "setGamma(", "setTraining(", "setGtPick(", "addLayer(", "updateLayer(", "toMap(\"fuzzy\")", "toMap(\"posterior\")", "toMap(\"posteriorSd\")", "toTif(\"fuzzy\")", "toTif(\"posterior\")",
    "<EndInOreList", "<PAPlot", "<TopPlaces", "result.wofe.rows.map", "result.auc", "result.blockers", "result.topShare", "drillOnly", "Hide those {n}", "Plan view: each evidence is one value per map cell"], "Evidence overlay");
});

test("Planned holes: Collar, Direction, + Add hole as the action, the holes (list, exports, checks) as the last step, opened first when holes exist; the north reference, CSV and pattern in Fine-tune, aiming in its own fold", () => {
  const p = read("src/components/PlannedHoleParts.jsx"), v = read("src/modules/ViewerModule.jsx"), st = read("src/components/StepPane.jsx");
  assert.match(p, /<StepPane id="plan" label=\{tr\("Planned drillholes"\)\} start=\{plannedSoFar\.length \? "result" : 0\}/);
  for (const k of ['key: "collar"', 'key: "direction"']) assert.ok(p.includes(k), k);
  assert.match(p, /action=\{\{ label: tr\("\+ Add hole"\), onClick: submit, disabled: !canAdd,/);
  assert.match(p, /result=\{\{ key: plannedSoFar\.length \|\| null, label: tr\("Holes"\), offTitle: tr\("After the first hole"\), body: resultBody \}\}/);
  assert.match(p, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="plan">/);
  assert.match(p, /<MoreFold summary=\{tr\("Aim at a target…"\)\} data-fine-tune="plan-aim" open=\{aimOpen\}>/);
  assert.match(p, /setAimOpen\(true\)/, "a target handed over from Undrilled zones opens the aim fold");
  reachable(p, ["onStartPick", "solveTarget", "solveCollar", "planFromNearest(", "importCsv(", "<PlannedHolePattern", "setAzRef(", "<CollarPicker", "<ProbableGradePanel", "setTarget(", "setFromCollarId("], "Planned holes form");
  assert.match(v, /paneHeader\("Planned drillholes", Target, "model", true/);
  reachable(v, ["resultBody={<>", "<PlannedHoleRow", "exportPlannedHoles(\"csv\")", "exportPlannedHoles(\"kml\")", "exportPlannedHoles(\"gpx\")", "<PlannedHoleChecks", "exportPiercePoints"], "Planned holes list");
  // the shared pane: a pane can open on its Result, name that step, and grey it with its own words
  for (const k of ['start === "result"', "result?.label", "result.offTitle"]) assert.ok(st.includes(k), k);
});

test("Geology map and Outcrop structures: File, Layers (the cards as the last step) / File, Columns, Sets; the import buttons are the actions, the file's CRS in Fine-tune, a chosen file opens its column check", () => {
  const s = read("src/components/SurfaceMappingPanel.jsx");
  assert.match(s, /<StepPane id="geomap" label=\{tr\("Geology map"\)\} start=\{mapLayers\.length \? "result" : 0\}/);
  assert.match(s, /<StepPane id="structs" label=\{tr\("Outcrop structures"\)\} start=\{surfaceStructures\.length \? "result" : 0\}/);
  for (const k of ['key: "file"', 'key: "columns"', 'label: tr("Layers")', 'label: tr("Sets")']) assert.ok(s.includes(k), k);
  assert.match(s, /label: busy \? tr\("Importing…"\) : tr\("Import map layer…"\), onClick: \(\) => mapInput\.current\.click\(\), disabled: busy/);
  assert.match(s, /action=\{\{ label: tr\("Import"\), onClick: commitStructs, disabled: !pendingStruct, step: 1 \}\}/);
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="geomap">/);
  assert.match(s, /requestStep\("structs", "columns"\)/);
  assert.match(s, /requestStep\("structs", "file"\)/, "Cancel goes back to the file step");
  reachable(s, ["importMaps(", "readStructCsv(", "applyQmlToLayer(", "makeSubcrop(", "outlineSubcrop", "setSubDepth(", "<SourceCrsField", "<AzimuthRefPicker", "<CoveringLayers", "exportStructSet(", "changeStyleField(", "setOpenLegend(", "setTyping(", "setPendingStruct(",
    "updateSurfaceStructureSet(", "removeSurfaceStructureSet(", "removeMapLayer(", "setTypeSymbol("], "Surface mapping");
});

test("Unit polygons: the layer, the unit and a note as the question, Draw a polygon (then Finish) as the action, the polygons as the last step; the notes and the terrain options in Fine-tune", () => {
  const s = read("src/components/UnitPolygonPane.jsx");
  assert.match(s, /<StepPane id="unitpoly" label=\{tr\("Unit polygons"\)\}/);
  assert.ok(s.includes('key: "unit"'));
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="unitpoly">/);
  assert.match(s, /label: tr\("Finish"\), onClick: \(\) => finish\(\)/);
  assert.match(s, /label: tr\("Draw a polygon"\), onClick: onStart/);
  reachable(s, ["setLayerPick(", "setNewName(", "setUnit(", "setNoteText(", "onUndo", "onCancel", "removeUnitPolygon", "remove(i)", "drawnCopyOf", "<datalist", "planElevationText"], "Unit polygons");
});

test("Interpretation lines: the survey, layer, type and confidence as the question, Draw a line (then Finish) as the action, the lines as the last step; names, snapping and the drawing plane in Fine-tune", () => {
  const s = read("src/components/InterpretPane.jsx");
  assert.match(s, /<StepPane id="interpret" label=\{tr\("Interpretation lines"\)\}/);
  assert.ok(s.includes('key: "line"'));
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="interpret">/);
  assert.match(s, /label: tr\("Finish"\), onClick: finish, disabled: n < 2/);
  assert.match(s, /label: tr\("Draw a line"\), onClick: onStart, disabled: drawOn === "slice" && level == null/);
  reachable(s, ["setSurvey(", "setLayerPick(", "setNewName(", "setType(", "setConfidence(", "setAngle(", "setDirection(", "setName(", "setNoteText(", "onSnap(", "setDrawOn(", "setLevelRl(", "onUndo", "onCancel", "setEditIdx(", "restore", "remove(i)", "setLayerElev("], "Interpretation lines");
});

test("a pane's StepPane action is a handler, not a function that returns one (found live on Harry in #4070: a halo's click did nothing)", () => {
  for (const f of ["SurfaceMappingPanel", "UnitPolygonPane", "InterpretPane", "UndrilledZonesPane", "EvidenceOverlayPane", "PlannedHoleParts", ]) assert.doesNotMatch(read(`src/components/${f}.jsx`), /onClick: \(\) => \(\) =>/, f);
});

test("the seven panes' new strings are in every language", () => {
  const keys = [...["What kind of line?","After the first line","Which map file?","After the first layer","Where are the measurements?","Check the columns","Choose a file first.","Sets","After the first set","Polygons","After the first polygon"], "Cells scored","Occurrence cells","Posterior / known","ROC-AUC","Which area?","What counts as evidence?","Occurrences","Known occurrences? (optional)","Details","Where does the hole start?","Which way does it go?","Aim at a target…","After the first hole","Which unit?","An open mesh has no inside to search.","Covered","How near counts as covered?","Not covered","Holes counted","{drilled} drilled, {planned} planned","Notes on this run","{v} in 1 zone","{v} in {n} zones"];
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of keys) assert.ok(d[k], `${lang}: ${k}`);
  }
});
