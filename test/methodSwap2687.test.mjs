// TASKS.csv #2687 — Method pairs: 'Use this method instead' swaps the element's value for a method column's on the samples that have it
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { swapInMethod, methodPairs } from "../src/lib/qaqc.js";

const rows = [
  { hole_id: "A", from: 0, to: 1, values: { U: 100 }, methodValues: { U: { U_103: 120 } } },
  { hole_id: "A", from: 1, to: 2, values: { U: 0.5 }, qualifiers: { U: "<" }, methodValues: { U: { U_103: 3 } } },
  { hole_id: "A", from: 2, to: 3, values: { U: 80 } },
  { hole_id: "A", from: 3, to: 4, values: { U: 60 }, valueSources: { U: "U_100" }, methodValues: { U: { U_103: 66, U_101: 61 } } },
];

test("the other method becomes the value; the replaced result is kept under its own column's name", () => {
  const r = swapInMethod(rows, "U", "U_103");
  assert.equal(r.swapped, 3);
  assert.deepEqual(r.rows[0].values.U, 120);
  assert.deepEqual(r.rows[0].methodValues.U, { U: 100 });
  assert.equal(r.rows[0].valueSources.U, "U_103");
  assert.equal(r.rows[1].values.U, 3);
  assert.equal(r.rows[1].qualifiers.U, undefined, "the swapped-in result is measured");
  assert.equal(r.rows[1].methodValues.U, undefined, "a '<' limit is not kept as a method result");
  assert.equal(r.rows[2], rows[2], "a sample without the method is untouched");
  assert.deepEqual(r.rows[3].methodValues.U, { U_101: 61, U_100: 60 });
});

test("swapping back restores the values, and the pairs follow", () => {
  const once = swapInMethod(rows, "U", "U_103").rows;
  const back = swapInMethod(once, "U", "U");
  assert.equal(back.rows[0].values.U, 100);
  assert.equal(back.rows[3].values.U, 66, "the third sample's U came from U_100: it swaps back from that column");
  const back2 = swapInMethod(back.rows, "U", "U_100");
  assert.equal(back2.rows[3].values.U, 60);
  assert.ok(methodPairs(once, "U").some((g) => g.header === "U"));
});

test("wired: the button asks inline, then swaps through setAssays", () => {
  const t = readFileSync(new URL("../src/components/MethodPairsTab.jsx", import.meta.url), "utf8");
  assert.match(t, /const r = swapInMethod\(assays, symbol, g\.header\); setAssays\(r\.rows\);/);
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /<MethodPairsTab methods=\{methods\} symbol=\{symbol\} unit=\{unitL\} assays=\{assays\} setAssays=\{setAssays \|\| null\} \/>/);
});
