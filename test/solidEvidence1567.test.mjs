// TASKS.csv #1567 — a modelled body as evidence (distance in plan to its footprint), and rasters without values explained.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { solidFootprintEvidence } from "../src/lib/evidence.js";
import { evidenceDeps } from "../src/lib/evidenceCache.js";

const grid = { x0: 0, yTop: 100, dx: 10, dy: 10, nx: 11, ny: 11 }; // cell centres 0..100 east, 100..0 north
const at = (v, x, y) => v[Math.round((100 - y) / 10) * 11 + Math.round(x / 10)];

test("a body's footprint scores 0 over it and the plan distance away from it", () => {
  // a flat 20 x 20 m square at (40..60, 40..60), two triangles, at depth: only plan position counts
  const positions = [40, 40, -300, 60, 40, -300, 60, 60, -300, 40, 60, -300];
  const v = solidFootprintEvidence(grid, positions, [0, 1, 2, 0, 2, 3]);
  assert.equal(at(v, 50, 50), 0);
  assert.equal(at(v, 40, 40), 0);
  assert.equal(at(v, 80, 50), 20);
  assert.ok(Math.abs(at(v, 0, 0) - Math.hypot(40, 40)) < 1e-6);
});

test("a sliver narrower than a cell, or a vertical wall, still marks its corners; nothing on the grid gives no values", () => {
  const wall = solidFootprintEvidence(grid, [30, 70, 0, 30, 70, -100, 31, 70.5, -50], [0, 1, 2]);
  assert.equal(at(wall, 30, 70), 0);
  const off = solidFootprintEvidence(grid, [500, 500, 0, 510, 500, 0, 510, 510, 0], [0, 1, 2]);
  assert.ok(Number.isNaN(off[0]));
});

test("the cache follows the body; the pane offers bodies and names picture rasters; ViewerModule passes the meshes", () => {
  const s = { id: "b1", faceCount: 10 };
  assert.deepEqual(evidenceDeps({ kind: "solid", ref: "b1" }, {}, { solids: [s] }), [s, 10, undefined]);
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /label: tr\("Distance in plan to the body: \{name\}", \{ name: s\.name \}\), kind: "solid"/);
  assert.match(p, /rasters\.filter\(\(r\) => !r\.grid && !isOverlayOutput\(r\)\)/);
  assert.match(fs.readFileSync("src/modules/ViewerModule.jsx", "utf8"), /<EvidenceOverlayPane solids=\{implicitSurfaces\} solidMesh=\{\(id\) => sceneVertsToWorldFlat\(/);
});
