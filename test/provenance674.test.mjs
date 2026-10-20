// TASKS.csv #674 — trend parameters reach the exported files
import { test } from "node:test";
import assert from "node:assert/strict";
import { provenanceLines } from "../src/lib/meshExport.js";
import { blockModelParamLines } from "../src/lib/blockModelExport.js";

const trend = { trend: "GnD", dip: 43.85, dipAzimuth: 175.15, pitch: 179.42, ratios: { max: 3, int: 2, min: 1 } };

test("a trended surface names its trend and never says 'undefined' or 'No anisotropy'", () => {
  const implicit = provenanceLines("Contact", { tool: "implicit surface (GemPy)", anisotropy: trend }).join("\n");
  assert.ok(/Structural trend "GnD": dip 43.85 deg towards 175.15 deg, pitch 179.42/.test(implicit), implicit);
  assert.ok(!/undefined/.test(implicit) && !/No anisotropy/.test(implicit), implicit);
  const shell = provenanceLines("Cu shell", { tool: "numeric grade shell", element: "Cu", unit: "ppm", cutoff: 300, method: "idw2", searchRadiusM: 150, cellSizeM: 10, paddingM: 25, closure: "natural", samplePoints: 10, cellsEstimated: 5, generatedAt: "x", anisotropy: trend, searchEllipsoidM: [150, 100, 50] }).join("\n");
  assert.ok(/Structural trend/.test(shell) && /150 x 100 x 50 m/.test(shell) && !/No anisotropy/.test(shell), shell);
  const plain = provenanceLines("Plain", { tool: "implicit surface (GemPy)" }).join("\n");
  assert.ok(/No anisotropy, no variogram/.test(plain), plain);
  const legacy = provenanceLines("Old", { tool: "implicit surface (GemPy)", anisotropy: { azimuth: 45, dip: 30, major: 300, semiMajor: 150, minor: 50 } }).join("\n");
  assert.ok(/Anisotropy trend: 45\/30 deg, ranges 300\/150\/50 m/.test(legacy), legacy);
});

test("block-model headers carry the search ellipsoid, the per-hole limit, the cap audit and the MLS counts", () => {
  const lines = blockModelParamLines({ name: "Cu", source: "estimate-idw2", cells: [], params: {
    unit: "ppm", searchRadiusM: 150, maxSamples: 16, minHoles: 2,
    searchTrend: { name: "GnD", dip: 43.85, dipAzimuth: 175.15, pitch: 179.42, ratios: { max: 3, int: 2, min: 1 }, ellipsoidM: [150, 100, 50] },
    capAudit: { capValue: 5000, nCapped: 3, nSamples: 400, pctCapped: 0.75, pctMetalRemoved: 4.2 },
    mlsBlocks: { full: 10, reduced: 2, idw: 1 },
  } }).join("\n");
  for (const want of ["maxSamplesPerHole: 8", "search ellipsoid 150 x 100 x 50 m", "3 of 400 samples capped", "mlsBlocks: full 10, reduced 2, idw 1"]) assert.ok(lines.includes(want), `${want}\n${lines}`);
});
