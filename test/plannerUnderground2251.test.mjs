// TASKS.csv #2251 / #2253 (review #2174, WA gold) — the hole planner on a project drilled from underground: an uphole is normal, and the
// surface through the collars is a level between drill positions, not the ground
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("#2251 / #2253 the planner knows the collars look underground and words its notes for it", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.match(p, /const underground = useMemo\(\(\) => !groundAt && \(collars\?\.length \|\| 0\) > 1 && collarsLookUnderground\(collars, survey \|\| \[\]\)\.underground/);
  assert.match(p, /the solved hole is an uphole: normal from underground development/);
  assert.match(p, /a surface through the drill collars \(a level between drill positions, not the ground\)/);
  assert.match(p, /a level between drill positions, not the ground \(the flat plane through the data would have given \{p\} m\)/);
  assert.match(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /<PlannedHoleAddForm presetTarget=\{planTarget\}[^\n]*survey=\{survey\}/);
});
