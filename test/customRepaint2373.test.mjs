// TASKS.csv #2373 — a custom layer's 'Colour by' / one-colour / ramp change repaints its instances in place instead of rebuilding its group
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { onlyPaintChanged, paintCustomLayer } from "../src/modules/viewer/drillholeScene.js";
import { PickStandIn } from "../src/lib/viewer/pickStandIn.js";
import { buildLayerBatches } from "../src/lib/viewer/layerBatches.js";
import { PROTO_CYLINDER } from "../src/lib/viewer/protos.js";
import { customColour } from "../src/lib/customColour.js";
import { viewerSource } from "./helpers/viewerSource.mjs";

test("only the colour keys (and opacity) count as a repaint", () => {
  const j = (o) => JSON.stringify(o);
  assert.equal(onlyPaintChanged(j({ colourBy: "max" }), j({ colourBy: "n" })), true);
  assert.equal(onlyPaintChanged("null", j({ color: "#ff0000" })), true);
  assert.equal(onlyPaintChanged(j({ rampMin: 1, opacity: 0.5 }), j({ rampMin: 5, rampScale: "log", classes: 4 })), true);
  assert.equal(onlyPaintChanged(j({ colourBy: "max", size: 1 }), j({ colourBy: "max", size: 2 })), false, "a size change rebuilds");
  assert.equal(onlyPaintChanged(j({ shape: "cylinder" }), j({ shape: "square" })), false);
});

test("paintCustomLayer writes each instance's colour as the build would give it", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, value: i, n: 40 - i }));
  const layer = { id: "L1", name: "Gamma", rows, group: new THREE.Group() };
  for (const row of rows) {
    const m = new PickStandIn(PROTO_CYLINDER, { color: "#000000" });
    m.position.set(0, -row.from, 0); m.scale.set(1.6, 1, 1.6);
    m.userData = { row, holeId: "H1" };
    layer.group.add(m);
  }
  buildLayerBatches(layer.group);
  const inst = layer.group.children[0];
  assert.ok(inst.userData.compact);
  const styles = { "custom:L1": { colourBy: "n" } };
  assert.equal(paintCustomLayer(layer, styles), 40);
  const want = new THREE.Color(customColour(layer, styles, rows[7]));
  const a = inst.instanceColor.array;
  assert.ok(Math.abs(a[21] - want.r) < 1e-6 && Math.abs(a[22] - want.g) < 1e-6 && Math.abs(a[23] - want.b) < 1e-6);
  // one colour wins over the field
  paintCustomLayer(layer, { "custom:L1": { color: "#ff0000" } });
  assert.deepEqual([a[0], a[1], a[2]], [1, 0, 0]);
});

test("the build repaints a colour-only change and keeps the group", () => {
  const v = viewerSource();
  assert.ok(v.includes("if (!old || old[0] !== l || old[1] !== l.group || old[2] === sig[2] || !holes || !onlyPaintChanged(old[2], sig[2])) continue;"));
  assert.ok(v.includes("for (const l of repaint) paintCustomLayer(l, layerStyles); // #2373"));
});
