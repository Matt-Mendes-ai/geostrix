// TASKS.csv #3107 — the WA bedded-iron sample (WAMEX report A119232, CC BY 4.0, with Geoscience Australia's magnetic grid): one block of
// the report, clean intervals, oxides kept as the laboratory reports them, a thinned downhole log and a magnetic grid around the block.
import test from "node:test";
import assert from "node:assert/strict";
import { WA_SAMPLES, waAssays, waLog, loadWaSampleExtras } from "../src/lib/sampleWa.js";
import { read, exists, folderBytes, tiff, fileOf, said, checkIntervals, fakeStore, checkOffered } from "./sampleChecks3107.mjs";

const dir = "wa_iron", BOX = { x0: 796348, x1: 797548, y0: 7514298, y1: 7515098 };

test("147 holes of one block in MGA zone 50, every one surveyed, with intervals that neither overlap nor pass the hole's end", () => {
  assert.ok(folderBytes(dir) < 1.2e6, `${folderBytes(dir)} bytes`);
  const { collars, survey } = checkIntervals(dir, ["litho.csv", "assays.csv"]);
  assert.equal(collars.length, 147);
  assert.deepEqual([collars.filter((c) => c.hole_type === "RC").length, collars.filter((c) => c.hole_type === "DD").length], [140, 7]);
  assert.ok(collars.every((c) => c.epsg === "28350" && Number(c.x) >= BOX.x0 && Number(c.x) < BOX.x1 && Number(c.y) >= BOX.y0 && Number(c.y) < BOX.y1 && Number(c.z) > 430 && Number(c.z) < 440));
  // true -> grid north: the vertical holes' azimuths were turned by the grid convergence (1.10 degrees here), so none is left on a round true bearing of 0
  assert.equal(survey.length, 1083);
  assert.ok(survey.every((s) => Number(s.dip) <= -88));
});

test("assays: 4,157 two-metre XRF samples, the oxides stored as oxides and LOI as LOI", () => {
  const a = waAssays(read(dir, "assays.csv").toString("utf8"));
  assert.equal(a.rows.length, 4157);
  assert.deepEqual(a.elements.map((e) => `${e.symbol} ${e.unit}`), ["Fe %", "Si % SiO2", "Al % Al2O3", "P %", "S %", "Mn %", "Ca % CaO", "Mg % MgO", "K % K2O", "Na % Na2O", "Ti % TiO2", "LOI %"]);
  assert.equal(a.rows.filter((r) => r.values.Fe >= 55).length, 799);
  assert.ok(a.rows.every((r) => r.to - r.from === 2 && r.values.Fe > 0 && r.values.Fe < 70 && r.values.Si >= 0 && r.values.Si < 100 && r.values.LOI >= 0));
  // the first row of the file, as the laboratory reported it: 44.27 % SiO2 is stored as 44.27, not divided into Si
  assert.deepEqual([a.rows[0].hole_id, a.rows[0].from, a.rows[0].values.Fe, a.rows[0].values.Si, a.rows[0].values.Al], ["RHRC09570058", 22, 17.99, 44.27, 18.61]);
});

test("downhole logs: three channels at 0.5 m with the no-data code gone, and a magnetic grid 3 km around the block", async () => {
  const text = read(dir, "logs.csv").toString("utf8");
  assert.deepEqual(["density", "gamma", "susceptibility"].map((c) => waLog(text, c).length), [11542, 11511, 11496]);
  assert.ok(waLog(text, "density").every((r) => r.value > -99) && waLog(text, "susceptibility").every((r) => r.value > -99));
  const d = waLog(text, "density").map((r) => r.value).sort((a, b) => a - b);
  assert.ok(d[d.length >> 1] > 2 && d[d.length >> 1] < 3, `median density ${d[d.length >> 1]}`);
  assert.ok(exists(dir, WA_SAMPLES.wa_iron.grid.file));
  const { img, data } = await tiff(dir, "tmi_80m.tif");
  assert.deepEqual([img.getWidth(), img.getHeight(), img.getResolution()[0]], [91, 86, 80]);
  const [x0, y0, x1, y1] = img.getBoundingBox();
  assert.ok(x0 < BOX.x0 - 2900 && x1 > BOX.x1 + 2900 && y0 < BOX.y0 - 2900 && y1 > BOX.y1 + 2900);
  assert.ok(data.every((v) => Number.isFinite(v) && v > -2000 && v < 2000));
});

test("the loader puts the assays in Geochem, makes one numeric layer per log channel with its unit, and adds the grid as magnetics in nT", async () => {
  const store = fakeStore();
  const notes = await loadWaSampleExtras(dir, fileOf(dir), store, { project: { crsSet: true, epsg: 28350 } });
  assert.equal(store.state.assays.length, 4157);
  assert.equal(store.state.elements.length, 12);
  assert.deepEqual(store.state.layers.map((l) => [l.name, l.unit || "", l.rows.length]), [["Density (g/cm3)", "g/cm3", 11542], ["Natural gamma", "", 11511], ["Magnetic susceptibility", "", 11496]]);
  assert.match(said(notes), /WA bedded iron assays: 4,157 samples, 12 columns/);
  // the raster needs a canvas (the app's renderer): in Node that part either loads or says by itself that it could not
  if (store.state.rasters.length) assert.deepEqual([store.state.rasters[0].surveyMethod, store.state.rasters[0].units], ["mag", "nT"]);
  else assert.match(said(notes), /The WA bedded iron grid could not be loaded/);
  // loading it twice does not double the assays
  await loadWaSampleExtras(dir, fileOf(dir), store, { existingElements: store.state.elements, project: { crsSet: true, epsg: 28350 } });
  assert.equal(store.state.assays.length, 4157);
});

test("the sample is offered, named, translated and licensed where a user reads it", () => {
  checkOffered(dir, { licence: "CC-BY-4.0", who: /WA bedded iron sample .*Western Australia.*Geoscience Australia/, name: "WA bedded iron (sample)", inFootnote: "WA bedded iron (WAMEX report A119232)" });
  assert.match(read(dir, "README.md").toString("utf8"), /Geoscience\s+Australia does not endorse GeoStrix/);
});
