// TASKS.csv #1457 — evidence values are kept between openings of the overlay, keyed by grid + source + options, and recomputed
// only when a data input changes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cachedEvidence, gridSignature, evidenceCacheSize, clearEvidenceCache } from "../src/lib/evidenceCache.js";

test("same key and same data objects: computed once", () => {
  clearEvidenceCache();
  let runs = 0;
  const samples = [{ x: 1 }], grid = { nx: 2, ny: 2, x0: 0, yTop: 10, dx: 5, dy: 5 };
  const key = `${gridSignature(grid)}|element|Ag||||`;
  const a = cachedEvidence(key, [samples], () => { runs++; return new Float32Array(4); });
  const b = cachedEvidence(key, [samples], () => { runs++; return new Float32Array(4); });
  assert.equal(runs, 1);
  assert.equal(a, b);
});

test("a changed data object (the store replaced the array) recomputes", () => {
  clearEvidenceCache();
  let runs = 0;
  const f = () => { runs++; return [runs]; };
  cachedEvidence("k", [[1]], f);
  const v = cachedEvidence("k", [[1]], f); // a new array, though equal
  assert.equal(runs, 2);
  assert.deepEqual(v, [2]);
});

test("a different grid or option is a different entry; null results are not kept", () => {
  clearEvidenceCache();
  const d = [{}];
  cachedEvidence(`${gridSignature({ nx: 2, ny: 2, x0: 0, yTop: 1, dx: 1, dy: 1 })}|x`, d, () => [1]);
  cachedEvidence(`${gridSignature({ nx: 3, ny: 2, x0: 0, yTop: 1, dx: 1, dy: 1 })}|x`, d, () => [1]);
  cachedEvidence("none", d, () => null);
  assert.equal(evidenceCacheSize(), 2);
});

test("at most 16 entries, least recently used out first", () => {
  clearEvidenceCache();
  const d = [{}];
  for (let i = 0; i < 16; i++) cachedEvidence(`k${i}`, d, () => [i]);
  cachedEvidence("k0", d, () => ["recomputed"]); // touch k0: now most recent
  cachedEvidence("k16", d, () => [16]); // evicts k1
  assert.equal(evidenceCacheSize(), 16);
  let ran = false;
  assert.deepEqual(cachedEvidence("k0", d, () => { ran = true; return []; }), [0]);
  assert.equal(ran, false);
  cachedEvidence("k1", d, () => { ran = true; return [1]; });
  assert.equal(ran, true);
});

test("the pane computes through the cache with every data input as a dependency", () => {
  const src = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(src, /const computeValues = \(src, opts = \{\}\) => \(grid \? cachedEvidence\(/);
  assert.match(src, /\[rasters, mapLayers, surfaceSamples, surfaceElements, collars, survey, project\?\.desurveyMethod, assays, assayElements, voxelModels, geophysPts, structurePicks\]/);
  assert.match(src, /\(\) => computeValuesNow\(src, opts\)/);
});
