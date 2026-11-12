// TASKS.csv #2554 — the inversion's 'Ground from the stations' own elevations' replaced the project's terrain without asking and said
// 'Added the terrain'. Every terrain builder now asks first when a terrain exists and opens its note with what it replaced.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { replaceTerrainQuestion, confirmReplaceTerrain, replacedTerrainNote } from "../src/lib/terrainReplace.js";

test("no terrain: nothing asked, nothing said; a terrain: the question names both and says it is not undoable", () => {
  assert.equal(replaceTerrainQuestion(null, "Ground"), null);
  assert.equal(confirmReplaceTerrain(null, "Ground", () => { throw new Error("asked"); }), true);
  assert.equal(replacedTerrainNote(null), "");
  const q = replaceTerrainQuestion({ name: "Terrain from samples and collars" }, "Ground from the G stations");
  assert.match(q, /"Terrain from samples and collars"\) with "Ground from the G stations"/);
  assert.match(q, /not undoable/);
  let asked = null;
  assert.equal(confirmReplaceTerrain({ name: "DEM" }, "G", (x) => { asked = x; return false; }), false);
  assert.ok(asked);
  assert.equal(replacedTerrainNote({ name: "DEM" }), 'Replaced the terrain "DEM". ');
});

test("the station ground, the points / project TIN and the block-model top all ask before replacing", () => {
  const inv = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  // since #2638 the station ground is the run's own; making it the project's terrain is a separate step that still asks first
  assert.match(inv, /if \(!confirmReplaceTerrain\(projectTerrain, t\.name\)\) return;[^\n]*\r?\n\s*const replaced = replacedTerrainNote\(projectTerrain\);\r?\n\s*addTerrain\(/);
  assert.match(inv, /setGroundNote\(replaced \+ tr\("\\"\{name\}\\" is now the project's terrain\."/);
  const geo = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.equal((geo.match(/if \(!confirmReplaceTerrain\(terrain, name\)\) return;/g) || []).length, 2);
  assert.match(geo, /let msg = replaced \+ tr\(/);
  assert.match(geo, /text: replaced \+ tr\("Added the terrain/);
});
