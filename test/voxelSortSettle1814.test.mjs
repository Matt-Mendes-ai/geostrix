// TASKS.csv #1814 (review #1646, Kodiak) — a see-through block model is re-sorted back to front once the camera has stopped for
// VOXEL_SORT_INTERVAL_MS, not every 150 ms of an orbit: each sort rewrote and re-uploaded every instance (76k blocks, ~5 MB).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the transparent re-sort waits for the camera to settle", () => {
  const i = m.indexOf("const resortTransparentVoxels = (now) => {");
  assert.ok(i > 0);
  const body = m.slice(i, i + 1400);
  assert.match(body, /if \(camera\.position\.distanceToSquared\(voxelCamPrev\) > 1e-8 \|\| voxelCamPrev\.x !== voxelCamPrev\.x\) \{ voxelCamMovedAt = now; voxelCamPrev\.copy\(camera\.position\); \}/);
  assert.match(body, /if \(now - voxelCamMovedAt < VOXEL_SORT_INTERVAL_MS\) return;/);
  assert.ok(body.indexOf("voxelCamMovedAt < VOXEL_SORT_INTERVAL_MS") < body.indexOf("sortVoxelInstancesBackToFront(mesh"), "checked before any sort");
  // the loop stays at full rate for IDLE_AFTER_MS (400) after the last move, longer than the settle (150): the sort runs before it idles
  assert.ok(m.includes("const VOXEL_SORT_INTERVAL_MS = 150;") && m.includes("const IDLE_AFTER_MS = 400;"));
});
