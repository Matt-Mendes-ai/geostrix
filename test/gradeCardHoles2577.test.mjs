// TASKS.csv #2577 — the Li grade card scored 30 m aircore holes as tested and barren beside RC holes that cut the sheet at depth. A grade
// card can now read one set of holes (a collar field), and says how many holes and which depths it read.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assaysOfHoles, gradeCardReads } from "../src/lib/evidenceSources.js";
import { collarsMatching } from "../src/lib/holeFilter.js";

const collars = [{ hole_id: "AC1", attrs: { Drill_Code: "AC" } }, { hole_id: "AC2", attrs: { Drill_Code: "AC" } }, { hole_id: "RC1", attrs: { Drill_Code: "RC" } }];
const assays = [
  { hole_id: "AC1", from: 0, to: 4, values: { Li: 0.008 } }, { hole_id: "AC1", from: 26, to: 30, values: { Li: 0.01 } },
  { hole_id: "AC2", from: 0, to: 4, values: { Li: 0.007 } },
  { hole_id: "RC1", from: 120, to: 128, values: { Li: 0.02 } }, { hole_id: "RC1", from: 128, to: 190, values: { Li: 0.9 } },
];
const units = { Li: "%" };

test("the card's holes: a collar field picks them; what the card read", () => {
  const rc = new Set(collarsMatching(collars, "Drill_Code=RC").map((c) => c.hole_id));
  assert.deepEqual([...rc], ["RC1"]);
  assert.equal(assaysOfHoles(assays, rc).length, 2);
  assert.equal(assaysOfHoles(assays, null).length, 5);
  assert.deepEqual(gradeCardReads(assaysOfHoles(assays, rc), "Li", "%", units), { holes: 1, from: 120, to: 190 });
  const ac = new Set(collarsMatching(collars, "Drill_Code=AC").map((c) => c.hole_id));
  assert.deepEqual(gradeCardReads(assaysOfHoles(assays, ac), "Li", "%", units), { holes: 2, from: 0, to: 30 });
  assert.deepEqual(gradeCardReads([], "Li", "%", units), { holes: 0, from: null, to: null });
});

test("the pane filters a grade card's assays by its holes and shows the line", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.equal(p.includes("\u0000"), false, "no NUL byte in the source");
  assert.match(p, /holeGradePoints\(gradeAssaysOf\(cleanAssays, opts\), src\.ref,/);
  assert.match(p, /tr\("Reads \{n\} hole\(s\), samples from \{a\} to \{b\} m down hole/);
  assert.match(p, /aria-label=\{tr\("Holes this card reads"\)\}/);
});
