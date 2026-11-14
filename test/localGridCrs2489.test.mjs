// TASKS.csv #2489 (review #2486, WA lithium) — a local mine grid with control points, into a project whose CRS is not chosen: the import asks
// which CRS the control points are in (none chosen: nothing imported), and the notice names the chosen code, never the placeholder
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the import asks for the control points' CRS, refuses without one, and words the notice from the choice", () => {
  const p = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  const i = p.indexOf("TASKS.csv #2489"), body = p.slice(i, i + 2400);
  assert.ok(i > 0);
  assert.match(body, /if \(importStateRef\.current\.project\?\.crsSet === false\) \{/);
  assert.match(body, /transformImportRows\(importModal\.allRows, importModal\.mapping, \{ units, grid, zShift: 0 \}\)\.rows/); // where they would land: the check
  assert.match(body, /if \(!chosen\) \{ setNotices\(\(p\) => \[\.\.\.p, notice\("\{fileName\}: the local-grid transform needs the coordinate system its control points are in, and none was chosen\. Nothing was imported\."/);
  assert.match(body, /epsg: chosen, crsSet: true, localGrid: null/);
  assert.match(p, /v: importStateRef\.current\.project\?\.epsg \?\? project\?\.epsg \/\* #2489/);
});
