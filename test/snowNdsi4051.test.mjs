// TASKS.csv #4051 — the second snow test (NDSI from Sentinel-2 green and SWIR 1) beside the scene classification, and the index's scene in true colour. Made-up reflectances.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ndsi, snowByNdsi, ndsiMinOf, NDSI_SNOW_MIN, SNOW_MIN_GREEN } from "../src/lib/snowTest.js";
import { sceneOfRaster, isSentinelScene } from "../src/lib/sceneInfo.js";

// [green, SWIR 1] of the kinds of pixel the test has to tell apart
const SNOW = [0.8, 0.10];        // NDSI 0.78
const THIN = [0.5, 0.25];        // thin or dirty snow: NDSI 0.33, under the usual 0.4
const CARBONATE = [0.35, 0.30];  // bright carbonate rock: NDSI 0.08
const ROCK = [0.20, 0.25];       // ordinary rock: negative
const WATER = [0.05, 0.01];      // dark water or shadow: NDSI 0.67 at a few per cent reflectance
const px = (kinds) => ({ green: Float32Array.from(kinds.map((k) => k[0])), swir: Float32Array.from(kinds.map((k) => k[1])) });

test("NDSI is (green - SWIR 1) / (green + SWIR 1)", () => {
  assert.ok(Math.abs(ndsi(...SNOW) - 0.7778) < 1e-3);
  assert.ok(Math.abs(ndsi(...CARBONATE) - 0.0769) < 1e-3);
  assert.ok(ndsi(...ROCK) < 0);
  assert.ok(Number.isNaN(ndsi(NaN, 0.1)) && Number.isNaN(ndsi(0, 0)));
});

test("snow is found, bright carbonate rock and ordinary rock are not, dark water and shadow are kept out by the brightness guard", () => {
  const { green, swir } = px([SNOW, CARBONATE, ROCK, WATER, SNOW]);
  const r = snowByNdsi(green, swir);
  assert.deepEqual([...r.flags], [1, 0, 0, 0, 1]);
  assert.equal(r.count, 2);
  assert.equal(r.scored, 5);
  assert.ok(ndsi(...WATER) > NDSI_SNOW_MIN && WATER[0] < SNOW_MIN_GREEN, "water passes the index and fails only the guard");
});

test("the threshold is the user's: thin snow is caught by a lower one, and carbonate stays out until it is very low", () => {
  const { green, swir } = px([THIN, CARBONATE]);
  assert.deepEqual([...snowByNdsi(green, swir).flags], [0, 0], "the usual 0.4: thin snow is missed");
  assert.deepEqual([...snowByNdsi(green, swir, { min: 0.3 }).flags], [1, 0], "0.3 takes thin snow, not carbonate");
  assert.deepEqual([...snowByNdsi(green, swir, { min: 0.05 }).flags], [1, 1], "a threshold under the carbonate's NDSI takes it: the user chose that");
});

test("pixels the classification already blanked are not counted again: 'n by the classification, m more by NDSI'", () => {
  const { green, swir } = px([SNOW, SNOW, SNOW, ROCK]);
  const skip = Uint8Array.from([1, 0, 0, 0]);
  const r = snowByNdsi(green, swir, { skip });
  assert.deepEqual([...r.flags], [0, 1, 1, 0]);
  assert.equal(r.count, 2);
  assert.equal(r.scored, 4, "a skipped pixel was still scored");
});

test("no data (NaN) is neither snow nor scored", () => {
  const green = Float32Array.from([NaN, 0.8]), swir = Float32Array.from([0.1, NaN]);
  const r = snowByNdsi(green, swir);
  assert.deepEqual([...r.flags], [0, 0]); assert.equal(r.scored, 0);
});

test("the threshold as typed: a number between -1 and 1, else the usual one", () => {
  assert.equal(ndsiMinOf("0.3"), 0.3);
  assert.equal(ndsiMinOf(""), NDSI_SNOW_MIN);
  assert.equal(ndsiMinOf("abc"), NDSI_SNOW_MIN);
  assert.equal(ndsiMinOf("1.5"), NDSI_SNOW_MIN);
  assert.equal(NDSI_SNOW_MIN, 0.4);
});

test("the scene an index layer was made from is read off the layer", () => {
  const raster = { spectralIndex: { expr: "B11/B12", scene: "S2B_10UFB_20250812_0_L2A", date: "2025-08-12", sensor: "sentinel2", areaLonLat: [-130.1, 56.0, -129.9, 56.2], snow: { scl: 10, ndsi: 5, min: 0.4 } } };
  const sc = sceneOfRaster(raster);
  assert.equal(sc.id, "S2B_10UFB_20250812_0_L2A"); assert.equal(sc.date, "2025-08-12"); assert.equal(sc.sentinel, true);
  assert.deepEqual(sc.areaLonLat, [-130.1, 56.0, -129.9, 56.2]); assert.equal(sc.trueColour, false); assert.deepEqual(sc.snow, { scl: 10, ndsi: 5, min: 0.4 });
  assert.equal(sceneOfRaster({ spectralIndex: { expr: "b1/b2" } }), null, "an index from a file has no scene");
  assert.equal(sceneOfRaster({}), null);
  assert.equal(sceneOfRaster({ spectralIndex: { scene: "x", areaLonLat: [1, 2] } }).areaLonLat, null, "an area that is not four numbers is not used");
  assert.equal(sceneOfRaster({ spectralIndex: { scene: "S2A_x", trueColour: true } }).trueColour, true);
  assert.ok(isSentinelScene("S2A_36QWD_20200101_0_L2A") && !isSentinelScene("AST_L1T_00312312015"));
});

test("wiring: the fetch runs the NDSI test beside the classification, the modal offers it and the true colour, the layer shows its scene", () => {
  const f = readFileSync(new URL("../src/lib/imageryFetch.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(f, /snowByNdsi\(green, swir, \{ min, minGreen, skip \}\)/);
  assert.match(f, /snow !== false && mask && !!scene\.scl/, "on by default with the mask, off with snow: false");
  assert.match(f, /export async function fetchSceneTrueColour\(/);
  assert.match(f, /export async function sceneById\(/);
  assert.match(f, /export function renderTrueColour\(/);
  assert.match(f, /name: `Sentinel-2 \$\{scene\.date\} true colour/, "the drape is named with the scene's date");
  assert.match(f, /A ratio of surface signals|const SCL_MASK = \{ 0: "no data"/);
  const m = readFileSync(new URL("../src/components/SpectralIndexModal.jsx", import.meta.url), "utf8");
  assert.match(m, /snow: snowOn && source === "sentinel2" \? \{ min: snowMinN \} : false/);
  assert.match(m, /Show the scene in true colour/);
  assert.match(m, /A ratio of surface signals, not a mineral map/, "the wording stays");
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(r, /showSceneColour\(r\)/); assert.match(r, /<RasterScene raster=\{r\} \/>/); assert.match(r, /onDrape=\{placeSceneColour/);
  const t = readFileSync(new URL("../src/modules/viewer/RastersTerrainSection.jsx", import.meta.url), "utf8");
  assert.match(t, /<RasterScene raster=\{r\} compact \/>/);
});
