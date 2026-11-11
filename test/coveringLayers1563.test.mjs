// TASKS.csv #1563 — a Targeting score sent to the map lay under Lawyers' opaque MVI block model and three drapes, with no layer list on
// the tab: the visible layers over it in plan are named and one click hides them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coveringLayers } from "../src/lib/evidence.js";

test("visible rasters and block models that overlap the score's box in plan; hidden or apart ones are not", () => {
  const box = [1000, 2000, 3000, 4000];
  const rasters = [
    { id: "a", name: "RTP", bbox: [0, 0, 5000, 5000] },
    { id: "b", name: "far", bbox: [6000, 6000, 7000, 7000] },
    { id: "c", name: "hidden", bbox: [0, 0, 5000, 5000], visible: false },
    { id: "d", name: "edge", bbox: [3000, 2000, 4000, 4000] }, // touches only: not over it
  ];
  const models = [
    { id: "m1", name: "MVI", cells: [{ x: 2000, y: 3000, dx: 50, dy: 50 }] },
    { id: "m2", name: "away", cells: [{ x: 9000, y: 9000, dx: 50, dy: 50 }] },
    { id: "m3", name: "empty", cells: [] },
  ];
  assert.deepEqual(coveringLayers(box, rasters, models), { rasters: [{ id: "a", name: "RTP" }], models: [{ id: "m1", name: "MVI" }] });
  assert.deepEqual(coveringLayers(box), { rasters: [], models: [] });
});

test("the pane offers to hide them after Score -> map, only beside that message", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const cv = coveringLayers\(box, rasters\.filter\(\(r\) => !earlier\.includes\(r\)\), voxelModels\);/); // #1731 — the hidden earlier scores do not count
  assert.match(p, /\{msg && cover && cover\.forMsg === msg && \(/);
  assert.match(p, /cover\.rasters\.forEach\(\(r\) => updateRaster\(r\.id, \{ visible: false \}\)\); cover\.models\.forEach\(\(m\) => updateVoxelModel\(m\.id, \{ visible: false \}\)\);/);
});
