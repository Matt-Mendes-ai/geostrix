// TASKS.csv #2250 — planning from the existing collars nearest the target (an underground cuddy), upholes included
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nearestCollarsToTarget } from "../src/lib/holePlanning.js";

const collars = [
  { hole_id: "WG0034UD", x: 32100, y: 807700, z: 149 }, // 60 m from the target, below it: an uphole
  { hole_id: "WB0713UD", x: 32500, y: 807300, z: 250 },
  { hole_id: "FAR", x: 40000, y: 800000, z: 400 },
  { hole_id: "NOZ", x: 32101, y: 807701, z: NaN },
];
const target = { x: 32150, y: 807730, z: 165 };

test("the nearest collars come first, each with the az / dip / length a straight hole needs", () => {
  const n = nearestCollarsToTarget(collars, target, 2);
  assert.deepEqual(n.map((c) => c.hole_id), ["WG0034UD", "WB0713UD"]);
  const a = n[0];
  assert.ok(Math.abs(a.length - Math.hypot(50, 30, 16)) < 1e-9);
  assert.ok(a.dip > 0, "the target is above the cuddy: an uphole, positive dip");
  assert.ok(Math.abs(a.azimuth - (Math.atan2(50, 30) * 180) / Math.PI) < 1e-9);
  assert.equal(nearestCollarsToTarget(collars, { x: NaN, y: 0, z: 0 }).length, 0);
});

test("the form lists them and 'Use' fills the collar and the solved hole", () => {
  const s = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(s.includes("nearestCollarsToTarget(collars, { x: Number(target.x), y: Number(target.y), z: Number(target.z) })"));
  assert.ok(s.includes("onClick={() => planFromNearest(n)}"));
  assert.ok(s.includes("length: Math.round((n.length + PAST_TARGET_M) * 10) / 10"));
});
