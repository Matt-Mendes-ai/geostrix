// TASKS.csv #1844 (review #1646, Kodiak MPD) — on a project with no holes the disabled Run buttons of Implicit surface, Strat. stack and
// Structures said 'Runs in GeoStrix's Python engine (GemPy) — the status bar's Py shows whether it is ready' while Py read 'idle' (ready),
// and the Correlation pane's Fence button only described the tool. Each title now says first what is missing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");

test("the GemPy Run buttons' titles say what is missing, then the engine", () => {
  assert.match(src, /const gempyTitle = \(missing\) => \(implicitBusy \? tr\("A model is already running\."\) : missing \|\| tr\("Runs in GeoStrix's Python engine \(GemPy\) — the status bar's Py shows whether it is ready"\)\);/);
  assert.equal((src.match(/title=\{tr\("Runs in GeoStrix's Python engine \(GemPy\)/g) || []).length, 0, "no button keeps the bare engine title");
  assert.match(src, /title=\{gempyTitle\(!collars\.length \? tr\("No holes with collars yet: import collars first\."\) : !implicitTarget \? tr\("Choose a unit first\."\) : null\)\}/);
  assert.match(src, /title=\{gempyTitle\(!collars\.length \? tr\("No holes with collars yet: import collars first\."\) : stackUnits\.length < 2 \? tr\("Choose at least two units for the stack first\."\) : null\)\}/);
  assert.match(src, /title=\{gempyTitle\(!struct_types\.length \? tr\("No structure picks with an orientation yet\."\) : !structuralTarget \? tr\("Choose a structure type first\."\) : null\)\}/);
});

test("the Correlation pane's Fence button says there are no holes when it is disabled for that", () => {
  assert.match(src, /title=\{collars\.length \? tr\("Fence \/ panel diagram — project the holes[^"]*"\) : tr\("No holes with collars yet: import collars first\."\) \/\* #1844 \*\/\}/);
});
