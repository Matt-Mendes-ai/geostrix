// TASKS.csv #3949 — the section's ground is a line only (no light brown fill under it), and its label names the project terrain's own source
// ('Ground surface (GEM-15)'), or reads plain 'Ground surface' when the source is not known. Synthetic terrains only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { terrainShortName } from "../src/lib/terrainSource.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the short name of each terrain source a fetch records", () => {
  const t = (service) => ({ source: { service } });
  assert.equal(terrainShortName(t("Google GEM-15 (15 m bare-earth terrain model)")), "GEM-15");
  assert.equal(terrainShortName(t("Google GEM-15 (15 m surface model)")), "GEM-15");
  assert.equal(terrainShortName(t("Copernicus DEM GLO-30 (ESA, surface model ~30 m)")), "GLO-30");
  assert.equal(terrainShortName(t("AWS Terrain Tiles (Terrarium): SRTM blended with national DEMs (CDEM in Canada)")), "AWS Terrain Tiles");
  assert.equal(terrainShortName(t("NRCan MRDEM-30 terrain (30 m, bare earth)")), "MRDEM-30");
  assert.equal(terrainShortName(t("NRCan MRDEM-30 terrain (30 m, bare earth): no HRDEM lidar in this area")), "MRDEM-30");
  assert.equal(terrainShortName(t("NRCan HRDEM lidar terrain (1 m) on 40% of the area, MRDEM-30 elsewhere")), "HRDEM");
  assert.equal(terrainShortName(t("Canadian Digital Elevation Model, Natural Resources Canada (bundled with the sample)")), "CDEM");
  assert.equal(terrainShortName(t("my own lidar grid")), null, "a source it does not know: plain 'Ground surface'");
  assert.equal(terrainShortName({ name: "dem.tif" }), null, "a terrain from a file records no service");
  assert.equal(terrainShortName(null), null);
});

test("the section window draws the ground as a line, labelled with the source; ViewerModule sends it", () => {
  const w = read("../src/components/SectionWindow.jsx");
  assert.doesNotMatch(w, /#e8dfc8/, "the fill under the ground is gone");
  assert.match(w, /<polyline\s+points=\{elevationProfile\.map/, "the line stays");
  assert.match(w, /const groundLabel = data\.groundSource \? tr\("Ground surface \(\{source\}\)", \{ source: data\.groundSource \}\) : tr\("Ground surface"\);/);
  assert.doesNotMatch(w, /Ground surface \(SRTM\)/);
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /const openSectionOrSay = async \(sent\) => \{ const payload = \{ \.\.\.sent, groundSource: terrainShortName\(terrain\) \/\* #3949 \*\/ \};/, "every section opens through openSectionOrSay, which adds it");
});
