// TASKS.csv #2263 — 'Terrain from this project's samples and collars' asks before a surface through underground collars, and names it so
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");

test("the builder tests the collars, asks, and names the result for what it is", () => {
  const body = g.slice(g.indexOf("const terrainFromProject = async () => {"), g.indexOf("const importPointsTerrain = async (file) => {"));
  assert.ok(body.includes("const ug = collarsLookUnderground(collars, survey);"));
  assert.ok(body.includes("if (ug.underground && !window.confirm(tr(\"The collars look like underground collars"));
  assert.ok(body.includes('name: ug.underground ? "Surface through the collars" : "Terrain from samples and collars"'));
});
