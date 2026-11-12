// TASKS.csv #2167 (WA review #2148, T19) — the 'past the end of their hole' count: holes with no collar or no length are not counted (the
// uranium run flagged 22,404 of 22,407 rows: surveys of one 0 m station were in before the collars); the notice says how many holes could
// not be checked and where the length came from.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkableHoleLengths, importCheckSummary, runDataQC } from "../src/lib/dataQC.js";

const rows = (hole, n, step = 10) => Array.from({ length: n }, (_, i) => ({ hole_id: hole, from: i * step, to: (i + 1) * step, value: "SA" }));
const text = (m) => (m == null ? "" : typeof m === "string" ? m : m.text ?? String(m));

test("#2167 hole lengths: only holes with a collar and a length above 0 m; the deeper of collar and survey (#339), with its source", () => {
  const collars = [{ hole_id: "A", length: 50 }, { hole_id: "B", length: 30 }, { hole_id: "C" }, { hole_id: "D", length: 0 }];
  const survey = [{ hole_id: "B", depth: 45 }, { hole_id: "C", depth: 0 }, { hole_id: "X", depth: 80 }, { hole_id: "A", depth: 20 }];
  const L = checkableHoleLengths(collars, survey);
  assert.deepEqual(L.get("A"), { length: 50, source: "collar" });
  assert.deepEqual(L.get("B"), { length: 45, source: "survey" });
  assert.equal(L.has("C"), false, "a 0 m station is not a length");
  assert.equal(L.has("D"), false, "a 0 m collar length is not a length");
  assert.equal(L.has("X"), false, "a survey with no collar");
});

test("#2167 the uranium shape: rows before collars, 0 m surveys -> nothing 'past the end', the holes said not checked", () => {
  const survey = ["U1", "U2", "U3"].map((h) => ({ hole_id: h, depth: 0, azimuth: 0, dip: -90 }));
  const r = [...rows("U1", 5), ...rows("U2", 4), ...rows("U3", 6)];
  const noCollars = text(importCheckSummary(r, [], survey, "Lithology rows"));
  assert.doesNotMatch(noCollars, /past the end/);
  assert.match(noCollars, /3 hole\(s\) not checked against a hole length/);
  // collars without a length, the same 0 m surveys
  const bare = text(importCheckSummary(r, ["U1", "U2", "U3"].map((h) => ({ hole_id: h })), survey, "Lithology rows"));
  assert.doesNotMatch(bare, /past the end/);
  assert.match(bare, /3 hole\(s\) not checked/);
});

test("#2167 the notice names where the hole's length came from", () => {
  const collars = [{ hole_id: "A", length: 25 }, { hole_id: "B", length: 25 }];
  const byCollar = text(importCheckSummary(rows("A", 4), collars, [], "rows"));
  assert.match(byCollar, /2 past the end of their hole \(its length from the collar file\)/);
  const bySurvey = text(importCheckSummary(rows("B", 5), collars, [{ hole_id: "B", depth: 32 }], "rows"));
  assert.match(bySurvey, /2 past the end of their hole \(its length from the deepest survey station, deeper than the collar's\)/);
  const both = text(importCheckSummary([...rows("A", 4), ...rows("B", 5)], collars, [{ hole_id: "B", depth: 32 }], "rows"));
  assert.match(both, /4 past the end of their hole \(2 by the collar's length, 2 by the deepest survey station\)/);
  assert.doesNotMatch(both, /not checked/);
});

test("#2167 Data QC: no 'past the end' warning for a hole with no collar or a 0 m survey only", () => {
  const { issues } = runDataQC({ project: {}, collars: [{ hole_id: "A", length: 20, x: 0, y: 0, z: 0 }, { hole_id: "C", x: 1, y: 1, z: 0 }], survey: [{ hole_id: "C", depth: 0, azimuth: 0, dip: -90 }, { hole_id: "Z", depth: 0, azimuth: 0, dip: -90 }],
    layers: { litho: [...rows("A", 3), ...rows("C", 3), ...rows("Z", 3)] }, boundaries: [], assays: [] });
  const past = issues.filter((i) => /extends past/.test(i.message));
  assert.deepEqual([...new Set(past.map((i) => i.holeId))], ["A"], "only A (20 m) has a length to be past");
});
