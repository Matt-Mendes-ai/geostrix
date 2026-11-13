// TASKS.csv #3107 — the Rouyn-Noranda sample (Quebec's SIGEOM, CC BY 4.0, with a federal CDEM terrain): geology polygons, outcrop
// structural measurements by the right-hand rule from true north, and 280 historical drillholes as traces on the terrain.
import test from "node:test";
import assert from "node:assert/strict";
import Papa from "papaparse";
import { REGIONAL_SAMPLES, loadRegionalSample } from "../src/lib/sampleRegional.js";
import { parseStructureRows } from "../src/lib/mapLayers.js";
import { parseShapefileZip } from "../src/lib/shapefile.js";
import { BLAKE_EPSG } from "../src/lib/sampleBlakeRiver.js";
import { read, exists, table, folderBytes, tiff, fileOf, said, checkOffered } from "./sampleChecks3107.mjs";

const dir = "qc_rouyn_noranda", S = REGIONAL_SAMPLES.qc_rouyn_noranda;

test("the folder is small, holds the files the loader names, and shares the Blake River gravity sample's CRS", () => {
  assert.ok(folderBytes(dir) < 0.9e6, `${folderBytes(dir)} bytes`);
  for (const f of [S.terrain.file, ...S.layers.map((l) => l.zip), S.structures.file, "collars.csv", "survey.csv", "README.md"]) assert.ok(exists(dir, f), f);
  assert.equal(S.epsg, BLAKE_EPSG);
});

test("280 hole traces with a medium or high location, each on the terrain, each with a collar and an end station", async () => {
  const collars = table(dir, "collars.csv"), survey = table(dir, "survey.csv");
  assert.equal(collars.length, 280);
  assert.equal(new Set(collars.map((c) => c.hole_id)).size, 280);
  assert.deepEqual([collars.filter((c) => c.location_precision === "high").length, collars.filter((c) => c.location_precision === "medium").length], [166, 114]);
  const { img, data } = await tiff(dir, "terrain_cdem_30m.tif");
  assert.deepEqual([img.getWidth(), img.getHeight(), img.getResolution()[0]], [322, 297, 30]);
  const [x0, y0, x1, y1] = img.getBoundingBox();
  let lo = Infinity, hi = -Infinity;
  for (const v of data) { if (v < lo) lo = v; if (v > hi) hi = v; }
  assert.ok(lo > 260 && hi < 380, `${lo} to ${hi} m`);
  for (const c of collars) assert.ok(c.epsg === "26917" && Number(c.x) > x0 && Number(c.x) < x1 && Number(c.y) > y0 && Number(c.y) < y1 && Number(c.z) >= lo - 1 && Number(c.z) <= hi + 1 && Number(c.length) > 0, c.hole_id);
  assert.equal(survey.length, 560);
  const len = new Map(collars.map((c) => [c.hole_id, Number(c.length)])), by = new Map();
  for (const s of survey) { assert.ok(len.has(s.hole_id) && Number(s.dip) <= -5 && Number(s.dip) >= -90 && Number(s.azimuth) >= 0 && Number(s.azimuth) < 360); by.set(s.hole_id, [...(by.get(s.hole_id) || []), Number(s.depth)]); }
  for (const [h, d] of by) assert.deepEqual(d, [0, len.get(h)], h);
  // the first hole of the file: SIGEOM gives azimuth 200 (true) at the start; 1.49 degrees are subtracted for grid north
  assert.deepEqual([collars[0].hole_id, Number(survey[0].azimuth), Number(survey[0].dip)], ["FD-81657", 198.51, -60]);
});

test("the geology reads as 316 polygons of 44 units, and the 299 measurements as strike / dip by the right-hand rule", async () => {
  const g = await parseShapefileZip(new Uint8Array(read(dir, "geology.zip")));
  assert.deepEqual([g.features.length, g.geomType, new Set(g.features.map((f) => f.attributes.UNIT)).size], [316, "polygon", 44]);
  assert.match(g.prjWkt, /NAD_1983_UTM_Zone_17N/);
  assert.ok(g.features.every((f) => !/<a |href/.test(Object.values(f.attributes).join(" ")))); // the service's HTML links are gone
  const rows = Papa.parse(read(dir, "structures.csv").toString("utf8"), { header: true, skipEmptyLines: true }).data;
  const out = parseStructureRows(rows, S.structures.columns);
  assert.deepEqual([out.rows.length, out.skipped, out.derivedFromStrike, out.strikeRule], [299, 0, 299 - out.horizontal, "rhr"]);
  assert.deepEqual([out.rows.filter((r) => r.cls === "bedding").length, out.rows.filter((r) => r.cls === "cleavage").length, out.rows.filter((r) => r.cls === "foliation").length], [103, 64, 42 + 31 + 1]);
  assert.ok(rows.every((r) => Number(r.dip) >= 0 && Number(r.dip) <= 90)); // no "99 = undetermined" left
  const r0 = out.rows.find((r) => r.strike === 5 && r.dip === 90);
  assert.equal(r0.dipDir, 95); // dip to the right of the strike
});

test("the loader adds the terrain, the geology draped on it, and the measurements turned from true to grid north", async () => {
  const got = { layers: [], sets: [], terrains: [], surface: [] };
  const store = { addMapLayer: (l) => got.layers.push(l), addTerrain: (t) => got.terrains.push(t), addSurfaceStructureSet: (s) => got.sets.push(s), setSurfaceSamples: (fn) => { got.surface = fn(got.surface); }, setSurfaceElements: () => {} };
  const notes = await loadRegionalSample(dir, fileOf(dir), store, { projectEpsg: 26917 });
  assert.deepEqual(got.layers.map((l) => [l.features.length, l.styleField, l.visible]), [[316, "UNIT", true]]);
  assert.equal(got.layers[0].drapeMode, got.terrains.length ? "terrain" : "flat");
  assert.deepEqual([got.sets.length, got.sets[0].rows.length, got.sets[0].azimuthRef, got.surface.length], [1, 299, "true", 0]);
  const r0 = got.sets[0].rows.find((r) => Math.abs(r.strike - (5 - 1.49)) < 0.1 && r.dip === 90);
  assert.ok(r0 && Math.abs(r0.dipDir - (95 - 1.49)) < 0.1, JSON.stringify(r0));
  assert.match(said(notes), /Loaded the Rouyn-Noranda sample .*1 geology layer\(s\), 299 outcrop structural measurement\(s\)/);
  if (!got.terrains.length) assert.match(said(notes), /The Rouyn-Noranda terrain could not be loaded/);
});

test("the sample is offered, named, translated and licensed where a user reads it", () => {
  checkOffered(dir, { licence: "CC-BY-4.0", who: /Rouyn-Noranda sample .*SIGEOM/, name: "Rouyn-Noranda (sample)", inFootnote: "Rouyn-Noranda (Quebec's SIGEOM" });
  const readme = read(dir, "README.md").toString("utf8");
  assert.match(readme, /keeps no downhole assay table/);
  assert.match(readme, /Open Government Licence – Canada/);
});
