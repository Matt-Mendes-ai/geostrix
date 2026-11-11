// TASKS.csv #1733 — the lift and drift of the project's own surveyed holes, offered to the Target panel
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { surveyDeviation } from "../src/lib/surveyDeviation.js";

test("Copley's COP-23-0001: 129.2 -> 130.6 deg and 45.16 -> 43.78 deg over 280 m is about +0.5 /100 m each", () => {
  const r = surveyDeviation([{ hole_id: "C1", depth: 0, azimuth: 129.2, dip: 45.16 }, { hole_id: "C1", depth: 140, azimuth: 130, dip: 44.5 }, { hole_id: "C1", depth: 280, azimuth: 130.6, dip: 43.78 }]);
  assert.equal(r.holes, 1);
  assert.ok(Math.abs(r.lift - 1.38 / 2.8) < 1e-9 && Math.abs(r.drift - 1.4 / 2.8) < 1e-9, JSON.stringify(r));
});

test("the median over holes, a turn across north, and what is left out", () => {
  const rows = [
    { hole_id: "A", depth: 0, azimuth: 359, dip: 60 }, { hole_id: "A", depth: 100, azimuth: 1, dip: 58 }, // +2 /100 m both ways round north
    { hole_id: "B", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "B", depth: 200, azimuth: 88, dip: 62 }, // -1 / -1
    { hole_id: "C", depth: 0, azimuth: 10, dip: 50 }, { hole_id: "C", depth: 100, azimuth: 13, dip: 49 }, // +3 / +1
    { hole_id: "V", depth: 0, azimuth: 0, dip: 90 }, { hole_id: "V", depth: 100, azimuth: 40, dip: 88 }, // vertical: left out
    { hole_id: "S", depth: 0, azimuth: 0, dip: 60 }, { hole_id: "S", depth: 10, azimuth: 30, dip: 50 }, // 10 m only: left out
    { hole_id: "U", depth: 0, azimuth: 0, dip: -30 }, { hole_id: "U", depth: 100, azimuth: 0, dip: -28 }, // an uphole flattening: +2 lift
  ];
  const r = surveyDeviation(rows);
  assert.equal(r.holes, 4);
  assert.ok(Math.abs(r.drift - 1) < 1e-9 && Math.abs(r.lift - 1.5) < 1e-9, JSON.stringify(r)); // drifts 2, -1, 3, 0 -> 1; lifts 2, -1, 1, 2 -> 1.5
  assert.equal(surveyDeviation([]), null);
  assert.equal(surveyDeviation([{ hole_id: "A", depth: 0, azimuth: 0, dip: 60 }]), null);
});

test("the Target panel offers it with one click", () => {
  const p = fs.readFileSync("src/components/PlannedHoleTargeting.jsx", "utf8");
  assert.match(p, /const ownDev = useMemo\(\(\) => surveyDeviation\(survey\), \[survey\]\);/);
  assert.match(p, /onUpdate\(hole\.id, \{ lift: \+ownDev\.lift\.toFixed\(2\), drift: \+ownDev\.drift\.toFixed\(2\) \}\)/);
});
