// TASKS.csv #634 — placing a DC/IP line from two known points (e.g. the first and last electrode's GPS stations).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineFromTwoPoints, lineGeometry } from "../src/lib/dcip.js";

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≈ ${b}`);

test("#634 two points land exactly where they were typed (3Firs line 9000E, stations 800 and 2100)", () => {
  const p = { s1: 800, x1: 609009, y1: 5786789, s2: 2100, x2: 608367, y2: 5787894 };
  const L = lineFromTwoPoints(p);
  const g = lineGeometry([L.x0, L.y0], [L.x1, L.y1], L.scale);
  const a = g.at(800), b = g.at(2100);
  near(a[0], 609009); near(a[1], 5786789); near(b[0], 608367); near(b[1], 5787894);
  near(g.azimuth, 329.84, 0.01); // NNW, as the waypoints run
  near(L.scale, Math.hypot(642, 1105) / 1300); // ground metres per file metre (GPS spacing vs chainage)
  const mid = g.at(1450); // half-way stays on the straight line between them
  near(mid[0], (609009 + 608367) / 2); near(mid[1], (5786789 + 5787894) / 2);
});

test("#634 points given in either order, and bad input", () => {
  const L = lineFromTwoPoints({ s1: 2100, x1: 608367, y1: 5787894, s2: 800, x2: 609009, y2: 5786789 });
  const g = lineGeometry([L.x0, L.y0], [L.x1, L.y1], L.scale);
  near(g.at(800)[0], 609009); near(g.at(2100)[1], 5787894);
  assert.equal(lineFromTwoPoints({ s1: 5, x1: 1, y1: 1, s2: 5, x2: 9, y2: 9 }), null, "same position");
  assert.equal(lineFromTwoPoints({ s1: 0, x1: 1, y1: 1, s2: 100, x2: 1, y2: 1 }), null, "same point");
  assert.equal(lineFromTwoPoints({ s1: 0, x1: "", y1: 1, s2: 100, x2: 1, y2: 1 }), null, "blank");
});
