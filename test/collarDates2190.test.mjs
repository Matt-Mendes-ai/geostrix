// TASKS.csv #2190 (review #2174, WA gold) — STARTDATE / ENDDATE on 242 holes (194 and 197 distinct values) were dropped without a word
// by the 100-distinct-value rule: date columns are now kept with each hole, and what is still left out is named in the notice (#2492)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isDateHeader, collarAlwaysKept } from "../src/lib/collarAttrs.js";
import { surfaceAttrColumns } from "../src/lib/geochem.js";

test("date headers: the review's and common spellings; not words that merely contain 'date'", () => {
  for (const h of ["STARTDATE", "ENDDATE", "Start_Date", "COMPLETION_DATE", "Drill_Dt", "sampled_tstamp", "Date", "DateDrilled"]) assert.ok(isDateHeader(h), h);
  for (const h of ["Update", "Candidate", "Validated", "Mandate", "Depth", "Dip"]) assert.ok(!isDateHeader(h), h);
});

test("on 242 holes the dates go over the 100-value rule but are kept; a mapped column is never added", () => {
  const headers = ["HOLEID", "EAST", "NORTH", "RL", "PROJECTCODE", "STARTDATE", "ENDDATE", "BATCHNO"];
  const rows = Array.from({ length: 242 }, (_, i) => ({ HOLEID: `H${i}`, EAST: 400000 + i, NORTH: 6500000 + i, RL: 300, PROJECTCODE: "P1", STARTDATE: `2019-${1 + (i % 12)}-${1 + (i % 28)} ${i}:00`, ENDDATE: `2019-${1 + (i % 12)}-${2 + (i % 27)} ${i}:30`, BATCHNO: `B${i}` }));
  const mapping = { hole_id: "HOLEID", x: "EAST", y: "NORTH", z: "RL" };
  const attrCols = surfaceAttrColumns(headers, rows, mapping);
  assert.deepEqual(attrCols, ["PROJECTCODE"]); // the rule alone
  for (const c of collarAlwaysKept(headers, mapping)) if (!attrCols.includes(c)) attrCols.push(c);
  assert.deepEqual(attrCols, ["PROJECTCODE", "STARTDATE", "ENDDATE"]);
  assert.deepEqual(collarAlwaysKept(headers, { ...mapping, _c0: "STARTDATE" }), ["ENDDATE"]);
  // BATCHNO (242 distinct, not a date) is the one the notice names as not imported
  const notKept = headers.filter((h) => !attrCols.includes(h) && !Object.values(mapping).includes(h));
  assert.deepEqual(notKept, ["BATCHNO"]);
});

test("the collar commit uses it", () => {
  const u = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /import \{ collarAlwaysKept(, firstPerHole)? \} from "\.\.\/\.\.\/lib\/collarAttrs\.js";/); // firstPerHole: #2172
  assert.match(u, /for \(const c of collarAlwaysKept\(collarHdrs, attrMapping\)\) if \(!attrCols\.includes\(c\)\) attrCols\.push\(c\);/);
});
