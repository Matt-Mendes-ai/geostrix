// TASKS.csv #2097 (review #2013, Woodjam) — Targeting's checks see collars with no attitude (as assumed vertical holes, #2014) and leave
// out collars whose status column says proposed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isProposedCollar, drilledCollars } from "../src/lib/collarStatus.js";
import { drilledTraceIndex, planChecks } from "../src/lib/plannedHoleChecks.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("a status-like column saying proposed / planned marks a collar; a note mentioning it does not", () => {
  assert.equal(isProposedCollar({ hole_id: "WJProp24_006", attrs: { status: "proposed" } }), true);
  assert.equal(isProposedCollar({ hole_id: "A", attrs: { Hole_Status: "Planned" } }), true);
  assert.equal(isProposedCollar({ hole_id: "B", status: "Not drilled" }), true);
  assert.equal(isProposedCollar({ hole_id: "C", attrs: { status: "completed" } }), false);
  assert.equal(isProposedCollar({ hole_id: "D", attrs: { comment: "proposed" } }), false);
  assert.equal(isProposedCollar({ hole_id: "E" }), false);
  assert.deepEqual(drilledCollars([{ hole_id: "P", attrs: { status: "proposed" } }, { hole_id: "Q" }]), { collars: [{ hole_id: "Q" }], proposed: ["P"] });
});

test("the drilled index takes a trace-less collar as a vertical hole and says so; a proposed collar is not drilled", () => {
  const collars = [
    { hole_id: "TK10-23", x: 1000, y: 1000, z: 900, length: 360 },                      // no survey, no azimuth / dip: assumed vertical
    { hole_id: "WJProp24_006", x: 1005, y: 1000, z: 900, length: 300, azimuth: 0, dip: 60, attrs: { status: "proposed" } },
    { hole_id: "FAR", x: 5000, y: 5000, z: 900, length: 300, azimuth: 0, dip: 60 },
  ];
  const idx = drilledTraceIndex(collars, [], "minimumCurvature");
  assert.equal(idx.n, 2);
  assert.deepEqual([...idx.assumed], ["TK10-23"]);
  assert.deepEqual(idx.proposed, ["WJProp24_006"]);
  // a planned vertical hole 139 m east of TK10-23: its nearest is TK10-23, flagged as assumed
  const plan = [{ id: "p", name: "WJ-PLAN-B", x: 1139, y: 1000, z: 900, azimuth: 0, dip: 90, length: 300 }];
  const trace = () => Array.from({ length: 101 }, (_, i) => ({ md: i * 3, x: 1139, y: 1000, z: 900 - i * 3 }));
  const [r] = planChecks(plan, idx, [], trace);
  assert.equal(r.nearestReal.hole_id, "TK10-23");
  assert.ok(Math.abs(r.nearestReal.distance - 139) < 1e-6);
  assert.equal(r.nearestReal.assumed, true);
  assert.deepEqual(r.samePad, []);
});

test("the panes use it: planned-hole checks, Undrilled zones and the evidence overlay", () => {
  assert.match(read("src/components/PlannedHoleParts.jsx"), /taken as a vertical hole/);
  assert.match(read("src/components/PlannedHoleParts.jsx"), /whose status is proposed are not counted as drilled holes/);
  const u = read("src/components/UndrilledZonesPane.jsx");
  assert.match(u, /const \{ collars: drilledList, proposed \} = drilledCollars\(collars\);/);
  assert.match(u, /are taken as vertical\./);
  assert.match(read("src/components/EvidenceOverlayPane.jsx"), /holeTraces\(drilledCollars\(collars\)\.collars, survey/);
});
