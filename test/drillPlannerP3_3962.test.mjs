// TASKS.csv #3962 P3 — the adaptive loop (design.md 1.6): the as-drilled link offered, predicted against actual, calibration, What changed.
// Synthetic data only.
import test from "node:test";
import assert from "node:assert/strict";
import { asDrilledOffers, compareToActual, calibration, whatChanged, dataStamp, LINK_M } from "../src/lib/drillPlanner/adaptive.js";
import { seriesIntercepts } from "../src/lib/drillPlanner/seriesIntercepts.js";

test("the as-drilled link is offered for a collar with the planned hole's name, or within 10 m of its collar; never twice, never for a linked hole", () => {
  const planned = [
    { id: "p1", name: "DD26-031", x: 100, y: 100 },
    { id: "p2", name: "PLAN-2", x: 200, y: 200 },
    { id: "p3", name: "PLAN-3", x: 300, y: 300 },
    { id: "p4", name: "PLAN-4", x: 400, y: 400, asDrilledHoleId: "DD26-040" },
    { id: "p5", name: "PLAN-5", x: 204, y: 203 }, // the same collar as p2's offer: only one hole gets it
  ];
  const collars = [{ hole_id: "dd26-031", x: 130, y: 100 }, { hole_id: "DD26-032", x: 206, y: 203 }, { hole_id: "DD26-033", x: 300 + LINK_M + 1, y: 300 }, { hole_id: "DD26-040", x: 400, y: 400 }];
  const o = asDrilledOffers(planned, collars);
  assert.deepEqual(o.map((x) => [x.holeId, x.collarId, x.by]), [["p1", "dd26-031", "name"], ["p2", "DD26-032", "distance"]]);
  assert.ok(Math.abs(o[1].distance - Math.hypot(6, 3)) < 1e-9);
});

const pred = { step: 2, rules: { cutoff: 1, minLength: 2, maxInternalDilution: 2 }, gt: [2, 6, 12], beyond: false };
test("predicted against actual: the drilled hole's best intercept by the same rules, and where it fell against P10-P90", () => {
  const comps = (vals) => vals.map((v, i) => ({ from: i * 2, to: i * 2 + 2, value: v }));
  const mid = compareToActual(pred, comps([0.1, 0.2, 2, 2, 0.3, 0.1])); // 4 m at 2 = 8
  assert.equal(mid.where, "inside"); assert.equal(mid.gt, 8);
  const ref = seriesIntercepts(Float64Array.from([0, 2, 4, 6, 8, 10]), 2, Float64Array.from([0.1, 0.2, 2, 2, 0.3, 0.1]), pred.rules);
  assert.equal(mid.gt, ref.best.gt);
  assert.equal(compareToActual(pred, comps([0.1, 0.2, 0.3])).where, "below"); // no intercept: 0, under P10
  assert.equal(compareToActual(pred, comps([5, 5, 5, 5])).where, "above"); // 8 m at 5 = 40
  assert.deepEqual(mid.values[2], [5, 2]);
  assert.equal(compareToActual({ ...pred, beyond: true }, comps([1])), null);
  // a gap in the composites is a gap in the series, not a shifted one
  const gap = compareToActual(pred, [{ from: 0, to: 2, value: 3 }, { from: 6, to: 8, value: 3 }]);
  assert.equal(gap.gt, 6);
});

test("calibration: the share inside P10-P90, overconfident when far under it with five or more holes", () => {
  const r = (w) => ({ where: w });
  const c = calibration([r("inside"), r("inside"), r("below"), r("inside"), r("above"), null]);
  assert.deepEqual([c.n, c.inside, c.below, c.above], [5, 3, 1, 1]);
  assert.equal(c.share, 0.6); assert.equal(c.overconfident, false);
  assert.equal(calibration([r("below"), r("below"), r("inside"), r("above"), r("below")]).overconfident, true);
  assert.equal(calibration([]).share, null);
  assert.notEqual(dataStamp("10:abc", [1, 2]), dataStamp("11:abc", [1, 2]));
});

test("What changed: the re-run program against the holes still to drill — kept, consider dropping, consider adding", () => {
  const remaining = [{ id: "a", name: "P1", x: 0, y: 0, azimuth: 90, dip: -60 }, { id: "b", name: "P2", x: 50, y: 0, azimuth: 0, dip: -70 }];
  const rerun = [{ id: "c1", order: 1, x: 0.4, y: 0, azimuth: 90.2, dip: -60 }, { id: "c2", order: 2, x: 100, y: 0, azimuth: 45, dip: -60 }];
  const w = whatChanged(remaining, rerun);
  assert.deepEqual(w.keep.map((k) => [k.hole.id, k.order]), [["a", 1]]);
  assert.deepEqual(w.drop.map((h) => h.id), ["b"]);
  assert.deepEqual(w.add.map((c) => c.id), ["c2"]);
  assert.equal(whatChanged(remaining, [{ id: "z", order: 1, x: 0, y: 0, azimuth: 270, dip: -60 }]).keep.length, 0, "the opposite direction is another hole");
});

test("by distance the drilled hole must point the plan's way: a fan hole on the same pad is another hole (live, P3)", () => {
  const planned = [{ id: "p1", name: "PLAN-1", x: 0, y: 0, azimuth: 90, dip: -60 }, { id: "p2", name: "PLAN-2", x: 100, y: 0, azimuth: 0, dip: -85 }];
  const collars = [{ hole_id: "FAN", x: 0, y: 0 }, { hole_id: "ASDRILLED", x: 3, y: 2 }, { hole_id: "STEEP", x: 101, y: 0 }];
  const survey = [{ hole_id: "FAN", depth: 0, azimuth: 270, dip: -60 }, { hole_id: "ASDRILLED", depth: 0, azimuth: 96, dip: -58 }, { hole_id: "ASDRILLED", depth: 50, azimuth: 99, dip: -57 }, { hole_id: "STEEP", depth: 0, azimuth: 200, dip: -88 }];
  const o = asDrilledOffers(planned, collars, LINK_M, survey);
  assert.deepEqual(o.map((x) => [x.holeId, x.collarId]), [["p1", "ASDRILLED"], ["p2", "STEEP"]], "the fan hole (270°) is not offered; a steep hole's azimuth is not compared");
  assert.equal(asDrilledOffers(planned, [{ hole_id: "FAN", x: 0, y: 0, azimuth: 270, dip: -60 }]).length, 0, "the collar's own direction when there is no survey");
});
