// TASKS.csv #1974 — strings that were shown in English only now go through tr(): WFS result lines, the DC/IP line message, the
// Point survey Z meanings, the OMF coarsening note, the boundary CRS notes, As-drilled, the 3D slice readout and "slab", the
// geoML quality labels, the "Vein:" surface label and the structure set's north / date tooltip
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sliceReadoutText } from "../src/lib/sliceReadout.js";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#1974 the slice readout says what it said, now through tr()", () => {
  const ext = { y0: 0, y1: 100 };
  assert.equal(sliceReadoutText({ on: false }, ext), "");
  assert.equal(sliceReadoutText({ on: true }, null), "Load drillholes to set the slice range.");
  assert.equal(sliceReadoutText({ on: true, mode: "horizontal", pos: 0.5, thickness: 20 }, ext, 1000), "Showing 1040–1060 m elevation");
  assert.equal(sliceReadoutText({ on: true, mode: "horizontal", pos: 0.5, thickness: 0 }, ext, 1000), "Showing everything below 1050 m elevation");
  assert.equal(sliceReadoutText({ on: true, mode: "vertical", thickness: 30, azimuth: 45 }, ext), "Vertical slab 30 m thick, striking 45°");
  assert.equal(sliceReadoutText({ on: true, mode: "vertical", thickness: 0, azimuth: 45 }, ext), "Everything on one side of a vertical cut striking 45°");
});

test("#1974 no English-only strings left at the listed places", () => {
  assert.doesNotMatch(read("components/AddWebLayerModal.jsx"), /text: `Imported \$\{/);
  assert.doesNotMatch(read("components/DcipPanel.jsx"), /readings \(\$\{p\.array\}\)|text: "Map the A, M/);
  assert.match(read("modules/GeophysicsModule.jsx"), /<option key=\{k\} value=\{k\}>\{tr\(label\)\}<\/option>/);
  assert.doesNotMatch(read("lib/omf.js"), /coarsenNote = `Coarsened/);
  assert.doesNotMatch(read("lib/boundaryImport.js"), /note = T \? `|`it states no CRS/);
  assert.match(read("components/PlannedHoleTargeting.jsx"), /tr\("As-drilled"\)/);
  assert.match(read("modules/ViewerModule.jsx"), /tr\("slab"\)/);
  assert.doesNotMatch(read("modules/ViewerModule.jsx"), /`Vertical slab \$\{/);
  assert.match(read("components/PredictivePanel.jsx"), /\{tr\(q\.label\)\}/);
  assert.doesNotMatch(read("modules/viewer/modellingRuns.js"), /`Vein: \$\{veinValue\}`/);
  assert.doesNotMatch(read("components/SurfaceMappingPanel.jsx"), /` on \$\{s\.azimuthDate\}`/);
});
