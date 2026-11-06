// TASKS.csv #1378 — internal keys in the UI: stack tooltips said 'Move "mcode:Earn clastics" up', Parameters used said 'Gempy C O 10',
// 'Engine Dtype float32' and gave the model box as offsets from the scene origin
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { paramRows, extentText } from "../src/lib/paramRows.js";

const params = { tool: "implicit surface (GemPy)", gempyCO: 10, engineDtype: "float32", extent: [-846, 1098, -738, 916, -1560, 189], extentOrigin: [424918.44, 6641913.81, 1500], generatedAt: "2026-11-03T10:00:00Z", domain: null };

test("readable labels; the extent in project coordinates when the run kept its origin", () => {
  const rows = Object.fromEntries(paramRows(params).map((r) => [r.key, r]));
  assert.equal(rows.gempyCO.label, "GemPy covariance at lag zero (c_o)");
  assert.equal(rows.engineDtype.text, "single (float32)");
  assert.equal(rows.extent.label, "Model extent (project coordinates)");
  assert.equal(rows.extent.text, "E 424,072–426,016 · N 6,641,176–6,642,830 · Z −60–1,689".replace("−60", "-60"));
  assert.ok(!rows.extentOrigin && !rows.generatedAt && !rows.domain); // the origin, the time and empty values are not rows
  assert.equal(rows.tool.label, "Tool"); // anything else: its key spelled out, as before
});

test("an older surface (no origin) or a trend-warped run says which frame its extent is in", () => {
  assert.equal(extentText({ extent: [1, 2, 3, 4, 5, 6] }).label, "Model extent (solve frame: from the scene origin)");
  assert.match(extentText({ ...params, anisotropy: { ratio: 2 } }).label, /warped by the trend/);
  assert.equal(extentText({}), null);
});

test("the panel, the stack tooltips, the run and the export header use them", () => {
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{paramRows\(s\.params\)\.map\(\(\{ key: k, label, text \}\) =>/);
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(m, /tr\("Move \\"\{u\}\\" up in the stratigraphic stack", \{ u: display \}\)/);
  assert.ok(!/stratigraphic stack", \{ u \}\)/.test(m));
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /extentOrigin: \[originRef\.current\.x, originRef\.current\.y, originRef\.current\.z\]/);
  const x = readFileSync(new URL("../src/lib/meshExport.js", import.meta.url), "utf8");
  assert.match(x, /Solve-grid extent \(project coordinates, #1378\)/);
});
