// TASKS.csv #3882 — Copernicus GLO-30 is the default online terrain: a NEW fetch reads it unless another source was chosen before; a chosen source is
// kept, a project's saved terrain keeps its own service, AWS / NRCan / GEM-15 stay choices, the AWS cone warning is AWS's alone, the credit line is
// Copernicus's. No network.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { savedTerrainSource, DEFAULT_TERRAIN_SOURCE, TERRAIN_SOURCES, TERRAIN_SOURCE_KEY } from "../src/lib/terrainSource.js";
import { planTerrainFetch } from "../src/lib/srtmFetch.js";
import { terrainCredit } from "../src/lib/credits.js";
import { terrainLodOf } from "../src/lib/viewer/lodTerrain.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const store = (v) => ({ getItem: (k) => (k === TERRAIN_SOURCE_KEY ? v : null) });

test("#3882 no remembered choice reads GLO-30; a remembered choice is kept; a value this version does not know falls to the default", () => {
  assert.equal(DEFAULT_TERRAIN_SOURCE, "copernicus");
  assert.equal(savedTerrainSource(store(null)), "copernicus");
  assert.equal(savedTerrainSource(store(undefined)), "copernicus");
  assert.equal(savedTerrainSource(store("")), "copernicus");
  for (const s of ["aws", "mrdem", "hrdem", "gem15", "gem15dsm", "copernicus"]) assert.equal(savedTerrainSource(store(s)), s, `${s} stays a choice and is kept`);
  assert.equal(savedTerrainSource(store("srtm90")), "copernicus");
  assert.equal(savedTerrainSource({ getItem() { throw new Error("blocked"); } }), "copernicus", "a private window: the default");
  assert.equal(savedTerrainSource(null), "copernicus");
  assert.deepEqual([...TERRAIN_SOURCES].sort(), ["aws", "copernicus", "gem15", "gem15dsm", "hrdem", "mrdem"]);
});

test("#3882 the Terrain pane reads the default through the helper, lists GLO-30 first, keeps every other choice, and remembers a choice under the same key", () => {
  const g = read("../src/modules/GeophysicsModule.jsx");
  assert.match(g, /useState\(\(\) => savedTerrainSource\(localStorage\)\)/);
  assert.match(g, /localStorage\.setItem\(TERRAIN_SOURCE_KEY, v\)/);
  assert.equal(TERRAIN_SOURCE_KEY, "geostrix.terrainSource", "the key earlier versions wrote");
  const at = (v) => g.indexOf(`<option value="${v}"`);
  assert.ok(at("copernicus") > 0 && at("copernicus") < at("aws"), "the default is first");
  for (const v of ["aws", "mrdem", "hrdem", "gem15", "gem15dsm"]) assert.ok(at(v) > 0, `${v} is still offered`);
  assert.match(g, /Copernicus GLO-30 \(default\)/, "the tooltip names the default");
  assert.doesNotMatch(g, /localStorage\.getItem\("geostrix\.terrainSource"\) \|\| "aws"/);
});

test("#3882 the fetch's own default is GLO-30 (a caller that names no source), AWS still plans its tiles", () => {
  const box = [-120.0, 56.0, -119.9, 56.05];
  const none = planTerrainFetch(box, 200), cop = planTerrainFetch(box, 200, "copernicus"), aws = planTerrainFetch(box, 200, "aws");
  assert.deepEqual(none, cop);
  assert.equal(cop.zoom, null);
  assert.ok(aws.zoom > 0 && aws.tiles > 0, "AWS still has its tile plan");
});

test("#3882 the AWS cone warning is AWS's alone: only the AWS fetch looks for cones, and the message is shown only for a fetch that found some", () => {
  assert.match(read("../src/lib/srtmFetch.js"), /suspectCones/);
  assert.doesNotMatch(read("../src/lib/copernicusDem.js"), /suspectCones/);
  assert.match(read("../src/modules/GeophysicsModule.jsx"), /if \(parsed\.suspectCones\?\.length\) \{/);
});

test("#3882 a GLO-30 terrain: the credit line ESA's licence asks for, tiles in the 3D View, no-data over open ocean; a saved AWS terrain keeps its own", () => {
  assert.match(terrainCredit({ source: { service: "Copernicus DEM GLO-30 (ESA, surface model ~30 m)" } }), /© DLR e\.V\. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved\./);
  assert.match(terrainCredit({ source: { service: "AWS Terrain Tiles (Terrarium): SRTM blended with national DEMs (CDEM in Canada)" } }), /Terrain Tiles on AWS/, "a project saved with the AWS terrain keeps its credit");
  const t = { bbox: [0, 0, 20000, 20000], gridW: 201, gridH: 201, source: { service: "Copernicus DEM GLO-30 (ESA, surface model ~30 m)", sourcePixelM: 30 } };
  assert.equal(terrainLodOf(t, 26910)?.source, "copernicus", "the 3D View's detailed tiles read it by window");
  const src = read("../src/lib/copernicusDem.js");
  assert.match(src, /Cells over open ocean do not exist \(404\) and stay no data\./);
  assert.match(src, /noDataMask: out\.noDataMask/);
});

test("#3882 the Help names the default and says AWS is a choice; a saved terrain keeps its source", () => {
  const h = read("../src/help/pages/geophysics.js");
  assert.match(h, /Copernicus GLO-30 \(≈ 30 m\), the default/ /* #4104 */);
  assert.match(h, /A terrain already in the project keeps the source it was fetched from\./);
  assert.match(h, /Shown only when AWS Terrain Tiles is the Online source\./);
});
