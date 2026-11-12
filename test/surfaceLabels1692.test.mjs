// TASKS.csv #1692 — repeated generated-surface names are told apart (lib/viewer/surfaceLabels.js, #1192 / #2782) in the surface list and
// in the 'New version of' picker too, not only in the relationship and cut pickers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the list row and the 'New version of' options use surfaceLabels", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /\{cands\.map\(\(c\) => <option key=\{c\.id\} value=\{c\.id\}>\{surfaceLabels\.get\(c\.id\) \?\? c\.name\}<\/option>\)\}/);
  assert.match(v, /whiteSpace: "nowrap" \}\} title=\{tr\("\{vertexCount\} vertices, \{faceCount\} faces"[^\n]*\}>\{surfaceLabels\.get\(s\.id\) \?\? s\.name\}<\/div>/);
  assert.ok(!/<option key=\{c\.id\} value=\{c\.id\}>\{c\.name\}<\/option>/.test(v), "no bare name left in the picker");
});
