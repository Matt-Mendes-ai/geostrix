// TASKS.csv #2159 (WA drillhole review) — -999 / -999.25 / -9999 / -99999 read as missing in collar, survey and interval numbers
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { num, isNullSentinel } from "../src/lib/layers.js";

test("#2159 num(): the no-data codes are missing, exact values only", () => {
  for (const v of [-999, "-999", "-999.25", " -9999 ", "-99999", -999999, "-999.0"]) assert.ok(Number.isNaN(num(v)), String(v));
  for (const [v, want] of [["-998", -998], ["-1000", -1000], [-999.5, -999.5], ["2.65", 2.65], [0, 0], ["-60", -60]]) assert.equal(num(v), want, String(v));
  assert.equal(isNullSentinel("-999.25"), true); assert.equal(isNullSentinel(""), false); assert.equal(isNullSentinel("abc"), false);
});

test("#2159 the import counts them per mapped column and says so", () => {
  const p = readFileSync(new URL("../src/modules/viewer/useImportPipeline.js", import.meta.url), "utf8");
  assert.match(p, /if \(v != null && v !== "" && isNullSentinel\(v\)\) hits\.set\(c/);
  assert.match(p, /were read as missing: \{cols\}/);
});
