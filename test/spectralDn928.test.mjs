// TASKS.csv #928 — a spectral index on a user's own file reads Sentinel-2 offset DNs and Landsat Collection 2 scaling
// as reflectance before the ratio, so the ratio and the dark-pixel mask work as they do on fetched scenes.
import test from "node:test";
import assert from "node:assert/strict";
import { evaluateIndex, detectEncoding } from "../src/lib/spectralIndices.js";

const enc = { reflectance: (v) => v, scaled: (v) => v * 10000, s2offset: (v) => v * 10000 + 1000, landsatC2: (v) => (v + 0.2) / 0.0000275 };
const run = (e, red, blue, encoding) => evaluateIndex([Float32Array.from([enc[e](blue)]), Float32Array.from([enc[e](red)])], { B4: 2, B2: 1 }, "B4/B2", { floor: "auto", encoding });

test("#928: a gossan pixel (red 0.30, blue 0.05) gives B4/B2 = 6.00 in every encoding once it is named", () => {
  for (const e of Object.keys(enc)) assert.ok(Math.abs(run(e, 0.3, 0.05, e).values[0] - 6) < 1e-3, e);
  // the old behaviour, for the record: the offset file read as plain DN / 10,000 compresses the ratio
  assert.ok(Math.abs(run("s2offset", 0.3, 0.05, null).values[0] - 2.667) < 0.01);
});

test("#928: a truly dark pixel (0.002 reflectance) is masked on an offset Sentinel-2 file and on a Landsat C2 file", () => {
  for (const e of ["s2offset", "landsatC2"]) {
    const r = run(e, 0.3, 0.002, e);
    assert.equal(r.dark, 1, e); assert.ok(Number.isNaN(r.values[0]));
  }
});

test("#928: the guess from the values", () => {
  const spread = (lo, n = 1000, step = 20) => Float32Array.from({ length: n }, (_, i) => lo + i * step);
  assert.equal(detectEncoding([spread(1000)], "sentinel2"), "s2offset");
  assert.equal(detectEncoding([spread(50)], "sentinel2"), "scaled");
  assert.equal(detectEncoding([spread(7300)], "landsat"), "landsatC2");
  assert.equal(detectEncoding([Float32Array.from({ length: 100 }, (_, i) => 0.01 + i / 200)], "landsat"), "reflectance");
  assert.equal(detectEncoding([spread(20)], "aster_vnir_swir"), "aster");
});
