// TASKS.csv #2962 (review #2876, WA iron) — two collars recorded at 0 m on a 433 m plateau pulled 'the ground interpolated between the nearest
// collars' down to 0.1-9 m, and the lowest-collar rule (#2584) kept the bad collars and left the surveyed twins out ('a pit or benches?').
// The collar ground now leaves out, first, collars whose elevation is not ground by the shared rule (#3004), and the note names them.
import test from "node:test";
import assert from "node:assert/strict";
import { collarBenches, collarGround, collarsLookUnderground } from "../src/lib/pitShell.js";
import { collarLevelsText } from "../src/lib/collarLevelsText.js";

// a plateau of surveyed collars at 430-436 m on a 600 m grid, with RHDMET_0154 (433.065) and its twin RHRCMET_0154_A at 0.0 m 2.5 m away,
// RHDMET_0155 (417.8) with RHRCMET_0155_A at 0.0, and three bores at the import's median (438.811) beside surveyed twins at 424-426 m
const field = [];
for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) field.push({ hole_id: `S${i}${j}`, x: 804000 + i * 600, y: 7507000 + j * 600, z: 430 + ((i + j) % 4) * 2 });
const bad = [
  { hole_id: "RHDMET_0154", x: 804995, y: 7508228, z: 433.065 }, { hole_id: "RHRCMET_0154_A", x: 804997.5, y: 7508228, z: 0 },
  { hole_id: "RHDMET_0155", x: 806200, y: 7509400, z: 417.8 }, { hole_id: "RHRCMET_0155_A", x: 806202.5, y: 7509400, z: 0 },
  { hole_id: "B1", x: 805500, y: 7507500, z: 438.811, zAssumed: "median" }, { hole_id: "T1", x: 805503, y: 7507500, z: 424 },
  { hole_id: "B2", x: 805800, y: 7507900, z: 438.811, zAssumed: "median" }, { hole_id: "T2", x: 805803, y: 7507900, z: 425 },
  { hole_id: "B3", x: 806100, y: 7508300, z: 438.811, zAssumed: "median" }, { hole_id: "T3", x: 806103, y: 7508300, z: 426 },
];
const collars = [...field, ...bad];

test("#2962 the 0 m collars and the median-assumed bores are not ground: the surveyed twins stand", () => {
  const b = collarBenches(collars);
  assert.deepEqual(b.untrusted.map((c) => [c.hole_id, c.why]).sort(), [["B1", "assumed"], ["B2", "assumed"], ["B3", "assumed"], ["RHRCMET_0154_A", "suspect"], ["RHRCMET_0155_A", "suspect"]]);
  assert.ok(!b.higher.some((c) => ["RHDMET_0154", "RHDMET_0155", "T1", "T2", "T3"].includes(c.hole_id)), "the surveyed collars are not left out as 'higher'");
  // the review's typed collar 5 m from the pair, and 12 / 27 / 50 m away: about the plateau, not 0.1-9 m
  const g = collarGround(collars);
  for (const [x, y] of [[804995, 7508230], [805002, 7508238], [805015, 7508238], [805040, 7508238]]) assert.ok(g(x, y) > 400, `${x}: ${g(x, y)}`);
});

test("#2962 a terrain-filled elevation is ground; with nothing trusted the collars are used as before", () => {
  const t = collarBenches([...field, { hole_id: "TR", x: 805000, y: 7508000, z: 431, zAssumed: "terrain" }]);
  assert.ok(!t.untrusted.some((c) => c.hole_id === "TR"));
  const allAssumed = field.map((c) => ({ ...c, zAssumed: "median", z: 438.8 }));
  const a = collarBenches(allAssumed);
  assert.equal(a.kept.length, allAssumed.length); assert.equal(a.untrusted.length, 0);
});

test("#2962 the note names the collars left out", () => {
  const text = collarLevelsText(collars);
  assert.match(text, /5 collar\(s\) left out of the ground between the collars, their elevation not being ground/);
  assert.match(text, /RHRCMET_0154_A \(0 m\)/);
  assert.match(text, /B1 \(438\.8 m\)/);
  assert.equal(collarLevelsText(field), null, "a clean field: no note");
});

test("#2962 untrusted collars are no evidence of underground drilling (the Elev offer, the pit and the solver read it)", () => {
  // 5 'stacked' pairs here (each bad collar 2.5-3 m from a surveyed one, more than 10 m apart) would be 11 % of 46 collars
  const r = collarsLookUnderground(collars, []);
  assert.equal(r.stacked, 0); assert.equal(r.underground, false);
  // real stacked collars (levels 60 m apart) still count
  const levels = []; for (let i = 0; i < 10; i++) levels.push({ hole_id: `L${i}a`, x: i * 100, y: 0, z: 300 }, { hole_id: `L${i}b`, x: i * 100 + 2, y: 0, z: 240 });
  assert.equal(collarsLookUnderground(levels, []).underground, true);
});
