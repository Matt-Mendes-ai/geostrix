// TASKS.csv #1839 — two models with one name are told apart by their property in the Targeting lists
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { modelListName } from "../src/lib/modelListName.js";

test("the property joins the name only when another model shares it", () => {
  const a = { id: 1, name: "3dmesh_utm", property: "Resistivity (ohm.m)" }, b = { id: 2, name: "3dmesh_utm", property: "Chargeability (mV/V)" }, c = { id: 3, name: "Cu estimate", property: "Cu" };
  const all = [a, b, c];
  assert.equal(modelListName(a, all), "3dmesh_utm — Resistivity (ohm.m)");
  assert.equal(modelListName(b, all), "3dmesh_utm — Chargeability (mV/V)");
  assert.equal(modelListName(c, all), "Cu estimate");
  assert.equal(modelListName({ id: 4, name: "3dmesh_utm" }, all), "3dmesh_utm"); // no property to add
  assert.equal(modelListName(a, [a]), "3dmesh_utm");
});

test("the evidence list and the Voxel ranges rows use it", () => {
  assert.equal((fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8").match(/name: modelListName\(m, voxelModels\)/g) || []).length, 3);
  assert.match(fs.readFileSync("src/modules/viewer/ViewerParts.jsx", "utf8"), /\{modelListName\(model, others\)\}/);
});
