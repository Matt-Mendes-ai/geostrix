// TASKS.csv #1890 / #1895 — a line that already reaches the target (to the mm the segments round to) adds nothing; the route's
// driven length comes back beside the whole addition, and grades are stored to 0.01 %
import test from "node:test";
import assert from "node:assert/strict";
import { declineToTarget, computeLine } from "../src/lib/designLines.js";

const portal = { start: { x: 1000, y: 2000, z: 500 }, azimuth: 0, segments: [] };

test("designing to the same target twice adds nothing the second time", () => {
  const target = [1200, 2300, 380];
  const r = declineToTarget(portal, target, { maxGrade: 14, minRadius: 25 });
  assert.ok(r.segments.length > 0 && r.turns > 0);
  const line = { ...portal, segments: r.segments };
  const end = computeLine(line).end;
  assert.ok(Math.hypot(end[0] - target[0], end[1] - target[1]) < 0.05 && Math.abs(end[2] - target[2]) < 0.05, `end ${end}`);
  const again = declineToTarget(line, target, { maxGrade: 14, minRadius: 25 });
  assert.equal(again.segments.length, 0);
  assert.ok(!again.insideCircle, "a reached target is not 'inside the turning circle'");
  // the route after the spiral is what the message quotes: its driven length, under the whole addition
  assert.ok(r.routeLength > 0 && r.routeLength < r.length);
  const spiral = r.segments[0];
  assert.ok(Math.abs(r.length - r.routeLength - spiral.radius * (spiral.angle * Math.PI / 180) * Math.sqrt(1 + (spiral.grade / 100) ** 2)) < 1e-6);
  for (const s of r.segments) assert.equal(s.grade, +s.grade.toFixed(2));
});
