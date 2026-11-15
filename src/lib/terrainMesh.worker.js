// TASKS.csv #3588 (8) / #3590 — the adaptive (RTIN) terrain mesh built off the main thread: 520 + 340 ms of the 813 ms task that froze the 3D View on its
// first entry after a terrain was built (Macpass, a 1025 square). The client (lib/viewer/sceneBuilders.js prewarmAdaptiveMesh) sends the grid; the result is the
// same { vertexIds, indices, maxError, triangles } buildAdaptiveTerrain returns, transferred back.
import { buildAdaptiveTerrain } from "./terrainMesh.js";
import { decodeNoDataMask, isNoData } from "./demFill.js";

self.onmessage = (e) => {
  const { id, gridW, gridH, elevations, noDataMask, maxTriangles } = e.data;
  try {
    const mask = decodeNoDataMask(noDataMask);
    const am = buildAdaptiveTerrain(gridW, gridH, elevations, mask ? (k) => isNoData(mask, k) : null, { maxTriangles });
    self.postMessage({ id, am }, [am.vertexIds.buffer, am.indices.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
