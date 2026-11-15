// TASKS.csv #3551 (Fireweed rehearsal, Macpass) — underground per collar, not per project: 'Terrain from this project's samples and collars' took
// Macpass's 80 UDDH collars as ground (worst -163.6 m at TU078, 146 collars more than 5 m off) because the per-project check stays quiet at 10
// upward holes of 559 (1.8 %). Collars typed underground, holes that start upward, and flat-drilled stations far under a collar nearby are now
// left out of the collar ground and said; pit benches and surface holes are not.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import Papa from "papaparse";
import { undergroundCollars, surfaceCollars, typedUnderground, collarsLookUnderground, collarGround, UNDER_RL_M } from "../src/lib/collarGround.js";
import { normalizeHoleType } from "../src/lib/holeType.js";
import { terrainFromPoints } from "../src/lib/terrainFromPoints.js";
import { surfaceMisfit } from "../src/lib/collarBenches.js";
import { collarLevelsText } from "../src/lib/collarLevelsText.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const table = (f) => Papa.parse(read(`../sample_data/yk_macpass/${f}`).replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;
// as the import stores them: the file's column kept, the normalized 'hole type' beside it (#2161); dips stored as degrees below horizontal (#339)
const macpass = () => {
  const collars = table("collars.csv").map((r) => ({ hole_id: r.hole_id, x: +r.x, y: +r.y, z: +r.z, attrs: { hole_type: r.hole_type, "hole type": normalizeHoleType(r.hole_type) } }));
  const survey = table("survey.csv").map((r) => ({ hole_id: r.hole_id, depth: +r.depth, azimuth: +r.azimuth, dip: -r.dip }));
  return { collars, survey };
};
const terrainOf = (pts) => { const t = terrainFromPoints({ points: pts.map((c) => ({ x: c.x, y: c.y, z: c.z })) }, { gridMax: 200, spacingFit: true }); return { bbox: t.bbox, gridW: t.gridW, gridH: t.gridH, elevations: t.elevations, noDataMask: t.noDataMask }; };

test("Macpass: the 80 UDDH collars are left out by their hole type, and the project is a surface project", () => {
  const { collars, survey } = macpass();
  const u = undergroundCollars(collars, survey);
  const uddh = collars.filter((c) => c.attrs.hole_type === "UDDH");
  assert.equal(uddh.length, 80);
  assert.equal(u.typed, 80);
  assert.ok(uddh.every((c) => u.ids.get(c.hole_id) === "type"));
  assert.equal(u.ids.size, 80, "no surface hole left out: TS015 turns up 4 degrees at 150 m, and still starts downward from surface");
  assert.equal(surfaceCollars(collars, survey).length, 479);
  const v = collarsLookUnderground(collars, survey);
  assert.equal(v.underground, false, "the per-project verdict is for the other 479 (one upward station among them)");
  assert.equal(v.typed, 80);
});

test("Macpass, pinned against the surface collars only: the terrain through them is within 6.2 m of them; through every collar it was 163.6 m off at TU078", () => {
  const { collars, survey } = macpass();
  const surf = surfaceCollars(collars, survey);
  const before = surfaceMisfit(collars, terrainOf(collars), 5);
  assert.equal(before.worst.id, "TU078");
  assert.ok(Math.abs(before.worst.dz + 163.6) < 0.06, `the rehearsal's -163.6 m (${before.worst.dz})`);
  assert.equal(before.over, 146, "the rehearsal's 146 more than 5 m off");
  const after = surfaceMisfit(surf, terrainOf(surf), 5);
  assert.ok(Math.abs(after.worst.dz) < 6.5, `worst ${after.worst.dz} (${after.worst.id})`);
  assert.ok(after.over <= 2, `${after.over} more than 5 m off`);
  assert.ok(after.median < 1);
});

test("Macpass: with no terrain, the ground between the collars stands above every UDDH collar (the stand-in Interpret, planned holes and the pit tools read)", () => {
  const { collars, survey } = macpass();
  const g = collarGround(collars), u = undergroundCollars(collars);
  const tu = collars.find((c) => c.hole_id === "TU078");
  assert.ok(g(tu.x, tu.y) > 1500, `TU078 ground ${g(tu.x, tu.y)} m (collar at 1,301.4 m)`);
  for (const c of collars) if (u.ids.has(c.hole_id)) assert.ok(g(c.x, c.y) - c.z > 80, `${c.hole_id}: ${(g(c.x, c.y) - c.z).toFixed(1)} m`);
  // the same without the survey: the hole type alone decides it here
  assert.equal(undergroundCollars(collars).ids.size, undergroundCollars(collars, survey).ids.size);
  // and every tool's note says so (CollarLevelsNote)
  const note = collarLevelsText(collars);
  assert.match(note, /^80 collar\(s\) look like underground drilling: 80 by their hole type \(UDDH, UG …\), 0 starting upward, 0 drilled flat or upward from a station far below a collar nearby \(TU001, /);
  assert.match(note, /They are left out of the ground between the collars\./);
  assert.match(note, /4 collars have another collar within 15 m in plan that is more than 5 m lower \(steep ground, benches or a pit\?\)/ /* #3654 (3) */, "#2584's check, now over the 479 surface collars only (steep pads)");
});

test("Macpass with its hole-type column removed: the holes that start upward and the flat-drilled stations under the hills are still found, no surface hole", () => {
  const { collars, survey } = macpass();
  const untyped = collars.map((c) => ({ ...c, attrs: {} }));
  const u = undergroundCollars(untyped, survey);
  const uddh = new Set(collars.filter((c) => c.attrs.hole_type === "UDDH").map((c) => c.hole_id));
  assert.ok([...u.ids.keys()].every((id) => uddh.has(id)), "only UDDH collars");
  assert.ok(u.upward >= 9 && u.under >= 40, `${u.upward} starting upward, ${u.under} under a collar nearby`);
});

test("the hole type: UDDH, UG DDH, U/G, Underground in a hole-type column; not in another column, and not DDH or RC", () => {
  for (const a of [{ "hole type": "UDDH" }, { Drill_Type: "UG DDH" }, { hole_type: "Underground" }, { HoleType: "U/G" }, { "hole type": "UGDD" }, { DRILL_METHOD: "underground core" }])
    assert.equal(typedUnderground({ attrs: a }), true, JSON.stringify(a));
  for (const a of [{ "hole type": "Diamond (DD)" }, { hole_type: "RC" }, { comment: "underground" }, { prospect: "UG zone" }, {}])
    assert.equal(typedUnderground({ attrs: a }), false, JSON.stringify(a));
  assert.equal(typedUnderground({}), false);
});

// a hillside of surface collars (50 m grid, z = 1000 + 0.1 x, drilled 60 degrees down) and an untyped drill station 150 m under it
const hillside = () => {
  const collars = [], survey = [];
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) { const id = `S${i}-${j}`, x = i * 50, y = j * 50; collars.push({ hole_id: id, x, y, z: 1000 + 0.1 * x }); survey.push({ hole_id: id, depth: 0, azimuth: 0, dip: 60 }); }
  return { collars, survey };
};
test("an untyped drill station under a hillside: the hole drilled up, the flat ones and the steep ones beside them are all left out; the hillside is not", () => {
  const { collars, survey } = hillside();
  [[-20, "U1"], [0, "U2"], [5, "U3"], [45, "U4"], [60, "U5"], [80, "U6"]].forEach(([dip, id], k) => {
    collars.push({ hole_id: id, x: 225 + k * 0.5, y: 225, z: 1022.5 - 150 + k * 0.3 });
    survey.push({ hole_id: id, depth: 0, azimuth: 90, dip });
  });
  const u = undergroundCollars(collars, survey);
  assert.equal(u.ids.get("U1"), "upward");
  for (const id of ["U2", "U3", "U4", "U5", "U6"]) assert.equal(u.ids.get(id), "under", id);
  assert.equal(u.ids.size, 6);
  const g = collarGround(collars, survey);
  assert.ok(Math.abs(g(225, 225) - 1022.5) < 0.5, `the ground over the station: ${g(225, 225)}`);
});

test("not underground: pit benches drilled down, a surface hole that turns up at depth, a flat hole on a hillside with no collar far above", () => {
  const { collars, survey } = hillside();
  // a pit: floor collars 60 m under the rim, 5 m away in plan, drilled steeply down (#2584's benches: the lowest is the floor)
  collars.push({ hole_id: "P1", x: 102, y: 100, z: 1010 - 60 }, { hole_id: "P2", x: 104, y: 103, z: 1010 - 45 });
  survey.push({ hole_id: "P1", depth: 0, azimuth: 0, dip: 70 }, { hole_id: "P2", depth: 0, azimuth: 0, dip: 90 });
  // a surface hole that flattens and turns up 4 degrees at 150 m (Macpass TS015)
  survey.push({ hole_id: "S3-3", depth: 150, azimuth: 0, dip: -4 });
  // a flat geotechnical hole from a collar on the hillside
  collars.push({ hole_id: "G1", x: 330, y: 330, z: 1033 }); survey.push({ hole_id: "G1", depth: 0, azimuth: 270, dip: 0 });
  const u = undergroundCollars(collars, survey);
  assert.equal(u.ids.size, 0, [...u.ids.keys()].join(","));
  assert.ok(UNDER_RL_M >= 30);
});

test("a project whose collars are all typed underground is an underground project; an untyped mine (#2217) is judged as before", () => {
  const { collars, survey } = hillside();
  const all = collars.map((c) => ({ ...c, attrs: { hole_type: "UDDH" } }));
  assert.equal(collarsLookUnderground(all, survey).underground, true);
  assert.equal(collarGround(all), null, "no collar is ground");
  // 12 holes drilled upward among 245, no type column: the per-project rule (#2217) still calls it underground
  const mine = [], sv = [];
  for (let k = 0; k < 245; k++) { mine.push({ hole_id: `M${k}`, x: (k % 20) * 30, y: Math.floor(k / 20) * 30, z: 200 + (k % 7) * 20 }); sv.push({ hole_id: `M${k}`, depth: 0, azimuth: 0, dip: k < 12 ? -30 : 45 }); }
  assert.equal(collarsLookUnderground(mine, sv).underground, true);
});

test("the terrain builder leaves them out, says how many and why, and offers to keep them; the stack note no longer assumes a pit", () => {
  const src = read("../src/modules/GeophysicsModule.jsx");
  assert.match(src, /const ugCollars = useMemo\(\(\) => undergroundCollars\(collars, survey\), \[collars, survey\]\);/);
  assert.match(src, /allCollarPts = groundCollarPts;/);
  assert.match(src, /const benches = useMemo\(\(\) => collarBenches\(groundCollarPts\), \[groundCollarPts\]\);/);
  assert.match(src, /undergroundCollarsText\(ugCollars\)\} \$\{ugMode === "out" \? tr\("They were left out of the terrain; 'Underground collars' can keep them\."\)/);
  assert.match(src, /<option value="out">\{tr\("Leave them out of the ground"\)\}<\/option>/);
  assert.match(src, /pit benches or mine levels\? The surface through all of them is not the topography there;/);
  assert.doesNotMatch(src, /benches drilled at different dates\?/);
});
