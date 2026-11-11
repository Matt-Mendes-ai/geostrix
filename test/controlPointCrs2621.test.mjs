// TASKS.csv #2621 (re-test of #2489) — the control-point CRS question does not offer 'keep them, no CRS'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the control-point caller asks with noLocalGrid, and the request carries it to the dialog", () => {
  assert.match(src("../src/modules/viewer/useImportPipeline.js"), /The collars are placed in it\.", \{ fileName: importModal\.fileName \}\), pts, null, \{ noLocalGrid: true \}\)/);
  assert.match(src("../src/lib/projectCrsRequest.js"), /detail: \{ reason, points, suggested, noLocalGrid: !!opts\.noLocalGrid, (family: opts\.family \|\| null, )?resolve \}/);
  assert.match(src("../src/App.jsx"), /noLocalGrid=\{!!crsRequest\.noLocalGrid\}/);
});

test("the dialog neither shows nor pre-selects the local-grid answer then", () => {
  const m = src("../src/components/ProjectCrsModal.jsx");
  assert.match(m, /useState\(\(\) => !noLocalGrid && !project\.crsSet/);
  assert.match(m, /\{!noLocalGrid && <div role="radio"/);
});
