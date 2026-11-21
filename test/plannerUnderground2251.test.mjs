// TASKS.csv #2251 / #2253 (review #2174, WA gold) — the hole planner on a project drilled from underground: an uphole is normal, and the
// surface through the collars is a level between drill positions, not the ground
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
test("#2251 / #2253 the planner knows the collars look underground and words its notes for it", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.match(p, /const underground = useMemo\(\(\) => !groundAt && \(collars\?\.length \|\| 0\) > 1 && collarsLookUnderground\(collars, survey \|\| \[\]\)\.underground/);
  assert.match(p, /the hole is an uphole: normal from underground development/);
  assert.match(p, /the collar sits on a drill level, not the ground/);
  assert.match(p, /Elev is on a drill level, not the ground \(a flat plane gives \{p\} m\)/);
  assert.match(readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8"), /<PlannedHoleAddForm presetTarget=\{planTarget\}[^\n]*survey=\{survey\}/);
});
