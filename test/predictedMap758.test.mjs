// TASKS.csv #758 — the predicted geological map: terrain grid, unit raster, agreement with mapped geology.
import test from "node:test";
import assert from "node:assert/strict";
import { terrainGrid, unitRaster, mapAgreement } from "../src/lib/predictedMap.js";

// flat 1000 m terrain over a 1 km square, 11 x 11 nodes
const terrain = { bbox: [0, 0, 1000, 1000], gridW: 11, gridH: 11, elevations: new Float32Array(121).fill(1000) };

test("grid: clipped to the terrain, spacing >= the minimum, row 0 north, capped point count", () => {
  const g = terrainGrid(terrain, [-500, 200, 600, 2000], { maxPts: 1e6, minSpacing: 25 });
  assert.deepEqual(g.bbox, [0, 200, 600, 1000]);
  assert.equal(g.nx, 24); assert.equal(g.ny, 32);
  assert.equal(g.nodes.length, 24 * 32);
  assert.ok(g.nodes[0].y > g.nodes[g.nodes.length - 1].y);
  assert.equal(g.nodes[0].z, 1000);
  const capped = terrainGrid(terrain, [0, 0, 1000, 1000], { maxPts: 100, minSpacing: 1 });
  assert.ok(capped.nodes.length <= 100 && capped.nodes.length >= 80, String(capped.nodes.length));
  assert.equal(terrainGrid(terrain, [2000, 2000, 3000, 3000]), null);
  assert.equal(terrainGrid(null, [0, 0, 1, 1]), null);
});

test("raster: unit colours, transparent where the model has no unit", () => {
  const g = { nx: 2, ny: 1, nodes: [{ i: 0, j: 0 }, { i: 1, j: 0 }] };
  const px = unitRaster(g, ["A", null], (u) => (u === "A" ? "#ff8000" : "#000"));
  assert.deepEqual([...px], [255, 128, 0, 255, 0, 0, 0, 0]);
});

test("agreement: per mapped unit, names matched loosely, unmatched map units listed apart", () => {
  // west half mapped Basalt, east half mapped DACT; the model says DACT everywhere except two west nodes = BASALT
  const g = terrainGrid(terrain, [0, 0, 1000, 1000], { maxPts: 1e6, minSpacing: 250 }); // 4 x 4
  const layer = { name: "geology", styleField: "UNIT", features: [
    { parts: [[[0, 0], [500, 0], [500, 1000], [0, 1000]]], attributes: { UNIT: "Basalt " } },
    { parts: [[[500, 0], [1000, 0], [1000, 1000], [500, 1000]]], attributes: { UNIT: "DACT" } },
    { parts: [[[0, 0], [10, 0], [10, 10]]], attributes: { UNIT: "Granite" } },
  ] };
  const units = g.nodes.map((n, k) => (n.x < 500 && k < 6 ? "BASALT" : "DACT"));
  const a = mapAgreement(g, units, layer, ["DACT", "BASALT"]);
  const by = Object.fromEntries(a.units.map((r) => [r.unit, r]));
  assert.equal(a.mappedNodes, 16);
  assert.equal(by.DACT.agree, 8); assert.equal(by.DACT.pct, 1);
  assert.equal(by["Basalt "].nodes, 8); assert.equal(by["Basalt "].agree, 4); assert.equal(by["Basalt "].pct, 0.5);
  assert.equal(by["Basalt "].modelledAs[0].unit, "BASALT");
  assert.equal(a.overall, 12 / 16);
  // a mapped unit the model does not have: listed, never scored
  const b = mapAgreement(g, units, layer, ["DACT"]);
  assert.deepEqual(b.unmatchedMapUnits, ["Basalt "]);
  assert.equal(b.units.find((r) => r.unit === "Basalt ").pct, null);
  assert.equal(b.overall, 1);
  // blank model nodes are left out of the share
  const c = mapAgreement(g, units.map((u, k) => (k === 15 ? null : u)), layer, ["DACT", "BASALT"]);
  assert.equal(c.units.find((r) => r.unit === "DACT").blank, 1);
  assert.equal(mapAgreement(g, units, { ...layer, styleField: null }, ["DACT"]), null);
});
