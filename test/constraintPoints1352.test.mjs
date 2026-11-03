// TASKS.csv #1352 review (Silvertip, Geophysics) — a point reading stored with from = to feeds the inversion constraints
import { test } from "node:test";
import assert from "node:assert/strict";
import { constraintSamples, SUSC_UNITS } from "../src/lib/drillholeConstraints.js";

test("mag-susc point readings (from = to) are samples at that depth, not bad values", () => {
  const collars = [{ hole_id: "H1", x: 0, y: 0, z: 1000, azimuth: 0, dip: -90, length: 300 }];
  const survey = [{ hole_id: "H1", depth: 0, azimuth: 0, dip: -90 }, { hole_id: "H1", depth: 300, azimuth: 0, dip: -90 }];
  const rows = [{ hole_id: "H1", from: 50, to: 50, value: 1.2 }, { hole_id: "H1", from: 120.5, to: 120.5, value: 0.4 }, { hole_id: "H1", from: 200, to: 190, value: 1 }];
  const units = Object.keys(SUSC_UNITS)[0];
  const r = constraintSamples({ collars, survey, rows, method: "mag", units, desurveyMethod: "minimum_curvature" });
  assert.equal(r.points.length, 2, JSON.stringify(r.skipped));
  assert.equal(r.skipped.badValue, 1, "a reversed interval is still refused");
});
