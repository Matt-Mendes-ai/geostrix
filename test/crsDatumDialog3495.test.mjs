// TASKS.csv #3495 — the RL datum and the typed north in the status bar's Project coordinate system dialog
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
test("the dialog has the datum and north fields and writes them with the grid name", () => {
  const s = fs.readFileSync(new URL("../src/components/ProjectCrsModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /setLocalGridDatum\?\.\(d\)/);
  assert.match(s, /aria-label=\{tr\("RL datum offset \(m\)"\)\}/);
  assert.match(s, /aria-label=\{tr\("Grid north from true north \(degrees, east positive\)"\)\}/);
  assert.match(s, /project\.localGrid\?\.tie/);
});
