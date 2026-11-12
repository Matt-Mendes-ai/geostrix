// TASKS.csv #2898 (review #2876, WA bedded iron) — repeat logging runs (RUN 11 to 271: 45,397 readings beside 2,539,078 of run 1, a
// calibration hole logged 27 times) were averaged into the bins with run 1: an all-number column was never a row filter (#2652). A run
// column is offered and pre-set to its main run; the box says why.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rowFilterColumns, runRowFilter, defaultRowFilter, applyRowFilter } from "../src/lib/importRowFilter.js";

const H = ["Hole_id", "Depth From", "Depth To", "Projectcode", "DEPTHSTEP", "RUN", "Density_Best"];
const runs = [1, 11, 21, 31, 41, 51, ...Array.from({ length: 22 }, (_, i) => 61 + 10 * i)]; // 28 distinct, up to 271
const rows = [];
for (let i = 0; i < 2000; i++) rows.push({ Hole_id: `RC${i % 40}`, "Depth From": String(i * 0.1), "Depth To": String(i * 0.1), Projectcode: "RH", DEPTHSTEP: "0.1", RUN: "1", Density_Best: "2.3" });
runs.slice(1).forEach((r, k) => { for (let j = 0; j < 3; j++) rows.push({ Hole_id: "RHD_GPCAL_4", "Depth From": String(10 + j), "Depth To": String(10 + j), Projectcode: "RH", DEPTHSTEP: "0.1", RUN: String(r), Density_Best: String(2 + k / 100) }); });

test("RUN (28 whole-number values) is a row filter, pre-set to run 1", () => {
  const cols = rowFilterColumns(H, rows);
  const run = cols.find((c) => c.col === "RUN");
  assert.ok(run && run.run, "offered, though all numbers and more than 12 values");
  assert.equal(run.values.length, 28);
  assert.ok(!cols.some((c) => c.col === "DEPTHSTEP" || c.col === "Density_Best"), "other number columns are still not filters (#2652)");
  const f = defaultRowFilter(H, rows);
  assert.deepEqual(f, { col: "RUN", keep: ["1"], drop: 81, flag: "run" });
  assert.equal(applyRowFilter(rows, f).dropped, 81);
});

test("no preset when no run dominates, or the column is not runs", () => {
  assert.equal(runRowFilter([{ col: "RUN", run: true, values: [["1", 50], ["2", 50]] }]), null);
  assert.equal(runRowFilter([{ col: "Priority", values: [["1", 90], ["2", 10]] }]), null);
  const text = [{ Run: "A" }, { Run: "B" }, ...Array.from({ length: 20 }, (_, i) => ({ Run: `R${i}` }))];
  assert.ok(!rowFilterColumns(["Run"], text).length, "a 'Run' of 22 text values is not a run column");
});

test("the box says why", () => {
  const b = readFileSync(new URL("../src/components/RowFilterBox.jsx", import.meta.url), "utf8");
  assert.match(b, /preset\.flag === "run" \/\* TASKS\.csv #2898 \*\//);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["{col}: {n} row(s) are repeat runs, not run {keep} (the main one): they are left out, so each depth is read once. Tick their value to keep them."], l);
});
