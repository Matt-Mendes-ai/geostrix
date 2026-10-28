// TASKS.csv #1070 (review #1016) — the rows an importer leaves out are counted, with the reason and examples.
import test from "node:test";
import assert from "node:assert/strict";
import { skippedRowsText, normNumericInterval } from "../src/lib/viewer/importHelpers.js";

test("#1070 the review's RQD file: 3 of 5 rows skipped, value not a number (NR, <10, (blank))", () => {
  const raw = [{ h: "DH1", f: "0", t: "3", v: "85" }, { h: "DH1", f: "3", t: "6", v: "NR" }, { h: "DH1", f: "6", t: "9", v: "<10" }, { h: "DH1", f: "9", t: "12", v: "" }, { h: "DH1", f: "12", t: "15", v: "40" }];
  const mapping = { hole_id: "h", from: "f", to: "t", value: "v" };
  const dropped = [];
  raw.forEach((r) => { const n = normNumericInterval(r, mapping, []); if (isNaN(n.value)) dropped.push({ reason: "no value", example: r.v }); });
  assert.equal(skippedRowsText(dropped, raw.length), " Skipped 3 of 5 row(s): 3 value not a number (NR, <10, (blank)).");
});

test("#1070 several reasons, examples capped at three, nothing to say -> empty", () => {
  const t = skippedRowsText([{ reason: "no hole id" }, { reason: "no from", example: "" }, { reason: "no from", example: "x" }, { reason: "no from", example: "y" }, { reason: "no from", example: "z" }], 10);
  assert.equal(t, " Skipped 5 of 10 row(s): 1 no hole id; 4 blank or non-numeric From ((blank), x, y).");
  assert.equal(skippedRowsText([], 4), "");
});
