// TASKS.csv #2176 step 3 — the drillhole traces as merged LineSegments chunks: chunking, per-hole ranges, hiding / showing a hole,
// its colour, and a pick that still names the hole
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { chunkHoles, traceChunkArrays, holeAtVertex, addTraceChunks, setTraceHoleHidden, setTraceHoleColour, hideTraceHoles, TRACE_OPACITY, TRACE_OPACITY_COLOURED, TRACE_GREY } from "../src/lib/viewer/traceBatch.js";
import { applyHoleColours } from "../src/lib/viewer/holeColours.js";
import { viewerSource } from "./helpers/viewerSource.mjs";

// a vertical hole at (x, z) with n stations 10 m apart
const hole = (id, x, z, n = 4, dashed = false) => ({ holeId: id, dashed, pts: Array.from({ length: n }, (_, i) => ({ x, y: i ? -10 * i : 0, z })) });

test("chunks are spatially together and about the requested size", () => {
  const holes = [];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 25; j++) holes.push(hole(`H${i}_${j}`, i * 50, j * 50));
  const chunks = chunkHoles(holes, 100);
  assert.equal(chunks.length, 10);
  assert.equal(chunks.flat().length, 1000);
  assert.equal(new Set(chunks.flat()).size, 1000);
  // each chunk spans a small part of the 2 km x 1.25 km grid
  for (const c of chunks) { const xs = c.map((h) => h.pts[0].x), zs = c.map((h) => h.pts[0].z); assert.ok(Math.max(...xs) - Math.min(...xs) <= 1000 && Math.max(...zs) - Math.min(...zs) <= 1250); }
  assert.deepEqual(chunkHoles([], 10), []);
  assert.equal(chunkHoles(holes.slice(0, 5), 10).length, 1);
});

test("each hole's segments, its vertex range and (dashed) distances restarting at the collar", () => {
  const a = traceChunkArrays([hole("A", 0, 0, 3), hole("B", 5, 5, 4)], { dashed: true });
  assert.deepEqual([...a.start], [0, 4]);
  assert.deepEqual([...a.count], [4, 6]);
  assert.equal(a.position.length, 10 * 3);
  assert.deepEqual([...a.position.slice(0, 6)], [0, 0, 0, 0, -10, 0], "A's first segment");
  assert.deepEqual([...a.dist.slice(4, 10)], [0, 10, 10, 20, 20, 30], "B's distances start at 0");
  assert.equal(a.color[3], TRACE_OPACITY);
  assert.equal(holeAtVertex(a.start, 0), 0);
  assert.equal(holeAtVertex(a.start, 3), 0);
  assert.equal(holeAtVertex(a.start, 4), 1);
  assert.equal(holeAtVertex(a.start, 9), 1);
});

test("a dashed (assumed vertical) hole goes in its own chunk with a LineDashedMaterial; one-point holes draw nothing", () => {
  const g = new THREE.Group();
  const out = addTraceChunks(g, [hole("A", 0, 0), hole("B", 10, 0), hole("V", 20, 0, 2, true), hole("P", 30, 0, 1)]);
  assert.equal(out.length, 2);
  assert.equal(g.children.length, 2);
  assert.ok(out[0].isLineSegments && out[0].material.isLineBasicMaterial && out[0].material.vertexColors && out[0].material.transparent);
  assert.ok(out[1].material.isLineDashedMaterial && out[1].geometry.attributes.lineDistance);
  assert.deepEqual(out[0].userData.traceChunk.holeIds, ["A", "B"]);
  assert.equal(out[0].geometry.attributes.color.itemSize, 4);
});

test("hiding a hole collapses it to its collar and showing it puts its points back; its colour and opacity are its own", () => {
  const g = new THREE.Group();
  const [ch] = addTraceChunks(g, [hole("A", 0, 0), hole("B", 7, 3)]);
  const pos = ch.geometry.attributes.position.array, before = pos.slice();
  setTraceHoleHidden(ch, "B", true);
  for (let v = 6; v < 12; v++) assert.deepEqual([pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], [7, 0, 3]);
  assert.deepEqual([...pos.slice(0, 18)], [...before.slice(0, 18)], "A untouched");
  hideTraceHoles(ch, {}); // nothing hidden any more
  assert.deepEqual([...pos], [...before]);
  assert.equal(setTraceHoleHidden(ch, "nope", true), false);
  setTraceHoleColour(ch, "A", "#ff0000");
  const col = ch.geometry.attributes.color.array;
  assert.deepEqual([col[0], col[1], col[2], col[3]], [1, 0, 0, Math.fround(TRACE_OPACITY_COLOURED)]);
  assert.equal(col[6 * 4 + 3], TRACE_OPACITY, "B stays grey");
  setTraceHoleColour(ch, "A", null);
  const grey = new THREE.Color(TRACE_GREY);
  assert.ok(Math.abs(col[0] - grey.r) < 1e-6 && col[3] === TRACE_OPACITY);
});

test("a pick on a chunk names the hole hit, and a hidden hole's hit is not visible", () => {
  const g = new THREE.Group();
  const [ch] = addTraceChunks(g, [hole("A", 0, 0), hole("B", 100, 0)]);
  g.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(new THREE.Vector3(100, -15, 50), new THREE.Vector3(0, 0, -1));
  const hits = rc.intersectObject(ch, false);
  assert.ok(hits.length >= 1);
  assert.equal(hits[0].object.userData.holeId, "B");
  assert.ok(hits[0].object.isLine && hits[0].object.parent === ch && hits[0].object.visible);
  setTraceHoleHidden(ch, "B", true);
  ch.geometry.boundingSphere = null;
  const again = rc.intersectObject(ch, false);
  assert.ok(again.every((h) => h.object.visible === false), "a collapsed hole is hidden from the pick consumers");
});

test("holes coloured by a collar field colour each hole's trace in the chunk and the grey comes back", () => {
  const g = new THREE.Group();
  const [ch] = addTraceChunks(g, [hole("A", 0, 0), hole("B", 7, 3)]);
  const collarsById = new Map([["A", { hole_id: "A", attrs: { type: "RC" } }], ["B", { hole_id: "B", attrs: { type: "DD" } }]]);
  const scheme = { colourOf: (c) => (c.attrs.type === "RC" ? "#00ff00" : "#0000ff") };
  applyHoleColours(g, scheme, { collarsById });
  const col = ch.geometry.attributes.color.array;
  assert.deepEqual([col[0], col[1], col[2], col[3]], [0, 1, 0, Math.fround(TRACE_OPACITY_COLOURED)]);
  assert.deepEqual([col[24], col[25], col[26]], [0, 0, 1]);
  applyHoleColours(g, null, { collarsById });
  assert.equal(col[3], TRACE_OPACITY);
});

test("the build adds the chunks and the Holes-list pass hides holes in them", () => {
  const v = viewerSource();
  assert.ok(v.includes("traceHoles.push({ holeId: c.hole_id, pts, dashed: assumedVertical });"));
  assert.ok(v.includes("if (rebuildHoles) addTraceChunks(groups.holes, traceHoles);"));
  assert.ok(!v.includes("new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map("), "no Line per hole");
  assert.ok(v.includes("if (child.userData?.traceChunk) { hideTraceHoles(child, visibleHoles); return; }"));
});
