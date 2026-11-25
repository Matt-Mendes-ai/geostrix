// TASKS.csv #4070 — Modelling codes, Model settings, geoML models and Model from map as steps (Matt's layout C): each is a StepPane, and every
// setting and tool it had before is still in it (a step, Fine-tune, or the top), so nothing was lost in the move. Pure: reads the source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const missing = (src, list) => list.filter((k) => !src.includes(k));

test("Modelling codes: 1 Codes, 2 Re-code, 3 Number, 4 Body -> Build; the Correlation pane keeps its own layout", () => {
  const s = read("components/ModellingCodesPane.jsx");
  assert.match(s, /<StepPane id="mcodes" label=\{tr\("Modelling codes"\)\}/);
  for (const k of ['key: "codes"', 'key: "recode"', 'key: "number"', 'key: "body"']) assert.ok(s.includes(k), k);
  assert.match(s, /action=\{hasBody \? \{ label: bodyCode \? tr\("Build a closed body from \{code\}", \{ code: bodyCode \}\) : tr\("Build a closed body"\), onClick: \(\) => onBuildBody\(bodyCode\)/);
  assert.match(s, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="mcodes">/);
  assert.deepEqual(missing(s, ["setPickMode(!pickMode)", "setBoxOn(!boxOn)", "setFillBetween(", "chooseBoxCode(", "uncodeBoxRows()", "codeBoxRows(boxConflict.code, true)", "assignSelected(", "setConnectFrom(",
    "setBodyCode(", "iso: Number(e.target.value)", "search: n ?? 0", "cell: n ?? 0", "largest: e.target.checked", "unloggedOutside: e.target.checked", "assaySymbol: e.target.value", "assayCutoff:",
    "applyHolesOrder", "deleteCodesNamed(", "leaveOut(", "setPickedCodes(", "setCode(c.name, { color:", "setCode(c.name, { role:", "showCode(c.name)", "moveCode(c.name, -1)", "moveCode(c.name, 1)",
    "setNumberCodes(", "autoNumber(", "mode: e.target.value", "dip: n == null", "dipDir: n == null", "gap: n == null", "computeSheets()", "setSheetPreview(", "assign: {}, ties: []"]), []);
});

test("Model settings: 1 Area, 2 Detail, 3 Trend (its label the run messages name); the rest in Fine-tune; the Guide's door opens its step", () => {
  const s = read("modules/viewer/panes/SettingsPane.jsx");
  assert.match(s, /<StepPane id="settings" label=\{tr\("Model settings"\)\}/);
  for (const k of ['key: "area"', 'key: "detail"', 'key: "trend"']) assert.ok(s.includes(k), k);
  assert.match(s, /question: tr\("Structural trends"\)/);
  assert.deepEqual(missing(s, ["setModelArea(", "setModelDomainId(", "<ModelAreaRange", "clusterNote(", "setUnitField(", "setActiveInterceptSetId(", "setClipToDomainBoundary(", "setClipToTopo(",
    "setLimitToContacts(", "setContactReachM(", "setOrientTypesSel(", "setModelResolution(", "setSurfaceDetail(", "setRangeMultiplier(", "setThinPicks(", "setThinWindowM(", "setOrientationReachM(",
    "setSmoothClusters(", "enabled: e.target.checked", "azimuth: v", "dip: v", "major: v", "semiMajor: v", "minor: v", "minSamples:", "<TrendHelper", "<TrendsPanel"]), []);
  const mp = read("modules/viewer/ModellingPanes.jsx");
  assert.match(mp, /requestStep\("settings", s\.resolution && !s\.area && !s\.holes \? "detail" : "area"\)/);
});

test("geoML models: 1 Model (rock unit / grade, quality), 2 What, 3 Shape -> Model, 4 Result; the job, an earlier job and the update stay on top", () => {
  const s = read("components/PredictivePanel.jsx");
  assert.match(s, /<StepPane id="geoml" label=\{tr\("geoML models"\)\}/);
  for (const k of ['key: "kind"', 'key: "what"', 'key: "shape"']) assert.ok(s.includes(k), k);
  assert.match(s, /action=\{kind === "rock" \? \{ label: /);
  assert.ok(s.includes("onClick: runUnit, disabled: !ready || !unit.size || rockEmpty }"));
  assert.ok(s.includes("onClick: runGrade, disabled: !ready || !element || gradeEmpty }"));
  assert.match(s, /result=\{\{ key: runs\.length \? runs\.length : null/);
  assert.deepEqual(missing(s, ["setKind", "setQuality(", "setUnit(", "setLeaveOut(", "setUnitName(", "setDeep(", "setUseHidden(", "setDenseNear(", "setHeldOut(", "setShapePick(", "setBodyPct(",
    "blockSizes.setUnit", "setElement(", "setShellsOn(", "setCutoffText(", "setBandsOn(", "blockSizes.setGrade", "cancelRun(", "cancelJob(busyJob)", "addonUninstall()", "Update to {v}…",
    "<GeomlRunAdvice", "<GeomlMissedIntercepts", 'tr("Not a resource estimate.")']), []);
});

test("Model from map: 1 Map, 2 Order, 3 Data -> Build (still data-mcp=map-run for the AI app), 4 Result (the fit card)", () => {
  const s = read("components/MapModelPanel.jsx");
  assert.match(s, /<StepPane id="mapmodel" label=\{tr\("Model from map"\)\}/);
  for (const k of ['key: "map"', 'key: "order"', 'key: "data"']) assert.ok(s.includes(k), k);
  assert.match(s, /attrs: \{ "data-mcp": "map-run" \}/);
  assert.match(s, /result=\{\{ key: fit && !busy \? fit : null, body: fit && !busy \? <MapFitCard/);
  assert.match(s, /<div ref=\{roleListRef\} \/>/, "the cut offer's 'change the roles' still scrolls to the order");
  assert.deepEqual(missing(s, ["setLayerId(", "setField(", "setDescField(", "setClasses(", "setFaultLayerId(", "setFault(f.i, { on:", "setFault(f.i, { dip:", "setFault(f.i, { dipDir:", "<FaultPickOffer",
    "undoFaults", "<CutOffer", "setCut(null)", "setOrderFrom(", "move(i, -1)", "move(i, 1)", "setRole(u,", "setBreaks(", "setShowWhy(", "setRelation(", "setUseHoles(", "setCodeEdit(", "setFullDetail(",
    "setBodyOff(", "setBodyDepth(", "setBodyShape(", "setSheetDip(", "setSheetDipDir(", "fitToLogs", "setBodyDip(", "setBodyFlare(", "onBuildBodies?.("]), []);
});

test("side 5's buttons carry a role (#4069): none left without one in these files", async () => {
  const { buttonTags, hasRole } = await import("../scripts/button-roles.mjs");
  for (const f of ["components/MapModelPanel.jsx", "components/PredictivePanel.jsx", "components/CorrelationMatrix.jsx", "components/GeomlResultBlock.jsx", "components/LithoSuggestBox.jsx", "components/DomainsPanel.jsx",
    "components/GeomlMissedIntercepts.jsx", "components/DomainCaps.jsx", "components/AlterationBoxModal.jsx", "components/GeomlBlockSize.jsx", "components/ModellingCodesPane.jsx"]) {
    const left = buttonTags(read(f)).filter((t) => !hasRole(t.text)).length;
    assert.equal(left, 0, f);
  }
});
