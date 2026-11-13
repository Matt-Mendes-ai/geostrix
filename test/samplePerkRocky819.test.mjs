// TASKS.csv #819 — the Perk-Rocky sample: every bundled file is there, and the loader turns them into map layers,
// outcrop measurements and a terrain
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PERK_FILES, PERK_EPSG, loadPerkRocky } from "../src/lib/samplePerkRocky.js";

import { bcSkip, bcSampleDir, perkFile } from "./helpers/bcSample.mjs";

const dir = new URL("../sample_data/perk_rocky/", import.meta.url);

// TASKS.csv #3134 — the repository keeps only Perk-Rocky's Copernicus terrain (redistributable; the installer ships it); the mapping layers come
// from report 42317, downloaded by the app (#3100)
test("#819 / #3134 the repository holds Perk-Rocky's terrain and its README, and no layer of the report", () => {
  assert.ok(PERK_FILES.includes("terrain_copernicus_glo30.tif"));
  for (const f of ["terrain_copernicus_glo30.tif", "README.md"]) assert.ok(fs.existsSync(new URL(f, dir)), f);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["README.md", "terrain_copernicus_glo30.tif"]);
});

test("#819 every Perk-Rocky file is in the folder found", { skip: bcSkip("perk_rocky") }, () => {
  const d = bcSampleDir("perk_rocky");
  for (const f of PERK_FILES.filter((n) => !/^terrain_/.test(n))) assert.ok(fs.existsSync(d + f), f);
});

test("#819 the loader adds the map layers, 147 measurements and the terrain, in EPSG:26910", { skip: bcSkip("perk_rocky") }, async () => {
  const readFile = async (name) => { const b = perkFile(name); return { name, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; };
  const layers = [], sets = [], terrains = [];
  const notes = await loadPerkRocky(readFile, { addMapLayer: (l) => layers.push(l), addSurfaceStructureSet: (s) => sets.push(s), addTerrain: (t) => terrains.push(t) }, { projectEpsg: PERK_EPSG });
  assert.deepEqual(notes.filter((n) => n.level === "error"), [], JSON.stringify(notes));
  const litho = layers.find((l) => l.sourceName === "PR-Litho_interpV3");
  assert.equal(litho.features.length, 77);
  assert.equal(litho.styleField, "Litho_code");
  assert.equal(litho.visible, true);
  assert.equal(layers.find((l) => l.sourceName === "PR-Str_interp").styleField, "Structure_Type");
  assert.equal(layers.length, 5);
  assert.equal(sets.length, 1);
  assert.equal(sets[0].rows.length, 147);
  assert.equal(sets[0].rows.filter((r) => r.cls === "bedding").length, 104);
  assert.equal(terrains.length, 1);
  const t = terrains[0];
  assert.ok(t.gridW > 100 && t.bbox[0] < 353300 && t.bbox[2] > 361800, JSON.stringify(t.bbox));
});
