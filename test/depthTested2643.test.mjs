// TASKS.csv #2643 — a 'depth tested' evidence: each hole's deepest sample as an elevation, high where the drilling stopped shallow
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { depthTestedPoints } from "../src/lib/evidenceSources.js";
import { pointEvidence } from "../src/lib/evidence.js";
import { evidenceDeps } from "../src/lib/evidenceCache.js";

const vertical = (x, y, z, len) => [{ x, y, z, md: 0 }, { x, y, z: z - len, md: len }];

test("one point per hole at its deepest sample, valued at that elevation; holes without samples have none", () => {
  const traces = new Map([["SHALLOW", vertical(0, 0, 500, 300)], ["DEEP", vertical(200, 0, 500, 300)], ["NONE", vertical(400, 0, 500, 300)]]);
  const assays = [
    { hole_id: "SHALLOW", from: 0, to: 2, Au_ppm: 1 }, { hole_id: "SHALLOW", from: 48, to: 50, Au_ppm: 0.1 },
    { hole_id: "DEEP", from: 0, to: 2, Au_ppm: 0.2 }, { hole_id: "DEEP", from: 248, to: 250, Cu_ppm: 40 }, // any element counts
    { hole_id: "GHOST", from: 0, to: 900 }, // no trace
    { hole_id: "DEEP", from: 10, to: "x" },
  ];
  const pts = depthTestedPoints(assays, traces);
  assert.deepEqual(pts.map((p) => [p.hole_id, p.depth, Math.round(p.value)]), [["SHALLOW", 50, 450], ["DEEP", 250, 250]]);
  // between them the shallow hole's side is high: favourable when high = not tested at depth
  const g = { x0: 0, yTop: 0, dx: 50, dy: 50, nx: 5, ny: 1 };
  const v = pointEvidence(g, pts, { maxDistance: 300 });
  assert.ok(v[0] > v[4], `${v[0]} > ${v[4]}`);
  assert.equal(Math.round(v[0]), 450);
});

test("the card's cache follows the assays; the pane offers it and reads it", () => {
  const d = { assays: [{ a: 1 }], collars: [1], survey: [2], desurveyMethod: "min", customLayers: [], projectLayers: {} };
  assert.deepEqual(evidenceDeps({ kind: "numeric", ref: "depth:assays" }, {}, d), [d.assays, d.collars, d.survey, d.desurveyMethod]);
  const c = fs.readFileSync("src/lib/evidenceCache.js", "utf8");
  assert.match(c, /if \(src\.ref === "depth:assays"\) return \[d\.assays, \.\.\.holes\];/);
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /if \(traces\.size && cleanAssays\.length\) out\.push\(\{ key: "num:depth:assays", label: tr\("Drillholes: elevation of the deepest sample in each hole"\), kind: "numeric", ref: "depth:assays" \}\);/);
  assert.match(p, /if \(ref === "depth:assays"\) return depthTestedPoints\(cleanAssays, traces\);/);
  assert.match(p, /solids, solidMesh, cleanAssays\]\);/);
});
