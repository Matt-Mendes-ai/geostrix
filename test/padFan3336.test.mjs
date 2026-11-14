// TASKS.csv #3336 (review #3195, Galore Creek) — a second hole fanned from an existing pad always failed the spacing check ('PD23-013 — 12.8 m
// (within the 67.9 m minimum), at 51 m down this hole', one metre past the 50 m left out, for a hole 123 m from it at the toe). The pad's own
// holes are followed down the whole hole: from which depth it clears the minimum, how far apart the toes are; red only when still inside at
// the toe. The nearest-hole check proper is against the holes off the pad.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planChecks, drilledTraceIndex, padClearance } from "../src/lib/plannedHoleChecks.js";

// the pad: PD-12 (az 0, dip -60) and PD-13 (az 40, dip -60) from one collar; another hole 400 m east
const collars = [
  { hole_id: "PD-12", x: 1000, y: 1000, z: 1200, azimuth: 0, dip: -60, length: 400 },
  { hole_id: "PD-13", x: 1003, y: 1002, z: 1200, azimuth: 40, dip: -60, length: 400 },
  { hole_id: "OFF-1", x: 1400, y: 1000, z: 1180, azimuth: 270, dip: -70, length: 300 },
];
const survey = collars.flatMap((c) => [0, 200, 400].map((d) => ({ hole_id: c.hole_id, depth: d, azimuth: c.azimuth, dip: c.dip })));
const drilled = drilledTraceIndex(collars, survey, "minimum_curvature");
const fan = { id: "p1", name: "Fan", x: 1001, y: 1001, z: 1200, azimuth: 100, dip: -70, length: 400 };

test("a fan from the pad: the pad's holes followed down the hole, clear of the minimum below some depth; the off-pad hole checked from the collar", () => {
  const [r] = planChecks([fan], drilled, []);
  assert.deepEqual(r.samePad.sort(), ["PD-12", "PD-13"]);
  assert.equal(r.padProfile.length, 2);
  const p13 = r.padProfile.find((p) => p.hole_id === "PD-13");
  assert.ok(p13.d[0] < 5, "together at the collar");
  assert.ok(p13.d[p13.d.length - 1] > 100, `apart at the toe: ${p13.d[p13.d.length - 1]}`);
  for (let i = 1; i < p13.d.length; i++) assert.ok(p13.md[i] >= p13.md[i - 1]);
  const c = padClearance(p13, 67.9);
  assert.ok(c.below > 50 && c.below < 400 && !c.inside, JSON.stringify(c));
  assert.ok(Math.abs(c.toe - p13.d[p13.d.length - 1]) < 1e-9);
  assert.equal(r.nearestOff.hole_id, "OFF-1");
  // the old check: the nearest after the 50 m left out is a pad hole, about a metre past them
  assert.ok(["PD-12", "PD-13"].includes(r.nearestReal.hole_id));
});

test("padClearance: never inside; inside at the toe; no minimum", () => {
  const prof = { md: [0, 50, 100, 150], d: [2, 40, 80, 120] };
  assert.deepEqual(padClearance(prof, 60), { below: 100, toe: 120, inside: false });
  assert.deepEqual(padClearance(prof, 1), { below: 0, toe: 120, inside: false });
  assert.deepEqual(padClearance(prof, 200), { below: null, toe: 120, inside: true });
  assert.deepEqual(padClearance(prof, null), { below: null, toe: 120, inside: false });
  assert.equal(padClearance({ md: [], d: [] }, 60), null);
});

test("a hole not on a pad keeps the old result shape", () => {
  const [r] = planChecks([{ ...fan, id: "p2", x: 1200, y: 1300 }], drilled, []);
  assert.deepEqual(r.samePad, []);
  assert.equal("padProfile" in r, false);
});

test("wiring: the pane says the pad by depth and at the toe, flags the toe and the off-pad hole; keys", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const nearestReal = onPad \? nearestOff : nearest0;/);
  assert.match(p, /const padTooClose = minSpacing > 0 && pads\.some\(\(x\) => x\.c\.inside\);/);
  assert.match(p, /\) : onPad \? null \/\* #3336/);
  const keys = ["Same pad as {holes}.", "{hole}: {toe} m apart at the toe.", "{hole}: within the {min} m minimum all the way to the toe ({toe} m apart there).", "{hole}: within the {min} m minimum down to {md} m down this hole; {toe} m apart at the toe."];
  for (const k of keys) assert.ok(p.includes(`tr("${k}"`), k);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
