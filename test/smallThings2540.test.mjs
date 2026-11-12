// TASKS.csv #2540 (review #2486, WA lithium) — small things: (1) the Vein tool's run button had no text; (2) the halo opened on an
// empty 'Alteration' layer without a word; (4) Core orient.'s hole list was 2,249 unfiltered options. (3), one naming scheme for
// bodies built by different routes, is a follow-up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
const core = readFileSync(new URL("../src/components/CoreOrientationCalculator.jsx", import.meta.url), "utf8");

test("(1) the vein button is worded", () => {
  assert.match(panes, /<><Layers3 size=\{14\} \/>\{" "\}\{tr\("Build vein"\)\}<\/>/);
});

test("(2) the halo starts on a layer that has codes, and says when Alteration is empty", () => {
  assert.match(panes, /const altEmpty = !\(storeLayers\.alt \|\| \[\]\)\.length;/);
  assert.match(panes, /if \(altSource\.layer !== "alt" \|\| !altEmpty\) return;/);
  assert.match(panes, /const first = \(storeLayers\.vein \|\| \[\]\)\.length \? "vein" : \(storeLayers\.litho \|\| \[\]\)\.length \? "litho"/);
  assert.match(panes, /\{altEmpty \? tr\("Alteration \(none logged\)"\) : tr\("Alteration"\)\}/);
});

test("(4) a type-ahead over a long hole list, the chosen hole always kept", () => {
  assert.match(core, /orientable\.length > 30 && <div style=\{row\}><input type="search" value=\{holeFilter\}/);
  assert.match(core, /String\(c\.hole_id\)\.toLowerCase\(\)\.includes\(f\) \|\| c\.hole_id === holeId/);
});
