// TASKS.csv #3140 step 2b — a big downhole log's layers are imported as typed columns (a rowTable Table): in the app, a 2.58 M-reading log (4 layers of 516,600 binned rows)
// held 697 MB more than before the import as row objects and 484 MB as Tables (850 / 636 MB a minute and a half later, once autosave has run): the pins keep the wiring.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const s = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#3140 the log import builds a Table for a layer of 20,000 rows or more, after loading the builder before the commit", () => {
  assert.match(s, /const LOG_TABLE_MIN = 20000;\nlet tableBuild = null;/);
  assert.match(s, /if \(!tableBuild && \(importModal\.logTable \|\| \(importModal\.allRows\?\.length \|\| 0\) >= LOG_TABLE_MIN\)\) tableBuild = \(await import\("\.\.\/\.\.\/lib\/rowTableBuild\.js"\)\)\.tableFromRows;/);
  assert.match(s, /if \(tableBuild && rowsOut\.length >= LOG_TABLE_MIN\) \{ const table = tableBuild\(rowsOut\); if \(isTable\(table\)\) layerOut\.rows = table; \}/);
  assert.match(s, /setCustomLayers\(\(p\) => \[\.\.\.p, isTable\(layerOut\.rows\) \? publishedLayers\(\[layerOut\]\)\[0\] : layerOut\]\);/);
});

test("#3140 a layer under the limit keeps its rows (nothing new to go wrong for a small log)", () => {
  assert.match(s, /rowsOut\.length >= LOG_TABLE_MIN/);
  assert.ok(!/rowTableBuild\.js"\)\)\.tableFromRows;[^\n]*\n[^\n]*static/.test(s));
  assert.ok(!/^import .*rowTableBuild/m.test(s), "the builder stays a lazy chunk, out of the startup bundle");
});
