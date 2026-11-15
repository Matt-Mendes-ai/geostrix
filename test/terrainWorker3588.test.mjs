// TASKS.csv #3588 (8) — the adaptive terrain mesh is built in a worker while the user is in Maps (Macpass: 813 ms main-thread task on the first entry to the 3D
// View after the terrain was built). The worker answers exactly what buildAdaptiveTerrain does; the viewer asks for it when the terrain changes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAdaptiveTerrain } from "../src/lib/terrainMesh.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the worker's answer is buildAdaptiveTerrain's, with the buffers transferred", async () => {
  const sent = [];
  globalThis.self = { postMessage: (m, tr) => sent.push([m, tr]) };
  await import("../src/lib/terrainMesh.worker.js");
  const gridW = 140, gridH = 120, elevations = new Float32Array(gridW * gridH);
  for (let j = 0; j < gridH; j++) for (let i = 0; i < gridW; i++) elevations[j * gridW + i] = 40 * Math.sin(i / 17) + 25 * Math.cos(j / 11) + (i > 60 && i < 70 ? 8 : 0);
  const want = buildAdaptiveTerrain(gridW, gridH, elevations, null, { maxTriangles: 20000 });
  globalThis.self.onmessage({ data: { id: 7, gridW, gridH, elevations, noDataMask: null, maxTriangles: 20000 } });
  assert.equal(sent.length, 1);
  const [msg, tr] = sent[0];
  assert.equal(msg.id, 7);
  assert.deepEqual(msg.am.vertexIds, want.vertexIds);
  assert.deepEqual(msg.am.indices, want.indices);
  assert.equal(msg.am.maxError, want.maxError);
  assert.equal(tr.length, 2);
});

test("the viewer asks for it when the terrain changes, the cache keeps the first result, and a small grid is left to the full mesh (source pins)", () => {
  const sb = read("../src/lib/viewer/sceneBuilders.js");
  assert.match(sb, /export function prewarmAdaptiveMesh\(terrain\)/);
  assert.match(sb, /if \(e\.data\.am && !adaptiveTerrainCache\.has\(terrain\)\) adaptiveTerrainCache\.set\(terrain, e\.data\.am\);/);
  assert.match(sb, /!\(gridW \* gridH > ADAPTIVE_TERRAIN_NODES\) \|\| adaptiveTerrainCache\.has\(terrain\)/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /useEffect\(\(\) => \{ prewarmAdaptiveMesh\(terrain\); \}, \[terrain\]\);/);
});
