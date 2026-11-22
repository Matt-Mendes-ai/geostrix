// TASKS.csv #3765 (Scottie Gold review) — a 67,344-cell chargeability model beside the holes: the 3D slice showed the model's cut face with the slab's
// 21 holes buried in its cells, and the legend line gave neither property nor unit ('Model_Fine_Chg (chg) ≤ 0.442 … ≥ 63.6'; the ends are the 2nd and
// 98th percentiles, unsaid). Synthetic model and slab.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { voxelLegendGroups, voxelLegendLabel } from "../src/lib/legendGroups.js";
import { slabOf, farLayerPlane, cellAlong } from "../src/lib/viewer/sliceModelFace.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const cells = (n) => Array.from({ length: n }, (_, i) => ({ x: i, y: 0, z: 0, dx: 10, dy: 10, dz: 10, value: i < n - 5 ? Math.exp((i / n) * 4) : 104.2 }));
const model = (extra = {}) => ({ id: "m1", name: "Model_Fine_Chg (chg)", property: "chg", source: "import", min: 0, max: 104.2, dx: 25, dy: 25, dz: 12.5, cells: cells(400), ...extra });

test("the legend says what the values are: unit not stated, and the clipped ends are the 2nd and 98th percentiles", () => {
  const g = voxelLegendGroups([model()])[0];
  assert.equal(g.label, "Model_Fine_Chg (chg) · unit not stated");
  assert.ok(g.ramp, "still a ramp, with its '≤' / '≥' ends");
  assert.match(g.ramp.minLabel, /^≤ .* \(P2\)$/); assert.match(g.ramp.maxLabel, /^≥ .* \(P98\)$/);
  const typed = voxelLegendGroups([model({ stretch: "minmax" })])[0];
  assert.doesNotMatch(typed.ramp.minLabel + typed.ramp.maxLabel, /P2|P98/, "a typed range is not a percentile stretch");
});

test("a stated unit is the unit; a model GeoStrix made states its own; the property is added when the name lacks it; a typed range is not a percentile stretch", () => {
  assert.equal(voxelLegendLabel(model({ params: { unit: "mV/V" } }), "Model_Fine_Chg (chg)", "mV/V"), "Model_Fine_Chg (chg) (mV/V)");
  assert.doesNotMatch(voxelLegendLabel(model({ source: "estimate-idw", params: { element: "Au", unit: "g/t" } }), "Au estimate", "g/t"), /not stated/);
  assert.doesNotMatch(voxelLegendLabel(model({ source: "kriging-variance" }), "Au KV", null), /not stated/, "made here: its unit is its own (the variance)");
  assert.equal(voxelLegendGroups([model({ name: "IP block", property: "chg" })])[0].label.startsWith("IP block — chg · unit not stated"), true);
  const stops = voxelLegendGroups([model({ stops: [{ value: 0, color: "#000000" }, { value: 104.2, color: "#ffffff" }] })])[0];
  assert.doesNotMatch(stops.ramp?.minLabel + stops.ramp?.maxLabel, /P2|P98/, "its own colour stops");
});

// the slab exactly as ViewerModule's effect builds it (scene coords)
function slabPlanes(n, c, t) {
  const plane = (normal, point) => new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  return [plane(n.clone().negate(), c.clone().addScaledVector(n, t / 2)), plane(n.clone(), c.clone().addScaledVector(n, -t / 2))];
}
test("slabOf reads the slab back from its two planes; the far layer is the cell nearest the back of the slab, whichever side the camera is on", () => {
  const a = (35 * Math.PI) / 180, n = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), c = n.clone().multiplyScalar(120).add(new THREE.Vector3(0, 40, 0).multiplyScalar(0)), t = 50, w = 25;
  const planes = slabPlanes(n, c, t);
  const front = new THREE.Vector3().copy(n).multiplyScalar(500), back = new THREE.Vector3().copy(n).multiplyScalar(-300);
  const sf = slabOf(planes, front), sb = slabOf(planes, back);
  assert.ok(Math.abs(sf.t - t) < 1e-9 && Math.abs(sf.nc - 120) < 1e-9);
  assert.equal(sf.side, 1); assert.equal(sb.side, -1);
  const u = (p) => n.dot(p) - 120; // distance along n from the slab's middle
  const inSlab = (p) => Math.abs(u(p)) <= t / 2 + 1e-9;
  for (const [slab, farU] of [[sf, -t / 2], [sb, t / 2]]) {
    const pl = farLayerPlane(slab, w);
    const kept = (p) => inSlab(p) && pl.distanceToPoint(p) >= 0;
    for (let k = -t / 2 - 5; k <= t / 2 + 5; k += 1) {
      const p = n.clone().multiplyScalar(120 + k);
      const want = Math.abs(k) <= t / 2 && Math.abs(k - farU) <= w; // within a cell of the slab's far boundary
      assert.equal(kept(p), want, `u = ${k} (camera side ${slab.side})`);
    }
  }
  assert.equal(slabOf([planes[0]], front), null, "a cut with no thickness has no slab to layer");
  assert.equal(slabOf([], front), null);
});

test("a cell's thickness along the slab's normal: scene x = east (dx), y = up (dz), z = -north (dy)", () => {
  assert.equal(cellAlong({ dx: 25, dy: 25, dz: 12.5 }, new THREE.Vector3(1, 0, 0)), 25);
  assert.equal(cellAlong({ dx: 25, dy: 40, dz: 12.5 }, new THREE.Vector3(0, 0, 1)), 40);
  assert.equal(cellAlong({ dx: 25, dy: 40, dz: 12.5 }, new THREE.Vector3(0, 1, 0)), 12.5, "a horizontal slice: the cell's height");
  assert.equal(cellAlong({}, new THREE.Vector3(1, 0, 0)), 1, "no size: a metre");
});

test("wiring: the hook runs after the voxel build, and the legend keys are in four languages", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  const build = v.indexOf("}, [voxelModels, collars, slice3d.on, deferRound]);"), hook = v.indexOf("useSliceModelFace({ voxelMeshesRef, slicePlanesRef, originRef, activityRef: lastActivityRef, slice3d, voxelModels");
  assert.ok(build > 0 && hook > build, "the hook's effect runs after the build's, so it sees the new meshes");
  const h = read("../src/lib/viewer/sliceModelFace.js");
  assert.match(read("../src/modules/viewer/useSliceModelFace.js"), /import\("\.\.\/\.\.\/lib\/viewer\/sliceModelFace\.js"\)/, "loaded when a slice with a thickness is on, not at startup");
  assert.doesNotMatch(read("../src/modules/viewer/useSliceModelFace.js"), /from "three"/);
  // TASKS.csv #4020 — the back wall is a filled face (lib/viewer/sliceMap.js) placed at the far side each frame, the clipped boxes hidden
  assert.match(h, /face\.onBeforeRender = /);
  assert.match(h, /const eps = Math\.min\(0\.5, slab\.t \/ 4\), u = slab\.side > 0 \? -slab\.t \/ 2 \+ eps : slab\.t \/ 2 - eps;/);
  assert.match(h, /m\.visible = false;/);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); assert.ok(j["unit not stated"], l); }
});
