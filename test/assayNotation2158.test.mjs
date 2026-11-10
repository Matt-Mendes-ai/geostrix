// TASKS.csv #2158 (WA drillhole review) — below-detection and not-assayed notations with no number, and -1 / -9 no-data codes
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAssayCell, columnDetectionLimit } from "../src/lib/geochem.js";

test("#2158 the column's detection limit: the lab's '<x', else its small negative code; never the smallest reading", () => {
  assert.equal(columnDetectionLimit(["<0.01", "0.5", "<0.01", "<0.02", "1.2"]), 0.01);
  assert.equal(columnDetectionLimit(["-0.005", "0.3", -0.005, "-1"]), 0.005);
  assert.equal(columnDetectionLimit(["0.3", "1.2", "BDL"]), null);
});

test("#2158 below-detection notations: half the column's limit, or blank (counted) when it states none", () => {
  for (const s of ["< LOD", "<LOD", "<DL", "BDL", "ND", "<", "n.d.", "below detection"]) assert.deepEqual(readAssayCell(s, "bdl", 0, 0.01), { value: 0.005, qualifier: "<", kind: "txt_bdl" }, s);
  assert.deepEqual(readAssayCell("BDL", "bdl", 0, null), { value: null, qualifier: null, kind: "txt_bdl_nodl" });
  assert.deepEqual(readAssayCell("<0.01"), { value: 0.005, qualifier: "<", kind: null }); // a number after '<': as before
});

test("#2158 not-assayed notations are counted, not silently blank", () => {
  for (const s of ["NULL", "X", "N/L", "-", "NA", "N/A", "NS", "NR", "LNS", "IS", "not analysed"]) assert.equal(readAssayCell(s).kind, "na_text", s);
  assert.equal(readAssayCell("1.25").value, 1.25);
  assert.equal(readAssayCell("Xx").kind, null); // only the codes, not any text
});

test("#2158 -1 and -9: no-data codes when the column's limit is something else; '<1' when it is 1; as before with no limit", () => {
  assert.equal(readAssayCell("-1", "bdl", 0, 0.01).kind, "neg_missing");
  assert.equal(readAssayCell("-9", "bdl", 0, 0.005).value, null);
  assert.deepEqual(readAssayCell("-1", "bdl", 0, 1), { value: 0.5, qualifier: "<", kind: "neg_bdl" });
  assert.equal(readAssayCell("-1", "bdl", 0, null).kind, "neg_bdl"); // unchanged without a limit
  assert.equal(readAssayCell("-0.01", "bdl", 0, 0.01).value, 0.005);
  for (const v of ["-666", "-5000", "-33330000"]) assert.equal(readAssayCell(v, "bdl", 0, 0.01).kind, "neg_missing", v);
});

test("#2158 wiring: the assay commit passes each column's limit and says the counts", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /readAssayCell\(raw, negativeMode, colMaxOf\(header\), dlOf\(header\)(, posMaxOf\(header\))?\)/); // posMaxOf: #2336
  assert.match(g, /cell\(s\) marked not assayed/);
});

test("#2158 -1 / -9 are never read as an over-limit code (a column topping out at 0.52 read -1 as '>1')", async () => {
  const { isOverLimitCode } = await import("../src/lib/geochem.js");
  assert.equal(isOverLimitCode(-1, 0.52), false);
  assert.equal(isOverLimitCode(-9, 5), false);
  assert.equal(isOverLimitCode(-10, 9.89), true); // #1648's Copley K
  assert.equal(readAssayCell("-1", "bdl", 0.52, 0.01).kind, "neg_missing");
});
