// TASKS.csv #2682 — while a unit polygon is drawn, its first corner lights up on hover when a click there would close the ring;
// the click (UnitPolygonPane, #2414) and the hover share lib/viewer/interpretDraw.js closesRing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { closesRing, hoverFirstCorner, syncInterpretPreview } from "../src/lib/viewer/interpretDraw.js";

const sq = [{ x: 0, y: 0, z: 10 }, { x: 100, y: 0, z: 10 }, { x: 100, y: 100, z: 10 }];
const origin = { x: 0, y: 0, z: 0 };

test("closesRing: within max(1 m, 2 % of the outline's size) of the first corner, from three corners", () => {
  assert.equal(closesRing(sq, { x: 2, y: 1 }), true); // diagonal ~141 m -> 2.8 m
  assert.equal(closesRing(sq, { x: 5, y: 0 }), false);
  assert.equal(closesRing(sq.slice(0, 2), { x: 0, y: 0 }), false); // two corners: no ring yet
  assert.equal(closesRing([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }], { x: 0.9, y: 0 }), true); // the 1 m floor
  assert.equal(closesRing(sq, null), false);
});

test("hoverFirstCorner: a marker at the first corner shows only for a unit polygon and only near it", () => {
  const g = new THREE.Group();
  syncInterpretPreview(g, sq, origin);
  const kids = g.children.length;
  assert.equal(hoverFirstCorner(g, { on: true, ring: true, points: sq }, { x: 1, y: 1 }, origin), true);
  const m = g.children.find((c) => c.userData.firstCorner);
  assert.ok(m && m.visible);
  const pos = m.geometry.attributes.position;
  assert.deepEqual([pos.getX(0), pos.getY(0), pos.getZ(0) + 0], [0, 11.5, 0]); // the preview's scene frame and lift
  assert.equal(hoverFirstCorner(g, { on: true, ring: true, points: sq }, { x: 50, y: 50 }, origin), false);
  assert.equal(m.visible, false);
  assert.equal(g.children.length, kids + 1); // reused, not one per move
  // interpretation lines (no ring) and a stopped drawing never light it
  assert.equal(hoverFirstCorner(g, { on: true, ring: false, points: sq }, { x: 0, y: 0 }, origin), false);
  assert.equal(hoverFirstCorner(g, { on: false, ring: true, points: sq }, { x: 0, y: 0 }, origin), false);
  syncInterpretPreview(g, [], origin); // a rebuild drops it
  assert.equal(g.children.length, 0);
});

test("wiring: the pane closes with closesRing; the 3D view's hover calls hoverFirstCorner; onStart marks a polygon as a ring", () => {
  const pane = fs.readFileSync(new URL("../src/components/UnitPolygonPane.jsx", import.meta.url), "utf8");
  assert.match(pane, /if \(closesRing\(pts\.slice\(0, -1\), pts\[n - 1\]\)\) finish\(true\);/);
  const vm = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /hoverFirstCorner\(interpretGroupRef\.current, interpretRef\.current, worldPt, originRef\.current\)/);
  assert.match(vm, /ring: interpretOpen === "polygon"/);
});
