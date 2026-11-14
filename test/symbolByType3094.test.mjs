// TASKS.csv #3094 (from #3066) — the per-type USGS symbol choice is the project's (store setStructureSymbolByType, project.structureSymbolByType),
// not written onto every set holding the type: it holds for a set imported later, and an older project's per-set choices stay as the fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { projectSymbolChoices, FAMILIES } from "../src/lib/structureSymbols.js";

const fams = Object.keys(FAMILIES);
const [A, B] = fams;

test("the project's choice wins; per-set choices remain the fallback; unknown symbols are ignored", () => {
  const sets = [{ symbolByType: { fault: A, bedding: A } }, { symbolByType: { vein: B } }];
  assert.deepEqual(projectSymbolChoices(sets), { fault: A, bedding: A, vein: B }, "an older project, as before");
  assert.deepEqual(projectSymbolChoices(sets, { fault: B, contact: A, joint: "no-such-symbol" }), { fault: B, bedding: A, vein: B, contact: A });
  assert.deepEqual(projectSymbolChoices([], { contact: B }), { contact: B }, "a choice made before any set holds the type");
});

test("every reader gets the project's map, and the panel writes it through the store", () => {
  const rd = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  const v = rd("../src/modules/ViewerModule.jsx");
  assert.ok(v.includes("outcropLegendGroup({ surfaceStructures, symbolByType: store.project?.structureSymbolByType /* #3094 */ })"));
  assert.ok(v.includes("flatZ: surfaceFlatZ, symbolByType: store.project?.structureSymbolByType /* #3094 */ })"));
  assert.ok(v.includes("store.project?.structureSymbolByType /* #3094 */, rebuildSeq, deferRound]"));
  assert.ok(rd("../src/modules/LayoutModule.jsx").includes("outcropLegendGroup({ surfaceStructures, symbolByType: project?.structureSymbolByType })"));
  assert.ok(rd("../src/lib/projectKmzExport.js").includes("symbolByType: project.structureSymbolByType /* #3094 */"));
  const p = rd("../src/components/SurfaceMappingPanel.jsx");
  assert.ok(p.includes("setStructureSymbolByType(key, family || null);"));
  assert.ok(p.includes("projectSymbolChoices(surfaceStructures, project?.structureSymbolByType)"));
});
