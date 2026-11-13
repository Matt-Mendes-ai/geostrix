// TASKS.csv #2802 (split from #2746) — a level of detail for very long custom logs: readings binned along each hole into one marker per bin when
// a typical spacing is a few pixels, switched in the render loop like the assay markers (#3144).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { readingSpacingM, primeLogLod, dropLogCoarse, logLodTick, LOG_LOD_MIN } from "../src/modules/viewer/logLod.js";
import { binReadings } from "../src/modules/viewer/logLodBuild.js";
const settle = () => new Promise((r) => setTimeout(r, 0));

// n holes, vertical from z = 0, a reading every 0.05 m over 60 m (1,200 a hole)
function data(nHoles, { codes = false } = {}) {
  const rows = [], traces = [];
  for (let h = 0; h < nHoles; h++) {
    const id = `H${h}`;
    traces.push({ hole_id: id, pts: [{ md: 0, x: h * 20, y: 0, z: 0 }, { md: 100, x: h * 20, y: -100, z: 0 }] });
    for (let i = 0; i < 1200; i++) rows.push({ hole_id: id, depth: +(i * 0.05).toFixed(2), value: codes ? (i < 600 ? "SST" : "CLY") : 20 + (i % 10) });
  }
  return { layer: { id: "g", name: "Gamma eU3O8 (ppm)", rows }, traces };
}

test("the spacing and the bins: mean for a number, the commonest value for a code, every reading in one bin", () => {
  const { layer } = data(2);
  assert.ok(Math.abs(readingSpacingM(layer.rows) - 0.05) < 1e-9);
  const bins = binReadings(layer.rows.filter((r) => r.hole_id === "H0"), 4.8, true);
  assert.equal(bins.reduce((n, b) => n + b.n, 0), 1200);
  assert.ok(bins.length >= 12 && bins.length <= 13, `${bins.length} bins over 60 m`);
  assert.ok(Math.abs(bins[0].value - 24.5) < 0.6, "the mean of 20..29");
  const coded = binReadings(data(1, { codes: true }).layer.rows, 40, false);
  assert.deepEqual(coded.map((b) => b.value), ["SST", "CLY"]);
});

test("only a long log gets it; the coarse set is built on first need (its builder loaded then), swaps with the full one, and goes on a rebuild", async () => {
  const short = new THREE.Group();
  primeLogLod(short, data(10).layer, {}); // 12,000 readings
  assert.equal(short.userData.logLod, undefined, `under ${LOG_LOD_MIN}`);
  const { layer, traces } = data(20); // 24,000 readings
  const g = new THREE.Group(), full = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  g.add(full);
  primeLogLod(g, layer, {});
  const L = g.userData.logLod;
  assert.ok(Math.abs(L.spacingM - 0.05) < 1e-9);
  assert.equal(L.coarse, null, "nothing built yet");
  logLodTick(g, 0.001, traces, {}); // 5 cm = 50 px: full set
  assert.equal(L.coarse, null);
  logLodTick(g, 0.1, traces, {}); // 5 cm = 0.5 px: coarse wanted; the builder starts loading
  await settle(); await settle();
  logLodTick(g, 0.1, traces, {}); // built on the next frame
  assert.ok(L.coarse?.length > 0 && L.lodOn);
  const inst = L.coarse.reduce((n, c) => n + (c.count || 0), 0);
  assert.ok(inst > 0 && inst <= 20 * 13, `${inst} coarse markers for 24,000 readings`);
  assert.equal(full.visible, false);
  assert.ok(L.coarse.every((c) => c.visible));
  logLodTick(g, 0.012, traces, {}); // 4.2 px: inside the margin, stays coarse
  assert.equal(L.lodOn, true);
  logLodTick(g, 0.005, traces, {}); // 10 px: full again
  assert.equal(L.lodOn, false);
  assert.equal(full.visible, true);
  assert.ok(L.coarse.every((c) => !c.visible));
  logLodTick(g, 0.1, traces, { H0: false }); // the shown holes changed: built again without H0
  assert.ok(L.coarse.reduce((n, c) => n + (c.count || 0), 0) < inst);
  dropLogCoarse(g);
  assert.equal(L.coarse, null);
  assert.equal(full.visible, true);
  assert.ok(!g.children.some((c) => c.userData.lodCoarse), "no coarse marker left in the group");
});

test("wiring: drillholeScene drops it before a rebuild, patch or repaint and primes it after batching; the render loop ticks it", () => {
  const d = fs.readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  const drop = d.indexOf("for (const l of lodRedo) dropLogCoarse(l.group);"), retire = d.indexOf("retireHoles(g, changedHoles)) patched.add(k)");
  assert.ok(drop > 0 && drop < retire, "dropped before retireHoles reads the batches");
  assert.ok(d.indexOf("for (const l of lodRedo) dropLogCoarse") < d.indexOf("for (const l of repaint) paintCustomLayer"), "and before a repaint");
  assert.match(d, /for \(const l of lodRedo\) primeLogLod\(l\.group, l, layerStyles\);/);
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.ok(!/^import [^\n]*logLodBuild/m.test(v) && !/^import [^\n]*logLodBuild/m.test(d), "the builder is not a startup import");
  assert.match(v, /if \(g\?\.visible && g\.userData\.logLod\) logLodTick\(g, metresPerPixel\(camera, camState\.current\?\.radius, mount\.clientHeight\), tracesRef\.current, visibleHolesRef\.current\);/);
});
