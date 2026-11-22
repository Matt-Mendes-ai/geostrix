// TASKS.csv #4006 — a fault surface from every kind of fault evidence (lib/faultEvidence.js): oriented picks, logged fault intervals, outcrop
// faults, mapped fault lines at the terrain, drawn interpretation lines (at a level too) and section fault strings. Made-up data throughout.
import test from "node:test";
import assert from "node:assert/strict";
import { thinLine, fitPlane, mappedFaultAttitude, evidenceItems, faultSpec, faultEllipse, inEllipse, clipMeshToEllipse } from "../src/lib/faultEvidence.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const angleNear = (a, b, tol, msg) => near(Math.abs(((a - b + 540) % 360) - 180), 0, tol, msg);
// points on a plane through the origin dipping `dip` towards `dd`
const onPlane = (dip, dd, n = 30, seed = 1) => {
  const r = (dip * Math.PI) / 180, az = (dd * Math.PI) / 180;
  const down = [Math.sin(az) * Math.cos(r), Math.cos(az) * Math.cos(r), -Math.sin(r)], along = [Math.cos(az), -Math.sin(az), 0];
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  return Array.from({ length: n }, () => { const a = rnd() * 500, b = rnd() * 300; return { x: 1000 + a * along[0] + b * down[0], y: 2000 + a * along[1] + b * down[1], z: 300 + a * along[2] + b * down[2] }; });
};

test("#4006 the plane through the points: dip and dip direction recovered, a line of points is no plane", () => {
  for (const [dip, dd] of [[60, 90], [30, 225], [85, 10], [45, 300], [5, 180]]) {
    const p = fitPlane(onPlane(dip, dd));
    assert.equal(p.flat, false);
    near(p.dip, dip, 0.01, `dip ${dip}/${dd}`);
    angleNear(p.dipDir, dd, 0.05, `dip direction ${dip}/${dd}`);
    near(p.rms, 0, 1e-4, "on the plane");
    assert.ok(p.normal[2] > 0, "the normal points up");
  }
  assert.equal(fitPlane([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 1 }, { x: 200, y: 0, z: 2 }, { x: 300, y: 0, z: 3 }]).flat, true, "points on a line");
  assert.equal(fitPlane([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }]).flat, true, "two points");
});

test("#4006 a mapped trace every 250 m at the terrain; its dip from the map, else the nearest outcrop fault, else the type", () => {
  const t = thinLine([[0, 0], [1000, 0]]);
  assert.deepEqual(t.map((p) => p[0]), [0, 250, 500, 750, 1000]);
  assert.deepEqual(thinLine([[0, 0], [100, 0]]).map((p) => p[0]), [0, 25, 50, 75, 100], "a short line in at least 4 steps");
  const line = [[0, 0], [0, 1000]]; // strikes north: dips east (090) or west (270)
  assert.deepEqual(mappedFaultAttitude({ attributes: { TYPE: "fault", DIP: 70, DIP_DIR: 95 } }, line), { dip: 70, dipDir: 95, source: "map" });
  const west = mappedFaultAttitude({ attributes: { TYPE: "fault" } }, line, [{ x: 50, y: 500, dip: 55, dipDir: 265 }]);
  assert.equal(west.dip, 55); assert.equal(west.dipDir, 270); assert.equal(west.source, "outcrop");
  assert.equal(mappedFaultAttitude({ attributes: { TYPE: "Thrust fault" } }, line).dip, 30, "a thrust's default");
  assert.equal(mappedFaultAttitude({ attributes: { TYPE: "Normal fault" } }, line, [{ x: 5000, y: 0, dip: 10, dipDir: 90 }]).source, "default", "an outcrop fault beyond 500 m does not count");
});

test("#4006 the evidence items, one per structure, code, line and string, each in the same frame", () => {
  const ground = (x, y) => (x > 5000 ? NaN : 100 + y / 100);
  const items = evidenceItems({
    picks: [
      { x: 10, y: 20, z: 50, dip: 60, azimuth: 90, type: "FLT", id: "", hole_id: "DH-1", depth: 40 },
      { x: 12, y: 60, z: 10, dip: 62, azimuth: 92, type: "FLT", id: "", hole_id: "DH-2", depth: 70 },
      { x: 0, y: 0, z: 0, dip: 50, azimuth: 270, type: "Shear", id: "S1", hole_id: "DH-1", depth: 10 },
      { x: 0, y: 0, z: 0, dip: NaN, azimuth: 270, type: "Shear", id: "S1", hole_id: "DH-1", depth: 12 }, // no dip: left out
    ],
    intervals: [
      { code: "FZ", x0: 1, y0: 1, z0: 80, x1: 1, y1: 1, z1: 75, hole_id: "DH-1", from: 20, to: 25 },
      { code: "fz", x0: 9, y0: 9, z0: 60, x1: 9, y1: 9, z1: 60, hole_id: "DH-3", from: 40, to: 40.01 }, // a thin one: its top only
      { code: "BAS", x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: -5, hole_id: "DH-1", from: 0, to: 5 },
    ],
    outcrop: [{ x: 100, y: 100, z: 101, dip: 70, dipDir: 80 }],
    mapped: [{ layer: { id: "geo" }, feature: { parts: [[[0, 0], [0, 2000]]], attributes: { NAME: "Main Fault", TYPE: "normal fault" } } }],
    drawn: [{ layer: { id: "int" }, feature: { parts: [[[0, 0, 150], [100, 0, 150]]], attributes: { name: "F2 at depth", type: "fault", level_rl: 150, dip: 75, dip_dir: 180 } } },
      { layer: { id: "int" }, feature: { parts: [[[0, 0], [100, 0]]], attributes: { name: "F3", type: "fault" } } }],
    strings: [{ id: "c1", unit: "Fault A", section: "s1", points: [{ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: NaN }] }],
    ground,
  });
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  assert.deepEqual(items.map((i) => i.id), ["pick:FLT|", "pick:Shear|S1", "logged:FZ", "outcrop", "mapped:geo:0:0", "drawn:int:0:0", "drawn:int:1:0", "string:s1:c1"]);
  assert.equal(byId["pick:FLT|"].points.length, 2); assert.equal(byId["pick:FLT|"].holes, 2); assert.equal(byId["pick:FLT|"].orientations[1].azimuth, 92);
  assert.equal(byId["pick:Shear|S1"].name, "Shear — S1"); assert.equal(byId["pick:Shear|S1"].points.length, 1);
  assert.deepEqual(byId["logged:FZ"].points.map((p) => p.z), [80, 75, 60], "top and bottom; a thin interval once"); assert.equal(byId["logged:FZ"].orientations.length, 0);
  const m = byId["mapped:geo:0:0"];
  assert.equal(m.name, "Main Fault"); assert.equal(m.points.length, 9); assert.equal(m.points[4].z, 100 + 1000 / 100, "at the terrain");
  assert.equal(m.orientations.length, 2); assert.equal(m.orientations[0].dip, 70, "the outcrop fault 100 m from the trace"); assert.equal(m.dipSource, "outcrop");
  assert.equal(m.orientations[0].azimuth, 90, "on the outcrop fault's side of the trace");
  assert.ok(m.points.every((p) => p.x === 0));
  const d = byId["drawn:int:0:0"];
  assert.ok(d.points.every((p) => p.z === 150), "at its level, not draped"); assert.equal(d.orientations.length, 2); assert.equal(d.orientations[0].azimuth, 180);
  assert.ok(byId["drawn:int:1:0"].points.every((p) => p.z === 100), "a line on the terrain is draped"); assert.equal(byId["drawn:int:1:0"].orientations.length, 0, "no dip, no orientation");
  assert.deepEqual(byId["string:s1:c1"].points, [{ x: 1, y: 2, z: 3 }]);
  // a dip the user sets for a line replaces the map's
  const user = evidenceItems({ mapped: [{ layer: { id: "geo" }, feature: { parts: [[[0, 0], [0, 2000]]], attributes: { TYPE: "fault" } } }], ground, userDip: { "mapped:geo:0:0": 80 } });
  assert.equal(user[0].orientations[0].dip, 80); assert.equal(user[0].dipSource, "user");
  assert.equal(evidenceItems({ mapped: [{ layer: { id: "g" }, feature: { parts: [[[9000, 0], [9000, 900]]], attributes: { TYPE: "fault" } } }], ground }).length, 0, "off the terrain: nothing");
});

test("#4006 a fault from its items: an orientation fitted when none is measured, a dip the user sets, and when it is a guess", () => {
  const pts = onPlane(55, 135, 12);
  const logged = [{ id: "logged:FLT", kind: "logged", points: pts, orientations: [], holes: 6 }];
  const s = faultSpec(logged);
  assert.equal(s.ok, true); assert.equal(s.orientations.length, 1);
  near(s.orientations[0].dip, 55, 0.01, "fitted dip"); angleNear(s.orientations[0].azimuth, 135, 0.05, "fitted dip direction");
  assert.deepEqual(s.said.map((x) => x.key), ["fitted"]); assert.equal(s.guess, false);
  const line = [{ id: "drawn:a", kind: "drawn", points: [{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }, { x: 200, y: 0, z: 0 }], orientations: [], holes: 0 }];
  assert.equal(faultSpec(line).ok, false); assert.equal(faultSpec(line).why, "no-orientation", "one straight line spans no plane: it needs a dip");
  const withDip = faultSpec(line, { dip: 70, dipDir: 0 });
  assert.equal(withDip.ok, true); assert.equal(withDip.orientations[0].dip, 70); assert.ok(withDip.said.some((x) => x.key === "user-dip")); assert.equal(withDip.guess, true, "three points");
  const onePick = [{ id: "pick:FLT|", kind: "pick", points: pts.slice(0, 6), orientations: [{ ...pts[0], dip: 55, azimuth: 135 }], holes: 1 }];
  assert.equal(faultSpec(onePick).guess, true, "picks from one hole only");
  assert.equal(faultSpec([...onePick, { id: "mapped:x", kind: "mapped", points: pts.slice(6), orientations: [], holes: 0 }]).guess, false, "two kinds of evidence");
  assert.equal(faultSpec([]).ok, false);
});

test("#4006 a finite fault: the ellipse around the evidence plus a margin; a mesh is cut to it", () => {
  const pts = onPlane(60, 90, 40);
  const plane = fitPlane(pts), e = faultEllipse(pts, plane, 100);
  assert.ok(pts.every((p) => inEllipse(e, p)), "every evidence point inside");
  near(e.u[2], 0, 1e-9, "u along strike is horizontal");
  const far = { x: plane.centroid.x + e.u[0] * (e.a + 50), y: plane.centroid.y + e.u[1] * (e.a + 50), z: plane.centroid.z };
  assert.equal(inEllipse(e, far), false, "beyond the margin along strike");
  // two triangles: one at the centre, one far along strike
  const c = plane.centroid, k = e.a + 500;
  const P = [c.x, c.y, c.z, c.x + 1, c.y, c.z, c.x, c.y + 1, c.z, c.x + e.u[0] * k, c.y + e.u[1] * k, c.z, c.x + e.u[0] * k + 1, c.y + e.u[1] * k, c.z, c.x + e.u[0] * k, c.y + e.u[1] * k + 1, c.z];
  assert.deepEqual(clipMeshToEllipse(P, [0, 1, 2, 3, 4, 5], e), { indices: [0, 1, 2], kept: 1, dropped: 1 });
});
