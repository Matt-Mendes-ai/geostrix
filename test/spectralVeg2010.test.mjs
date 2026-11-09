// TASKS.csv #2010 — band ratios from a multiband GeoTIFF already worked (Spectral index, #783); what was left: the vegetation threshold is the
// user's (NDVI 0.4 was fixed), and the Evidence overlay points a satellite picture to Maps > Spectral index.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateIndex } from "../src/lib/spectralIndices.js";
const s = readFileSync(new URL("../src/components/SpectralIndexModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const e = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

// reflectance: NDVI 0.2, 0.5 and 0.7 (NIR band 1, red band 2), iron ratio on bands 2 / 3
const nir = new Float32Array([0.30, 0.45, 0.51]), red = new Float32Array([0.20, 0.15, 0.09]), blue = new Float32Array([0.05, 0.05, 0.05]);
test("the vegetation mask follows the NDVI the user enters", () => {
  const run = (max) => evaluateIndex([nir, red, blue], { B8: 1, B4: 2, B2: 3 }, "B4/B2", { veg: { nir: "B8", red: "B4", max } }).vegetated;
  assert.equal(run(0.4), 2);
  assert.equal(run(0.6), 1);
  assert.equal(run(0.1), 3);
});
test("wired: the threshold input, its use, the evidence pointer", () => {
  assert.match(s, /veg: vegOn \? \{ nir: sens\.nir, red: sens\.red, max: vegMaxN \} : null/);
  assert.match(s, /aria-label=\{tr\("NDVI above which a pixel is vegetated"\)\}/);
  assert.match(e, /Maps > Spectral index makes iron oxide, clay \/ hydroxyl or your own ratio/);
});
