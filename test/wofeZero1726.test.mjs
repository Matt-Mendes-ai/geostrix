// TASKS.csv #1726 (review #1645, Copley) — weights of evidence keep a layer whose contingency table has a zero cell (every occurrence
// inside the pattern), with a continuity correction, instead of dropping it
import test from "node:test";
import assert from "node:assert/strict";
import { weights, bestCutoff } from "../src/lib/evidence.js";

test("#1726 a zero cell is corrected by 0.5, flagged, and still gives a strong positive weight", () => {
  const w = weights(30, 3, 1000, 3); // every one of the 3 occurrences inside a 30-cell pattern: c = 0
  assert.ok(w && w.corrected && w.wPlus > 2 && w.C > 2, JSON.stringify(w));
  const plain = weights(30, 2, 1000, 3);
  assert.ok(plain && !plain.corrected);
  assert.equal(weights(0, 0, 1000, 3), null, "an empty pattern");
  assert.equal(weights(1000, 3, 1000, 3), null, "the whole area");
  assert.equal(weights(30, 0, 1000, 0), null, "no occurrences");
});

test("#1726 bestCutoff on the evidence that defines the occurrences no longer comes back without a best", () => {
  const n = 400, values = new Float64Array(n), valid = new Array(n).fill(true);
  for (let k = 0; k < n; k++) values[k] = k < 3 ? 5000 + k : 10 + (k % 97);
  const D = new Set([0, 1, 2]); // Cu >= 5000 as the occurrences, Cu as the evidence
  const r = bestCutoff(values, D, valid);
  assert.ok(r.best && r.best.corrected && r.best.cutoff <= 5000 && r.best.wPlus > 3, JSON.stringify(r.best));
});

// TASKS.csv #1833 — Undrilled zones: a project with no drillholes is told so (every part of a unit is undrilled), and a block model's
// range shell (#1780, type geophysical_shell) is a solid the pane can measure
test("#1833 Undrilled zones says there is no drilling, and counts a block-model shell as a solid", async () => {
  const { readFileSync } = await import("node:fs");
  const u = readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");
  assert.ok(u.includes("No drillholes yet: every part of a unit is undrilled.") && u.includes("Targeting > Voxel ranges, on the Advanced ribbon > Shell at this range") /* #2261 */);
  const { SOLID_SURFACE_TYPES } = await import("../src/lib/viewer/modelHelpers.js");
  assert.ok(SOLID_SURFACE_TYPES.has("geophysical_shell"));
});
