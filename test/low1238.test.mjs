// TASKS.csv #1198 breaks; #1250 MapInfo names; #1259 total depth; #1275 orphan survey; #1215, #1222, #1238, #1272, #1195 text
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyBreaks } from "../src/lib/layers.js";
import { holeLabelText } from "../src/lib/viewer/holeLabels.js";
import { runDataQC } from "../src/lib/dataQC.js";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1198 Jenks breaks are readable and no class starts at the maximum", () => {
  const vals = [0.00018, ...Array.from({ length: 50 }, (_, i) => 0.001 + i * 0.0007), 0.132163867354393];
  const b = classifyBreaks(vals, 5, "jenks");
  assert.ok(b.every((v) => v < 0.132163867354393), JSON.stringify(b));
  assert.ok(b.slice(1).every((v) => String(v).length <= 8), JSON.stringify(b));
  assert.deepEqual([...b].sort((x, y) => x - y), b, "in order");
});

test("#1259 total depth keeps its decimal", () => {
  assert.equal(holeLabelText({ id: "DH23-109", depth: 438.5, zWorld: 1 }, "hole_id_depth"), "DH23-109 (438.5m)");
  assert.equal(holeLabelText({ id: "A", depth: 452, zWorld: 1 }, "hole_id_depth"), "A (452m)");
  assert.match(read("src/components/StripLog.jsx"), /maxDepth: \+maxDepth\.toFixed\(1\)/);
});

test("#1275 an orphan survey hole is one error with its count", () => {
  const survey = Array.from({ length: 40 }, (_, i) => ({ hole_id: "QA-999", depth: i * 10, azimuth: 10, dip: -60 }));
  const { issues } = runDataQC({ project: {}, collars: [{ hole_id: "A", x: 0, y: 0, z: 0, length: 10 }], survey, layers: {}, boundaries: [], assays: [] });
  const hits = issues.filter((i) => /QA-999/.test(JSON.stringify(i)) && /no matching collar/.test(JSON.stringify(i)));
  assert.equal(hits.length, 1);
  assert.match(JSON.stringify(hits[0]), /40/);
});

test("#1250 MapInfo family names; #1215 #1222 #1272 #1195 #1238 text", () => {
  assert.match(read("src/components/SurfaceMappingPanel.jsx"), /startsWith\(`\$\{sourceName\} \(`\)/);
  assert.match(read("src/components/VariogramModal.jsx"), /LAYER_META\[k\]\?\.label/);
  assert.match(read("src/modules/GeochemModule.jsx"), /assays\.length > 0 && missingForDiagram\.length > 0/);
  assert.match(read("src/components/DbBrowserPanel.jsx"), /tr\("Databases"\)/);
  assert.match(read("src/components/InversionPanel.jsx"), /p\.meta\.stationsUsed\} of \$\{rows\.length\}/);
  assert.match(read("src/components/StereonetModal.jsx"), /dip: deg1\(p\.dip\)/);
});
