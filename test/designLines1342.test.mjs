// TASKS.csv #1342 — design linework: grades, curves of a chosen radius, spirals, a click reaching its point on a tangent
import { test } from "node:test";
import assert from "node:assert/strict";
import { payloadFromFields, fieldsFromPayload, emptyFields } from "../src/lib/projectFields.js";
import { computeLine, tangentTo, segmentsToPoint, runAboveGround, gradeRatio, designLineRows, designLineFeatures, norm360 } from "../src/lib/designLines.js";

const near = (a, b, tol = 1e-6, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} vs ${b}`);
const start = { x: 1000, y: 2000, z: 500 };

test("a straight at +1 % and one at -2 % gain and lose what they should, and length is along the slope", () => {
  const c = computeLine({ start, azimuth: 90, segments: [{ type: "straight", length: 100, azimuth: null, grade: 1 }, { type: "straight", length: 100, azimuth: null, grade: -2 }] });
  const run1 = 100 / Math.sqrt(1 + 0.01 ** 2), run2 = 100 / Math.sqrt(1 + 0.02 ** 2);
  near(c.end[0], 1000 + run1 + run2);
  near(c.end[1], 2000);
  near(c.end[2], 500 + 0.01 * run1 - 0.02 * run2);
  near(c.length, 200);
  near(c.segments[0].dz, 0.01 * run1);
  near(c.steepest, -2);
});

test("azimuth is clockwise from north, and a straight can set a new heading", () => {
  const c = computeLine({ start, azimuth: 0, segments: [{ type: "straight", length: 10, azimuth: null, grade: 0 }, { type: "straight", length: 10, azimuth: 90, grade: 0 }, { type: "straight", length: 10, azimuth: null, grade: 0 }] });
  near(c.end[0], 1020); near(c.end[1], 2010); near(c.azimuth, 90);
});

test("a right turn from north at radius 50 ends 50 east and 50 north, facing east; a left one mirrors it", () => {
  const right = computeLine({ start, azimuth: 0, segments: [{ type: "curve", radius: 50, turn: "right", angle: 90, grade: 0 }] });
  near(right.end[0], 1050); near(right.end[1], 2050); near(right.azimuth, 90);
  near(right.run, (Math.PI / 2) * 50);
  const left = computeLine({ start, azimuth: 0, segments: [{ type: "curve", radius: 50, turn: "left", angle: 90, grade: 0 }] });
  near(left.end[0], 950); near(left.end[1], 2050); near(left.azimuth, 270);
});

test("every point of a curve stays on its circle, and the path is smooth at any radius", () => {
  for (const R of [10, 25, 100, 400]) {
    const c = computeLine({ start, azimuth: 30, segments: [{ type: "curve", radius: R, turn: "right", angle: 200, grade: 0 }] });
    const cx = 1000 + R * Math.cos(30 * Math.PI / 180), cy = 2000 - R * Math.sin(30 * Math.PI / 180);
    c.vertices.forEach((v) => near(Math.hypot(v[0] - cx, v[1] - cy), R, 1e-6, `R ${R}`));
    assert.ok(c.vertices.length >= 40 + 1);
  }
});

test("a decline spirals: two full turns at -14.3 % come back over the start, 1 in 7 lower", () => {
  const R = 25, c = computeLine({ start, azimuth: 0, segments: [{ type: "curve", radius: R, turn: "left", angle: 720, grade: -14.3 }] });
  near(c.end[0], 1000, 1e-6); near(c.end[1], 2000, 1e-6);
  const run = 2 * Math.PI * R * 2;
  near(c.run, run);
  near(c.dz, -0.143 * run, 1e-6);
  near(c.length, run * Math.sqrt(1 + 0.143 ** 2));
  near(c.azimuth, 0, 1e-9);
  assert.equal(gradeRatio(-14.3), "1:7");
  assert.equal(gradeRatio(1), "1:100");
  assert.equal(gradeRatio(0), null);
});

test("changing one segment moves everything after it", () => {
  const seg = (g) => [{ type: "straight", length: 100, azimuth: null, grade: g }, { type: "curve", radius: 30, turn: "right", angle: 90, grade: 0 }, { type: "straight", length: 50, azimuth: null, grade: 0 }];
  const a = computeLine({ start, azimuth: 0, segments: seg(0) }), b = computeLine({ start, azimuth: 0, segments: seg(-5) });
  assert.ok(b.end[2] < a.end[2] - 4.9);
  near(b.segments[2].end[2], b.segments[0].end[2], 1e-9);
});

test("a tangent curve then a straight really reaches the point, leaving the curve in line with it", () => {
  let seed = 9; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let t = 0; t < 400; t++) {
    const az = rnd() * 360, R = 5 + rnd() * 100, ang = rnd() * 2 * Math.PI, dist = R * (2.2 + rnd() * 6);
    const target = [start.x + dist * Math.sin(ang), start.y + dist * Math.cos(ang)];
    const r = segmentsToPoint({ start, azimuth: az, segments: [] }, target, { radius: R, grade: -2 });
    const c = computeLine({ start, azimuth: az, segments: r.segments });
    near(c.end[0], target[0], 0.01, `case ${t} x`); near(c.end[1], target[1], 0.01, `case ${t} y`);
    const curve = c.segments.find((s) => s.type === "curve");
    if (curve) assert.ok(curve.angle <= 360);
  }
});

test("a curve turns towards the point: to the right when it lies right", () => {
  const r = tangentTo([0, 0], 0, 20, [200, 100]);
  assert.equal(r.turn, "right");
  const l = tangentTo([0, 0], 0, 20, [-200, 100]);
  assert.equal(l.turn, "left");
  near(l.azimuth, norm360(360 - r.azimuth), 1e-9);
});

test("a point inside the turning circle is refused, not bent into a wrong shape", () => {
  const r = segmentsToPoint({ start, azimuth: 0, segments: [] }, [start.x + 30, start.y], { radius: 50, grade: 0 });
  assert.equal(r.insideCircle, true);
  assert.equal(r.segments.length, 0);
});

test("no radius, or no heading yet: a click draws a straight", () => {
  const a = segmentsToPoint({ start, azimuth: 0, segments: [] }, [start.x + 100, start.y], { radius: 0, grade: 1 });
  assert.equal(a.segments.length, 1);
  near(a.segments[0].azimuth, 90);
  near(a.segments[0].length, 100 * Math.sqrt(1 + 0.01 ** 2), 1e-3);
  const b = segmentsToPoint({ start, azimuth: null, segments: [] }, [start.x, start.y + 100], { radius: 40, grade: 0 });
  assert.equal(b.segments[0].type, "straight");
});

test("bad numbers cannot put NaN in a line", () => {
  const c = computeLine({ start: { x: "a" }, azimuth: "", segments: [{ type: "curve", radius: 0, angle: 90, grade: "x" }, { type: "straight", length: -5, grade: null }, {}] });
  c.vertices.forEach((v) => v.slice(0, 3).forEach((n) => assert.ok(Number.isFinite(n))));
  near(c.length, 0);
});

test("a line above the ground is measured", () => {
  const c = computeLine({ start, azimuth: 90, segments: [{ type: "straight", length: 100, azimuth: null, grade: 0 }] });
  near(runAboveGround(c.vertices, () => 400), 100);
  near(runAboveGround(c.vertices, () => 600), 0);
  near(runAboveGround(c.vertices, () => null), 0);
});

test("the export has every vertex with its chainage, and a line with nothing drawn yet is left out of the DXF", () => {
  const lines = [{ name: "Decline", start, azimuth: 0, segments: [{ type: "straight", length: 100, azimuth: null, grade: -10 }] }, { name: "Empty", start, azimuth: 0, segments: [] }];
  const rows = designLineRows(lines);
  assert.equal(rows.length, 3);
  near(rows[1].chainage_m, 100, 0.01);
  assert.equal(rows[1].grade_pct, -10);
  assert.equal(designLineFeatures(lines).length, 1);
  assert.equal(designLineFeatures(lines)[0].geometry[1].length, 3);
});

test("lines are saved with the project and draw the same when reopened; an older file opens with none", () => {
  const f = emptyFields();
  assert.deepEqual(f.designLines, []);
  f.designLines = [{ id: "a", name: "Decline", color: "#e8590c", visible: true, start, azimuth: 45, segments: [{ type: "straight", length: 120, azimuth: null, grade: -2 }, { type: "curve", radius: 40, turn: "left", angle: 720, grade: -14.3 }] }];
  const file = JSON.parse(JSON.stringify(payloadFromFields(f)));
  const back = fieldsFromPayload(file, "p.geostrix.json").designLines;
  assert.deepEqual(back, f.designLines);
  assert.deepEqual(computeLine(back[0]).end, computeLine(f.designLines[0]).end);
  const old = { ...file, version: 20 }; delete old.designLines;
  assert.deepEqual(fieldsFromPayload(old, "old.geostrix.json").designLines, []);
});
