// TASKS.csv #4091 — the Mine Design panes still in long form: Dump / stockpile on a StepPane, Drifts and ramps and Design strings with their alternative routes
// behind closed headings. The reachable set of each: every control the pane offered before is still in it (in the step, the Result, or a fold).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const dump = read("../src/components/DumpPane.jsx");
const lines = read("../src/components/DesignLinesPane.jsx");
const strings = read("../src/components/DesignStringsPane.jsx");
const missing = (text, list) => list.filter((k) => !text.includes(k));
const between = (text, open, close) => { const a = text.indexOf(open); assert.ok(a >= 0, open); const b = text.indexOf(close, a); assert.ok(b > a, close); return text.slice(a, b); };

test("Dump / stockpile: Shape on a StepPane, Make the dump the one action, Result in numbers, density / swell / pit in Fine-tune", () => {
  assert.match(dump, /<StepPane id="dump"/);
  assert.match(dump, /key: "shape"/);
  assert.match(dump, /action=\{\{ label: tr\("Make the dump"\), onClick: make, disabled: missing/);
  assert.match(dump, /<StepNumbers rows=\{\[/);
  const fine = between(dump, '<MoreFold summary={tr("Fine-tune…")} data-fine-tune="dump">', "</MoreFold>");
  assert.deepEqual(missing(fine, ['field("density"', 'field("swell"', 'aria-label={tr("Pit shell whose waste the dump is compared with")}', "Use the pit's waste density"]), []);
  const shape = between(dump, "const shapeStep = (", "const resultBody");
  assert.deepEqual(missing(shape, ['aria-label={tr("Footprint string")}', 'field("crestZ"', 'field("repose"', "CollarLevelsNote"]), []);
  assert.deepEqual(missing(dump, ["<DumpRunList", "editDump", "removeDump"]), []);
});

test("Drifts and ramps: drawing, the typed segments and the segment table stay in view; 'To a target' and 'Profile and clearance' are closed folds with every control", () => {
  assert.deepEqual(missing(lines, ['tr("Draw in the 3D view")', 'tr("Add straight")', 'tr("Add curve")', 'tr("Segments")', 'tr("Driven length")']), []);
  const target = between(lines, '<MoreFold summary={tr("To a target")} data-fine-tune="lines-target">', "</MoreFold>");
  assert.deepEqual(missing(target, ['ariaLabel={tr("Target easting")}', 'aria-label={tr("Maximum grade to the target")}', 'aria-label={tr("Minimum curve radius to the target")}', "designToTarget", "setPicking"]), []);
  const prof = between(lines, '<MoreFold summary={tr("Profile and clearance")} data-fine-tune="lines-profile">', "</MoreFold>");
  assert.deepEqual(missing(prof, ['ariaLabel={tr("Profile width")}', 'ariaLabel={tr("Profile height")}', 'aria-label={tr("Profile shape")}', "addOpening", 'aria-label={tr("Pillar to keep")}', 'aria-label={tr("Rock density for the excavation tonnes")}']), []);
});

test("Design strings: draw and the vertex table stay in view; Tools (reverse, close, offset, copy, drape, join, split) is a closed fold; Solids from strings stays", () => {
  assert.deepEqual(missing(strings, ['tr("Draw in the 3D view")', 'tr("Add vertex")', 'tr("Add from last")', 'tr("Solids from strings")', 'tr("Make solid")', 'tr("Loft into a solid")', "Import DXF"]), []);
  const tools = between(strings, '<MoreFold summary={tr("Tools")} data-fine-tune="strings-tools">', "</MoreFold>");
  assert.deepEqual(missing(tools, ['tr("Reverse")', 'tr("Offset copy")', 'tr("Copy shifted")', 'tr("Drape")', 'tr("Join")', 'tr("Split at vertex")']), []);
});
