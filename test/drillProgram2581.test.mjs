// TASKS.csv #2581 — a planned hole had no hole type and the program one cost per metre (forgotten on reopen). A planned hole takes a type,
// the checks a rate per type kept with the project, and the rig file a type column.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { costByType, collarHoleTypes } from "../src/lib/drillProgram.js";

test("metres and cost by type; no total until every type with metres has a rate", () => {
  const holes = [{ type: "RC", length: 180 }, { type: "RC", length: 120 }, { type: "DD", length: 300 }, { type: "", length: 50 }];
  const a = costByType(holes, { RC: 90, DD: 250 });
  assert.deepEqual(a.rows.map((r) => [r.type, r.n, r.m, r.cost]), [["DD", 1, 300, 75000], ["RC", 2, 300, 27000], ["", 1, 50, null]]);
  assert.equal(a.totalM, 650);
  assert.equal(a.totalCost, null);
  assert.deepEqual(a.missing, [""]);
  const b = costByType(holes, { RC: 90, DD: 250, "": 40 });
  assert.equal(b.totalCost, 75000 + 27000 + 2000);
  assert.equal(costByType([], {}).totalCost, 0);
  assert.equal(costByType([{ length: 100 }], {}).rows[0].rate, null, "no rate is assumed");
});

test("the collars' own drill types are offered, commonest first", () => {
  const collars = [{ attrs: { Drill_Code: "AC" } }, { attrs: { Drill_Code: "AC" } }, { attrs: { Drill_Code: "RC" } }, { attrs: { hole_type: "DD" } }, { attrs: { Prospect: "X" } }];
  assert.deepEqual(collarHoleTypes(collars), ["AC", "RC", "DD"]);
});

test("the rates live in the project; the row edits the type; the rig rows carry it", () => {
  const st = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(st, /const setDrillRates = useCallback\(\(rates\) => setProject\(\(p\) => \(\{ \.\.\.p, drillRates: \(typeof rates === "function" \? rates\(p\.drillRates \|\| \{\}\) : rates\) \|\| null \}\)\), \[\]\);/);
  assert.match(readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8"), /setDrillRates\(\(prev\) => \(\{ \.\.\.prev, \[type\]:/);
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.match(p, /onChange=\{\(e\) => onUpdate\(hole\.id, \{ type: e\.target\.value \}\)\}/);
  assert.match(p, /costByType\(plannedHoles, rates\)/);
  const r = readFileSync(new URL("../src/lib/rigExport.js", import.meta.url), "utf8");
  assert.match(r, /hole_type: h\.type \|\| ""/);
});
