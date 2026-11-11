// TASKS.csv #2497 (review #2486) — the collar import's Elevation shift on its own, not only inside the local-grid tick; #2499 (4) — the fitted
// rotation says its direction
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitSimilarity } from "../src/lib/localGrid.js";

test("the shift is outside the {modal.localGridOn && ...} block; the pipeline applies it without a grid", () => {
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  const shift = m.indexOf('tr("Elevation shift")'), tick = m.indexOf('tr("X/Y are on a local mine grid")'), block = m.indexOf("{modal.localGridOn && (");
  assert.ok(shift > 0 && shift < tick && tick < block, "the shift sits before the tick and its block");
  const u = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(u, /if \(units === "ft" \|\| gridOn \|\| Number\(importModal\.zShift\)\) \{/);
  assert.match(u, /const zShift = importModal\.target === "collars" \? Number\(importModal\.zShift\) \|\| 0 : 0;/);
});

test("#2499 — the rotation is counter-clockwise from the local grid to the map, and says so", () => {
  assert.equal(fitSimilarity([{ lx: 0, ly: 0, wx: 0, wy: 0 }, { lx: 100, ly: 0, wx: 0, wy: 100 }]).rotationDeg, 90);
  const m = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(m, /rotation \{rotationDeg\}° counter-clockwise from the local grid to the map, RMS misfit/);
});
