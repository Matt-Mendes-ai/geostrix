// TASKS.csv #1810 / #1841 (the open parts) — Data QC runs on intervals and assays with no collars; the modelled unit layer and the
// variogram say the data are waiting for collars instead of blaming the box or the survey
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");

test("#1810 / #1841 no-collar wording", () => {
  const vm = read("modules/ViewerModule.jsx");
  assert.match(vm, /qcDisabled=\{!collars\.length && !assays\?\.length && !Object\.values\(layers\)\.some\(\(r\) => r\?\.length\)\}/);
  assert.match(vm, /: noCollarsNotice\(tr\("the modelled unit layer"\), layers, assays\)/);
  assert.match(read("components/VariogramModal.jsx"), /noCollarsNotice\(tr\("the variogram"\), layers, srcAssays\)\.text/);
  assert.doesNotMatch(read("modules/viewer/ViewerParts.jsx"), /Load some collars\/survey data first\. Scans/);
});
