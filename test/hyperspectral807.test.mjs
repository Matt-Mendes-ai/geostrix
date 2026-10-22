// TASKS.csv #807 — continuum-removed absorption features from a hyperspectral cube: depth and the wavelength of the
// minimum recovered from synthetic spectra with a known feature; wavelength lists from ENVI headers / GDAL metadata.
import test from "node:test";
import assert from "node:assert/strict";
import { FEATURES, parseWavelengths, wavelengthsFromGdalMetadata, featureBands, featureMap } from "../src/lib/hyperspectral.js";

const WL = Array.from({ length: 285 }, (_, i) => 381 + i * 7.43); // EMIT-like: 381-2493 nm
// a sloping continuum with one Gaussian absorption of depth d at centre c (width s nm)
const spectrum = (c, d, s = 18) => WL.map((w) => (0.25 + 0.00004 * (w - 2000)) * (1 - d * Math.exp(-(((w - c) / s) ** 2))));

test("#807 Al-OH: the minimum's wavelength and depth come back (muscovite vs phengite vs kaolinite)", () => {
  const idx = featureBands(WL, "aloh2200");
  assert.ok(idx.length >= 15, `${idx.length} bands in the 2200 window`);
  const pixels = [spectrum(2202, 0.15), spectrum(2218, 0.12), spectrum(2166, 0.2), spectrum(2205, 0)];
  const bands = idx.map((b) => pixels.map((p) => p[b]));
  const r = featureMap(bands, idx.map((b) => WL[b]));
  assert.ok(Math.abs(r.wavelength[0] - 2202) < 2.5, `muscovite at ${r.wavelength[0]}`);
  assert.ok(Math.abs(r.wavelength[1] - 2218) < 2.5, `phengite at ${r.wavelength[1]}`);
  assert.ok(Math.abs(r.wavelength[2] - 2166) < 2.5, `kaolinite at ${r.wavelength[2]}`);
  assert.ok(Math.abs(r.depth[0] - 0.15) < 0.03 && Math.abs(r.depth[2] - 0.2) < 0.03, `depths ${r.depth[0]}, ${r.depth[2]}`);
  assert.ok(r.depth[3] < 0.01 && Number.isNaN(r.wavelength[3]), "no feature: depth ~0, no wavelength");
  assert.equal(r.noFeature, 1);
});

test("#807 the other features; nodata and too few bands", () => {
  const i2 = featureBands(WL, "mgoh2330"), i9 = featureBands(WL, "ferric900");
  const p = spectrum(2335, 0.1), q = spectrum(905, 0.12, 60);
  assert.ok(Math.abs(featureMap(i2.map((b) => [p[b]]), i2.map((b) => WL[b])).wavelength[0] - 2335) < 3);
  assert.ok(Math.abs(featureMap(i9.map((b) => [q[b]]), i9.map((b) => WL[b])).wavelength[0] - 905) < 6);
  const bad = featureMap(i2.map((b) => [b === i2[3] ? -9999 : p[b]]), i2.map((b) => WL[b]), { isNoData: (v) => v === -9999 });
  assert.ok(Number.isNaN(bad.depth[0]) && bad.valid === 0);
  assert.throws(() => featureMap([[1], [1]], [2200, 2210]), /band/);
});

test("#807 wavelengths from an ENVI header, a list, micrometres, and GDAL band metadata", () => {
  assert.deepEqual(parseWavelengths("ENVI\nsamples = 3\nwavelength = {\n 2190.5, 2197.9,\n2205.3}\nfwhm = {1,2,3}"), [2190.5, 2197.9, 2205.3]);
  assert.deepEqual(parseWavelengths("2.1905 2.1979"), [2190.5, 2197.9]);
  assert.deepEqual(parseWavelengths("nothing here"), []);
  assert.deepEqual(wavelengthsFromGdalMetadata([{ wavelength: "2190.5", wavelength_units: "nm" }, { WAVELENGTH: "2197.9" }]), [2190.5, 2197.9]);
  assert.deepEqual(wavelengthsFromGdalMetadata([{ DESCRIPTION: "Band 1 (2190.5 nm)" }, { DESCRIPTION: "2197.9" }]), [2190.5, 2197.9]);
  assert.equal(wavelengthsFromGdalMetadata([{ wavelength: "2190.5" }, {}]), null);
  assert.ok(FEATURES.aloh2200.lo < 2160 && FEATURES.aloh2200.hi > 2225);
});
