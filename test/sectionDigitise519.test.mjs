// TASKS.csv #519 — section digitising: snapping to logged contacts, vertex editing, ghosted neighbour strings.
import test from "node:test";
import assert from "node:assert/strict";
import { snapTargets, snapClick, traceAt, moveVertex, deleteVertex, insertVertex, nearestSegment, ghostStrings } from "../src/lib/sectionDigitise.js";

// section along +x from (0, 0); a hole 3 m off the line, dipping east; screen: 2 px per metre, z up
const along = (x) => x;
const toScreen = (x, y, z) => [x * 2, (1000 - z) * 2];
const trace = Array.from({ length: 21 }, (_, i) => ({ md: i * 10, x: 100 + i * 5, y: 3, z: 1000 - i * 8.66 }));
const holes = [{ hole_id: "H1", trace }];
const intervals = [
  { hole_id: "H1", from: 0, to: 47.3, layer: "litho", label: "Lithology: AND" },
  { hole_id: "H1", from: 47.3, to: 90, layer: "litho", label: "Lithology: DACT" },
  { hole_id: "H1", from: 90, to: 120, layer: "litho", label: "Lithology: DACT" }, // a logging split: not a contact
  { hole_id: "H1", from: 30, to: 60, layer: "alt", label: "Alteration: PRO" },
];

test("#519 a click near the logged top of the chosen unit snaps to its exact XYZ (hole, depth kept)", () => {
  const targets = snapTargets(intervals, { unit: "DACT", kind: "contact" });
  assert.deepEqual(targets.map((t) => t.md), [47.3]);
  const p = traceAt(trace, 47.3);
  const [sx, sy] = toScreen(p.x, p.y, p.z);
  const s = snapClick({ sx: sx + 5, sy: sy - 4 }, { holes, targets, toScreen, along });
  assert.equal(s.snap, "boundary"); assert.equal(s.hole_id, "H1"); assert.equal(s.md, 47.3);
  assert.ok(Math.abs(s.x - p.x) < 1e-9 && Math.abs(s.y - 3) < 1e-9 && Math.abs(s.z - p.z) < 1e-9); // off the plane: the hole's own y
});

test("#519 away from a boundary but near the trace -> the trace point; far from everything -> no snap", () => {
  const targets = snapTargets(intervals, { unit: "DACT", kind: "contact" });
  const q = traceAt(trace, 150), [sx, sy] = toScreen(q.x, q.y, q.z);
  const s = snapClick({ sx: sx + 3, sy }, { holes, targets, toScreen, along });
  assert.equal(s.snap, "trace"); assert.ok(Math.abs(s.md - 150) < 1);
  assert.equal(snapClick({ sx: 10, sy: 10 }, { holes, targets, toScreen, along }), null);
  // faults / strings: every interval boundary of every layer
  assert.deepEqual(snapTargets(intervals, { kind: "fault" }).map((t) => t.md).sort((a, b) => a - b), [0, 30, 47.3, 60, 90, 120]);
});

test("#519 vertex editing", () => {
  const pts = [{ l: 0, z: 0, x: 0, y: 0 }, { l: 10, z: 0, x: 10, y: 0 }, { l: 20, z: 5, x: 20, y: 0 }];
  assert.deepEqual(moveVertex(pts, 1, { l: 12, z: 2, x: 12, y: 0 })[1], { l: 12, z: 2, x: 12, y: 0 });
  assert.equal(deleteVertex(pts, 1).length, 2); assert.equal(deleteVertex(deleteVertex(pts, 1), 0).length, 2); // never below two
  assert.equal(insertVertex(pts, 0, { l: 5, z: 1, x: 5, y: 0 })[1].l, 5);
  const sxsz = (p) => [p.l * 10, p.z * 10];
  assert.equal(nearestSegment(pts, sxsz, { sx: 150, sy: 22 }), 1); assert.equal(nearestSegment(pts, sxsz, { sx: 150, sy: 200 }), -1);
});

test("#519 ghosts: the nearest parallel section on each side, projected onto this one", () => {
  const cur = { id: "c", ax: 0, ay: 0, bx: 100, by: 0 };
  const mk = (id, y, az = 0) => ({ id, name: id, ax: 0, ay: y, bx: 100 * Math.cos(az), by: y + 100 * Math.sin(az), contacts: [{ unit: "DACT", color: "#f00", points: [{ x: 10, y, z: 900 }, { x: 50, y, z: 880 }] }] });
  const g = ghostStrings(cur, [mk("n50", 50), mk("n100", 100), mk("s50", -50), mk("oblique", 20, 0.5), { ...mk("empty", 30), contacts: [] }]);
  assert.deepEqual(g.map((x) => x.sectionId).sort(), ["n50", "s50"]);
  assert.deepEqual(g.find((x) => x.sectionId === "n50").strings[0].points, [{ l: 10, z: 900 }, { l: 50, z: 880 }]);
});
