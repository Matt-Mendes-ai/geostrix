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

// TASKS.csv #862 — explicit surfaces, wireframes, vein solids and unit volumes say how they were built
test("#862 hand-built meshes export their inputs, and unknown fields are never dropped", () => {
  const ex = provenanceLines("Top", { tool: "explicit surface (thin-plate spline exactly through hand-picked contacts)", picks: 14, sectionLines: 2, sections: ["S1", "S2"], lineSpacingM: 5, points: 40, mapContacts: [], mapLines: 0, dipGuide: null, frame: "elevation over the map", maxMisfitM: 1e-9, marginM: 50, looRmsM: 3.2, looMaxM: 7.5, overshootM: 0, extrapolatedPct: 22, furthestFromInputM: 180, cutAtTerrain: true, builtAt: "2026-10-24T00:00:00Z", builtKey: "k", faultTrim: { fault: "F1", side: 1 } }).join("\n");
  for (const want of ["14 pick(s)", "2 section line(s) on S1, S2", "Leave-one-out at the inputs: 3.2 m RMS", "22% of the surface", "Cut at the terrain: yes", "Built: 2026-10-24", "Other parameters: faultTrim = {\"fault\":\"F1\",\"side\":1}", "A geological interpretation"]) assert.ok(ex.includes(want), `${want}\n${ex}`);
  assert.ok(!/No anisotropy/.test(ex) && !/builtKey/.test(ex) && !/undefined/.test(ex), ex);
  const wf = provenanceLines("Body", { tool: "explicit wireframe from linked section outlines", body: "Ore", sections: ["A", "B", "C"], pointsPerOutline: 64, volumeM3: 12000, ends: "flat caps", builtAt: "t" }).join("\n");
  assert.ok(/3 section\(s\): A, B, C/.test(wf) && /64 points per outline/.test(wf) && /12,000 m3/.test(wf) && !/Other parameters/.test(wf), wf);
  const uv = provenanceLines("DACT", { tool: "unit volume from the implicit model's lithology block", unit: "DACT", model: "Run 1", builtAt: "t", cells: 6254, cellVolumeM3: 15625, cellsVolumeM3: 97718750, shellVolumeM3: 97000000, note: "Cut at the model box." }).join("\n");
  assert.ok(/COUNT of model blocks: 6,254 cells x 15625 m3 = 97,718,750 m3/.test(uv) && /Cut at the model box/.test(uv), uv);
  const vs = provenanceLines("Vein", { tool: "vein solid", hangingwall: "HW", footwall: "FW", volumeM3: 1200000, trueThicknessM: { min: 19.9, mean: 20, max: 20.1 }, attitude: "70° dip towards 90°", gridCellM: 3, nodesWhereWallsMeet: 0, ends: "where either wall ends", builtAt: "t" }).join("\n");
  assert.ok(/hangingwall "HW", footwall "FW"/.test(vs) && /19.9–20.1 m, mean 20 m/.test(vs) && /1,200,000 m3/.test(vs), vs);
  // a GemPy surface keeps its own closing line, and its extra fields now travel too
  const gp = provenanceLines("C", { tool: "implicit surface (GemPy)", surface: "C", sourcePoints: 9, orientations: 2, seed: 7 }).join("\n");
  assert.ok(/No anisotropy, no variogram/.test(gp) && /Other parameters: seed = 7/.test(gp), gp);
});
