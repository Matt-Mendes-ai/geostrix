// TASKS.csv #2249 — Undrilled zones does not cut a solid as 'air' above a ground made of underground collars
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const s = readFileSync(new URL("../src/components/UndrilledZonesPane.jsx", import.meta.url), "utf8");

test("the ground is the terrain, or the collars only when they are not underground; the result says why nothing was cut", () => {
  assert.ok(s.includes("const ug = terrain ? null : collarsLookUnderground(collars, survey);"));
  assert.ok(s.includes("const groundAt = terrain ? (x, y) => terrainGroundAt(terrain, x, y) : ug?.underground ? null : collarGround(collars);"));
  assert.ok(s.includes("underground: ug?.underground ? ug : null"));
  assert.ok(s.includes('tr("No part of the solid was cut as air: the collars look like underground collars'));
});
