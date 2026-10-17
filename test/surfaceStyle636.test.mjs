// TASKS.csv #636 — generated-surface colour / opacity
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { mergeSurfaceStyle, applySurfaceStyle, surfaceBaseLook } from "../src/lib/surfaceStyle.js";

const mesh = (opts = {}) => new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: 0xc8a24a, transparent: true, opacity: 0.75, ...opts }));

test("merge keeps only valid parts and drops cleared ones", () => {
  assert.deepEqual(mergeSurfaceStyle(undefined, { color: "#FF0000" }), { color: "#ff0000" });
  assert.deepEqual(mergeSurfaceStyle({ color: "#ff0000" }, { opacity: 2 }), { color: "#ff0000", opacity: 1 });
  assert.equal(mergeSurfaceStyle({ color: "#ff0000" }, { color: null }), undefined);
  assert.equal(mergeSurfaceStyle({ color: "#ff0000" }, null), undefined);
  assert.deepEqual(mergeSurfaceStyle(undefined, { color: "red" }) ?? {}, {});
});

test("a never-styled mesh is left exactly as built", () => {
  const m = mesh();
  applySurfaceStyle(m, { id: "a" });
  assert.equal(m.userData.styleOrig, undefined);
  assert.equal(m.material.color.getHex(), 0xc8a24a);
});

test("style applies, reset returns to the original (vertex colours included), the base look stays the original", () => {
  const m = mesh({ vertexColors: true, color: 0xffffff });
  applySurfaceStyle(m, { style: { color: "#2266cc", opacity: 0.4 } });
  assert.equal(m.material.color.getHex(), 0x2266cc);
  assert.equal(m.material.vertexColors, false);
  assert.equal(m.material.opacity, 0.4);
  assert.deepEqual(surfaceBaseLook(m), { color: 0xffffff, opacity: 0.75 });
  applySurfaceStyle(m, {});
  assert.equal(m.material.color.getHex(), 0xffffff);
  assert.equal(m.material.vertexColors, true);
  assert.equal(m.material.opacity, 0.75);
});

test("opacity alone keeps the original colours; full opacity on an opaque mesh stays opaque", () => {
  const m = mesh({ transparent: false, opacity: 1 });
  applySurfaceStyle(m, { style: { opacity: 0.5 } });
  assert.equal(m.material.color.getHex(), 0xc8a24a);
  assert.equal(m.material.transparent, true);
  applySurfaceStyle(m, { style: { opacity: 1 } });
  assert.equal(m.material.transparent, false);
});

test("the data-support view keeps its colours while on; opacity still applies", () => {
  const m = mesh({ vertexColors: true, color: 0xffffff });
  m.userData.baseColorHex = 0xc8a24a;
  applySurfaceStyle(m, { supportColored: true, style: { color: "#2266cc", opacity: 0.3 } });
  assert.equal(m.material.color.getHex(), 0xffffff);
  assert.equal(m.material.vertexColors, true);
  assert.equal(m.material.opacity, 0.3);
  assert.equal(m.userData.styleOrig.color, 0xc8a24a);
});
