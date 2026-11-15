// TASKS.csv #3536 (Fireweed rehearsal, Macpass) — Identify on an assay bar said "Value 0.25–1.8 ppm over 9.76–80.78 m (38 samples)" with Zn and
// Ag both on show, and a density "Value 2.708" with no unit. The line now carries its own name when the card's layer does not already say it,
// and the specific-gravity layer's tooltip its unit.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { describeHits } from "../src/lib/viewer/identify.js";
import { LAYER_META } from "../src/lib/layers.js";

const obj = (userData, parent) => ({ userData, parent, visible: true });
const ctx = (layerOf) => ({ origin: { x: 0, y: 0, z: 0 }, rayDirection: new THREE.Vector3(0, -1, 0), isHole: (id) => id === "TS19-002", traceOf: () => null, layerOf, rasterOf: () => null, mapLayerOf: () => null, structureSetOf: () => null, terrainMesh: null, kindOf: () => null });
const fieldsOf = (tip, row, layer) => { const g = {}; const [it] = describeHits([{ object: obj({ tip, row }, g), point: new THREE.Vector3(0, -10, 0), distance: 1 }], ctx((x) => (x.parent === g ? layer : null))); return it.fields; };

test("an assay bar names its element", () => {
  const f = fieldsOf("TS19-002\nAg: 0.25–1.8 ppm over 9.76–80.78 m (38 samples)", { hole_id: "TS19-002", from: 9.76, to: 12, values: { Ag: 0.25, Zn: 0.005 } }, "Assays");
  assert.deepEqual(f.find(([, v]) => /over 9\.76/.test(v)), ["Ag", "0.25–1.8 ppm over 9.76–80.78 m (38 samples)"]);
  assert.ok(!f.some(([k, v]) => k === "Value" && /over/.test(v)));
});

test("a line the card's layer already names stays 'Value'; a long name too; the density's value carries its unit", () => {
  assert.deepEqual(fieldsOf("H1\nLithology: VCL\n2–18 m", { hole_id: "TS19-002", from: 2, to: 18, value: "VCL" }, "Lithology").find(([k]) => k === "Value"), ["Value", "VCL"]);
  const long = "A very long custom layer name that goes on and on past forty";
  assert.equal(fieldsOf(`H1\n${long}: 5`, { hole_id: "TS19-002", depth: 3, value: 5 }, "Other").find(([, v]) => v === "5")[0], "Value");
  assert.equal(LAYER_META.sg.unit, "t/m³");
  const f = fieldsOf("TS19-002\nSpecific gravity: 2.708 t/m³\n@ 41 m", { hole_id: "TS19-002", from: 41, to: 42, value: 2.708 }, "Specific gravity");
  assert.deepEqual(f.find(([k]) => k === "Value"), ["Value", "2.708 t/m³"]);
});

test("wiring: the scene's numeric tooltips add the layer's unit", () => {
  const s = readFileSync(new URL("../src/modules/viewer/drillholeScene.js", import.meta.url), "utf8");
  assert.equal((s.match(/\$\{meta\.numeric \? `\$\{row\.value\}\$\{meta\.unit \? ` \$\{meta\.unit\}` : ""\}` \/\* unit: #3536 \*\/ : effectiveLabel\(groupKey, row\.value\)\}/g) || []).length, 2);
});
