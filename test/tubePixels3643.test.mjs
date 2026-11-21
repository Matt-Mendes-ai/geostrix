// TASKS.csv #3643 — interval tubes are never thinner than a few pixels (vertex shader), and Measure lands on the hole's axis.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { tubeVertex, tubeFactor, isTubeProto, pixelTubeMaterial, TUBE_UNIFORMS } from "../src/lib/viewer/tubeShader.js";
import { COLLAR_MARKER_UNIFORMS } from "../src/lib/viewer/collarMarkerShader.js";
import { snapToAxis, snapMeasurePoint } from "../src/lib/viewer/measureSnap.js";
import { PROTO_CYLINDER, PROTO_CYLINDER_16, PROTO_PRISM_4, PROTO_CROSS, PROTO_SPHERE_10 } from "../src/lib/viewer/protos.js";

test("tubeFactor: widens a thin tube to the floor, leaves a wide one, honours a cap and an orthographic view", () => {
  const proj11 = 1 / Math.tan((50 * Math.PI) / 360), H = 800;
  // 0.8 m radius from 27 km: 0.8 * 2.14 * 400 / 27000 = 0.025 px -> the factor takes it to 1.5 px
  const far = tubeFactor(0.8, 27000, proj11, H);
  assert.ok(Math.abs(0.8 * far * proj11 * 0.5 * H / 27000 - 1.5) < 1e-9, "drawn at the floor");
  assert.ok(far > 50);
  assert.equal(tubeFactor(0.8, 20, proj11, H), 1, "wide enough already: unchanged (0.8 m at 20 m is ~17 px)");
  assert.equal(tubeFactor(0.8, 1e-9, proj11, H), 1);
  const cap = tubeFactor(8, 5, proj11, H, 1.5, 10); // 8 m at 5 m: 8 * 2.14 * 400 / 5 = 1,370 px -> 10
  assert.ok(Math.abs(8 * cap * proj11 * 0.5 * H / 5 - 10) < 1e-9);
  assert.equal(tubeFactor(0.8, 5, proj11, H, 1.5, 1e9), 1, "no cap by default");
  assert.ok(tubeFactor(0.001, null, 0.01, H) > 1, "orthographic: no depth");
  assert.ok(Number.isFinite(tubeFactor(0, 100, proj11, H)));
});

test("the tube vertex shader replaces project_vertex and keeps the rest; only tube prototypes get it", () => {
  const src = "void main(){\n#include <begin_vertex>\n#include <project_vertex>\n}";
  const out = tubeVertex(src);
  assert.match(out, /uniform float uTubeMinPx/);
  assert.match(out, /gsLocal\.xz \*= gsK/);
  assert.ok(!out.includes("#include <project_vertex>"));
  assert.equal(tubeVertex("void main(){}"), "void main(){}");
  assert.ok(isTubeProto(PROTO_CYLINDER) && isTubeProto(PROTO_CYLINDER_16) && isTubeProto(PROTO_PRISM_4) && isTubeProto(PROTO_CROSS));
  assert.ok(!isTubeProto(PROTO_SPHERE_10) && !isTubeProto(null));
  const m = pixelTubeMaterial(new THREE.MeshLambertMaterial());
  assert.equal(m.userData.pixelTube, true);
  assert.equal(pixelTubeMaterial(m), m);
  assert.equal(TUBE_UNIFORMS.uViewportH, COLLAR_MARKER_UNIFORMS.uViewportH, "the viewport height is the collar markers' one uniform");
  const lb = readFileSync(new URL("../src/lib/viewer/layerBatches.js", import.meta.url), "utf8");
  assert.match(lb, /if \(isTubeProto\(fam\.geometry\)\) pixelTubeMaterial\(material, group\.name \|\| null\)/);
});

// a hole going down-east: stations every 10 m of md, along (1, 0, -1)/sqrt2 per 10 m? keep it simple: along +x then dipping
const trace = { hole_id: "H1", pts: [{ md: 0 }, { md: 100 }, { md: 200 }], wx: [0, 100, 100], wy: [0, 0, 0], wz: [500, 500, 400] };

test("snapToAxis: the foot of the perpendicular, clamped to the interval", () => {
  const a = snapToAxis(trace, { x: 40, y: 3, z: 504 });
  assert.ok(Math.abs(a.x - 40) < 1e-9 && Math.abs(a.y) < 1e-9 && Math.abs(a.z - 500) < 1e-9 && Math.abs(a.md - 40) < 1e-9);
  assert.ok(Math.abs(a.dist - 5) < 1e-9);
  const b = snapToAxis(trace, { x: 102, y: 2, z: 450 }); // beside the second leg (down): md 150
  assert.ok(Math.abs(b.x - 100) < 1e-9 && Math.abs(b.z - 450) < 1e-9 && Math.abs(b.md - 150) < 1e-9);
  const c = snapToAxis(trace, { x: 40, y: 3, z: 504 }, { from: 120, to: 160 }); // an interval on the second leg: clamped to its start
  assert.ok(Math.abs(c.md - 120) < 1e-9 && Math.abs(c.z - 480) < 1e-9);
  const d = snapToAxis(trace, { x: 500, y: 0, z: 500 }); // beyond the end of the first leg: the corner
  assert.ok(Math.abs(d.x - 100) < 1e-9 && Math.abs(d.md - 100) < 1e-9);
  assert.equal(snapToAxis(null, { x: 0, y: 0, z: 0 }), null);
  assert.equal(snapToAxis(trace, { x: NaN, y: 0, z: 0 }), null);
});

test("snapMeasurePoint: only a hole's own drawing, Shift keeps the surface, a plane point stays", () => {
  const tube = { userData: { holeId: "H1", row: { from: 20, to: 60 } }, parent: null, material: { visible: true } };
  const other = { userData: {}, parent: null, material: { visible: true } };
  const world = { x: 40, y: 2.8, z: 502.8, on: "x" };
  const s = snapMeasurePoint(world, [{ object: tube, point: {} }], [trace]);
  assert.ok(Math.abs(s.y) < 1e-9 && Math.abs(s.z - 500) < 1e-9 && s.axis.hole === "H1" && Math.abs(s.axis.md - 40) < 1e-9);
  assert.equal(snapMeasurePoint(world, [{ object: tube }], [trace], { shift: true }), world);
  assert.equal(snapMeasurePoint(world, [{ object: other }], [trace]), world);
  assert.equal(snapMeasurePoint({ ...world, plane: true }, [{ object: tube }], [trace]).plane, true);
  assert.equal(snapMeasurePoint(world, [{ object: tube }], []), world, "a hole with no trace keeps the surface point");
  // the interval clamps the snap: a click at md 70 on a tube that spans 20-60 lands at 60
  const c = snapMeasurePoint({ x: 70, y: 1, z: 501 }, [{ object: tube }], [trace]);
  assert.ok(Math.abs(c.axis.md - 60) < 1e-9);
});

test("wiring: Measure uses the snap, the card says so", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /snapMeasurePoint\(found, hits, tracesRef\.current, \{ shift: e\.shiftKey \}\)/);
  const m = readFileSync(new URL("../src/components/MeasureResults.jsx", import.meta.url), "utf8");
  assert.match(m, /Shift-click keeps the surface point/);
});
