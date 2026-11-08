// TASKS.csv #2098 (review #2013, Woodjam) — an evidence card with no usable cutoff (no occurrence where it has a value) gets a row
// saying so instead of vanishing from the weights list.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bestCutoff } from "../src/lib/evidence.js";
const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("soils 10 km from the drilling: the soil card has no value at any occurrence cell, so bestCutoff has no best", () => {
  const n = 100, values = new Float64Array(n).fill(NaN), valid = new Uint8Array(n).fill(1);
  for (let k = 0; k < 40; k++) values[k] = k; // the soil card covers cells 0-39
  const D = new Set([80, 81, 82, 83, 84]); // the occurrences sit in cells 80-84
  const bc = bestCutoff(values, D, valid);
  assert.equal(bc.best, null);
  assert.equal(bc.ND, 0);
  assert.equal(bc.N, 40);
});

test("the pane keeps such a card as a 'none' row, out of the posterior, and says why", () => {
  assert.match(p, /rowsW\.push\(bc\.best \? \{/);
  assert.match(p, /: \{ id: l\.id, label: l\.label, none: true, nCells: bc\.N, ndHere: bc\.ND, nMissing: bc\.nMissing \}\);/);
  assert.match(p, /r\.used = !r\.none && \(!r\.thin \|\| !anySound\);/);
  assert.match(p, /no weight: no occurrence lies where this evidence has a value/);
  assert.match(p, /\{!r\.none && " · " \+ tr\("\{a\} of \{d\} occurrence cells inside the pattern/, "no crash on a row without counts");
  assert.match(p, /else if \(rowsW\.length\) out\.wofeNone = \{ rows: rowsW, ND \};/);
});
