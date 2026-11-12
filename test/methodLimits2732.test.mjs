// TASKS.csv #2732 — QAQC names the detection limit of each lab method an element was joined from
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { methodDetectionLimits } from "../src/lib/qaqc.js";

test("samples grouped by the method column of their value, each with its '<' limit", () => {
  const rows = [
    ...Array.from({ length: 6 }, () => ({ values: { U: 0.25 }, qualifiers: { U: "<" } })), // main column, <0.5
    ...Array.from({ length: 4 }, (_, i) => ({ values: { U: 3 + i } })),
    ...Array.from({ length: 3 }, () => ({ values: { U: 1 }, qualifiers: { U: "<" }, valueSources: { U: "U_103" } })), // <2
    { values: { U: 9 }, valueSources: { U: "U_103" } },
  ];
  const m = methodDetectionLimits(rows, "U");
  assert.deepEqual(m.map((g) => [g.method, g.n, g.limit, g.basis]), [[null, 10, 0.5, "lt"], ["U_103", 4, 2, "lt"]]);
});

test("one method column: nothing to say", () => {
  assert.deepEqual(methodDetectionLimits([{ values: { U: 1 } }, { values: { U: 2 } }], "U"), []);
});

test("wired: a note under the limit when the methods' limits differ", () => {
  const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(q, /const methodLimits = useMemo\(\(\) => methodDetectionLimits\(labAssays\(assays\), symbol\), \[assays, symbol\]\);/);
  assert.match(q, /methodLimits\.length > 1 && new Set\(methodLimits\.map\(\(m\) => m\.limit\)\)\.size > 1/);
});
