// TASKS.csv #4070 — Faults, Section correlation and Explicit surface as steps (Matt's layout C, "steps, like the Guide", 2026-11-24; side 4). The reachable set of each:
// every tool and setting each pane offered before the steps is still in it (a step, the Result step, a fold), so nothing was lost in the move.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const panes = modellingPanesSource();
const block = (id) => { const a = panes.indexOf(`{toolPane === "${id}" && (<>`); const b = panes.indexOf("{toolPane === ", a + 10); return panes.slice(a, b > a ? b : undefined); };
const missing = (text, list) => list.filter((k) => !text.includes(k));

test("Faults: the builder is the steps (Evidence, Faults, Shape -> Build, then the Result), the tool rows the ribbon repeats are gone, every tool is still reachable", () => {
  const b = block("faults");
  assert.match(b, /paneHeader\("Faults", SquareSplitVertical, "model", true/, "the compact pane message (#4070)");
  const fb = read("../src/modules/viewer/FaultBuilder.jsx");
  assert.match(fb, /<StepPane id="faults" label=\{tr\("Faults"\)\}/);
  for (const k of ['key: "evidence"', 'key: "faults"', 'key: "shape"']) assert.ok(fb.includes(k), k);
  assert.match(fb, /onClick: build/);
  assert.match(fb, /fineTune=\{fineTune\}/);
  assert.deepEqual(missing(fb, ["setOff(", "setAssign(", "setNames(", "setDips(", "setShape(", "setGapM(", "setExtent(", "setMarginM(", "setUntil(", "check(s)", "addToStack(s)", "setCheckN(", "data-fault-built", "data-fault-kind", "data-fault-item"]), []);
  const fp = read("../src/modules/viewer/FaultsPanel.jsx");
  assert.doesNotMatch(fp, /requestModuleAction\("open-pane"/, "no row opens a pane the ribbon already opens");
  assert.equal((fp.match(/className="gs-btn gs-btn--sm"/g) || []).length, 1, "one Open button, over the two tools the ribbon has not");
});

test("Section correlation: the three tools are the steps (Fence, Intervals, Map contacts); each still there", () => {
  const b = block("correlation");
  assert.match(b, /paneHeader\("Section correlation", GitCompare, "model", true/);
  assert.match(b, /<StepPane id="correlation" label=\{tr\("Section correlation"\)\}/);
  for (const k of ['key: "fence"', 'key: "intervals"', 'key: "contacts"']) assert.ok(b.includes(k), k);
  assert.deepEqual(missing(b, ["setFenceOpen(true)", "mcodesPane(\"correlate\")", "<SurfaceGeologyProjection", "onProject={projectMapContact}", "setMapConstraint={setMapConstraint}", "emptyPaneHint(", "collars.length"]), []);
  const sg = read("../src/components/SurfaceGeologyProjection.jsx");
  assert.deepEqual(missing(sg, ["onProject(settings()", "setMapConstraint(e.target.checked", "setClasses(", "setRadius(", "setDepth(", "setManualDip(", "setManualDipDir(", "setTolerance(", "setLayerId(", "setContactKey("]), []);
  assert.doesNotMatch(sg, /ge-section-label/, "the step's question names it");
});

test("Explicit surface: Picks, Lines, Unit and Shape steps; every setting and tool it had is still in the pane (a step or More)", () => {
  const b = block("explicit");
  assert.match(b, /paneHeader\("Explicit surface", PenTool, "model", true/);
  const x = read("../src/components/ExplicitSurfacePanel.jsx");
  assert.match(x, /<StepPane id="explicit" label=\{tr\("Explicit surface"\)\}/);
  for (const k of ['key: "picks"', 'key: "lines"', 'key: "unit"', 'key: "shape"']) assert.ok(x.includes(k), k);
  assert.match(x, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="explicit">/);
  const reach = ["update({ boundedBy", "update({ color", "update({ contact", "update({ cutAtTerrain", "update({ dipGuide", "update({ downholeGuide", "update({ extent", "update({ keepOrder", "update({ layer", "update({ lines",
    "update({ mapContacts", "update({ margin", "update({ picks", "update({ resolution", "update({ shape", "update({ tin",
    "exportInputs(", "faceImage", "isopachMap", "keepShallowest", "keepVersion", "measureThickness", "newSurface", "otherBlock", "rebuildPile", "redo", "seedAbsent", "seedBases", "seedEvents", "seedTops", "splitUnit", "undo",
    "setDigDrawing(", "setDigImageId(", "setDigPts(", "setEditing(", "setEventKey(", "setImageSnapM(", "setLineTool(", "setMapField(", "setMapLayerId(", "setPairKey(", "setPickFor(", "setSelId(", "setShowPicks(", "setSnap(", "setToolHint(", "setUnitNote(",
    "dxfInputRef", "startDigitizing()", "stopDigitizing()", "finishLine()"];
  assert.deepEqual(missing(x, reach), []);
  // the long intro and the build hint moved to Help; the protective framing stays in the Help page's cautions
  assert.doesNotMatch(x, /A surface exactly through your own picks: contacts clicked in the 3D view/);
});

test("the three panes' new strings are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${lang}.json`));
    for (const k of ["Where does it pass?", "Which lines hold it?", "Which unit and side?", "How is it meshed?", "Which panel?", "Which surface?", "Which evidence?", "Which faults?", "Other fault tools…", "In the ribbon: {tools}."]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
