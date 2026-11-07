// TASKS.csv #1466 / #1622 — contour labels and index contours: which levels, where along the lines, and the 3D build.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { contourIntervalOf, indexLevels, levelText, contourLabelSpots } from "../src/lib/contourLabels.js";

const ring = (cx, cy, r, n = 64) => Array.from({ length: n + 1 }, (_, i) => ({ x: cx + r * Math.cos((2 * Math.PI * i) / n), y: cy + r * Math.sin((2 * Math.PI * i) / n) }));
const line = (y, x0, x1, z) => [{ x: x0, y, z }, { x: x1, y, z }];

test("the interval: stored, else the smallest step", () => {
  assert.equal(contourIntervalOf({ contourInterval: 50, contourLevels: [1000, 1100] }), 50);
  assert.equal(contourIntervalOf({ contourLevels: [1000, 1050, 1050, 1150] }), 50);
  assert.equal(contourIntervalOf({ contourLevels: [7] }), null);
});

test("index contours: round multiples of five intervals in a regular series, every level of a few chosen ones", () => {
  const levels = Array.from({ length: 28 }, (_, i) => 50 + i * 50); // Silvertip soils terrain: 50 ... 1400 m
  const idx = [...indexLevels({ contourLevels: levels, contourInterval: 50 })].sort((a, b) => a - b);
  assert.deepEqual(idx, [250, 500, 750, 1000, 1250]);
  assert.deepEqual([...indexLevels({ contourLevels: [0.0059, 0.012, 0.02, 0.04] })].sort(), [0.0059, 0.012, 0.02, 0.04]);
  // irregular, many levels: every fifth
  const odd = Array.from({ length: 12 }, (_, i) => 3 + i * 7.3);
  assert.equal(indexLevels({ contourLevels: odd, contourInterval: 7.3 }).size, 3);
});

test("label text is short", () => {
  assert.equal(levelText(1250), "1250");
  assert.equal(levelText(12.5), "12.5");
  assert.equal(levelText(0.0059), "0.0059");
  assert.equal(levelText(0.012), "0.012");
});

test("spots: on index lines only, spaced along long lines, none on a tiny loop, capped round-robin", () => {
  const levels = [], lines = [];
  for (let i = 0; i < 10; i++) { const z = 50 + i * 50; lines.push(line(i * 100, 0, 4000, z)); levels.push(z); }
  lines.push(ring(2000, 500, 2)); levels.push(250); // a 12 m loop at an index level
  const b = { polylines: lines, contourLevels: levels, contourInterval: 50 };
  const spots = contourLabelSpots(b);
  assert.ok(spots.length > 0);
  assert.ok(spots.every((s) => s.level === 250 || s.level === 500));
  assert.ok(!spots.some((s) => s.line === 10), "the tiny loop is not labelled");
  const on250 = spots.filter((s) => s.line === 4);
  assert.ok(on250.length >= 3, "a 4 km line gets several labels");
  assert.ok(on250.every((s) => s.z === 250 && s.y === 400));
  const capped = contourLabelSpots(b, { max: 2 });
  assert.deepEqual(capped.map((s) => s.line).sort(), [4, 9], "the first round gives each index line one label");
});

test("syncBoundaries draws in-between contours faint and labels the index ones, outside the pick targets", async () => {
  globalThis.document ??= { createElement: () => ({ getContext: () => ({ measureText: () => ({ width: 40 }), fillRect() {}, fillText() {} }) }), fonts: null };
  const { syncBoundaries } = await import("../src/lib/viewer/sceneBuilders.js");
  const group = new THREE.Group(), cache = {};
  const levels = Array.from({ length: 10 }, (_, i) => 50 + i * 50);
  const b = { id: "c1", polylines: levels.map((z, i) => line(i * 100, 0, 4000, z)), closedFlags: levels.map(() => false), contourLevels: levels, contourInterval: 50, useVertexZ: true, color: "#8a5a2b", drapeMode: "flat" };
  syncBoundaries(group, cache, [b], { origin: { x: 0, y: 0, z: 0 }, terrain: null });
  const g = cache.c1;
  const lines3 = g.children.filter((c) => c.isLine);
  const labels = g.children.find((c) => c.userData?.contourLabels);
  assert.equal(lines3.length, 10);
  assert.equal(lines3.filter((l) => l.material.transparent && l.material.opacity < 1).length, 8);
  assert.ok(labels && labels.children.length > 0 && labels.children.every((s) => s.isSprite));
  assert.ok(labels.children.every((s) => Math.abs(s.position.y - 251) < 1e-6 || Math.abs(s.position.y - 501) < 1e-6));
  // labels off
  syncBoundaries(group, cache, [{ ...b, contourLabels: false }], { origin: { x: 0, y: 0, z: 0 }, terrain: null });
  assert.ok(!cache.c1.children.some((c) => c.userData?.contourLabels));
  // removing the layer disposes without throwing on the label group
  syncBoundaries(group, cache, [], { origin: { x: 0, y: 0, z: 0 }, terrain: null });
  assert.equal(group.children.length, 0);
  const viewer = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(viewer, /filter\(\(c\) => !c\.userData\?\.contourLabels\)/);
  assert.match(viewer, /fitContourLabels\(boundaryGroupRef\.current, camera/);
  assert.match(viewer, /fitContourLabels\(boundaryGroupRef\.current, renderCamera, outW, outH, false\)/);
});

test("terrain contours keep their interval; the boundary row has the toggle", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /contourLevels: lineLevels, contourInterval: contourInterval/);
  assert.match(g, /updateBoundary\(b\.id, \{ contourLabels: e\.target\.checked \}\)/);
});
