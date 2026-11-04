// TASKS.csv #1684 (review #1645, Copley) — the base of overburden from the logs: overburdenBases() lists where an overburden unit
// ends on a logged unit in every hole; a start directly under overburden is counted apart from the other non-tops and becomes a
// top only when the caller asks (the stack's unit directly below the overburden)
import test from "node:test";
import assert from "node:assert/strict";
import { codedRuns, topsForCode, overburdenBases, startsBelowNonUnit, startsBelowOverburden } from "../src/lib/modellingCodes.js";

const mc = { codes: [{ name: "OVB", role: "overburden", order: 0 }, { name: "B", role: "stratigraphic", order: 1 }, { name: "C", role: "stratigraphic", order: 2 }, { name: "FLT", role: "cross-cutting" }], assign: {}, ties: [] };
const role = () => "stratigraphic";
const rows = [
  { hole_id: "H1", from: 0, to: 5, value: "OVB" }, { hole_id: "H1", from: 5, to: 40, value: "B" }, { hole_id: "H1", from: 40, to: 90, value: "C" },
  { hole_id: "H2", from: 0, to: 8, value: "OVB" }, { hole_id: "H2", from: 8, to: 60, value: "C" }, // B eroded: overburden rests on C
  { hole_id: "H3", from: 0, to: 3, value: "OVB" }, { hole_id: "H3", from: 3, to: 4, value: "OVB" }, { hole_id: "H3", from: 4, to: 30, value: "B" }, // a split overburden row is one run
  { hole_id: "H4", from: 0, to: 12, value: "OVB" }, // ends inside the overburden: no base
  { hole_id: "H5", from: 0, to: 6, value: "OVB" }, { hole_id: "H5", from: 9, to: 50, value: "B" }, // an unlogged gap under it
  { hole_id: "H6", from: 0, to: 2, value: "OVB" }, { hole_id: "H6", from: 2, to: 7, value: "FLT" }, { hole_id: "H6", from: 7, to: 50, value: "B" },
];
const runs = codedRuns(rows, mc, null);

test("#1684 overburdenBases: one base per hole where the overburden ends on a logged unit, whatever that unit is", () => {
  const { bases, skipped } = overburdenBases(runs, mc, role, "OVB");
  assert.deepEqual(bases.map((b) => [b.hole_id, b.md, b.below]), [["H1", 5, "B"], ["H2", 8, "C"], ["H3", 4, "B"], ["H6", 2, "FLT"]]);
  assert.equal(skipped.holeEnd, 2, "H4 ends inside it, H5 has a gap under it");
  assert.equal(bases[0].row.value, "B"); assert.equal(bases[0].ovbRow.to, 5);
  const byRole = overburdenBases(runs, mc, role); // no match: every overburden-role code
  assert.equal(byRole.bases.length, 4);
  const byFn = overburdenBases(runs, mc, role, (r) => r.hole_id === "H2" && r.code === "OVB");
  assert.deepEqual(byFn.bases.map((b) => b.hole_id), ["H2"]);
});

test("#1684 topsForCode: a start under overburden is counted apart and is a top only when asked", () => {
  const off = topsForCode(runs, "B", mc, role);
  assert.deepEqual(off.tops.map((t) => t.hole_id), ["H1"].filter(() => false), "H1 and H3 start under overburden, H5 below a gap, H6 under a fault");
  assert.deepEqual(off.skipped, { holeStart: 0, gap: 1, belowRole: 1, olderAbove: 0, underOverburden: 2 });
  const on = topsForCode(runs, "B", mc, role, { underOverburden: true });
  assert.deepEqual(on.tops.map((t) => [t.hole_id, t.from]), [["H1", 5], ["H3", 4]]);
  assert.equal(on.skipped.underOverburden, 0);
  // C under overburden in H2 is still not C's top on its own (it belongs to the base of overburden = the unit under it in a stack)
  assert.deepEqual(topsForCode(runs, "C", mc, role).skipped.underOverburden, 1);
});

test("#1684 startsBelowNonUnit honours the option; startsBelowOverburden tells overburden from a fault", () => {
  assert.equal(startsBelowNonUnit(["OVB"], mc, null, role), true);
  assert.equal(startsBelowNonUnit(["OVB"], mc, null, role, { underOverburden: true }), false);
  assert.equal(startsBelowNonUnit(["FLT"], mc, null, role, { underOverburden: true }), true, "a fault above is still not a top");
  assert.equal(startsBelowOverburden(["OVB"], mc, null, role), true);
  assert.equal(startsBelowOverburden(["FLT"], mc, null, role), false);
  assert.equal(startsBelowOverburden([], mc, null, role), false);
});
