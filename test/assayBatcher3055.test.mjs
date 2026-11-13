// TASKS.csv #3055 (the rest of #2932, WA iron) — assay markers written straight into compact batch arrays (no object per sample), and the
// element ranges kept per samples array. The batches must hold exactly what the stand-in path built.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";
import { makeAssayBatcher, BATCH_MIN } from "../src/lib/viewer/assayBatcher.js";
import { buildLayerBatches, eachLayerMember } from "../src/lib/viewer/layerBatches.js";
import { PickStandIn } from "../src/lib/viewer/pickStandIn.js";
import { assayProto, placeAssayMarker } from "../src/lib/viewer/assayShape.js";
import { traceLookup } from "../src/lib/viewer/modelHelpers.js";
import { assayRange } from "../src/lib/viewer/assayRanges.js";
import { minMax } from "../src/lib/layers.js";

const at = traceLookup([{ md: 0, x: 0, y: 100, z: 0 }, { md: 200, x: 40, y: -90, z: 10 }]).at;
const rows = Array.from({ length: 300 }, (_, i) => ({ from: i * 0.6, to: i * 0.6 + 0.6, v: (i * 37) % 70, k: i }));
const colorOf = (v) => (v > 50 ? "#7a2e00" : v > 25 ? "#d98b2b" : "#f2e3c4");

function oldPath(shape) {
  const g = new THREE.Group();
  for (const r of rows) {
    const s = new PickStandIn(assayProto(shape), { color: colorOf(r.v), transparent: false, opacity: 1, side: THREE.FrontSide });
    if (!placeAssayMarker(s, shape, at, r, 1 + r.v / 30, 2, -1)) continue;
    s.userData = { k: r.k };
    g.add(s);
  }
  buildLayerBatches(g);
  return g;
}
function newPath(shape, list = rows) {
  const g = new THREE.Group(), b = makeAssayBatcher();
  for (const r of list) b.add(assayProto(shape), { color: colorOf(r.v), transparent: false, opacity: 1, side: THREE.FrontSide }, (t) => placeAssayMarker(t, shape, at, r, 1 + r.v / 30, 2, -1), () => ({ k: r.k }));
  b.finish(g);
  buildLayerBatches(g);
  return g;
}

test("the batcher's compact batch holds the same matrices, colours and rows as the stand-in path, spheres and along the hole", () => {
  for (const shape of ["sphere", "trace"]) {
    const a = oldPath(shape).children[0].userData.compact, b = newPath(shape).children[0].userData.compact;
    assert.equal(b.rows.length, a.rows.length);
    for (let i = 0; i < a.base.length; i++) assert.ok(Math.abs(a.base[i] - b.base[i]) < 1e-4, `${shape} base[${i}]`);
    assert.deepEqual(b.rows.map((r) => r.k), a.rows.map((r) => r.k));
  }
  const o = oldPath("sphere").children[0], n = newPath("sphere").children[0];
  assert.deepEqual(Array.from(n.instanceColor.array).map((v) => +v.toFixed(5)), Array.from(o.instanceColor.array).map((v) => +v.toFixed(5)));
  assert.equal(n.material.color.getHex(), 0xffffff, "a white batch material (instanceColor multiplies it)");
});

test("members read through eachLayerMember as before; a small family is drawn as plain meshes", () => {
  const g = newPath("sphere");
  let seen = 0; eachLayerMember(g, (m) => { seen++; assert.ok(m.userData.k >= 0 && m.material.color.isColor); });
  assert.equal(seen, rows.length);
  const few = newPath("sphere", rows.slice(0, BATCH_MIN - 1));
  assert.ok(few.children.every((c) => c.isMesh && !c.isInstancedMesh && !c.isPickStandIn), "promoted to real meshes by buildLayerBatches");
  assert.equal(few.children.length, BATCH_MIN - 1);
});

test("the element range: the same numbers as before, and worked out once per samples array, source and element", () => {
  const assays = Array.from({ length: 5000 }, (_, i) => ({ values: { Fe: i % 7 === 0 ? null : (i * 13) % 997 / 10, Si: i % 11 ? (i % 50) : "x" }, src: i % 3 ? "lab" : "pxrf" }));
  const shown = (a) => a.src === "lab";
  for (const sym of ["Fe", "Si"]) {
    const vals = assays.filter((a) => a.values[sym] != null && shown(a)).map((a) => a.values[sym]);
    const finite = vals.filter(Number.isFinite).sort((x, y) => x - y);
    const q = (pp) => (finite.length ? finite[Math.min(finite.length - 1, Math.floor(pp * (finite.length - 1)))] : undefined);
    assert.deepEqual(assayRange(assays, sym, "lab", shown), { ...minMax(vals), p50: q(0.5), p90: q(0.9), n: finite.length }, sym);
  }
  assert.equal(assayRange(assays, "Fe", "lab", shown), assayRange(assays, "Fe", "lab", shown), "kept");
  assert.notEqual(assayRange(assays, "Fe", "both", () => true), assayRange(assays, "Fe", "lab", shown), "per source");
  assert.deepEqual(assayRange(assays, "Zn", "lab", shown), { min: 0, max: 0, p50: undefined, p90: undefined, n: 0 });
});

test("wiring: buildAssaySpheres writes through the batcher and the cached ranges", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /const ranges = Object\.fromEntries\(assayDisplayElements\.map\(\(sym\) => \[sym, assayRange\(assays, sym, assaySource, assayRowShown\)\]\)\);/);
  assert.match(v, /batcher\.add\(assayProto\(shape\), \{ color: assayColorFor\(v, idx, style\)/);
  assert.match(v, /batcher\.finish\(into\);\r?\n\s*buildLayerBatches\(into\);/);
});
