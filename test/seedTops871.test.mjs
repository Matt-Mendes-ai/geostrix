// TASKS.csv #871 — picks seeded at the logged tops of a unit, by the implicit tool's rules
import { test } from "node:test";
import assert from "node:assert/strict";
import { codedRuns, topsForCode } from "../src/lib/modellingCodes.js";
import { seedPicksFromTops } from "../src/lib/explicitUnits.js";
import { roleForLithology } from "../src/lib/layers.js";

const rows = [
  { hole_id: "H1", from: 0, to: 5, value: "CAS" }, { hole_id: "H1", from: 5, to: 20, value: "DACT" }, // under casing: not a top
  { hole_id: "H2", from: 0, to: 10, value: "AND" }, { hole_id: "H2", from: 10, to: 30, value: "DACT" }, // a real top at 10 m
  { hole_id: "H3", from: 0, to: 12, value: "DACT" }, // at the hole start: not a top
  { hole_id: "H4", from: 0, to: 8, value: "AND" }, { hole_id: "H4", from: 8, to: 9, value: "DACT" }, { hole_id: "H4", from: 9, to: 15, value: "AND" }, { hole_id: "H4", from: 15, to: 25, value: "DACT" }, // two tops: the shallowest
  { hole_id: "H5", from: 0, to: 6, value: "AND" }, { hole_id: "H5", from: 6, to: 20, value: "DACT" }, // already picked
  { hole_id: "H6", from: 0, to: 4, value: "AND" }, { hole_id: "H6", from: 4, to: 20, value: "DACT" }, // no trace
];
const role = (v) => (roleForLithology(v) === "overburden" ? "overburden" : "stratigraphic"); // the app's default role (ViewerModule mcodeDefaultRole)

test("#871 the logged tops exclude casing and hole starts; one pick per hole, existing picks kept", () => {
  const runs = codedRuns(rows, null, () => null);
  const { tops, skipped } = topsForCode(runs, "DACT", null, role);
  assert.equal(skipped.belowRole, 1); assert.equal(skipped.holeStart, 1);
  const t = tops.map((r) => ({ hole_id: r.hole_id, md: r.from, above: r.above?.code ?? null, below: r.code }));
  const existing = [{ id: "a", hole_id: "H5", md: 6, x: 0, y: 0, z: 0 }];
  const r = seedPicksFromTops(existing, t, (h, md) => (h === "H6" ? null : [1, 2, -md]), (i) => `n${i}`);
  assert.deepEqual(r.picks.map((p) => [p.hole_id, p.md, p.above, p.below, p.z]), [["H2", 10, "AND", "DACT", -10], ["H4", 8, "AND", "DACT", -8]]);
  assert.equal(r.had, 1); assert.equal(r.noTrace, 1);
  assert.ok(r.picks.every((p) => p.src === "boundary" && p.seeded));
});

test("#871 casing and overburden codes are overburden by default", () => {
  for (const c of ["CAS", "cas", "OVB", "Casing", "OB", "OBN"]) assert.equal(roleForLithology(c), "overburden", c);
  assert.equal(roleForLithology("DACT"), "stratigraphic");
});
