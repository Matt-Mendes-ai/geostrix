// TASKS.csv #2767 (#2630 (2)) — a finished interpretation line's vertex can be moved (Edit vertices: a drag in the 3D view); its length,
// ties and the layer's box follow.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addInterpretationLine, interpretationLayer, moveInterpretationVertex } from "../src/lib/interpretation.js";

const tieA = { hole_id: "A", md: 40, label: "Lithology: P", kind: "boundary" };
const tieC = { hole_id: "C", md: 0, label: "collar", kind: "collar" };
const line = () => addInterpretationLine(interpretationLayer("Test", ""), [{ x: 0, y: 0, z: 100, snap: tieA }, { x: 100, y: 0, z: 100 }, { x: 100, y: 100, z: 100 }], { type: "contact" });

test("the per-vertex ties are kept on the feature when a line is added", () => {
  const L = line();
  assert.deepEqual(L.features[0].tieVerts, [tieA, null, null]);
  assert.equal(L.features[0].attributes.length_m, 200);
});

test("moving a vertex updates the part, the length and the box; a tie on the new spot is recorded, and the old one goes with it", () => {
  const L = line();
  const M = moveInterpretationVertex(L, 0, 2, [100, 300], tieC);
  assert.deepEqual(M.features[0].parts[0], [[0, 0], [100, 0], [100, 300]]);
  assert.equal(M.features[0].attributes.length_m, 400);
  assert.deepEqual(M.bbox, [0, 0, 100, 300]);
  assert.equal(M.features[0].attributes.ties, "A 40 m (Lithology: P); C collar");
  const N = moveInterpretationVertex(M, 0, 0, [-50, 0], null);
  assert.equal(N.features[0].attributes.ties, "C collar", "the moved vertex lost its tie");
  const O = moveInterpretationVertex(N, 0, 2, [100, 250], null);
  assert.ok(!("ties" in O.features[0].attributes) && !O.features[0].tieVerts, "no tie left: no ties text");
  assert.equal(L.features[0].parts[0][2][1], 100, "the input layer is not mutated");
});

test("a bad index or point leaves the layer as it was; an older line keeps its ties text", () => {
  const L = line();
  assert.equal(moveInterpretationVertex(L, 5, 0, [1, 1]), L);
  assert.equal(moveInterpretationVertex(L, 0, 9, [1, 1]), L);
  assert.equal(moveInterpretationVertex(L, 0, 0, [NaN, 1]), L);
  const old = { ...L, features: [{ ...L.features[0], tieVerts: undefined }] };
  delete old.features[0].tieVerts;
  const M = moveInterpretationVertex(old, 0, 1, [120, 0], null);
  assert.equal(M.features[0].attributes.ties, "A 40 m (Lithology: P)");
});

test("wiring: the pane's pencil, the drag hook and ViewerModule's view refs", () => {
  const p = readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8");
  assert.match(p, /useInterpretVertexEdit\(\{ view, layer: editIdx != null \? layer : null, index: editIdx, groundAt,/);
  assert.match(p, /moveInterpretationVertex\(l, editIdx, vi, xy, tie\)/);
  const h = readFileSync(new URL("../src/components/useInterpretVertexEdit.js", import.meta.url), "utf8");
  assert.match(h, /view\.dragHook\.current = \(e\) => \{\s*const vi = nearest\(e\);\s*if \(vi < 0\) return false;/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /view: \{ scene: sceneRef, camera: cameraRef, renderer: rendererRef, dragHook: viewDragHookRef, origin: originRef, activity: lastActivityRef \}, snapCtx: \(\) => \(\{ traces: tracesRef\.current, layers, visible: layerVisible \}\)/);
});
