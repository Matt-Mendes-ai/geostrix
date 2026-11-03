// TASKS.csv #1569 (review #1497, Lawyers) — with drillholes loaded, adding a block model widens the fit box only
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");

test("the big build depends on the block models only for a project without holes", () => {
  assert.ok(src.includes('collars.length ? "" : voxelGeomSignature /* #1569 — with holes, only the fit box below */'));
  assert.ok(!/, voxelGeomSignature, fitBox,/.test(src));
});

test("a small effect re-derives the block-model corners of the fit box", () => {
  assert.ok(src.includes("lastTracesRef.current = [...lastTracesRef.current.slice(0, lastHoleTraceCountRef.current), ...voxelFitCorners(voxelModels, originRef.current)];"));
  assert.ok(src.includes("allTraces.push(...voxelFitCorners(voxelModels, { x: ox, y: oy, z: oz }));"));
});
