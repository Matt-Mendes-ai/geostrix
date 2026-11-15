// TASKS.csv #3343 (review #3195, Galore Creek) — planned holes were never checked against each other: two planned holes that cross or double up
// passed every check. Each planned hole's nearest other planned hole now, with the shared-pad rule; the pane flags it within the minimum.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { planChecks, nearestPlannedOf, COLLAR_ZONE_M } from "../src/lib/plannedHoleChecks.js";
import { plannedTrace } from "../src/lib/plannedTrace.js";

const plan = (id, x, y, azimuth, dip, length = 300) => ({ id, name: id, x, y, z: 1000, azimuth, dip, length });

test("two crossing planned holes find each other; a far one finds nothing; distances and depths", () => {
  // A goes east and B north, both at -45: at 212 m down each they meet 150 m east of A's collar, RL 850
  const holes = [plan("A", 0, 0, 90, -45), plan("B", 150, -150, 0, -45), plan("FAR", 5000, 5000, 0, -60)];
  const r = nearestPlannedOf(holes, holes.map((h) => plannedTrace(h)));
  assert.equal(r[0].name, "B"); assert.equal(r[1].name, "A"); assert.equal(r[2], null);
  assert.ok(r[0].distance < 10, String(r[0].distance));
  assert.ok(r[0].md > 100 && r[0].md < 250, String(r[0].md));
  assert.equal(r[0].samePad, false);
  // the same hole planned twice: 0 m from the collar down
  const twice = nearestPlannedOf([plan("X", 0, 0, 45, -60), plan("Y", 0, 0, 45, -60)], [plan("X", 0, 0, 45, -60), plan("Y", 0, 0, 45, -60)].map((h) => plannedTrace(h)));
  assert.ok(twice[0].samePad && twice[0].distance < 1e-6 && twice[0].md >= COLLAR_ZONE_M);
});

test("a fan from one planned pad leaves the first 50 m of both out; planChecks carries the entry", () => {
  const fan = [plan("F1", 0, 0, 0, -60), plan("F2", 2, 0, 90, -60)];
  const r = nearestPlannedOf(fan, fan.map((h) => plannedTrace(h)));
  assert.equal(r[0].samePad, true);
  assert.ok(r[0].md >= COLLAR_ZONE_M);
  assert.ok(r[0].distance > 20, String(r[0].distance));
  const checked = planChecks(fan, null, []);
  assert.equal(checked[0].nearestPlanned.name, "F2");
  assert.equal(planChecks([fan[0]], null, [])[0].nearestPlanned, undefined, "one planned hole: nothing to compare");
});

test("wiring: the pane says the nearest planned hole and flags it within the minimum; keys", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const plannedClose = minSpacing > 0 && !!nearestPlanned && nearestPlanned\.distance < minSpacing;/);
  assert.match(p, /\{nearestPlanned && <div style=\{\{ color: plannedClose \?/);
  const keys = ["Nearest planned hole: {name} — {distance} m{v}, at {md} m down this hole{pad}", " (same pad: the first {m} m of both are not compared)"];
  for (const k of keys) assert.ok(p.includes(`tr("${k}"`), k);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
