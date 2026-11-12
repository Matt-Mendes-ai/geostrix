// TASKS.csv #2058 (the 3D View half) — the generated-surface row's show / hide eye has an accessible name and state, as the other rows' do.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the surface row's eye: 'Show or hide {name}' with the told-apart name, and its pressed state", () => {
  const v = fs.readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /onClick=\{\(\) => toggleImplicitSurface\(s\.id\)\} aria-label=\{tr\("Show or hide \{name\}", \{ name: surfaceLabels\.get\(s\.id\) \?\? s\.name \}\)\} aria-pressed=\{!!s\.visible\}/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(fs.readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Show or hide {name}"], l);
});
