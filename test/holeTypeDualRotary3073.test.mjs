// TASKS.csv #3073 (#2900 (6), WA review) — a collar file's Drill Code 'DualRotary' became the hole-type class 'DUALROTARY'; dual-rotary (dual-wall
// pipe) drilling is a method of its own, named like the others. A method the table does not know is still kept, in capitals (case variants merge).
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHoleType } from "../src/lib/holeType.js";

test("dual rotary, however it is written, is the class 'Dual rotary'", () => {
  for (const raw of ["DualRotary", "Dual Rotary", "DUAL-ROTARY", "dual_rotary", "DualRot", "Dual wall rotary", "Dual tube"]) assert.equal(normalizeHoleType(raw), "Dual rotary", raw);
});

test("the other classes and an unknown method are unchanged", () => {
  assert.equal(normalizeHoleType("RC"), "Reverse circulation (RC)");
  assert.equal(normalizeHoleType("Rotary"), "Percussion / rotary");
  assert.equal(normalizeHoleType("DD"), "Diamond (DD)");
  assert.equal(normalizeHoleType("Costean"), "COSTEAN");
  assert.equal(normalizeHoleType("DR"), "DR", "DR alone is not read as dual rotary: too short to be sure");
});
