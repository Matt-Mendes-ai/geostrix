// TASKS.csv #2006 — the wiring of the two new open samples (Osborne magnetics: a point survey + a grid, like Blake River; GeoMet: drillholes on a local grid with no CRS): the loader,
// the one 3D View branch for point + grid samples, the cards, names, menu, installer notice and the notices that say the GeoMet traces are reconstructed. Synthetic / bundled data only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { read, checkOffered } from "./sampleChecks3107.mjs";
import { loadOsborne, osborneReadingPoints, OSBORNE_EPSG, OSBORNE_SURVEY } from "../src/lib/sampleOsborne.js";
import { loadPointGridSample, POINT_GRID_DIRS } from "../src/lib/samplePointGrid.js";
import { WA_SAMPLES } from "../src/lib/sampleWa.js";

const src = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#2006 Osborne's loader: the readings load as a magnetic survey in UTM 54S, the CRS is adopted, the notice credits the data; one 3D View branch serves both point + grid samples", async () => {
  const text = read("osborne", "osborne_magnetic.csv").toString("utf8");
  const { points, medianZ } = osborneReadingPoints(text);
  assert.equal(points.length, 24927);
  assert.ok(points.every((p) => p._src === OSBORNE_SURVEY && Number.isFinite(p.z) && Number.isFinite(p.value)));
  assert.ok(medianZ > 276 && medianZ < 467);
  const calls = { epsg: null, layers: {}, rasters: [], surveys: {} };
  const store = { setEpsg: (e) => { calls.epsg = e; }, addRaster: (r) => calls.rasters.push(r), setLayers: (fn) => { calls.layers = fn(calls.layers); }, updateGeophysSurvey: (k, patch) => { calls.surveys[k] = patch; } };
  const readFile = async (n) => new File([read("osborne", n)], n);
  const notes = (await loadPointGridSample("osborne", readFile, store, { crsSet: false })).map((n) => n.text);
  assert.equal(calls.epsg, OSBORNE_EPSG);
  assert.equal(calls.layers.geophys_pts.length, 24927);
  assert.deepEqual(calls.surveys[OSBORNE_SURVEY], { method: "mag", units: "nT", zMeaning: "elevation" });
  assert.ok(notes.some((x) => /Loaded the Osborne magnetics sample.*24,927 flight-line readings.*Commonwealth of Australia \(Geoscience Australia\)/.test(x)), notes.join(" | "));
  assert.ok(notes.some((x) => /Project CRS set to WGS 84 \/ UTM zone 54S \(EPSG:32754\)/.test(x)));
  // the raster needs a canvas (the app's renderer): in Node that part fails by itself and says so, and the readings still load
  if (calls.rasters.length) assert.deepEqual([calls.rasters[0].surveyMethod, calls.rasters[0].units], ["mag", "nT"]);
  else assert.ok(notes.some((x) => /The Lightning Creek grid could not be loaded/.test(x)));
  await loadOsborne(readFile, store, { crsSet: true, epsg: OSBORNE_EPSG });
  assert.equal(calls.layers.geophys_pts.length, 24927); // twice replaces, does not double
  assert.deepEqual(POINT_GRID_DIRS, { blake: "blake_river", osborne: "osborne" });
  const vm = src("../src/modules/ViewerModule.jsx");
  assert.match(vm, /if \(which === "blake" \|\| which === "osborne"\)/);
  assert.ok(Buffer.byteLength(vm) <= 735000, "ViewerModule stays under its cap");
});

test("#2006 both are offered, named, in the installer notice, the File menu (four languages) and the footnote, with the checks every open sample passes", () => {
  checkOffered("osborne", { licence: "CC-BY-4.0", who: /Osborne/, name: "Osborne magnetics (sample)", inFootnote: "Osborne magnetics (Geoscience Australia survey P1029" });
  checkOffered("geomet", { licence: "CC-BY-4.0", who: /GeoMet/, name: "GeoMet drillholes (sample)", inFootnote: "GeoMet (IMPA, UFMG and Vale S.A., CC BY 4.0)" });
});

test("#2006 GeoMet's wiring: a local grid (no CRS) in the import queue, its assays through the WA extras, a notice that says the traces are reconstructed", () => {
  const imp = src("../src/modules/viewer/importPipelineImpl.js");
  assert.match(imp, /geomet: \{\n\s+dir: "geomet", localGrid: "GeoMet local mine grid", files: \["collars\.csv", "survey\.csv"\]/);
  assert.match(imp, /RECONSTRUCTED from the samples' X, Y and Z/);
  assert.match(imp, /a local grid with no coordinate system: there is no map backdrop and nothing to reproject/);
  assert.match(imp, /if \(S\.localGrid\) \{/);
  assert.match(imp, /live\.setLocalGrid\(S\.localGrid\)/);
  assert.equal(WA_SAMPLES.geomet.assays, "assays.csv");
  assert.equal(WA_SAMPLES.geomet.epsg, null);
  const vm = src("../src/modules/ViewerModule.jsx");
  assert.match(vm, /setLocalGrid: store\.setLocalGrid,/);
  assert.match(vm, /which === "geomet" \/\* #2006 \*\//);
});
