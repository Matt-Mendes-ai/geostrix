// TASKS.csv #3514 — the USGS Spectral Library v7 subset in the Hyperspectral tab's reference picker
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { spectrumText } from "../src/lib/usgsSpectra.js";
import { parseSpectrum, resampleSpectrum, matchMap } from "../src/lib/spectralMatch.js";
const doc = createRequire(import.meta.url)("../src/lib/usgsSpectraSubset.json");

test("the subset: 36 minerals on a 350-2500 nm 5 nm grid, small, with its source and licence", () => {
  assert.deepEqual(doc.wavelengthNm, { from: 350, step: 5, count: 431 });
  assert.ok(doc.spectra.length >= 30 && doc.spectra.length <= 60);
  for (const s of doc.spectra) { assert.equal(s.values.length, 431, s.name); assert.ok(s.values.every((v) => Number.isFinite(v) && v > -0.06 && v < 2.01), `${s.name} has clean reflectances`); assert.ok(s.file.startsWith("splib07b_") && s.record, s.name); }
  assert.match(doc.source, /Data Series 1035/); assert.match(doc.licence, /public domain/i);
  assert.ok(fs.statSync(new URL("../src/lib/usgsSpectraSubset.json", import.meta.url)).size < 150 * 1024, "about 110 kB, not a library");
  for (const k of ["Kaolinite", "Alunite", "Muscovite", "Calcite", "Chlorite (clinochlore)", "Epidote", "Jarosite", "Goethite", "Hematite", "Pyrophyllite", "Gypsum"]) assert.ok(doc.spectra.some((s) => s.name === k), `${k} is in it`);
});

test("known absorption positions: kaolinite near 2,205-2,210 nm, muscovite near 2,195-2,205, calcite near 2,340-2,350", () => {
  const at = (name, lo, hi) => { const s = doc.spectra.find((x) => x.name === name); let best = 0, bi = 0; for (let w = lo; w <= hi; w += 5) { const i = (w - 350) / 5, c = (s.values[i - 3] + s.values[i + 3]) / 2 - s.values[i]; if (c > best) { best = c; bi = w; } } return bi; };
  assert.ok(Math.abs(at("Kaolinite", 2100, 2250) - 2207) <= 8, `kaolinite ${at("Kaolinite", 2100, 2250)}`);
  assert.ok(Math.abs(at("Muscovite", 2150, 2250) - 2200) <= 10, `muscovite ${at("Muscovite", 2150, 2250)}`);
  assert.ok(Math.abs(at("Calcite", 2250, 2400) - 2345) <= 10, `calcite ${at("Calcite", 2250, 2400)}`);
});

test("a spectrum goes through the reference box: text, parse, resample to a cube's bands, and the angle map finds the pixels carrying it", () => {
  const kaol = doc.spectra.find((s) => s.name === "Kaolinite");
  const ref = parseSpectrum(spectrumText(doc, kaol));
  assert.equal(ref.wl.length, 431); assert.equal(ref.wl[0], 350);
  const wl = Array.from({ length: 200 }, (_, i) => 380 + i * 10.6); // an EMIT-like grid, 380-2,490 nm
  const r = resampleSpectrum(ref, wl);
  assert.ok(r.covered > 0.99);
  const bands = wl.map((_, b) => Float32Array.from({ length: 60 }, (_, p) => (p < 4 ? r.value[b] * (0.5 + p * 0.2) : 0.3 + 0.1 * Math.sin(b * 0.7 + p))));
  const m = matchMap(bands, "sam", Array.from(r.value)).map;
  assert.deepEqual([...m.keys()].sort((a, b) => m[a] - m[b]).slice(0, 4).sort(), [0, 1, 2, 3], "the four kaolinite pixels (brightness 0.5-1.1 of it) have the smallest angle");
  assert.ok(m[0] < 0.01 && m[30] > 1);
});

test("wiring: the picker is lazy, credits the USGS and names the reference on the raster", () => {
  const t = fs.readFileSync(new URL("../src/components/HyperspectralTab.jsx", import.meta.url), "utf8");
  assert.match(t, /loadUsgsSubset\(\)\.then\(setUsgs\)/);
  assert.match(t, /reference: refName/);
  assert.match(t, /USGS_CREDIT/);
  assert.ok(!/^import .*usgsSpectraSubset/m.test(t) && fs.readFileSync(new URL("../src/lib/usgsSpectra.js", import.meta.url), "utf8").includes('import("./usgsSpectraSubset.json")'));
});
