// TASKS.csv #2829 — the Blake River gravity sample (Geological Survey of Canada, Open Government Licence - Canada): the bundled grid
// decodes, the stations read as a gravity survey, the two agree where a station lies, and the sample is offered and named.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import zlib from "node:zlib";
import { decodeGrd } from "../src/lib/grdFormats.js";
import { nodeGridAreaBbox } from "../src/lib/raster.js";
import { blakeStationPoints, loadBlakeRiver, BLAKE_FILES, BLAKE_EPSG, BLAKE_SURVEY, BLAKE_GRID, BLAKE_STATIONS } from "../src/lib/sampleBlakeRiver.js";
import { sampleCardsFor, sampleFootnote } from "../src/lib/sampleCards.js";
import { sampleProjectName } from "../src/lib/sampleProjectName.js";

const dir = new URL("../sample_data/blake_river/", import.meta.url);
const read = (n) => fs.readFileSync(new URL(n, dir));
const grid = async () => decodeGrd(new Uint8Array(read(BLAKE_GRID)), async (u8) => new Uint8Array(zlib.inflateSync(u8)));

test("the bundled files are the ones the loader names, and small", () => {
  for (const f of BLAKE_FILES) assert.ok(fs.existsSync(new URL(f, dir)), f);
  assert.ok(fs.existsSync(new URL("README.md", dir)));
  const bytes = BLAKE_FILES.reduce((a, f) => a + fs.statSync(new URL(f, dir)).size, 0);
  assert.ok(bytes < 1.5e6, `${bytes} bytes`);
});

test("the Bouguer grid decodes: 767 x 424 nodes at 100 m in UTM 17N, all negative mGal", async () => {
  const g = await grid();
  assert.deepEqual([g.ncols, g.nrows, g.dx, g.dy, g.x0, g.y0, g.rotation], [767, 424, 100, 100, 609300, 5332300, 0]);
  let n = 0, min = Infinity, max = -Infinity;
  for (const v of g.values) if (Number.isFinite(v)) { n++; if (v < min) min = v; if (v > max) max = v; }
  assert.equal(n, 257508);
  assert.ok(Math.abs(min + 65.6028) < 1e-3 && Math.abs(max + 31.7128) < 1e-3, `${min} ${max}`);
  assert.deepEqual(nodeGridAreaBbox(g.x0, g.y0, g.dx, g.dy, g.ncols, g.nrows), [609250, 5332250, 685950, 5374650]);
});

test("the stations read as one gravity survey of 7,810 points in the grid's CRS", () => {
  const { points, medianZ } = blakeStationPoints(read(BLAKE_STATIONS).toString("utf8"));
  assert.equal(points.length, 7810);
  assert.ok(points.every((p) => p._src === BLAKE_SURVEY && Number.isFinite(p.z)));
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y), vs = points.map((p) => p.value);
  assert.ok(Math.min(...xs) > 600000 && Math.max(...xs) < 705000 && Math.min(...ys) > 5320000 && Math.max(...ys) < 5380000); // metres, not degrees
  assert.ok(Math.abs(Math.min(...vs) + 70.93) < 1e-9 && Math.abs(Math.max(...vs) + 29.67) < 1e-9);
  assert.ok(medianZ > 250 && medianZ < 350, `median elevation ${medianZ}`);
  // the first station of the download: -79.425003, 48.11783 -> 617,218.32 E 5,330,596.31 N; Bouguer -65.53 at 315.32 m
  const first = points.find((p) => p.label === "20713");
  assert.deepEqual([first.x, first.y, first.z, first.value], [617218.32, 5330596.31, 315.32, -65.53]);
});

test("where a station lies inside the grid, the published grid and the station agree (real data against real data)", async () => {
  const g = await grid();
  const { points } = blakeStationPoints(read(BLAKE_STATIONS).toString("utf8"));
  const diffs = [];
  for (const p of points) {
    const fx = (p.x - g.x0) / g.dx, fy = (p.y - g.y0) / g.dy, i = Math.floor(fx), j = Math.floor(fy);
    if (i < 0 || j < 0 || i >= g.ncols - 1 || j >= g.nrows - 1) continue;
    const v = (a, b) => g.values[b * g.ncols + a], c = [v(i, j), v(i + 1, j), v(i, j + 1), v(i + 1, j + 1)];
    if (!c.every(Number.isFinite)) continue;
    const tx = fx - i, ty = fy - j;
    diffs.push(c[0] * (1 - tx) * (1 - ty) + c[1] * tx * (1 - ty) + c[2] * (1 - tx) * ty + c[3] * tx * ty - p.value);
  }
  assert.ok(diffs.length > 5000, `${diffs.length} stations inside the grid`);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length, sd = Math.sqrt(diffs.reduce((a, b) => a + (b - mean) ** 2, 0) / diffs.length);
  assert.ok(Math.abs(mean) < 0.01 && sd < 0.1, `mean ${mean.toFixed(4)} sd ${sd.toFixed(4)} mGal`); // a station file in the wrong place or unit could not pass
});

test("the loader sets the CRS on an empty project, adds the survey with its method and unit, and says what it loaded", async () => {
  const calls = { layers: { geophys_pts: [] }, surveys: {}, epsg: null, rasters: [] };
  const store = {
    setEpsg: (e) => { calls.epsg = e; }, addRaster: (r) => calls.rasters.push(r),
    setLayers: (fn) => { calls.layers = fn(calls.layers); }, updateGeophysSurvey: (k, patch) => { calls.surveys[k] = patch; },
  };
  const readFile = async (name) => new File([read(name)], name);
  const notes = await loadBlakeRiver(readFile, store, { crsSet: false, epsg: 3156 });
  assert.equal(calls.epsg, BLAKE_EPSG);
  assert.equal(calls.layers.geophys_pts.length, 7810);
  assert.deepEqual(calls.surveys[BLAKE_SURVEY], { method: "grav", units: "mGal", zMeaning: "elevation" });
  // the raster needs a canvas (the app's renderer): in Node that part fails by itself and says so, and the stations still load
  const text = notes.map((n) => n.text);
  assert.ok(text.some((t) => /Loaded the Blake River gravity sample.*7,810 gravity stations/.test(t)), text.join(" | "));
  assert.ok(text.some((t) => /Project CRS set to NAD83 \/ UTM zone 17N \(EPSG:26917\)/.test(t)));
  if (!calls.rasters.length) assert.ok(text.some((t) => /The Blake River grid could not be loaded/.test(t)));
  else assert.deepEqual([calls.rasters[0].surveyMethod, calls.rasters[0].units], ["grav", "mGal"]);
  // loading it twice replaces the survey, it does not double it
  await loadBlakeRiver(readFile, store, { crsSet: true, epsg: BLAKE_EPSG });
  assert.equal(calls.layers.geophys_pts.length, 7810);
});

test("the sample is offered on both empty views, named on its tab, and the README carries the licence and what was done", () => {
  for (const mode of ["viewer", "surface"]) assert.ok(sampleCardsFor(mode).some((c) => c.id === "blake"), mode);
  assert.equal(sampleCardsFor("viewer").length, 6);
  assert.match(sampleFootnote(), /Blake River gravity/);
  assert.equal(sampleProjectName("blake", "Untitled project"), "Blake River gravity (sample)");
  assert.equal(sampleProjectName("blake", "My project"), "My project");
  const readme = read("README.md").toString("utf8");
  assert.match(readme, /Contains information licensed under the \[Open Government Licence – Canada\]\(https:\/\/open\.canada\.ca\/en\/open-government-licence-canada\)/);
  assert.match(readme, /nothing is synthesized/);
  assert.match(readme, /not endorsed by, or affiliated with, the Government of Canada/);
  const main = fs.readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  assert.match(main, /"sample:blake"/);
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(new RegExp(`\\n  ${lang}: \\{[^\\n]*"Blake River gravity \\(7,810 stations, no drillholes\\)": "`).test(main), lang);
});
