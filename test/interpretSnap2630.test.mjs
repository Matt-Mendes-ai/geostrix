// TASKS.csv #2630 (1) — interpretation-line clicks in the 3D View snap to a collar, a logged boundary of a shown interval layer, or a
// hole's trace, and the line records the ties.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSnapIndex, snapRay, snapTolerance, snapInterpretClick, shownIntervalLayers } from "../src/lib/viewer/interpretSnap.js";
import { addInterpretationLine, interpretationLayer, tiesText } from "../src/lib/interpretation.js";

// scene coords: x = E - ox, y = Z - oz, z = oy - N. Origin (1000, 2000, 0). Hole A collared at E 1100 N 2000 Z 300, vertical to 100 m.
const origin = { x: 1000, y: 2000, z: 0 };
const sceneOf = (E, N, Z) => ({ x: E - origin.x, y: Z - origin.z, z: origin.y - N });
const holeA = { hole_id: "A", pts: [{ md: 0, ...sceneOf(1100, 2000, 300) }, { md: 100, ...sceneOf(1100, 2000, 200) }] };
const holeB = { hole_id: "B", pts: [{ md: 0, ...sceneOf(1300, 2000, 300) }, { md: 100, ...sceneOf(1300, 2000, 200) }] };
const layers = { litho: [{ hole_id: "A", from: 0, to: 40, value: "P" }, { hole_id: "A", from: 40, to: 100, value: "GR" }], alt: [{ hole_id: "A", from: 10, to: 20, value: "SER" }] };
// a ray looking straight down (-y in scene) from 1,000 m above, at (E, N)
const down = (E, N) => ({ origin: sceneOf(E, N, 1300), direction: { x: 0, y: -1, z: 0 } });
const tol5 = () => 5; // 5 m reach

test("the index holds each collar and the boundaries of the shown layers only", () => {
  const idx = buildSnapIndex([holeA, holeB], layers, ["litho"]);
  const labels = idx.info.map((i) => `${i.hole_id}|${i.md}|${i.label}`).sort();
  // A's collar (md 0) is taken once, as the collar; the boundaries at 40 and 100 m carry the first row's label there
  assert.deepEqual(labels, ["A|0|collar", "A|100|litho: GR", "A|40|litho: P", "B|0|collar"]);
  assert.equal(idx.xyz.length, 4 * 3);
  assert.ok(!labels.some((l) => l.includes("SER")), "alteration is not shown: no snap to its boundaries");
});

test("a click straight above a vertical hole takes its collar (the nearest target to the eye along the ray is not needed: the ray hits them all)", () => {
  const idx = buildSnapIndex([holeA, holeB], layers, ["litho"], (k) => (k === "litho" ? "Lithology" : k));
  const s = snapRay(idx, down(1101, 2001), tol5);
  assert.ok(s && s.hole_id === "A");
  assert.ok(["collar", "boundary"].includes(s.kind));
  assert.equal(snapRay(idx, down(1200, 2000), tol5), null, "nothing within 5 m between the holes");
});

test("an oblique ray takes a logged boundary at depth, and a trace point between boundaries", () => {
  const idx = buildSnapIndex([holeA], layers, ["litho"], () => "Lithology");
  // a horizontal ray from the west at Z 260 (md 40 on hole A): the P / GR contact
  const ray = { origin: sceneOf(900, 2000, 260), direction: { x: 1, y: 0, z: 0 } };
  const s = snapRay(idx, ray, tol5);
  assert.equal(s.kind, "boundary"); assert.equal(s.md, 40); assert.equal(s.label, "Lithology: P");
  // at Z 230 (md 70) no boundary within 5 m: the nearest trace point
  const t = snapRay(idx, { origin: sceneOf(900, 2000, 230), direction: { x: 1, y: 0, z: 0 } }, tol5);
  assert.equal(t.kind, "trace"); assert.ok(Math.abs(t.md - 70) < 1e-6);
});

test("snapInterpretClick returns world coordinates and the tie; off, it returns the hit unchanged", () => {
  const cam = { isOrthographicCamera: true, top: 500, bottom: -500, zoom: 1 }; // 1,000 m over 1,000 px: 1 m a px, 12 m reach
  const hit = { x: 1105, y: 2003, z: 300 };
  const w = snapInterpretClick(hit, down(1105, 2003), { on: true, traces: [holeA, holeB], layers, visible: { litho: true }, origin, camera: cam, heightPx: 1000 });
  assert.equal(w.x, 1100); assert.equal(w.y, 2000); assert.equal(w.snap.hole_id, "A");
  assert.equal(snapInterpretClick(hit, down(1105, 2003), { on: false, traces: [holeA], layers, visible: {}, origin, camera: cam, heightPx: 1000 }), hit);
  assert.equal(snapTolerance(cam, 1000)(5), 12);
  assert.deepEqual(shownIntervalLayers({ litho: true, alt: false, struct: true }), ["litho"]);
});

test("the line records its ties as an attribute and a field", () => {
  const pts = [{ x: 1100, y: 2000, z: 300, snap: { hole_id: "A", md: 40, label: "Lithology: P", kind: "boundary" } }, { x: 1300, y: 2000, z: 300, snap: { hole_id: "B", md: 0, label: "collar", kind: "collar" } }, { x: 1400, y: 2100, z: 300 }];
  assert.equal(tiesText(pts), "A 40 m (Lithology: P); B collar");
  const L = addInterpretationLine(interpretationLayer("Test", ""), pts, { type: "contact" });
  assert.equal(L.features[0].attributes.ties, "A 40 m (Lithology: P); B collar");
  assert.ok(L.fields.includes("ties"));
  const L2 = addInterpretationLine(interpretationLayer("Test", ""), pts.map(({ snap, ...p }) => p), { type: "contact" });
  assert.ok(!("ties" in L2.features[0].attributes) && !L2.fields.includes("ties"), "no ties: no field");
});

test("ViewerModule snaps line clicks (not unit polygons) and the pane has the switch", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /snapInterpretClick\(raycastWorldPoint\(raycaster\), raycaster\.ray, \{ on: interpretOpen === true && interpretRef\.current\.snap !== false/);
  const p = readFileSync(new URL("../src/components/InterpretPane.jsx", import.meta.url), "utf8");
  assert.match(p, /checked=\{drawing\.snap !== false\} onChange=\{\(e\) => onSnap\(e\.target\.checked\)\}/);
});
