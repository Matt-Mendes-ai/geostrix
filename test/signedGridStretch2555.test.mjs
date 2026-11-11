// TASKS.csv #2555 — the raster Stretch list suggested 'Log (the values span 1.6 decades)' on a Bouguer grid of -0.42 to +0.42 mGal: the
// span came from the positive half only, and the log stretch painted the low (the target) one colour. No log suggestion on a signed
// grid now; a diverging ramp centred on zero is offered instead.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decadesSpanned, signedGridHint } from "../src/lib/rasterColour.js";

// a gravity-like grid: -0.42 to +0.42, half of it below zero
const grav = Float32Array.from({ length: 6400 }, (_, i) => -0.42 + (0.84 * i) / 6399);
// a resistivity-like grid: all positive, 2 decades
const res = Float32Array.from({ length: 1001 }, (_, i) => 32 * (3852 / 32) ** (i / 1000));

test("a signed grid: no decades, half the cells non-positive, a symmetric range from the 2nd / 98th percentiles", () => {
  assert.equal(decadesSpanned(grav), 0);
  const h = signedGridHint(grav);
  assert.ok(Math.abs(h.nonPositive - 0.5) < 0.01, String(h.nonPositive));
  assert.equal(h.straddles, true);
  assert.ok(h.symMax > 0.38 && h.symMax < 0.42, String(h.symMax));
});

test("a positive grid keeps its log suggestion; a grid with a few zeros (under 5 %) still gets it; one negative cell does not straddle", () => {
  assert.ok(decadesSpanned(res) > 1.9);
  assert.equal(signedGridHint(res).straddles, false);
  const fewZeros = Float32Array.from(res); for (let i = 0; i < 30; i++) fewZeros[i] = 0;
  assert.ok(decadesSpanned(fewZeros) > 1.5);
  const oneNeg = Float32Array.from(res); oneNeg[0] = -1;
  assert.equal(signedGridHint(oneNeg).straddles, false);
  assert.deepEqual(signedGridHint(new Float32Array(0)), { nonPositive: 0, straddles: false, symMax: null });
});

test("the menu labels the log entry for a signed grid and offers the diverging ramp", () => {
  const c = readFileSync(new URL("../src/components/RasterColourControls.jsx", import.meta.url), "utf8");
  assert.match(c, /tr\("Log \(positive values only: \{pct\}% of the cells are not\)"/);
  assert.match(c, /apply\(\{ palette: "diverging", stretch: "custom", min: -sig4\(signed\.symMax\), max: sig4\(signed\.symMax\) \}\)/);
});
