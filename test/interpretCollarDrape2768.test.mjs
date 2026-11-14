// TASKS.csv #2768 (#2630 (3)) — with no terrain an interpretation layer is draped on the ground between the collars instead of lying flat
// at one RL; 'Flat at one RL instead' keeps the old behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interpretationOnCollars } from "../src/lib/viewer/sceneBuilders.js";

const collars = [{ x: 0, y: 0, z: 160 }, { x: 100, y: 0, z: 330 }, { x: 0, y: 100, z: 250 }];

test("draped only for an interpretation layer, with no terrain, three or more collars, and not set flat", () => {
  assert.equal(interpretationOnCollars({ interpretation: true, drapeMode: "terrain" }, null, collars), true);
  assert.equal(interpretationOnCollars({ interpretation: true }, null, collars), true, "a new layer");
  assert.equal(interpretationOnCollars({ interpretation: true, drapeMode: "flat" }, null, collars), false);
  assert.equal(interpretationOnCollars({ interpretation: true }, { id: "t" }, collars), false, "a terrain: the terrain drape, as before");
  assert.equal(interpretationOnCollars({ drapeMode: "terrain" }, null, collars), false, "other map layers are unchanged");
  assert.equal(interpretationOnCollars({ interpretation: true }, null, collars.slice(0, 2)), false);
});

test("wiring: the map-layer drape samples the collar ground; the 3D View passes the collars; the pane says so and offers flat", () => {
  const sb = readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8");
  assert.match(sb, /const onCollars = mapLayerOnCollars\(l, terrain, collars\);/); // every map layer since #3368
  assert.match(sb, /onCollars \? `collars:\$\{collarsKey\(collars\)\}`/);
  assert.match(sb, /const ground = collarGround\(collars\);\s*geometry = new THREE\.PlaneGeometry\(w, h, COLLAR_DRAPE_SEG, COLLAR_DRAPE_SEG\);/);
  assert.match(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /syncMapLayers\([^)]*collars \/\* #2768 \*\/ \}\)/);
  const p = readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8");
  assert.match(p, /tr\("No terrain: the lines are draped on the ground between the collars/);
  assert.match(p, /drapeMode: e\.target\.checked \? "flat" : "terrain"/);
  assert.match(p, /const groundAt = useMemo\(\(\) => \(terrain \? \(x, y\) => terrainGroundAt\(terrain, x, y\) : collarG\), \[terrain, collarG\]\);/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const j = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(j["Flat at one RL instead"] && j["No terrain: the lines are draped on the ground between the collars (a surface through the collar elevations)."], l);
  }
});
