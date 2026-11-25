// TASKS.csv #4075 — the startup JavaScript was 1,987.7 kB of its 2,000 kB budget (the step panes and dialogs of #4069-#4074 had pulled ~12 kB in). What the first screen does not need is now behind a
// dynamic import: the step pane shell, the hole filter bar, the Rasters & terrain section (only a project that has one draws it), the AI app's view / model actions (loaded by the first request),
// the vector-export builder (the first export) and the interpretation snap (the first click while interpreting). Pinned here so a later static import does not undo it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const vm = read("src/modules/ViewerModule.jsx");

test("#4075 ViewerModule imports none of the moved parts statically", () => {
  for (const f of ["StepPane.jsx", "HoleFilterBar.jsx", "RastersTerrainSection.jsx", "vectorFeatures.js", "interpretSnap.js", "mcpViewAction.js", "mcpModelAction.js"]) {
    assert.ok(!new RegExp(`^import [^\\n]*from "[^"]*${f.replace(".", "\\.")}"`, "m").test(vm), `${f} is not a static import of ViewerModule`);
  }
  assert.match(vm, /const StepPane = lazyPart\(\(\) => import\("\.\.\/components\/StepPane\.jsx"\)\)/);
  assert.match(vm, /const HoleFilterBar = lazyPart\(\(\) => import\("\.\/viewer\/HoleFilterBar\.jsx"\)\)/);
  assert.match(vm, /const RastersTerrainSection = lazyPart\(\(\) => import\("\.\/viewer\/RastersTerrainSection\.jsx"\)\)/);
  assert.ok(vm.includes("{(rasters.length > 0 || terrain) && <RastersTerrainSection"), "a project with no raster or terrain does not even load the section");
});

test("#4075 the export builder and the interpretation snap are awaited where they are used", () => {
  assert.ok(vm.includes('(await import("../lib/viewer/vectorFeatures.js")).buildVectorFeatures(...a)'));
  assert.equal((vm.match(/= built \|\| await buildVectorFeatures\(kind, key\);/g) || []).length, 4, "the four vector exports (shapefile, GeoPackage, DXF, GOCAD)");
  assert.ok(vm.includes("const onInterpretClick = useCallback(async (e) => {") && vm.includes("const world = await snapInterpretClick("));
});

test("#4075 the AI app's hooks load their work on the first request, and answer as before", () => {
  const v = read("src/modules/viewer/useMcpViewActions.js"), m = read("src/modules/viewer/useMcpModelActions.js");
  assert.ok(v.includes('import("./mcpViewAction.js")') && !/^import .*mcpViewAction/m.test(v));
  assert.ok(m.includes('import("./mcpModelAction.js")') && !/^import .*mcpModelAction/m.test(m));
  assert.ok(v.includes("p?.reply?.(r)") && m.includes("p?.reply?.(r)") && v.includes('fail("The view could not be changed.")') && m.includes('fail("The model could not be built.")'), "a failed load is answered, not left hanging");
  assert.ok(!/^export function (viewAction|modelAction)/m.test(v + m), "the work is in the *Action files");
  assert.ok(/^export function viewAction/m.test(read("src/modules/viewer/mcpViewAction.js")) && /export (async )?function modelAction/.test(read("src/modules/viewer/mcpModelAction.js")));
});

test("#4075 what the first screen would otherwise wait for is fetched when idle, after the first frame", () => {
  assert.match(vm, /preloadWhenIdle\(\[\(\) => import\("\.\.\/components\/StepPane\.jsx"\), \(\) => import\("\.\/viewer\/HoleFilterBar\.jsx"\), \(\) => import\("\.\/viewer\/RastersTerrainSection\.jsx"\)\]\)/);
  const p = read("src/lib/idlePreload.js");
  assert.ok(p.includes("requestIdleCallback") && p.includes("setTimeout") && p.includes(".catch(() => {})") && p.includes('typeof window === "undefined"'));
});
