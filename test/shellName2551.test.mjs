// TASKS.csv #2551 (review #2486) — two 'Li > 0.2323 % shell' rows told apart only by a time. The shell's default name carries the
// trend (#2423) and now the Model area when it is the checked holes, as Estimation's names do (#2069). The pane's ellipsoid line is #2676.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");

test("the shell's name: trend and checked holes", () => {
  assert.match(r, /const shellArea = modelArea === "checked" \? checkedHoleCount\(collars, visibleHoles\) : null;/);
  assert.match(r, /shellArea && shellArea\.checked < shellArea\.all \? `\$\{shellArea\.checked\} checked holes` : ""/);
  assert.match(r, /const label = `\$\{symbol\} > \$\{numericCutoff\} \$\{unitL\} shell\$\{shellTags\.length \? ` \(\$\{shellTags\.join\(", "\)\}\)` : ""\}`;/);
});

test("the pane still prints the ellipsoid under a trend (#2676)", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /const gt = trendFor\("gradeShell"\); if \(!gt\) return null;/);
  assert.match(p, /tr\("Along trend \\"\{name\}\\": an ellipsoid of \{searchRadius\} × \{v\} × \{v2\} m \(\{v3\}\)"/);
});
