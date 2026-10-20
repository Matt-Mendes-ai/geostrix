// TASKS.csv #765 — structure picks averaged per hole in depth windows, never across a fold or an overturned limb
import { test } from "node:test";
import assert from "node:assert/strict";
import { thinStructurePicks, gradientOf, orientationOfGradient } from "../src/lib/viewer/orientationThin.js";

test("gradient round trip, including overturned", () => {
  for (const [d, a, o] of [[30, 120, false], [5, 350, false], [70, 200, true]]) {
    const r = orientationOfGradient(gradientOf(d, a, o));
    assert.ok(Math.abs(r.dip - d) < 1e-9 && Math.abs(((r.azimuth - a + 540) % 360) - 180) < 1e-9 && r.overturned === o);
  }
});

test("scattered picks in one window average to the true plane", () => {
  const rows = [[28, 265], [32, 275], [30, 262], [31, 278], [29, 270]].map(([dip, azimuth], i) => ({ hole_id: "H1", depth: 100 + i * 5, dip, azimuth, value: "CON" }));
  const t = thinStructurePicks(rows);
  assert.equal(t.after, 1);
  assert.ok(Math.abs(t.rows[0].dip - 30) < 1 && Math.abs(t.rows[0].azimuth - 270) < 2);
  assert.equal(t.rows[0].nPicks, 5); assert.equal(t.rows[0].value, "CON"); assert.ok(Math.abs(t.rows[0].depth - 110) < 1e-9);
});

test("windows split by depth and by angle (a fold limb, an overturned pick)", () => {
  const rows = [
    { hole_id: "H1", depth: 10, dip: 30, azimuth: 90 }, { hole_id: "H1", depth: 20, dip: 32, azimuth: 92 },
    { hole_id: "H1", depth: 30, dip: 30, azimuth: 270 },                    // other fold limb: 60 deg away -> new window
    { hole_id: "H1", depth: 140, dip: 30, azimuth: 270 },                   // > 50 m further -> new window
    { hole_id: "H1", depth: 145, dip: 30, azimuth: 270, overturned: true }, // overturned: gradient reversed -> new window
    { hole_id: "H2", depth: 12, dip: 30, azimuth: 90 },                     // another hole
    { x: 1, y: 2, z: 3, dip: 10, azimuth: 0 },                              // outcrop (no hole): kept as is
  ];
  const t = thinStructurePicks(rows);
  assert.equal(t.before, 7); assert.equal(t.after, 6);
  const h1 = t.rows.filter((r) => r.hole_id === "H1");
  assert.equal(h1.length, 4);
  assert.equal(h1.find((r) => r.overturned)?.nPicks, 1);
});
