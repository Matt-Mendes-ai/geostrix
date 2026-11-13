// TASKS.csv #3107 — the Central Lapland sample (Geological Survey of Finland, CC BY 4.0): the 1:1 000 000 bedrock units and faults of a
// 100 km window and 121 whole-rock samples, no drillholes. The oxides stay oxides, "<value" reads as below detection, no duplicates.
import test from "node:test";
import assert from "node:assert/strict";
import { REGIONAL_SAMPLES, isRegionalSample, loadRegionalSample } from "../src/lib/sampleRegional.js";
import { waSurface } from "../src/lib/sampleWa.js";
import { parseShapefileZip } from "../src/lib/shapefile.js";
import { reprojectXY } from "../src/lib/reproject.js";
import { read, exists, table, folderBytes, fileOf, said, checkOffered } from "./sampleChecks3107.mjs";

const dir = "fi_lapland", BOX = [400000, 7490000, 500000, 7560000];
const zip = (n) => parseShapefileZip(new Uint8Array(read(dir, n)));

test("the folder is small, holds the files the loader names, and its CRS is one GeoStrix has (ETRS89 / UTM 35N = ETRS-TM35FIN)", () => {
  assert.ok(folderBytes(dir) < 0.8e6, `${folderBytes(dir)} bytes`);
  const S = REGIONAL_SAMPLES.fi_lapland;
  assert.ok(isRegionalSample(dir) && !isRegionalSample("wa_gold"));
  for (const f of [...S.layers.map((l) => l.zip), ...S.surface.map((s) => s[0]), "README.md"]) assert.ok(exists(dir, f), f);
  const ll = reprojectXY(450000, 7525000, S.epsg, 4326); // the middle of the window is in northern Finland
  assert.ok(ll.x > 25 && ll.x < 26.5 && ll.y > 67.5 && ll.y < 68.2, JSON.stringify(ll));
});

test("the map layers: 168 bedrock units of 35 rock names and 135 faults, each touching the window", async () => {
  const u = await zip("bedrock_units.zip"), f = await zip("faults.zip");
  assert.deepEqual([u.features.length, u.geomType, f.features.length, f.geomType], [168, "polygon", 135, "polyline"]);
  assert.equal(new Set(u.features.map((x) => x.attributes.ROCK_NAME)).size, 35);
  assert.equal(f.features.filter((x) => /^Thrust fault/.test(x.attributes.FAULT_TYPE)).length, 55);
  for (const x of [...u.features, ...f.features]) {
    const xs = x.parts.flat().map((p) => p[0]), ys = x.parts.flat().map((p) => p[1]);
    assert.ok(Math.max(...xs) >= BOX[0] && Math.min(...xs) <= BOX[2] && Math.max(...ys) >= BOX[1] && Math.min(...ys) <= BOX[3]);
  }
  assert.match(u.prjWkt, /ETRS_1989_UTM_Zone_35N/);
});

test("the rock table: 121 samples inside the window, oxides as oxides, '<' as below detection, no duplicate and no name column", () => {
  const rows = table(dir, "rocks.csv");
  assert.equal(rows.length, 121);
  assert.equal(new Set(rows.map((r) => r.sample_id)).size, 121);
  assert.ok(!Object.keys(rows[0]).some((k) => /sampler|name|notes/i.test(k)));
  const s = waSurface(read(dir, "rocks.csv").toString("utf8"), "rock");
  assert.equal(s.samples.length, 121);
  assert.ok(s.samples.every((p) => p.x >= BOX[0] && p.x <= BOX[2] && p.y >= BOX[1] && p.y <= BOX[3] && p.z === null && p.medium === "rock"));
  const unit = Object.fromEntries(s.elements.map((e) => [e.symbol, e.unit]));
  assert.deepEqual([unit.Si, unit.Al, unit.Fe, unit.Mg, unit.K, unit.Ni, unit.Au, unit.Y], ["% SiO2", "% Al2O3", "% FeO", "% MgO", "% K2O", "ppm", "ppb", "ppm"]);
  assert.equal(s.elements.length, 52);
  const si = s.samples.map((p) => p.values.Si), tot = s.samples.map((p) => ["Si", "Ti", "Al", "Fe", "Mn", "Mg", "Ca", "Na", "K", "P"].reduce((a, k) => a + (p.values[k] || 0), 0));
  assert.deepEqual([Math.min(...si), Math.max(...si)], [34, 95.4]); // SiO2 as reported, not divided into Si
  assert.ok(tot.every((v) => v > 75 && v < 100.5), `${Math.min(...tot)} to ${Math.max(...tot)}`); // anhydrous oxide totals
  assert.equal(s.samples.filter((p) => (p.bdl || []).includes("Au")).length, 109);
  assert.deepEqual([Math.max(...s.samples.map((p) => p.values.Ni)), Math.max(...s.samples.map((p) => p.values.Cr))], [1710, 4950]);
});

test("the loader adds the two map layers flat (no terrain) and the rocks as surface samples, and says so", async () => {
  const got = { layers: [], surface: [], elements: [], terrains: [], sets: [] };
  const store = { addMapLayer: (l) => got.layers.push(l), addTerrain: (t) => got.terrains.push(t), addSurfaceStructureSet: (s) => got.sets.push(s),
    setSurfaceSamples: (fn) => { got.surface = fn(got.surface); }, setSurfaceElements: (fn) => { got.elements = fn(got.elements); } };
  const notes = await loadRegionalSample(dir, fileOf(dir), store, { projectEpsg: 25835 });
  assert.deepEqual(got.layers.map((l) => [l.features.length, l.styleField, l.drapeMode, l.visible]), [[168, "ROCK_NAME", "flat", true], [135, "FAULT_TYPE", "flat", true]]);
  assert.deepEqual([got.surface.length, got.elements.length, got.terrains.length, got.sets.length], [121, 52, 0, 0]);
  assert.match(said(notes), /Loaded the Central Lapland sample .*121 whole-rock samples/);
  await loadRegionalSample(dir, fileOf(dir), store, { projectEpsg: 25835, existingSurfaceElements: got.elements });
  assert.equal(got.surface.length, 121); // loading twice does not double the samples
});

test("the sample is offered, named, translated and licensed where a user reads it", () => {
  checkOffered(dir, { licence: "CC-BY-4.0", who: /Central Lapland sample .*Geological Survey of Finland/, name: "Central Lapland (sample)", inFootnote: "Central Lapland (Geological Survey of Finland" });
  assert.match(read(dir, "README.md").toString("utf8"), /Basic Licence and may not be redistributed/);
});
