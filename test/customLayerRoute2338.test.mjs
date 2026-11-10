// TASKS.csv #2338 (review #2325, WA uranium) — the custom-layer route counts what it leaves out, adds nothing it cannot draw, takes a name,
// does not guess a point Depth beside From and To, and its trash icon asks
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessMapping } from "../src/lib/layers.js";
import { skippedRowsText } from "../src/lib/viewer/importHelpers.js";

test("drilldetail.csv: From and To found, so Casing_Depth is not the Depth", () => {
  const m = guessMapping("custom", ["HoleID", "mFrom", "mTo", "Casing_Depth", "Detail"]);
  assert.equal(m.from, "mFrom");
  assert.equal(m.to, "mTo");
  assert.equal(m.depth, "");
  assert.equal(guessMapping("custom", ["HoleID", "depth", "code"]).depth, "depth"); // a point table keeps its Depth
});

test("the skipped rows are said as the built-in routes say them", () => {
  const t = skippedRowsText([{ reason: "no code" }, { reason: "no interval", example: "NNA5025" }, { reason: "no interval", example: "NNA5026" }], 424);
  assert.match(t, /Skipped 3 of 424 row\(s\): 1 blank code; 2 no To and no Depth, so no interval or point to draw \(NNA5025, NNA5026\)\./);
});

test("the commit, the dialog's name field and the trash icon", () => {
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /cDropped\.push\(\{ reason: "no interval", example: row\.hole_id \}\)/);
  assert.match(p, /nothing was added as a custom layer/);
  assert.match(p, /name: layerName/);
  const d = readFileSync(new URL("../src/components/ImportMappingModal.jsx", import.meta.url), "utf8");
  assert.match(d, /customName: e\.target\.value/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /iconAction\(\(\) => \{ if \(confirmDestructive\(tr\("Remove the custom layer/);
});
