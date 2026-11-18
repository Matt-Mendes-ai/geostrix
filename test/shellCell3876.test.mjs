// TASKS.csv #3876 (#3816 / #3785's leftover) — when the runs at the cut-off are shorter than the grade shell's cell, the notice proposes the
// cell that would follow them (about the run, rounded, never under the composite length) and what it costs in cells.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { niceNumber } from "../src/lib/auto/autoCommon.js";

test("the proposed cell: the run rounded, never under the composite; its cost in cells", () => {
  const src = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(src, /const propose = atMed < cs \? Math\.max\(numericUseComposites \? Number\(numericCompositeLength\) \|\| 0 : 0, niceNumber\(atMed\) \|\| 0\) : 0;/);
  assert.match(src, /A cell of about \{p\} m would follow the runs \(Cell size in this pane\), at about \{k\} times as many cells\./);
  // runs of 2.3 m with 1 m composites under a 10 m cell: about 2.5 m, 64 times the cells; with 4 m composites, 4 m
  const propose = (at, comp) => Math.max(comp, niceNumber(at));
  assert.equal(propose(2.3, 1), 2.5); assert.equal(Math.round((10 / 2.5) ** 3), 64);
  assert.equal(propose(2.3, 4), 4);
});
