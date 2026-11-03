// TASKS.csv #1658 / #1669 (review #1646, Kodiak) — a UBC mesh is found by its content; each model is imported under its own name
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isUBCMeshText } from "../src/lib/voxel.js";

test("SJ Geophysics' 3dmesh_utm.txt head is a mesh; a model file is not", () => {
  assert.equal(isUBCMeshText("65 75 78\r\n683360.000 5510070.000 1750.000\r\n40.000 63*30.000 40.000\r\n"), true);
  assert.equal(isUBCMeshText("  10 20 5\n-1.5e3 2 300\n"), true);
  assert.equal(isUBCMeshText("1.000e-08\n1.000e-08\n2345.1\n"), false);
  assert.equal(isUBCMeshText(""), false);
});

test("the importer takes every model with the mesh, named after each model file", () => {
  const src = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.ok(src.includes("const modelFiles = files.filter((f) => f !== meshFile);"));
  assert.ok(src.includes("for (const modelFile of modelFiles) {"));
  assert.ok(src.includes("addVoxelModel({ name: modelName, source: \"ubc\","));
  assert.ok(src.includes('accept=".msh,.mod,.con,.den,.sus,.res,.chg,.sen,.txt"'));
});
