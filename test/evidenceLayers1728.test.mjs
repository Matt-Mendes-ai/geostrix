// TASKS.csv #1728 (review #1645, Copley) — numeric downhole layers and custom-layer fields along the holes, logged zones as distances
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceGrid, distanceEvidence, pointEvidence } from "../src/lib/evidence.js";
import { holeTraces, numericLayerFields, layerFieldPoints, zoneCodes, zoneParts } from "../src/lib/evidenceSources.js";

// two vertical holes 400 m apart
const collars = [{ hole_id: "H1", x: 200, y: 500, z: 1000, azimuth: 0, dip: -90, depth: 200, length: 200 }, { hole_id: "H2", x: 600, y: 500, z: 1000, azimuth: 0, dip: -90, depth: 200, length: 200 }];
const traces = holeTraces(collars, [], "tangential");
const grid = evidenceGrid({ extent: [0, 0, 1000, 1000], cellSize: 50 });

const swir = [ // a custom SWIR layer: point rows with a text mineral and numeric fields; empty readings are null
  { hole_id: "H1", depth: 10, value: "white mica", ai_Wav_WtMica: 2203.9, ai_XT_WtMica: 0.70, note: "x" },
  { hole_id: "H1", depth: 20, value: "white mica", ai_Wav_WtMica: 2206.5, ai_XT_WtMica: 0.75, note: "y" },
  { hole_id: "H1", depth: 30, value: null, ai_Wav_WtMica: null, ai_XT_WtMica: null, note: "" },
  { hole_id: "H2", depth: 10, value: "kaolinite", ai_Wav_WtMica: 2199.1, ai_XT_WtMica: 0.40, note: "" },
  { hole_id: "H2", depth: 40, value: "white mica", ai_Wav_WtMica: 2201.0, ai_XT_WtMica: 0.55, note: "" },
  { hole_id: "H2", depth: 50, value: "white mica", ai_Wav_WtMica: 2200.2, ai_XT_WtMica: 0.52, note: "" },
];

test("#1728 the numeric fields of a layer are the ones with enough numbers; text and row keys are not", () => {
  assert.deepEqual(numericLayerFields(swir), ["ai_Wav_WtMica", "ai_XT_WtMica"]);
  assert.deepEqual(numericLayerFields(swir, { min: 6 }), []);
  const sg = [{ hole_id: "H1", from: 0, to: 2, value: 2.6 }, { hole_id: "H1", from: 2, to: 4, value: 2.7 }, { hole_id: "H2", from: 0, to: 2, value: 2.9 }, { hole_id: "H2", from: 2, to: 4, value: 3.1 }, { hole_id: "H2", from: 4, to: 6, value: 2.8 }];
  assert.deepEqual(numericLayerFields(sg), ["value"]);
});

test("#1728 field values sit on the hole trace, the highest per 25 m plan bin, and IDW spreads them like a grade", () => {
  const pts = layerFieldPoints(swir, "ai_Wav_WtMica", traces);
  assert.equal(pts.length, 2, "one bin per vertical hole");
  const h1 = pts.find((p) => Math.abs(p.x - 200) < 1), h2 = pts.find((p) => Math.abs(p.x - 600) < 1);
  assert.equal(h1.value, 2206.5); assert.equal(h2.value, 2201.0);
  const v = pointEvidence(grid, pts, { maxDistance: 250 });
  const at = (x, y) => v[Math.round((grid.yTop - y) / grid.dy) * grid.nx + Math.round((x - grid.x0) / grid.dx)];
  assert.ok(Math.abs(at(225, 525) - 2206.5) < 0.5 && Math.abs(at(575, 525) - 2201) < 0.5);
  assert.ok(Number.isNaN(at(25, 25)), "beyond the reach: no evidence");
  assert.deepEqual(layerFieldPoints(swir, "note", traces), [], "a text field has no points");
});

test("#1728 logged interval zones become distance evidence along the interval, not a point at the collar", () => {
  const zones = [{ hole_id: "H1", from: 100, to: 160, value: "FR" }, { hole_id: "H2", from: 0, to: 10, value: "BX" }, { hole_id: "H9", from: 0, to: 5, value: "FR" }, { hole_id: "H1", depth: 3, value: "FL" }];
  assert.deepEqual(zoneCodes(zones, traces), ["BX", "FR"], "H9 has no trace, FL is a pick not an interval");
  const parts = zoneParts(zones, "FR", traces);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].length, 13, "100 to 160 m every 5 m");
  assert.ok(parts[0].every(([x, y]) => Math.abs(x - 200) < 1e-6 && Math.abs(y - 500) < 1e-6), "a vertical hole: the zone is a point in plan");
  const d = distanceEvidence(grid, parts);
  const at = (x, y) => d[Math.round((grid.yTop - y) / grid.dy) * grid.nx + Math.round((x - grid.x0) / grid.dx)];
  assert.ok(at(225, 525) < at(725, 525), "nearer the zone's hole");
});

test("#1728 the pane offers them and reads them", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('kind: "numeric"') && p.includes('kind: "zone"') && p.includes("layerFieldPoints(rows, field, traces)") && p.includes("zoneParts(zoneRows, src.ref, traces)"));
  assert.ok(p.includes('tr("Distance to logged zone: {code}", { code })') && p.includes('tr("Drillholes: {layer} {field} along the holes"'));
});
