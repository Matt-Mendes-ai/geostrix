// TASKS.csv #1002 — the downhole dip guide: a pick on a hole takes the attitude measured on the core there
import test from "node:test";
import assert from "node:assert/strict";
import { downholeDipGuides } from "../src/lib/explicitDownhole.js";
import { explicitPoints, fitExplicitSurface } from "../src/lib/explicitSurface.js";

const E0 = 500000, N0 = 6200000;
const pick = { x: E0, y: N0, z: 1000, hole_id: "DH-1", md: 150, src: "pick" };
const rows = [
  { hole_id: "DH-1", depth: 151.2, dip: 45, azimuth: 90, value: "CON" }, // the contact, 1.2 m below the pick
  { hole_id: "DH-1", depth: 150.5, dip: 80, azimuth: 0, value: "JN" }, // a joint, nearer
  { hole_id: "DH-2", depth: 150, dip: 10, azimuth: 0, value: "CON" },
];

test("#1002 the nearest reading of the chosen type within the window; its lines lie in the measured plane through the pick", () => {
  const g = downholeDipGuides([pick], rows, { types: ["CON"], windowM: 3, reachM: 20 });
  assert.equal(g.used.length, 1);
  assert.deepEqual([g.used[0].dip, g.used[0].dipDir, g.used[0].type], [45, 90, "CON"]);
  assert.equal(g.lines.length, 2);
  // the plane dipping 45 towards 090 through the pick: z = 1000 - (x - E0)
  for (const l of g.lines) for (const p of l.pts) assert.ok(Math.abs(p.z - (1000 - (p.x - E0))) < 1e-9, JSON.stringify(p));
  const span = (l) => Math.hypot(l.pts.at(-1).x - l.pts[0].x, l.pts.at(-1).y - l.pts[0].y, l.pts.at(-1).z - l.pts[0].z);
  assert.ok(Math.abs(span(g.lines[0]) - 40) < 1e-9 && Math.abs(span(g.lines[1]) - 40) < 1e-9, "20 m each way");
  // any type: the joint is nearer; a window too small: nothing (counted)
  assert.equal(downholeDipGuides([pick], rows, { windowM: 3 }).used[0].type, "JN");
  const none = downholeDipGuides([pick], rows, { types: ["CON"], windowM: 1 });
  assert.equal(none.used.length, 0); assert.equal(none.unmatched, 1);
});

test("#1002 in a fit, the surface leaves the hole at the measured dip where the picks alone say flat", () => {
  const picks = [pick, { x: E0 + 400, y: N0, z: 1000, src: "pick" }, { x: E0, y: N0 + 400, z: 1000, src: "pick" }, { x: E0 - 400, y: N0 - 300, z: 1000, src: "pick" }];
  const g = downholeDipGuides([pick], rows, { types: ["CON"], windowM: 3, reachM: 20 });
  const ep = explicitPoints({ picks, lines: [] }, [], { extraLines: g.lines });
  assert.equal(ep.downholeLines, 2);
  const res = fitExplicitSurface(ep.points, { frame: "map", resolution: 60 });
  // vertices within 15 m down-dip of the pick lie on the measured plane z = 1000 - (x - E0); without the guide, flat at 1000
  const near = [];
  for (let i = 0; i < res.positions.length; i += 3) { const dx = res.positions[i] - E0, dy = res.positions[i + 1] - N0; if (dx > 3 && dx < 15 && Math.abs(dy) < 3) near.push([dx, res.positions[i + 2]]); }
  assert.ok(near.length > 0);
  for (const [dx, z] of near) assert.ok(Math.abs(z - (1000 - dx)) < 1.5, `${dx.toFixed(1)} m east: ${z.toFixed(2)}`);
});
