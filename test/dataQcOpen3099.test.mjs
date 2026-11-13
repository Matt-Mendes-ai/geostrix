// TASKS.csv #3099 (#2937, WA iron) — Data QC opens at once with 'Checking …' and runs its check just after the dialog is painted (it took
// 1.4 s before the dialog appeared on 148,000 assays and 150,455 intervals).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the dialog starts with no result, says it is checking, and runs the check after its first paint", () => {
  const s = fs.readFileSync(new URL("../src/components/DataQCModal.jsx", import.meta.url), "utf8");
  assert.match(s, /const \[ran, setResult\] = useState\(null\);/);
  assert.match(s, /const f = requestAnimationFrame\(\(\) => \{ t = setTimeout\(\(\) => setResult\(runQC\(\)\), 0\); \}\);/);
  assert.match(s, /const result = ran \|\| NOT_YET;/);
  assert.match(s, /const NOT_YET = \{ issues: \[\], byCategory: new Map\(\), summary: \{\} \};/);
  assert.match(s, /\{!ran && <div role="status"[^>]*>\{tr\("Checking \{n\} holes…", \{ n: \(collars \|\| \[\]\)\.length \}\)\}<\/div>\}/);
  assert.doesNotMatch(s, /useState\(runQC\)/, "no longer computed before the first paint");
});
