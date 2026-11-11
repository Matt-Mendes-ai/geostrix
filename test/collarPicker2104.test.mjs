// TASKS.csv #2104 — the collar pickers: sorted by hole id with numbers in order, filtered by a typed text, the chosen one kept
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sortHoleIds, filterHoleIds } from "../src/lib/holeIdList.js";

test("natural order and the filter", () => {
  assert.deepEqual(sortHoleIds(["DH-10", "dh-2", "TF24-126", "DCL10-01", "DH-1"]), ["DCL10-01", "DH-1", "dh-2", "DH-10", "TF24-126"]);
  assert.deepEqual(filterHoleIds(["DH-1", "DH-10", "TF24-126"], "tf"), ["TF24-126"]);
  assert.deepEqual(filterHoleIds(["DH-1", "DH-10", "TF24-126"], "tf", "DH-10"), ["DH-10", "TF24-126"]); // the chosen one stays
  assert.deepEqual(filterHoleIds(["DH-1"], "  "), ["DH-1"]);
});

test("both pickers use it; As-drilled lists only holes with a known path", () => {
  assert.match(fs.readFileSync("src/components/PlannedHoleParts.jsx", "utf8"), /<CollarPicker ids=\{collars\.map\(\(c\) => c\.hole_id\)\} value=\{fromCollarId\}/);
  const t = fs.readFileSync("src/components/PlannedHoleTargeting.jsx", "utf8");
  assert.match(t, /<CollarPicker ids=\{traceable\.ids\}/);
  assert.match(t, /!holeAttitudeAssumed\(c, surveyed\.has\(c\.hole_id\) \? \[1\] : \[\]\)/);
});
