// TASKS.csv #2927 (review #2876, WA bedded iron) — flat interbedded strands were described as veins and intrusions ('SONAM repeats in 26 % of
// the holes that log it: it behaves like a steep body or a set of sheets … Veins / dykes models it as a body'), where the repeats are 2 m
// interbeds of its stack neighbours (SONAM / ONAM / SONAM). On a near-flat pile whose repeats are split by the same neighbours the run now
// says 'interbedded with X' and names the route that takes one top per hole; the pick check and the fold-back check name interbeds first.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { interbeds, planeDipDeg } from "../src/lib/pileTops.js";

const L = (from, value) => ({ from, value });
const rows = new Map([
  ["A", [L(0, "TNAM"), L(4, "SONAM"), L(6, "ONAM"), L(8, "SONAM"), L(12, "SNAM")]],
  ["B", [L(0, "SONAM"), L(2, "ONAM"), L(4, "ONAM"), L(6, "SONAM")]],
  ["C", [L(0, "SONAM"), L(3, "CLA"), L(5, "SONAM"), L(7, "ONAM"), L(9, "SONAM")]],
  ["D", [L(0, "SONAM"), L(9, "SNAM")]], // no repeat
]);

test("between a unit's first and last run in each repeating hole: which units, in how many holes", () => {
  const r = interbeds(["A", "B", "C", "D"], (h) => rows.get(h), (v) => v === "SONAM");
  assert.equal(r.of, 3, "D does not repeat SONAM");
  assert.deepEqual(r.map((q) => [q.code, q.holes]), [["ONAM", 3], ["CLA", 1]]);
  assert.deepEqual(interbeds(["D"], (h) => rows.get(h), (v) => v === "SONAM").length, 0);
});

test("the plane's dip through the first tops: near flat, steep, or undefined", () => {
  const flat = [], steep = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { flat.push({ x: i * 50, y: j * 50, z: 400 - 0.05 * i * 50 }); steep.push({ x: i * 50, y: j * 50, z: 400 - 1.5 * i * 50 }); }
  assert.ok(Math.abs(planeDipDeg(flat) - Math.atan(0.05) * 180 / Math.PI) < 1e-9);
  assert.ok(planeDipDeg(steep) > 56 && planeDipDeg(steep) < 57);
  assert.ok(Number.isNaN(planeDipDeg([{ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }])), "in a line");
});

test("wiring: the interbedded wording on a near-flat pile, the vein wording otherwise; interbeds first in the pick and fold-back checks", () => {
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  // #3262 — the dip test moved into looksLikeFlatPile (lib/pileTops.js: dip <= 15 and the first tops close to their plane, no cross-cutting role)
  assert.match(r, /const ib = pile && unitVals \? interbeds\(/);
  assert.match(r, /const split = ib\.filter\(\(q\) => q\.holes >= 0\.5 \* ib\.of\)\.slice\(0, 3\);/);
  assert.ok(r.includes("interbedded with {list} (in {n} of those {m} holes)") && r.includes("it behaves like a steep body or a set of sheets"));
  assert.ok(r.includes(": usually interbeds of neighbouring units in a flat pile"));
  const t = readFileSync(new URL("../src/lib/topology.js", import.meta.url), "utf8");
  assert.ok(t.includes("a real overturned fold, interbeds of neighbouring units in a flat pile"));
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    assert.ok(Object.keys(d).some((k) => k.includes("interbedded with {list}")), l);
    assert.ok(Object.keys(d).filter((k) => k.includes("interbeds of neighbouring units in a flat pile")).length === 2, l);
  }
});
