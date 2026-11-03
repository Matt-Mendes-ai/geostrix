// TASKS.csv #1350 — an assay file dropped on the 3D View opens in the Geochem assay import instead of stopping at a notice
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pipe = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
const geo = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");

test("the drop paths queue the assay file and hand it over", () => {
  assert.doesNotMatch(pipe, /notice\("\{name\} looks like assay data/); // the old dead-end notice
  assert.equal(pipe.split("assayHandoffRef.current.push(file)").length - 1, 2); // single file and folder queue
  assert.match(pipe, /assayHandoffRef\.current\.push\(file\); handOverAssays\(\);/); // a single file: at once
  assert.match(pipe, /importQueueTotalRef\.current = 0; handOverAssays\(\); return; \}/); // a folder: when the queue is done
  assert.match(pipe, /goToModule\("geochem"\);\s*requestModuleAction\("import-assay-file", \{ file: files\[0\] \}\);/);
});

test("Geochem opens a handed-over file as if picked with Import", () => {
  assert.match(geo, /useModuleAction\(\["import-assay-file"\], \(_a, p\) => \{ if \(p\?\.file\) handleFile\(p\.file, false\); \}\);/);
});
