// TASKS.csv #1560 (review #1497, Lawyers) — each evidence kind is cached on the data it reads: a raster's eye toggle, a block
// model's display range or a new raster on the map no longer recomputes the soil, drill-grade and structure layers
import test from "node:test";
import assert from "node:assert/strict";
import { cachedEvidence, evidenceDeps, clearEvidenceCache } from "../src/lib/evidenceCache.js";

const grid = { id: "g" }, cells = [{ x: 0 }], features = [{ parts: [] }], rows = [{ hole: "A" }];
const data = () => ({
  rasters: [{ id: 7, name: "Mag", grid, visible: true }],
  mapLayers: [{ id: 3, features, visible: true }],
  surfaceSamples: [{ x: 1 }], surfaceElements: [{ symbol: "Au" }],
  collars: [{ hole: "A" }], survey: [], desurveyMethod: "tangent",
  assays: [{ hole: "A" }], assayElements: [{ symbol: "Au" }],
  voxelModels: [{ id: "bm", cells, supportCutoff: 0, method: "ip", vmin: 0 }],
  geophysPts: [{ x: 1 }], structurePicks: [{ hole: "A" }],
  projectLayers: { litho: rows, custom: null }, customLayers: [{ id: 5, rows }],
});

test("a raster layer depends on its grid only; a map layer on its features; a block model on its cells and support", () => {
  const d = data();
  assert.deepEqual(evidenceDeps({ kind: "raster", ref: 7 }, {}, d), [grid]);
  assert.deepEqual(evidenceDeps({ kind: "distance", ref: "3" }, {}, d), [features]);
  assert.deepEqual(evidenceDeps({ kind: "voxel", ref: "bm", how: "max" }, {}, d), [cells, 0, "ip"]);
  assert.deepEqual(evidenceDeps({ kind: "survey", ref: "k" }, {}, d), [d.geophysPts]);
  assert.deepEqual(evidenceDeps({ kind: "element", ref: "Au" }, {}, d), [d.surfaceSamples, d.surfaceElements]);
});

test("hole-based kinds depend on the collars, the survey and the desurvey method, not a derived trace map", () => {
  const d = data(), holes = [d.collars, d.survey, "tangent"];
  assert.deepEqual(evidenceDeps({ kind: "grade", ref: "Au" }, {}, d), [d.assays, d.assayElements, ...holes]);
  assert.deepEqual(evidenceDeps({ kind: "pxrf", ref: "Au" }, {}, d), [d.assays, d.assayElements, ...holes]);
  assert.deepEqual(evidenceDeps({ kind: "pick", ref: "Vn" }, {}, d), [d.structurePicks, ...holes]);
  assert.deepEqual(evidenceDeps({ kind: "numeric", ref: "litho:value" }, {}, d), [rows, ...holes]);
  assert.deepEqual(evidenceDeps({ kind: "numeric", ref: "coded:litho:QV:extra" }, {}, d), [rows, ...holes]);
  assert.deepEqual(evidenceDeps({ kind: "numeric", ref: "custom:5:Cu" }, {}, d), [rows, ...holes]);
  assert.deepEqual(evidenceDeps({ kind: "zone", ref: "litho:QV" }, {}, d), [rows, ...holes]);
});

test("a visibility flag, a colour or a display range on the parent object does not invalidate the cached values", () => {
  clearEvidenceCache();
  let runs = 0;
  const d = data();
  const key = "g|grade|Au||||||";
  cachedEvidence(key, evidenceDeps({ kind: "grade", ref: "Au" }, {}, d), () => { runs++; return [runs]; });
  // the store replaces the arrays with patched copies; the data inside is the same objects
  d.rasters = d.rasters.map((r) => ({ ...r, visible: false }));
  d.voxelModels = d.voxelModels.map((m) => ({ ...m, vmin: 0.02 }));
  d.rasters = [...d.rasters, { id: 8, name: "Fuzzy score", grid: { id: "new" } }];
  cachedEvidence(key, evidenceDeps({ kind: "grade", ref: "Au" }, {}, d), () => { runs++; return [runs]; });
  cachedEvidence("g|raster|7|||||", evidenceDeps({ kind: "raster", ref: 7 }, {}, d), () => { runs++; return [runs]; });
  cachedEvidence("g|raster|7|||||", evidenceDeps({ kind: "raster", ref: 7 }, {}, d), () => { runs++; return [runs]; });
  cachedEvidence("g|voxel|bm|max||||", evidenceDeps({ kind: "voxel", ref: "bm" }, {}, d), () => { runs++; return [runs]; });
  d.voxelModels = d.voxelModels.map((m) => ({ ...m, vmax: 9 }));
  cachedEvidence("g|voxel|bm|max||||", evidenceDeps({ kind: "voxel", ref: "bm" }, {}, d), () => { runs++; return [runs]; });
  assert.equal(runs, 3); // grade once, raster once, voxel once
  // the data itself changing still recomputes
  d.assays = [...d.assays];
  cachedEvidence(key, evidenceDeps({ kind: "grade", ref: "Au" }, {}, d), () => { runs++; return [runs]; });
  d.voxelModels = d.voxelModels.map((m) => ({ ...m, supportCutoff: 2 }));
  cachedEvidence("g|voxel|bm|max||||", evidenceDeps({ kind: "voxel", ref: "bm" }, {}, d), () => { runs++; return [runs]; });
  assert.equal(runs, 5);
});

test("a source that is gone depends on nothing found, so a later return of the same id recomputes", () => {
  const d = data();
  assert.deepEqual(evidenceDeps({ kind: "raster", ref: 99 }, {}, d), [undefined]);
  assert.deepEqual(evidenceDeps({ kind: "numeric", ref: "custom:77:Cu" }, {}, d), [undefined, d.collars, d.survey, "tangent"]);
});
