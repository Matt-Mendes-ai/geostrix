// TASKS.csv #2747 (#1858) — Identify on a raster: the value with its unit; a picture raster (no value grid) says it holds colours only.
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { describeHits } from "../src/lib/viewer/identify.js";

const P = (x, y, z) => new THREE.Vector3(x, y, z);
const ctx = (rs) => ({ origin: { x: 0, y: 0, z: 0 }, rayDirection: new THREE.Vector3(0, -1, 0), isHole: () => false, traceOf: () => null, layerOf: () => null, rasterOf: () => rs, mapLayerOf: () => null, structureSetOf: () => null, kindOf: () => null });

test("#2747 a picture raster says 'Picture only'; a raster with values and a unit gives the unit", () => {
  const pic = { name: "Air photo", drapeMode: "flat", elevation: 0 };
  const [a] = describeHits([{ object: { userData: {}, parent: null, visible: true }, point: P(0, 0, 0), distance: 1 }], ctx(pic));
  assert.ok(a.fields.some(([k, v]) => k === "Values" && /Picture only/.test(v)));
  const grid = { nx: 1, ny: 1, x0: 0, yTop: 0, dx: 10, dy: 10, values: Buffer.from(new Float32Array([42.5]).buffer).toString("base64"), valid: null };
  const val = { name: "TMI", unit: "nT", grid, drapeMode: "flat", elevation: 0 };
  const [b] = describeHits([{ object: { userData: {}, parent: null, visible: true }, point: P(0, 0, 0), distance: 1 }], ctx(val));
  const v = b.fields.find(([k]) => k === "Value");
  assert.ok(v, JSON.stringify(b.fields));
  assert.match(v[1], / nT$/);
});
