// TASKS.csv #2527 (review #2486, WA lithium) — Implicit surface on a raw lithology code: a start with nothing logged above it (the collar, an
// unlogged start, a gap) is not a top, as the Modelling-codes branch and the Explicit surface tool already rule
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intervalEndIndex } from "../src/lib/viewer/intervals.js";
import { depthIndexAt } from "../src/lib/viewer/intervals.js"; // #2931 — was ends.get(depthKey(...))

// the rule the raw-code branch applies, on the review's three kinds of start
const rows = [
  { hole_id: "BENCH1", from: 0, to: 15, value: "P" },            // collared in pegmatite: a hole start
  { hole_id: "RC2", from: 0, to: 10, value: "CL" }, { hole_id: "RC2", from: 10, to: 30, value: "P" }, // a logged contact
  { hole_id: "RC3", from: 12, to: 20, value: "P" },               // logging starts at 12 m: an unlogged start
  { hole_id: "RC4", from: 0, to: 8, value: "CL" }, { hole_id: "RC4", from: 14, to: 22, value: "P" }, // after a 6 m gap
];
const ends = intervalEndIndex(rows), first = new Map();
for (const r of rows) if (!(first.get(r.hole_id) <= r.from)) first.set(r.hole_id, r.from);
const classify = (r) => { const above = depthIndexAt(ends, r.hole_id, r.from); if (above && above.length) return "contact"; return r.from <= first.get(r.hole_id) + 1e-6 ? "holeStart" : "gap"; };

test("only a start under a logged unit is a top", () => {
  const p = rows.filter((r) => r.value === "P").map((r) => [r.hole_id, classify(r)]);
  assert.deepEqual(p, [["BENCH1", "holeStart"], ["RC2", "contact"], ["RC3", "holeStart"], ["RC4", "gap"]]);
});

test("the raw-code branch applies it and says how many it left out", () => {
  const m = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(m, /if \(!top\.upHole && !\(aboveVals && aboveVals\.length\)\) \{ if \(Number\(r\.from\) <= \(firstFrom\.get\(r\.hole_id\) \?\? Infinity\) \+ 1e-6\) holeStartSkipped\+\+; else gapSkipped\+\+; return; \}/);
  assert.match(m, /\{unitName\}: \{a\} interval start\(s\) at a hole start and \{b\} below an unlogged gap were not used as contacts/);
});
