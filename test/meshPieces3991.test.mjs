// TASKS.csv #3991 — select a mesh, or one piece of it, in the 3D view and delete it (undoable). Made-up meshes only: a closed box (8 vertices,
// 12 triangles) and a separate flat sheet (2 triangles), as one indexed mesh of 2 pieces.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { labelPieces, keepPieces, pieceIndex, pieceParts, pieceName, pieceEdit } from "../src/lib/meshPieces.js";
import { piecesOf, WORKER_MIN_FACES } from "../src/lib/meshPiecesClient.js";
import { computeMeshVolume } from "../src/lib/volumetrics.js";
import { provenanceLines } from "../src/lib/meshExport.js";
import { reconcileSurfaces } from "../src/modules/viewer/surfaceUndo.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
// a 10 m box at the origin (outward triangles) and a sheet 50 m away, made-up
const BOX_V = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10];
const BOX_F = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
const SHEET_V = [50, 0, 0, 60, 0, 0, 60, 10, 0, 50, 10, 0], SHEET_F = [8, 9, 10, 8, 10, 11];
const POS = new Float32Array([...BOX_V, ...SHEET_V]), IDX = new Uint32Array([...SHEET_F, ...BOX_F]); // the sheet first: the order is by size, not by place
const geom = (pos, idx) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); return g; };

test("#3991 the pieces: shared vertex indices join triangles; numbered by size, the main body first; as many as the volume card counts", () => {
  const p = labelPieces(IDX, POS.length / 3);
  assert.equal(p.count, 2);
  assert.deepEqual(p.sizes, [12, 2], "the box (12 triangles) is piece 1");
  assert.deepEqual([...p.labels.slice(0, 2)], [1, 1], "the sheet's triangles"); assert.ok([...p.labels.slice(2)].every((l) => l === 0));
  assert.equal(computeMeshVolume(geom(POS, IDX)).componentCount, p.count, "the card's own count");
  assert.equal(labelPieces(new Uint32Array(0), 0), null);
  assert.equal(labelPieces(BOX_F, 8).count, 1);
});

test("#3991 cut down to some pieces: unused vertices dropped, triangles re-indexed; the kept box keeps its volume", () => {
  const p = labelPieces(IDX, POS.length / 3);
  const box = keepPieces(POS, IDX, p.labels, new Set([0]));
  assert.equal(box.vertices, 8); assert.equal(box.faces, 12);
  const v = computeMeshVolume(geom(box.positions, box.index));
  assert.ok(v.watertight && Math.abs(v.volumeM3 - 1000) < 1e-6, "a closed piece gets its own volume");
  const sheet = keepPieces(POS, IDX, p.labels, new Set([1]));
  assert.deepEqual([...sheet.positions], SHEET_V); assert.deepEqual([...sheet.index], [0, 1, 2, 0, 2, 3]);
  assert.deepEqual([...pieceIndex(IDX, p.labels, 1)], SHEET_F, "the piece's triangles in the mesh's own indices");
});

test("#3991 the edits: delete a piece, keep only it, split into one mesh per piece named 'piece k of n'; recorded for the exports", () => {
  assert.deepEqual(pieceParts("delete", 2, 1).map((q) => [...q.keep]), [[0]]);
  assert.deepEqual(pieceParts("keep", 2, 1).map((q) => [...q.keep]), [[1]]);
  assert.deepEqual(pieceParts("split", 3, 0).map((q) => [[...q.keep], q.piece]), [[[0], 0], [[1], 1], [[2], 2]]);
  assert.equal(pieceParts("delete", 1, 0), null, "one piece: nothing to choose");
  assert.equal(pieceName("Top of DLST", 2, 2), "Top of DLST (piece 2 of 2)");
  assert.equal(pieceName("Top of DLST (piece 1 of 3)", 1, 2), "Top of DLST (piece 1 of 2)", "not stacked");
  const e = pieceEdit("delete", { count: 2, label: 1, facesBefore: 14, facesAfter: 12, volumeBeforeM3: null, volumeAfterM3: 1000, at: "2026-11-21T00:00:00Z" });
  assert.equal(e.action, "piece removed by the user"); assert.equal(e.kind, "piece"); assert.equal(e.piece, 2);
  const lines = provenanceLines("Test surface", { method: "made-up" }, { manualEdits: { count: 1, edits: [e], volumeAsGeneratedM3: null, volumeNowM3: 1000 } }).join("\n");
  assert.match(lines, /1 manual edit applied/);
  assert.match(lines, /edit 1: 2026-11-21T00:00:00Z — piece removed by the user: piece 2 of 2, 14 -> 12 triangles/);
  assert.match(lines, /A piece edit removes whole separate pieces/);
  assert.doesNotMatch(lines, /triangle connectivity is unchanged/, "that line is for sculpts");
});

test("#3991 labelled once per geometry (cached); a big mesh goes to a worker, a small one is done at once", async () => {
  const g = geom(POS, IDX);
  const a = piecesOf(g), b = piecesOf(g);
  assert.equal(a, b, "the same promise: labelled once");
  assert.equal((await a).count, 2);
  assert.equal(await piecesOf(new THREE.BufferGeometry()), null);
  assert.ok(WORKER_MIN_FACES >= 100000);
  // 300,000 triangles labelled in well under a second (the worker's job, timed here on the main thread)
  const n = 300000, idx = new Uint32Array(n * 3);
  for (let t = 0; t < n; t++) { idx[3 * t] = t; idx[3 * t + 1] = t + 1; idx[3 * t + 2] = t + 2; }
  const t0 = performance.now(), big = labelPieces(idx, n + 2), ms = performance.now() - t0;
  assert.equal(big.count, 1); assert.ok(ms < 1500, `${ms.toFixed(0)} ms`);
});

test("#3991 one Undo step: the old surface out (to the grave), its pieces in, in one update; Undo puts the old one back and takes them away", () => {
  const grave = new Map([["A", { entry: { id: "A" } }]]);
  const undo = reconcileSurfaces(["X", "B1", "B2"], ["X", "A"], grave);
  assert.deepEqual(undo.remove, ["B1", "B2"]); assert.deepEqual(undo.restore, ["A"]); assert.deepEqual(undo.order, ["X", "A"]);
});

test("#3991 wired: the click goes to the selection only when no tool is armed; the bar is drawn; the piece edit replaces the surface in one update", () => {
  const v = read("../src/modules/ViewerModule.jsx"), h = read("../src/modules/viewer/MeshSelect.jsx"), c = read("../src/lib/meshPiecesClient.js"), u = read("../src/modules/viewer/useMeshSelect.jsx");
  // #3996 — the startup hook only checks for a mesh under the click; the rest loads then
  assert.match(u, /const MeshSelect = lazyPart\(\(\) => import\("\.\/MeshSelect\.jsx"\)\);/); assert.doesNotMatch(u, /meshPieces|stashSurface|i18n/);
  assert.match(v, /import \{ useMeshSelect \} from "\.\/viewer\/useMeshSelect\.jsx";/);
  assert.match(v, /if \(!\(pickHoleMode \|\| identify\.on \|\| sectionMode \|\| measureMode \|\| interpretRef\.current\.on \|\| mcPickMode \|\| explicitPickFor \|\| sculpt\.targetId\)\) meshSelect\.handleViewClick\(e\);/);
  assert.match(v, /\{meshSelect\.bar\}/);
  assert.match(h, /stashSurface\(\{ grave: c\.surfaceGrave\.current, meshes: c\.implicitMeshesRef\.current, group: c\.implicitGroupRef\.current, surfaces: c\.surfacesNowRef\.current \}, id\);/);
  assert.equal((h.match(/c\.setImplicitSurfaces\(/g) || []).length, 1, "one update: one Undo step");
  assert.match(h, /if \(e\.key === "Delete"\)/); assert.match(h, /e\.key === "Escape"/); assert.match(h, /e\.ctrlKey \|\| e\.metaKey/);
  assert.match(h, /if \(c\.expandedSurfaceId === id\) c\.setExpandedSurfaceId\(first\);/, "the open card follows: its volume recomputes");
  assert.match(c, /new Worker\(new URL\("\.\/meshPieces\.worker\.js", import\.meta\.url\), \{ type: "module" \}\)/);
});
