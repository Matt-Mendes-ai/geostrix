// TASKS.csv #3426 (split from #3336) — on a shared pad the separation to the pad's holes was judged at the toe only; a hole planned to a target
// is also judged where it meets it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planChecks, drilledTraceIndex, padClearance } from "../src/lib/plannedHoleChecks.js";

const collars = [
  { hole_id: "PD-12", x: 1000, y: 1000, z: 1200, azimuth: 0, dip: -60, length: 400 },
  { hole_id: "PD-13", x: 1003, y: 1002, z: 1200, azimuth: 40, dip: -60, length: 400 },
];
const survey = collars.flatMap((c) => [0, 200, 400].map((d) => ({ hole_id: c.hole_id, depth: d, azimuth: c.azimuth, dip: c.dip })));
const drilled = drilledTraceIndex(collars, survey, "minimum_curvature");
const fan = { id: "p1", name: "Fan", x: 1001, y: 1001, z: 1200, azimuth: 100, dip: -70, length: 400 };

test("a hole with a target gets the separation to each pad hole where it meets the target; one without gets none", () => {
  // the target 150 m down the fan hole
  const dip = (-70 * Math.PI) / 180, az = (100 * Math.PI) / 180, L = 150;
  const target = { x: 1001 + L * Math.cos(dip) * Math.sin(az), y: 1001 + L * Math.cos(dip) * Math.cos(az), z: 1200 + L * Math.sin(dip) };
  const [r] = planChecks([{ ...fan, target }], drilled, []);
  for (const p of r.padProfile) {
    assert.ok(p.target, p.hole_id);
    assert.ok(Math.abs(p.target.md - 150) < 4, String(p.target.md));
    assert.ok(Math.abs(p.target.d - p.d[p.md.indexOf(p.target.md)]) < 1e-9);
  }
  const [none] = planChecks([fan], drilled, []);
  assert.ok(none.padProfile.every((p) => !("target" in p)));
});

test("padClearance: the target is added only when the profile has one; inside flags the minimum", () => {
  const prof = { md: [0, 50, 100, 150], d: [2, 40, 80, 120], target: { md: 100, d: 80 } };
  assert.deepEqual(padClearance(prof, 60), { below: 100, toe: 120, inside: false, target: { md: 100, d: 80, inside: false } });
  assert.equal(padClearance(prof, 90).target.inside, true);
  assert.deepEqual(padClearance({ md: [0, 50, 100, 150], d: [2, 40, 80, 120] }, 60), { below: 100, toe: 120, inside: false });
});

test("wiring: the pane says the target separation and flags it; keys", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('tr("At the target ({md} m down) it is {d} m apart: within the minimum."'));
  assert.ok(p.includes("pads.some((x) => x.c.inside || x.c.target?.inside)"));
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of ["At the target ({md} m down) it is {d} m apart: within the minimum.", "At the target ({md} m down) it is {d} m apart."]) assert.ok(d[k], `${l}: ${k}`); }
});
