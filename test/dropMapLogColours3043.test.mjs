// TASKS.csv #3043 (from #2970) — a map layer dropped on the 3D View drew its units in a palette by file order; the Surface Geology import gives a
// unit named like a logged lithology code the logs' colour (#2970). The drop now does the same. SYNTHETIC map and log.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildLayer, autoColorFor } from "../src/lib/mapLayerBuild.js";
import { loggedCodeSpellings, withLogColours } from "../src/lib/logColours.js";
import { categoryColor, LAYER_META, colorForLithology } from "../src/lib/layers.js";

test("a dropped map's units named like logged codes take the logs' colours (the legend's own when changed)", () => {
  const sq = (x) => [[[x, 0], [x + 10, 0], [x + 10, 10], [x, 10], [x, 0]]];
  const parsed = { geomType: "polygon", fields: ["UNIT"], features: [{ attributes: { UNIT: "bnam" }, parts: sq(0) }, { attributes: { UNIT: "ALU" }, parts: sq(20) }, { attributes: { UNIT: "Q" }, parts: sq(40) }] };
  const layer = buildLayer(parsed, { sourceName: "syn_map", projectEpsg: null });
  assert.ok(layer && layer.categories.length === 3);
  const spell = loggedCodeSpellings([{ value: "BNAM" }, { value: "BNAM" }, { value: "ALU" }]);
  const override = { ALU: { color: "#123456" } };
  const cats = withLogColours(layer.categories, spell, (u) => categoryColor(override[u], LAYER_META.litho, u));
  const by = Object.fromEntries(cats.map((c) => [c.value, c.color]));
  assert.equal(by.bnam, colorForLithology("BNAM"), "case-blind, in the logged spelling's colour");
  assert.equal(by.ALU, "#123456", "the legend's override");
  assert.equal(by.Q, layer.categories.find((c) => c.value === "Q").color, "not a logged code: as built");
  assert.ok(typeof autoColorFor === "function");
});

test("the drop's map path applies them; the hook passes the legend overrides", () => {
  const impl = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(impl, /if \(!layer\.styleBreaks && layer\.categories\?\.length > 1\) \{\n\s*const spell = loggedCodeSpellings\(live\.layers\?\.litho\);/);
  assert.match(impl, /withLogColours\(layer\.categories, spell, \(u\) => categoryColor\(viewerUiState\?\.legendOverride\?\.litho\?\.\[u\], LAYER_META\.litho, u\)\)/);
  const hook = fs.readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(hook, /assays: storeAssays, viewerUiState \} = useStore\(\);/);
  assert.match(hook, /h: \{ viewerUiState, addVoxelModel,/);
});
