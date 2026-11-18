// TASKS.csv #3898 — "Build it for me": the block model's settings from the project's own drilling (src/lib/auto/autoBlockModel.js).
// Synthetic holes only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { autoBlockModel } from "../src/lib/auto/autoBlockModel.js";
import { niceNumber, thin, SAMPLE_MAX } from "../src/lib/auto/autoCommon.js";

// nx x ny vertical holes on a square grid, sampled every `len` m down `depth` m
function grid({ nx = 5, ny = 5, spacing = 50, len = 2, depth = 100 } = {}) {
  const collars = [], samples = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const hole_id = `S${i}-${j}`, x = 1000 + i * spacing, y = 5000 + j * spacing;
    collars.push({ hole_id, x, y, z: 300 });
    for (let d = 0; d < depth; d += len) samples.push({ hole_id, x, y, z: 300 - d - len / 2, from: d, to: d + len, value: (i + j + d) % 7 });
  }
  return { collars, samples };
}

test("the values follow the drilling: a quarter of the spacing across, two samples high, 1.5 spacings of search", () => {
  const r = autoBlockModel(grid());
  assert.equal(r.ok, true);
  assert.deepEqual(r.values.blockSize, { x: 10, y: 10, z: 5 });
  assert.equal(r.values.searchRadius, 80); // 75 m, up to a whole number of 10 m blocks
  assert.equal(r.values.minHoles, 2);
  assert.deepEqual([r.values.bounds.minX, r.values.bounds.maxX], [975, 1225]); // half a spacing beyond the edge holes
  // a wider grid gives bigger blocks: nothing is a fixed default
  const wide = autoBlockModel(grid({ spacing: 200, len: 1 }));
  assert.deepEqual(wide.values.blockSize, { x: 50, y: 50, z: 2 });
  for (const f of ["blockSize", "bounds", "searchRadius", "minHoles", "maxSamples"]) assert.ok(r.reasons.some((x) => x.field === f), f);
  assert.match(r.reasons[0].text, /^Blocks 10 x 10 m across: about a quarter of the median spacing between drill sites \(50 m\)\.$/);
  assert.match(r.notes[0], /no density/); // the blocks get grades, not tonnes
  assert.deepEqual(autoBlockModel({ ...grid(), hasDensity: true }).notes, []);
});

test("the data cannot support it: too few holes or no depths gives a verdict, no values", () => {
  const g = grid({ nx: 2, ny: 1 });
  const r = autoBlockModel(g);
  assert.equal(r.ok, false);
  assert.equal(r.values, null);
  assert.equal(r.verdict.length, 2);
  assert.match(r.verdict[0], /Too few drill sites \(2\)/);
  assert.match(r.verdict[1], /^Samples in only 2 holes/);
  const one = autoBlockModel(grid({ nx: 1, ny: 1 }));
  assert.match(one.verdict[1], /^Samples in only one hole/);
  const noDepths = grid(); noDepths.samples.forEach((s) => { delete s.from; delete s.to; });
  assert.match(autoBlockModel(noDepths).verdict[0], /no From \/ To depths/);
});

test("a large box keeps the blocks under what one run can estimate, and says so", () => {
  const r = autoBlockModel(grid({ nx: 40, ny: 40, spacing: 25, len: 1, depth: 300 }));
  const { x, z } = r.values.blockSize, b = r.values.bounds;
  assert.ok(Math.ceil((b.maxX - b.minX) / x) * Math.ceil((b.maxY - b.minY) / x) * Math.ceil((b.maxZ - b.minZ) / z) <= 200000);
  assert.ok(r.reasons.some((t) => /were enlarged/.test(t.text)));
});

test("cheap: a big project is thinned first and the choice takes well under a second", () => {
  const big = grid({ nx: 60, ny: 60, spacing: 20, len: 1, depth: 60 }); // 216,000 samples
  const t0 = performance.now();
  autoBlockModel(big);
  assert.ok(performance.now() - t0 < 1000);
  assert.equal(thin(big.samples).length, SAMPLE_MAX);
  assert.deepEqual([12.5, 17, 30, 70, 80, 0.42].map(niceNumber), [10, 20, 25, 50, 100, 0.5]);
});

test("every sentence goes through tr() with a key in each language", () => {
  const src = readdirSync(new URL("../src/lib/auto/", import.meta.url)).map((f) => readFileSync(new URL(`../src/lib/auto/${f}`, import.meta.url), "utf8")).join("\n");
  const keys = [...src.matchAll(/\b(?:say|tr)\("((?:[^"\\]|\\.)*)"|because\("[a-zA-Z]+", "((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1] ?? m[2]}"`));
  assert.ok(keys.length >= 12);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.deepEqual(keys.filter((k) => !d[k]), [], lang);
  }
});
