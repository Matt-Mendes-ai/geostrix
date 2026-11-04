// TASKS.csv #1878 — decline to a target, development profiles, clearance to other lines and holes, sharp corners
import test from "node:test";
import assert from "node:assert/strict";
import { computeLine, declineToTarget, profileArea, profileMesh, clearanceTo, selfClearance, sharpCorners, developmentRows } from "../src/lib/designLines.js";
import { isMeshClosed } from "../src/lib/meshQuery.js";

const portal = { name: "D", start: { x: 1000, y: 2000, z: 500 }, azimuth: 90, segments: [] };

test("a target the route can reach at the maximum grade: a tangent curve and a straight at the grade that lands on it", () => {
  const r = declineToTarget(portal, [1400, 2000, 460], { maxGrade: 14, minRadius: 30 });
  assert.equal(r.turns, 0);
  assert.ok(r.grade < 0 && Math.abs(r.grade) <= 14);
  const c = computeLine({ ...portal, segments: r.segments });
  assert.ok(Math.abs(c.end[0] - 1400) < 0.05 && Math.abs(c.end[1] - 2000) < 0.05 && Math.abs(c.end[2] - 460) < 0.05, `end ${c.end}`);
  assert.ok(Math.abs(c.steepest) <= 14 + 1e-6);
});

test("a deep target: whole spiral turns at the minimum radius first, then the route lands exactly", () => {
  const r = declineToTarget(portal, [1200, 2100, 300], { maxGrade: 14, minRadius: 25 });
  assert.ok(r.turns >= 1, `turns ${r.turns}`);
  assert.equal(r.segments[0].type, "curve"); assert.equal(r.segments[0].angle, 360 * r.turns); assert.equal(r.segments[0].radius, 25);
  const c = computeLine({ ...portal, segments: r.segments });
  assert.ok(Math.abs(c.end[0] - 1200) < 0.05 && Math.abs(c.end[1] - 2100) < 0.05 && Math.abs(c.end[2] - 300) < 0.05, `end ${c.end}`);
  assert.ok(Math.abs(c.steepest) <= 14 + 1e-6);
  assert.equal(c.minRadius, 25);
  // no heading yet: it heads straight at the target
  const r2 = declineToTarget({ ...portal, azimuth: null }, [1000, 2300, 450], { maxGrade: 10, minRadius: 20 });
  assert.equal(r2.segments.find((s) => s.type === "straight").azimuth, 0);
  const c2 = computeLine({ ...portal, azimuth: null, segments: r2.segments });
  assert.ok(Math.abs(c2.end[2] - 450) < 0.05);
  // a target inside the turning circle cannot be reached
  assert.ok(declineToTarget(portal, [1000, 2010, 500], { maxGrade: 14, minRadius: 30 }).insideCircle);
});

test("profiles: area, a closed swept mesh of the right volume", () => {
  assert.equal(profileArea({ width: 5, height: 5 }), 25);
  assert.ok(Math.abs(profileArea({ width: 5, height: 5, shape: "arched" }) - (5 * 2.5 + Math.PI * 6.25 / 2)) < 1e-9);
  const m = profileMesh([[0, 0, 100], [100, 0, 100], [100, 100, 100]], { width: 5, height: 5 });
  assert.ok(isMeshClosed(m.positions, m.indices));
  assert.ok(Math.abs(m.volume - 25 * 200) < 25 * 200 * 0.02, `volume ${m.volume}`);
  const a = profileMesh([[0, 0, 100], [100, 0, 90]], { width: 4, height: 4.5, shape: "arched" });
  assert.ok(isMeshClosed(a.positions, a.indices));
  const arched = profileArea({ width: 4, height: 4.5, shape: "arched" }) * Math.hypot(100, 10);
  assert.ok(a.volume < arched && a.volume > arched * 0.975, `arched ${a.volume} vs ${arched}: the polygonal arch sits inside the circle`);
});

test("clearance to another line and to a drillhole, sharp corners, the development table", () => {
  const drift = computeLine({ start: { x: 0, y: 0, z: 100 }, azimuth: 90, segments: [{ type: "straight", length: 200, azimuth: null, grade: 0 }] });
  const other = { name: "Return air", vertices: [[0, 12, 100], [200, 12, 100]] };
  const hole = { name: "DDH-1", vertices: [[100, -50, 150], [100, 50, 50]] };
  const c1 = clearanceTo(drift, [other], 100);
  assert.ok(Math.abs(c1.distance - 12) < 1e-9 && c1.name === "Return air");
  const c2 = clearanceTo(drift, [hole], 100);
  assert.ok(c2.distance < 1e-9 && c2.name === "DDH-1", "the hole passes through the drift");
  assert.equal(clearanceTo(drift, [{ name: "far", vertices: [[0, 500, 0], [1, 500, 0]] }], 100), null);
  const bent = computeLine({ start: { x: 0, y: 0, z: 100 }, azimuth: 90, segments: [{ type: "straight", length: 100, azimuth: null, grade: 0 }, { type: "straight", length: 100, azimuth: 179, grade: 0 }] });
  assert.deepEqual(sharpCorners(bent), [{ segment: 2, turn: 89 }]);
  assert.equal(sharpCorners(drift).length, 0);
  const rows = developmentRows([{ name: "D1", start: { x: 0, y: 0, z: 100 }, azimuth: 90, profile: { width: 5, height: 5 }, segments: [{ type: "straight", length: 100, azimuth: null, grade: 0 }, { type: "straight", length: 100, azimuth: null, grade: -14 }] }], { density: 2.7 });
  assert.equal(rows[0].level_m, 100); assert.equal(rows[0].ramp_m, 100); assert.equal(rows[0].volume_m3, 5000); assert.equal(rows[0].tonnes, 13500);
  assert.ok(selfClearance(drift) === null);
});
