// TASKS.csv #1529 (review #1497, Lawyers) — custom-layer intervals use the shared interval prototype, so they batch
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { viewerSource } from "./helpers/viewerSource.mjs"; // #2176 — the drillhole build moved out of ViewerModule

const src = viewerSource().replace(/\r\n/g, "\n"); // a CRLF checkout (CI) reads the same
const block = src.slice(src.indexOf("customLayers.forEach((layer) => {\n      const stI"), src.indexOf("layer.group.add(mesh);"));

test("a custom interval is the shared cylinder scaled between its ends, not a TubeGeometry per row", () => {
  assert.ok(block.length > 100);
  assert.ok(!block.includes("new THREE.TubeGeometry"), "no per-row tube");
  assert.ok(block.includes("new PickStandIn(INTERVAL_PROTO[stI.shape] || PROTO_CYLINDER,")); // a pick stand-in since #1500 (its batch draws it)
  assert.ok(block.includes("mesh.scale.set(1.6 * stI.size, len, 1.6 * stI.size);"));
  assert.ok(block.includes("mesh.quaternion.setFromUnitVectors(PIN_AXIS, dipPinDir.set(dx / len, dy / len, dz / len));"));
});

test("custom groups are in layerGroupsRef, which the rebuild batches", () => {
  assert.ok(src.includes("layerGroupsRef.current[id] = group;"));
  assert.ok(src.includes("Object.values(layerGroupsRef.current).forEach((g) => { if (g) buildLayerBatches(g); });"));
});
