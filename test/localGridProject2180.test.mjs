// TASKS.csv #2180 (review #2174, WA gold; Matt's decision 2026-11-09) — a local mine grid with no CRS is a project state of its own
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// the dialog request goes through a window event: a stand-in window records the reason and answers 'keep the local grid' (null)
const asked = [];
globalThis.window = { dispatchEvent: (e) => { asked.push(e.detail.reason); e.detail.resolve(null); }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init.detail; } };
const { isLocalGrid, localGridName, ensureProjectCrs, ensureExportCrs } = await import("../src/lib/projectCrsRequest.js");

test("the state: crsSet false with a localGrid; a chosen CRS is not a local grid", () => {
  assert.equal(isLocalGrid({ crsSet: false, localGrid: { name: "Wallaby" } }), true);
  assert.equal(isLocalGrid({ crsSet: false, localGrid: { name: "" } }), true);
  assert.equal(isLocalGrid({ crsSet: false }), false);
  assert.equal(isLocalGrid({ crsSet: true, epsg: 28351, localGrid: null }), false);
  assert.equal(localGridName({ crsSet: false, localGrid: { name: " Wallaby " } }), "Wallaby");
});

test("a tool that needs the real world says first it is not available on the grid; the placeholder EPSG is never returned", async () => {
  asked.length = 0;
  const p = { crsSet: false, epsg: 3156, localGrid: { name: "Wallaby mine grid" } };
  assert.equal(await ensureExportCrs(p), null);
  assert.match(asked[0], /^This project is on the local mine grid "Wallaby mine grid", with no coordinate system: this needs real-world coordinates, so it is not available\./);
  assert.equal(await ensureProjectCrs(p, "Fetching terrain needs the project's coordinate system."), null);
  assert.match(asked[1], /not available\. Keep the local grid, or choose the CRS the coordinates are really in\. Fetching terrain needs/);
  assert.equal(await ensureProjectCrs({ crsSet: true, epsg: 28351 }, "x"), 28351);
});

test("the store, the dialog's third answer, the status bar and the imports", () => {
  const st = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(st, /const setLocalGrid = useCallback\(\(name\) => setProject\(\(p\) => \(\{ \.\.\.p, crsSet: false, localGrid: \{ \.\.\.\(p\.localGrid \|\| \{\}\), name: String\(name \?\? ""\)\.trim\(\) \} \}\)\), \[\]\);/); // keeps a tie (#2288)
  assert.match(st, /epsg, crsSet: true, localGrid: null \}\)\), \[\]\);/); // a chosen CRS ends the local grid
  const m = readFileSync(new URL("../src/components/ProjectCrsModal.jsx", import.meta.url), "utf8");
  assert.match(m, /These are local mine-grid coordinates: keep them, no CRS/);
  assert.match(m, /useState\(\(\) => !noLocalGrid && !project\.crsSet && \(!!project\.localGrid \|\| \(!suggested && !!smallGrid\)\)\)/); // pre-selected by the magnitude check (not for a control-point question: #2621)
  assert.match(m, /const keepLocal = \(\) => \{ setLocalGrid\(gridName\); onDone\(null\); \};/);
  assert.match(readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8"), /project\.crsSet === false && project\.localGrid[\s\S]{0,400}\{tr\("Local grid"\)\}/);
  assert.match(readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8"), /live\.project\?\.crsSet !== false \|\| live\.project\?\.localGrid \|\|/);
  assert.match(readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8"), /project\?\.crsSet === false && !project\?\.localGrid/);
});
