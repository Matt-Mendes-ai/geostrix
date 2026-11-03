// TASKS.csv #1632 (review #1497, Lawyers) — a north arrow tied to a viewport follows its camera azimuth and frame rotation
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withLiveScaleBars, tieStarterFurniture, northRotationOf, relinkCopies } from "../src/lib/layoutLinks.js";

const vp = (az, rot = 0) => ({ id: "v1", type: "viewport", cameraAzimuthDeg: az, rotation: rot, worldHeightAtTarget: 1000, imgW: 800, imgH: 600 });

test("the starter arrow ties to the first view and then follows it", () => {
  const els = tieStarterFurniture([{ id: "north", type: "north", x: 1000, y: 40 }], vp(45));
  assert.deepEqual([els[0].rotation, els[0].boundTo], [45, "v1"]);
  // Fit the holes turns the frame north-up: the arrow follows without Sync
  const live = withLiveScaleBars([vp(0), els[0]]);
  assert.equal(live[1].rotation, 0);
});

test("frame rotation adds to the camera azimuth (#1477); a free arrow keeps its own angle", () => {
  assert.equal(northRotationOf(vp(350, 20)), 10);
  const free = { id: "n2", type: "north", rotation: 30 };
  assert.equal(withLiveScaleBars([vp(90), free])[1], free);
  const gone = { id: "n3", type: "north", rotation: 12, boundTo: "missing" };
  assert.equal(withLiveScaleBars([vp(90), gone])[1].rotation, 12, "a deleted view leaves the arrow as it was");
  assert.equal(northRotationOf({ id: "i", type: "image" }), null);
});

test("a copied arrow follows its copied view", () => {
  const [n] = relinkCopies([{ id: "n", type: "north", boundTo: "v1" }], new Map([["v1", "v9"]]), true);
  assert.equal(n.boundTo, "v9");
});

test("the dialog: Insert and Sync tie the arrow, typing an angle frees it", () => {
  const src = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("if (vp) { base.boundTo = vp.id; base.rotation = northRotationOf(vp); }"));
  assert.ok(src.includes("{ ...el, rotation: deg, boundTo: sel.id }"));
  assert.ok(src.includes("updateSelected({ rotation: Number(e.target.value) || 0, boundTo: null })"));
});
