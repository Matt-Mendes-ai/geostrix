// TASKS.csv #2319 (user report) — hiding the Lithology layer hid the hole traces and collar markers: both were built into the litho
// group, whose visibility follows the Lithology eye. They now have their own group, which no layer eye touches.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewerSource } from "./helpers/viewerSource.mjs"; // #2176 — the drillhole build moved out of ViewerModule

const v = viewerSource();

test("collars and traces go to their own 'holes' group, not the Lithology layer's", () => {
  assert.match(v, /const holeGroup = new THREE\.Group\(\); holeGroup\.name = "holes"; root\.add\(holeGroup\); groups\.holes = holeGroup;/);
  assert.match(v, /groups\.holes\.add\(marker\);/);
  assert.match(v, /addTraceChunks\(groups\.holes, traceHoles\);/); // #2176 — merged trace chunks
  assert.doesNotMatch(v, /groups\.litho\.add\((marker|traceLine)\)/);
});

test("the layer eyes set visibility for the data layers only; the hole colours and picking reach the new group", () => {
  assert.match(v, /Object\.keys\(LAYER_META\)\.forEach\(\(k\) => \{ if \(groups\[k\]\) groups\[k\]\.visible = !!layerVisible\[k\]; \}\);/);
  assert.ok(!/^\s*holes:/m.test(readFileSync(new URL("../src/lib/layers.js", import.meta.url), "utf8").split("LAYER_META")[1]?.slice(0, 4000) || ""), "'holes' is not a LAYER_META key");
  assert.match(v, /const g = layerGroupsRef\.current\?\.holes; \/\/ #2319/);
  assert.match(v, /Object\.values\(layerGroupsRef\.current\)\.forEach\(\(g\) => \{\s*if \(!g \|\| g\.visible === false\) return;/); // picking: every group
});
