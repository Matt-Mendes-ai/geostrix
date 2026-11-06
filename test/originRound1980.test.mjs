// TASKS.csv #1980 — after a deferred build (#1500) the effects that place objects by the scene origin run again, once, after the big
// build has set the new origin; they skip the deferred commit itself (it still has the previous project's origin)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDeferModel } from "../src/lib/viewer/buildDefer.js";

test("round goes up in the render after a marked commit only", () => {
  const d = buildDeferModel();
  d.render(); const r0 = d.round;
  d.render(); assert.equal(d.round, r0); // no mark: same round, the origin effects do not re-run
  d.mark(); assert.equal(d.skip(), true);
  d.render(); assert.equal(d.round, r0 + 1); assert.equal(d.skip(), false); // the render with the restored state: one new round
  d.render(); assert.equal(d.round, r0 + 1);
});

test("mark() schedules a render, so the round after it always comes", () => {
  const s = readFileSync(new URL("../src/lib/viewer/buildDefer.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /mark: \(\) => \{ if \(marked\.current !== seq\.current\) poke\(\(n\) => n \+ 1\); marked\.current = seq\.current; \}/);
  assert.match(s, /if \(marked\.current === seq\.current\) rounds\.current\+\+;/);
});

test("the viewer's origin-placed objects skip the deferred commit and list deferRound", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(v, /const deferRound = buildDefer\.round;/);
  for (const g of ["rasterGroupRef", "boundaryGroupRef", "mapLayerGroupRef", "surfStructGroupRef", "omfGroupRef", "terrainGroupRef", "sectionImageGroupRef"]) assert.ok(v.includes(`if (${g}.current && !buildDefer.skip())`), g);
  for (const g of ["voxelGroupRef", "sectionStringsGroupRef", "sectionLinesGroupRef", "plannedGroupRef"]) assert.ok(v.includes(`const group = ${g}.current;\n    if (!group || buildDefer.skip()) return; // #1980`), g);
  for (const deps of ["[rasters, collars, terrain, rebuildSeq, deferRound]", "[voxelModels, collars, slice3d.on, deferRound]", "[plannedHoles, deferRound]", "[designLines, collars, deferRound]", "[designStrings, collars, deferRound]", "[omfObjects, collars, rebuildSeq, deferRound]", "[terrain, collars, rebuildSeq, deferRound]", "[sections, showSectionLines, terrain, collars, deferRound]"]) assert.ok(v.includes(deps), deps);
  // they are declared after the big build effect, so in the round's render the build sets the origin first
  const big = v.indexOf("if (!groups.litho || buildDefer.skip()) return;");
  assert.ok(big > 0 && big < v.indexOf("[voxelModels, collars, slice3d.on, deferRound]") && big < v.indexOf("[rasters, collars, terrain, rebuildSeq, deferRound]"));
});
