// TASKS.csv #4070 part 4 — the Layout and Geochem side panels as steps (viewport, drill plan, legend, depth and section scale, calculated element,
// soil grid). The reachable set of each: every tool and setting the panel offered before the steps is still in it (a step, the Result step, a fold).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const layout = read("../src/modules/LayoutModule.jsx");
const geochem = read("../src/modules/GeochemModule.jsx");
const grid = read("../src/components/SampleGridPanel.jsx");
const missing = (text, list) => list.filter((k) => !text.includes(k));

test("Layout viewport: View and Scale steps with Refresh as the one primary, a Result in numbers, the rest in Fine-tune", () => {
  assert.match(layout, /<StepPane key=\{sel\.id\} id="layout-viewport" helpPage="layout" label=\{tr\("Viewport"\)\}/);
  for (const k of ['key: "view"', 'key: "scale"']) assert.ok(layout.includes(k), k);
  assert.match(layout, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="viewport">/);
  assert.deepEqual(missing(layout, ["onCentre", "onEnter", "onFit", "onFitAll", "onLiveView", "onSyncNorth", "onSyncScaleBar",
    'aria-label={tr("Fixed plot scale denominator")}', 'aria-label={tr("Plot scale")}', 'aria-label={tr("Grid spacing (m)")}']), []);
});

test("Layout drill plan: Frame, Holes and Colour steps, with the hole counts as numbers", () => {
  assert.match(layout, /<StepPane key=\{sel\.id\} id="layout-drillplan" helpPage="layout" label=\{tr\("Drill plan"\)\}/);
  for (const k of ['key: "frame"', 'key: "holes"', 'key: "colour"']) assert.ok(layout.includes(k), k);
  assert.match(layout, /<MoreFold summary=\{tr\("Fine-tune…"\)\} data-fine-tune="drillplan">/);
  assert.deepEqual(missing(layout, [tr1("Fit the holes"), tr1("Turn the frame"), tr1("Turn the frame and the page"), tr1("Fill the page"), tr1("Holes containing"),
    tr1("Holes in the frame"), tr1("With a leader"), tr1("No room for a label"), tr1("Coloured by?")]), []);
});

test("Layout legend: Source, Size and Rows steps; the key's lines and title are still editable", () => {
  assert.match(layout, /<StepPane key=\{sel\.id\} id="layout-legend" helpPage="layout" label=\{tr\("Legend"\)\}/);
  for (const k of ['key: "source"', 'key: "size"', 'key: "rows"']) assert.ok(layout.includes(k), k);
  assert.deepEqual(missing(layout, ['aria-label={tr("Key title")}', 'aria-label={tr("Key note")}', tr1("Add row"), tr1("Edit the key's lines")]), []);
});

test("Geochem calculated element: Formula and Name steps, Add is the primary, Cancel and the notes stay", () => {
  assert.match(geochem, /<StepPane id="geochem-calc" helpPage="import-assays" label=\{tr\("Calculated element"\)\}/);
  for (const k of ['key: "formula"', 'key: "name"']) assert.ok(geochem.includes(k), k);
  assert.match(geochem, /data-calc-add/);
  assert.match(geochem, /data-fine-tune="calc"/);
  assert.deepEqual(missing(geochem, ['aria-label={tr("Calculated element formula")}', 'aria-label={tr("Calculated element name")}', 'aria-label={tr("Unit of the calculated element")}',
    'aria-label={tr("Preset")}', 'aria-label={tr("Data source")}', "EquivalentBuilder", "calc.readPpm", "setCalc(null)"]), []);
  // the form's controls fit the sidebar: no intrinsic-width overflow (a long preset name pushed a horizontal scrollbar)
  assert.match(geochem, /aria-label=\{tr\("Preset"\)\}/);
  for (const label of ["Preset", "Calculated element formula", "Calculated element name"]) {
    const at = geochem.indexOf(`aria-label={tr("${label}")}`);
    assert.match(geochem.slice(Math.max(0, at - 220), at + 220), /width: "100%"/, label);
  }
});

test("Geochem soil grid: What and How steps, Grid to raster is the primary, a Result with the samples and cells", () => {
  assert.match(grid, /<StepPane id="geochem-grid" helpPage="import-assays"/);
  for (const k of ['key: "what"', 'key: "how"']) assert.ok(grid.includes(k), k);
  assert.deepEqual(missing(grid, ["setDone", "Grid to raster"]), []);
});

test("a pane with no header of its own has a ? at the end of its step bar, and the page it opens holds its fields", async () => {
  const sp = read("../src/components/StepPane.jsx");
  assert.match(sp, /openHelp\(helpPage\)/);
  assert.match(sp, /data-step-help=\{helpPage\}/);
  const { pageById } = await import("../src/help/content.js");
  const layoutPage = pageById("layout"), assays = pageById("import-assays");
  assert.ok(layoutPage && assays, "both pages exist");
  const names = (p) => (p.fields || []).map((f) => f.name);
  for (const k of ["Viewport: View, Scale, Refresh", "Legend: Source, Size, Rows", "Drill plan: Frame, Holes, Colour", "Table: Rows, Columns, Text"]) assert.ok(names(layoutPage).includes(k), k);
  for (const k of ["Calc. element: Formula, Name", "Grid an element to a raster: What, How"]) assert.ok(names(assays).includes(k), k);
  assert.equal((layout.match(/helpPage="layout"/g) || []).length, 5, "the Layout inline panes");
  assert.match(geochem, /id="geochem-calc" helpPage="import-assays"/);
  assert.match(grid, /id="geochem-grid" helpPage="import-assays"/);
});

test("the new strings are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(read(`../src/locales/${lang}.json`));
    for (const k of ["What is it?", "What is it called?", "Which holes?", "Which rows?", "Where from?", "What does it show?", "Coloured by?", "Fine-tune…"]) assert.ok(d[k], `${lang}: ${k}`);
  }
});

function tr1(s) { return `tr("${s}"`; }
