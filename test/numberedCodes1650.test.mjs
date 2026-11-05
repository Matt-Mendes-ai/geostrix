// TASKS.csv #1650 — numbered repeats (Min_Code1..n / Min_pct1..n) are kept on the interval and counted
import { test } from "node:test";
import assert from "node:assert/strict";
import { numberedSiblings, allCodesOf } from "../src/lib/viewer/importHelpers.js";

const headers = ["Hole", "From", "To", "Min_Code1", "Min_pct1", "Min_Code2", "Min_pct2", "Min_Code3", "Min_pct3", "Min_CP_pct_D"];
test("siblings of the mapped first code and its percentage", () => {
  const s = numberedSiblings(headers, "Min_Code1", "Min_pct1");
  assert.deepEqual(s.codes, ["Min_Code2", "Min_Code3"]); assert.deepEqual(s.pcts, ["Min_pct2", "Min_pct3"]);
  assert.equal(numberedSiblings(headers, "Min_Code2"), null, "only from the first of the run");
  assert.equal(numberedSiblings(headers, "Lithology"), null);
});
test("all codes of a row, and how many were past the first", () => {
  const s = numberedSiblings(headers, "Min_Code1", "Min_pct1");
  assert.deepEqual(allCodesOf({ Min_Code1: "PY", Min_pct1: "1", Min_Code2: "CP", Min_pct2: "0.3", Min_Code3: "" }, s), { all: "PY 1 · CP 0.3", extra: 1 });
  assert.deepEqual(allCodesOf({ Min_Code1: "PY", Min_pct1: "2" }, s), { all: "PY 2", extra: 0 });
});
