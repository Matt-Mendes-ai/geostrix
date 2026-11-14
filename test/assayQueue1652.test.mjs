// TASKS.csv #1652 — every assay-like file of a drop goes through the Geochem import in turn, pXRF by its name.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the 3D View hands over every file; Geochem queues them and routes pXRF by name", () => {
  assert.match(fs.readFileSync("src/modules/viewer/importPipelineImpl.js", "utf8"), /requestModuleAction\("import-assay-file", \{ files(, returnTo: [^}]*)? \}\);/);
  const g = fs.readFileSync("src/modules/GeochemModule.jsx", "utf8");
  assert.match(g, /const fs = p\?\.files \|\| \(p\?\.file \? \[p\.file\] : \[\]\); (returnToRef\.current = p\?\.returnTo \|\| null; )?enqueueAssayFiles\(fs\);/);
  assert.match(g, /handleFile\(f, \/pxrf\|xrf\/i\.test\(f\.name\)\)\.finally\(/);
  assert.match(g, /useEffect\(\(\) => \{ assayOpenRef\.current = !!assayModal; if \(!assayModal\) nextQueuedFile\(\); \}, \[assayModal\]\);/);
  assert.match(g, /enqueueAssayFiles\(files\); \/\/ #1652/);
});
