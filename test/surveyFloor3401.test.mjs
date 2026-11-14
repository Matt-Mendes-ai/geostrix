// TASKS.csv #3401 (#3360's follow-up) — a wheel step over two IP clouds (543,820 points) blocked 0.2-0.5 s while every point's matrix was
// rewritten for the zoom's size floor and uploaded again. The floor is now a shader uniform; a zoom sets it (resizeSurveyPts), no rebuild.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { syncGeophysPts, resizeSurveyPts, symbolRadius, geophysTipText } from "../src/lib/viewer/geophysPts.js";
import { eachPickTarget } from "../src/lib/viewer/layerBatches.js";
import { buildPickIndex, queryPickIndex } from "../src/lib/pickIndex.js";
import { PICK_ONLY_LAYER } from "../src/lib/viewer/pickStandIn.js";

const proto = new THREE.SphereGeometry(1, 8, 6);
const style = { color: null, opacity: 1, size: 1, shape: "sphere" };
const origin = { x: 0, y: 0, z: 0 };
const pts = (n, src, x0 = 0) => Array.from({ length: n }, (_, i) => ({ x: x0 + i * 100, y: 0, z: 0, value: i, _src: src }));
const opts = (minR) => ({ opts: {}, surveys: null, style, proto, minR, origin, tipOf: (r) => geophysTipText(r, null) });

test("a zoom sets each survey's floor uniform: no matrix written, the same batches, a few points too", () => {
  const g = new THREE.Group(), rows = [...pts(40, "IP.xyz"), ...pts(5, "Electrodes.csv", 10000)];
  syncGeophysPts(g, rows, opts(0.5));
  const batches = [...g.children], mats = batches.map((b) => b.instanceMatrix.array.slice());
  assert.equal(batches.length, 2, "the 5-point survey is a compact batch too");
  assert.ok(batches.every((b) => b.userData.compact.floor && b.userData.ownGeometry));
  assert.equal(resizeSurveyPts(g, 30), true);
  assert.deepEqual([...g.children], batches);
  batches.forEach((b, k) => { assert.equal(b.userData.compact.floor.u.value, 30); assert.deepEqual(b.instanceMatrix.array, mats[k]); });
  // the drawn radius is symbolRadius at the new floor
  for (const b of batches) {
    const { ratio, u } = b.userData.compact.floor, base = b.userData.compact.base;
    for (let i = 0; i < ratio.length; i++) {
      const t = (base[i * 16] - 1.4) / 2.8;
      assert.ok(Math.abs(base[i * 16] * Math.max(1, u.value * ratio[i]) - symbolRadius(t, 30)) < 1e-4);
    }
  }
  assert.equal(resizeSurveyPts(new THREE.Group(), 30), false, "nothing drawn: build as before");
});

test("the pick sizes each point's sphere with the floor, refitted without a rebuild of the index", () => {
  const g = new THREE.Group();
  syncGeophysPts(g, pts(3, "IP.xyz"), opts(0.5));
  g.updateMatrixWorld(true);
  const list = []; eachPickTarget(g, (c) => list.push(c));
  const idx = buildPickIndex(list);
  const rc = new THREE.Raycaster(new THREE.Vector3(20, 500, 0), new THREE.Vector3(0, -1, 0)); rc.layers.enable(PICK_ONLY_LAYER);
  assert.equal(rc.intersectObjects(queryPickIndex(idx, rc), false).length, 0, "at the base size (1.4-4.2 m) a ray 20 m off misses");
  resizeSurveyPts(g, 40);
  const hits = rc.intersectObjects(queryPickIndex(idx, rc), false);
  assert.ok(hits.length >= 1 && hits[0].object.userData.row.x === 0, "with a 40 m floor the first point's sphere is hit");
});

test("the shader: the floor attribute and uniform, the radius scaled before the instance matrix", () => {
  const g = new THREE.Group();
  syncGeophysPts(g, pts(30, "IP.xyz"), opts(2));
  const m = g.children[0].material, sh = { uniforms: {}, vertexShader: "#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}" };
  m.onBeforeCompile(sh);
  assert.equal(sh.uniforms.uMinR, g.children[0].userData.compact.floor.u);
  assert.match(sh.vertexShader, /attribute float aFloor;\nuniform float uMinR;/);
  assert.match(sh.vertexShader, /#include <begin_vertex>\ntransformed \*= max\(1\.0, uMinR \* aFloor\);\n#include <project_vertex>/);
  assert.equal(m.customProgramCacheKey(), "geophysFloor");
});
