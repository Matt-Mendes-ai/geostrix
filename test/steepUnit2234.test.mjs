// TASKS.csv #2234 (review #2174, WA gold) — a steep monzonite (IMZ: 57 holes repeating it, 75 near-vertical pick pairs) went through the
// implicit 'top of' route, folded back at 23 of 74 locations, and nothing pointed to the closed-body / vein route; Check relationships
// called the fold-back 'usually an interpolation artefact'.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("a unit repeated in a quarter or more of its holes is said to behave like a body", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /if \(per\.size >= 4 && multi\.length \/ per\.size >= 0\.25\) setNotices\(\(p\) => \[\.\.\.p, notice\("\{unitName\} repeats in \{p\} % of the holes that log it: it behaves like a steep body or a set of sheets, not one layer\./);
});

test("the fold-back check names the other readings", () => {
  const t = readFileSync(new URL("../src/lib/topology.js", import.meta.url), "utf8");
  assert.doesNotMatch(t, /usually an interpolation artefact rather than a real overturned fold/);
  assert.match(t, /an interpolation artefact, a real overturned fold, or a unit that is not one layer/);
});
