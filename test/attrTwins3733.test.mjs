// TASKS.csv #3733 — collar attribute values that are one value spelled two ways are named after the import (synthetic rows).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attrTwinGroups } from "../src/lib/attrTwins.js";

test("attrTwinGroups: case, spaces and a trailing generic word; numbers and unrelated values left alone", () => {
  const rows = [..."aabbccd"].map((c, i) => ({ zone: ({ a: "D Zone", b: "D zone", c: "South", d: "South Zone" })[c === "a" ? "a" : c === "b" ? "b" : c === "c" ? "South" : "d"] ?? "x", year: String(1990 + (i % 2)), kind: i % 2 ? "RC" : "DD" }));
  rows[4] = { zone: "South", year: "1990", kind: "DD" }; rows[5] = { zone: "South", year: "1991", kind: "RC" }; rows[6] = { zone: "South Zone", year: "1990", kind: "DD" };
  rows.push({ zone: "P zone", year: "1990", kind: "DD" }, { zone: "0", year: "1991", kind: "RC" });
  const g = attrTwinGroups(rows, ["zone", "year", "kind"]);
  assert.deepEqual(g.map((x) => [x.col, x.values.map((v) => `${v.value}:${v.n}`)]), [["zone", ["D Zone:2", "D zone:2"]], ["zone", ["South:2", "South Zone:1"]]]);
  assert.deepEqual(attrTwinGroups([{ a: "1" }, { a: "1.0" }], ["a"]), [], "numbers are not twins");
  assert.deepEqual(attrTwinGroups([{ a: "x" }, { a: "x" }], ["a"]), [], "one value");
});

test("wiring: the collar import notice names them", () => {
  const s = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(s, /const tw = attrTwinGroups\(ranked\.rows, attrCols\)\.slice\(0, 4\);/);
});
