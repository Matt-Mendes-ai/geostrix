// TASKS.csv #3107 — the Century sample (Geological Survey of Queensland's geochemistry and drillhole database, CC BY 4.0, with Geoscience
// Australia's magnetic grid): the 1992 holes of a shale-hosted zinc-lead-silver deposit, with soils. Only ROUTINE samples (the zone
// composites that lie over them are left out), magnetic azimuths turned to grid north, and the database's location rating kept.
import test from "node:test";
import assert from "node:assert/strict";
import { WA_SAMPLES, waAssays, waSurface, loadWaSampleExtras } from "../src/lib/sampleWa.js";
import { read, exists, table, folderBytes, tiff, fileOf, said, checkIntervals, fakeStore, checkOffered } from "./sampleChecks3107.mjs";

const dir = "qld_century";

test("37 holes in MGA zone 54 with the database's location rating, surveyed on grid azimuths, intervals that neither overlap nor pass the hole's end", () => {
  assert.ok(folderBytes(dir) < 0.4e6, `${folderBytes(dir)} bytes`);
  const { collars, survey } = checkIntervals(dir, ["litho.csv", "assays.csv"]);
  assert.equal(collars.length, 37);
  assert.ok(collars.every((c) => c.epsg === "7854" && Number(c.x) > 245000 && Number(c.x) < 250000 && Number(c.y) > 7925000 && Number(c.y) < 7929000 && Number(c.z) > 130 && Number(c.z) < 175));
  assert.deepEqual(Object.fromEntries(["DD", "RC", "RCD"].map((t) => [t, collars.filter((c) => c.hole_type === t).length])), { DD: 35, RC: 1, RCD: 1 });
  assert.deepEqual([collars.filter((c) => c.location_accuracy_m === "100").length, collars.filter((c) => c.location_accuracy_m === "20").length], [34, 3]);
  assert.equal(Math.round(collars.reduce((a, c) => a + Number(c.length), 0)), 11735);
  assert.equal(survey.length, 367);
  // the database's magnetic azimuth of 315 at DD92LH329's collar, plus the 1992 declination and the grid convergence (4.93 degrees)
  const s = survey.find((r) => r.hole_id === "DD92LH329" && r.depth === "0");
  assert.deepEqual([Number(s.azimuth), Number(s.dip)], [319.93, -75]);
  const lit = table(dir, "litho.csv");
  assert.deepEqual([lit.length, new Set(lit.map((r) => r.hole_id)).size, lit.filter((r) => r.lithology === "BLSH").length, lit.filter((r) => r.lithology === "SLST").length, lit.filter((r) => /^Mineralisation - Zone/.test(r.description)).length], [825, 34, 286, 285, 395]);
  assert.match(read(dir, "README.md").toString("utf8"), /395 of the 825 logged intervals/);
});

test("assays: 1,532 routine samples in the database's units, zinc to 37 %, below-detection codes read as such, no gold column", () => {
  const text = read(dir, "assays.csv").toString("utf8"), a = waAssays(text);
  assert.equal(a.rows.length, 1532);
  assert.deepEqual(a.elements.map((e) => `${e.symbol} ${e.unit}`), ["Zn ppm", "Pb ppm", "Ag ppm", "Cu ppm", "As ppm", "Cd ppm", "Co ppm", "Mn ppm", "Mo ppm", "Fe %"]);
  const zn = a.rows.map((r) => r.values.Zn);
  assert.deepEqual([zn.filter((v) => v >= 10000).length, zn.filter((v) => v >= 100000).length, Math.max(...zn), Math.max(...a.rows.map((r) => r.values.Pb)), Math.max(...a.rows.map((r) => r.values.Ag))], [720, 279, 370000, 440000, 600]);
  assert.deepEqual([new Set(a.rows.map((r) => r.hole_id)).size, a.rows.filter((r) => r.values.Cu != null).length, new Set(a.rows.filter((r) => r.values.Cu != null).map((r) => r.hole_id)).size], [26, 317, 3]);
  // -1 is "less than 1 ppm" silver: half the limit, flagged, never a negative grade
  assert.deepEqual([a.rows.filter((r) => r.qualifiers?.Ag === "<").length, a.rows.filter((r) => r.qualifiers?.Pb === "<").length], [622, 190]);
  assert.ok(a.rows.every((r) => Object.values(r.values).every((v) => v >= 0)));
  assert.ok(!/Au/.test(text.split("\n")[0]));
  // where a zone composite lay over the routine samples, the routine ones are kept (DD92LH329: 240-243 m was also a 3 m composite)
  const there = a.rows.filter((r) => r.hole_id === "DD92LH329" && r.from >= 240 && r.to <= 243);
  assert.ok(there.length >= 3 && there.every((r) => r.to - r.from < 1.5), JSON.stringify(there.map((r) => [r.from, r.to])));
  assert.ok(a.rows.every((r) => r.to - r.from <= 4.4 + 1e-9));
});

test("soils: 730 samples around the holes, the northing not taken for yttrium; the magnetic grid covers the holes", async () => {
  const soils = waSurface(read(dir, "soils.csv").toString("utf8"), "soil");
  assert.equal(soils.samples.length, 730);
  assert.deepEqual(soils.elements.map((e) => `${e.symbol} ${e.unit}`), ["Zn ppm", "Pb ppm", "Cu ppm", "Mn ppm", "Fe %", "Ag ppm", "As ppm", "Cd ppm", "Co ppm", "Ni ppm", "Mo ppm", "Cr ppm", "V ppm", "Sb ppm"]);
  assert.ok(soils.samples.every((s) => s.x > 246000 && s.x < 249500 && s.y > 7926800 && s.y < 7929500 && s.z === null && s.values.Zn >= 10 && s.values.Y === undefined));
  assert.equal(new Set(soils.samples.map((s) => s.sample_id)).size, 730);
  assert.deepEqual([Math.max(...soils.samples.map((s) => s.values.Zn)), Math.max(...soils.samples.map((s) => s.values.Pb)), table(dir, "soils.csv").filter((r) => r.mesh === "-40#").length], [9000, 1750, 543]);
  assert.ok(exists(dir, WA_SAMPLES.qld_century.grid.file));
  const { img, data } = await tiff(dir, "tmi_80m.tif");
  assert.deepEqual([img.getWidth(), img.getHeight(), img.getResolution()[0]], [115, 118, 80]);
  const [x0, y0, x1, y1] = img.getBoundingBox();
  for (const c of table(dir, "collars.csv")) assert.ok(Number(c.x) - 2900 > x0 && Number(c.x) + 2900 < x1 && Number(c.y) - 2900 > y0 && Number(c.y) + 2900 < y1, c.hole_id);
  let lo = Infinity, hi = -Infinity;
  for (const v of data) { assert.ok(Number.isFinite(v)); if (v < lo) lo = v; if (v > hi) hi = v; }
  assert.ok(lo > -90 && hi < -20, `${lo} to ${hi} nT`); // a quiet field over sedimentary rocks, as the README says
});

test("the loader puts the assays in Geochem, the soils in the surface samples, and adds the grid as magnetics in nT", async () => {
  const store = fakeStore();
  const notes = await loadWaSampleExtras(dir, fileOf(dir), store, { project: { crsSet: true, epsg: 7854 } });
  assert.deepEqual([store.state.assays.length, store.state.elements.length, store.state.surface.length, store.state.surfaceElements.length], [1532, 10, 730, 14]);
  assert.ok(store.state.surface.every((s) => s.medium === "soil"));
  assert.match(said(notes), /Century assays: 1,532 samples, 10 columns/);
  assert.match(said(notes), /Century surface samples: 730 soil/);
  // the raster needs a canvas (the app's renderer): in Node that part either loads or says by itself that it could not
  if (store.state.rasters.length) assert.deepEqual([store.state.rasters[0].surveyMethod, store.state.rasters[0].units], ["mag", "nT"]);
  else assert.match(said(notes), /The Century grid could not be loaded/);
  await loadWaSampleExtras(dir, fileOf(dir), store, { existingElements: store.state.elements, existingSurfaceElements: store.state.surfaceElements, project: { crsSet: true, epsg: 7854 } });
  assert.deepEqual([store.state.assays.length, store.state.surface.length], [1532, 730]); // loading twice does not double them
});

test("the sample is offered, named, translated and licensed where a user reads it", () => {
  checkOffered(dir, { licence: "CC-BY-4.0", who: /Century zinc-lead-silver sample .*Geological Survey of Queensland.*Geoscience Australia/, name: "Century zinc-lead-silver (sample)", inFootnote: "Century (Geological Survey of Queensland, CC BY 4.0)" });
  const readme = read(dir, "README.md").toString("utf8");
  assert.match(readme, /lists the dataset's licence as "Creative Commons\s+Attribution 4\.0"/);
  assert.match(readme, /rated good to \*\*100 m\*\* only/);
  assert.match(readme, /154 composite samples in two lab batches/);
});
