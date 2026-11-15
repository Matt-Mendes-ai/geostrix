// TASKS.csv #2003 (in part) — SAM, matched filter and RX on a synthetic cube
import test from "node:test";
import assert from "node:assert/strict";
import { spectralAngle, sam, background, rx, matchedFilter } from "../src/lib/spectralMatch.js";

// SYNTHETIC: 6 bands, a background of two smooth materials with noise, plus pixels carrying a 'clay' absorption target
let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
const mat1 = [0.30, 0.34, 0.38, 0.40, 0.42, 0.45], mat2 = [0.20, 0.22, 0.30, 0.36, 0.33, 0.31], clay = [0.30, 0.34, 0.38, 0.40, 0.10, 0.45];
const bgPix = Array.from({ length: 400 }, (_, i) => (i % 2 ? mat1 : mat2).map((v) => v * (0.8 + 0.4 * (rnd() + 0.5)) + 0.004 * rnd()));
const target = Array.from({ length: 5 }, () => clay.map((v) => v + 0.004 * rnd()));
const cube = [...bgPix, ...target, null, Float32Array.from([NaN, 1, 1, 1, 1, 1])]; // 400 + 5 + two masked

test("the spectral angle: 0 for a scaled copy, a hand value for two spectra, NaN for a zero spectrum", () => {
  assert.ok(spectralAngle([1, 2, 3], [2, 4, 6]) < 1e-7);
  assert.ok(Math.abs(spectralAngle([1, 0], [1, 1]) - Math.PI / 4) < 1e-12);
  assert.ok(Number.isNaN(spectralAngle([0, 0], [1, 1])));
});

test("SAM ranks the clay pixels closest to the clay reference; masked pixels are NaN", () => {
  const a = sam(cube, clay);
  const tgt = Array.from({ length: 5 }, (_, i) => a[400 + i]), bgMin = Math.min(...Array.from(a.slice(0, 400)));
  assert.ok(Math.max(...tgt) < bgMin, `${Math.max(...tgt)} < ${bgMin}`);
  assert.ok(Number.isNaN(a[405]) && Number.isNaN(a[406]));
});

test("the matched filter scores the target near 1 and the background near 0; RX scores the target far above the background", () => {
  const bg = background(cube);
  assert.equal(bg.n, 405); assert.equal(bg.bands, 6);
  const mf = matchedFilter(cube, clay, bg);
  const mfT = target.map((_, i) => mf[400 + i]), mfB = Array.from(mf.slice(0, 400));
  assert.ok(mfT.every((v) => v > 0.6), mfT.join(","));
  assert.ok(Math.abs(mfB.reduce((s, v) => s + v, 0) / 400) < 0.15);
  const r = rx(cube, bg), rB = Array.from(r.slice(0, 400)).sort((x, y) => x - y);
  assert.ok(r[400] > rB[Math.floor(0.99 * 400)], "the target is beyond the background's 99th percentile");
  assert.ok(Number.isNaN(r[405]));
});

test("fewer pixels than bands still inverts (the ridge); too few pixels gives none", () => {
  const few = Array.from({ length: 4 }, () => Array.from({ length: 6 }, () => 0.3 + 0.05 * rnd()));
  const bg = background(few);
  assert.ok(bg && bg.inv.length === 6);
  assert.ok(rx(few, bg).every(Number.isFinite));
  assert.equal(background([few[0]]), null);
});

import { parseSpectrum, resampleSpectrum, matchMap } from "../src/lib/spectralMatch.js";
test("#2003 UI step: a pasted spectrum is read, resampled to the band wavelengths, and the three maps are made from per-band arrays", () => {
  assert.equal(parseSpectrum("a b\n1 2"), null);
  const ref = parseSpectrum("wavelength,reflectance\n2.0,0.2\n2.2,0.1\n2.4,0.3"); // micrometres
  assert.deepEqual(ref.wl, [2000, 2200, 2400]);
  const wl = [1900, 2000, 2100, 2200, 2300, 2400];
  const r = resampleSpectrum(ref, wl);
  assert.ok(Number.isNaN(r.value[0]) && Math.abs(r.value[2] - 0.15) < 1e-12 && Math.abs(r.value[4] - 0.2) < 1e-12);
  assert.ok(Math.abs(r.covered - 5 / 6) < 1e-12);
  // a 6-band cube of 100 pixels: background noise, 5 pixels carry the reference
  const rng = (i) => (((i * 2654435761) >>> 0) % 1000) / 1000;
  const refv = [0.3, 0.2, 0.15, 0.1, 0.2, 0.3];
  const bands = refv.map((_, b) => Float32Array.from({ length: 100 }, (_, p) => (p < 5 ? refv[b] : 0.35 + 0.05 * rng(p * 7 + b))));
  const sam_ = matchMap(bands, "sam", refv).map;
  const order = [...sam_.keys()].sort((a, b) => sam_[a] - sam_[b]).slice(0, 5).sort();
  assert.deepEqual(order, [0, 1, 2, 3, 4], "the five target pixels have the smallest angle");
  assert.ok(sam_[0] < 0.01 && sam_[50] > 1, `target ${sam_[0]} deg, background ${sam_[50]} deg`);
  const mf = matchMap(bands, "mf", refv).map, rxm = matchMap(bands, "rx").map;
  assert.ok(mf[0] > 0.5 && Math.abs(mf[60]) < 0.5);
  assert.ok(rxm[0] > rxm[60]);
  // a masked pixel is NaN
  bands[2][7] = NaN;
  assert.ok(Number.isNaN(matchMap(bands, "sam", refv).map[7]));
});
