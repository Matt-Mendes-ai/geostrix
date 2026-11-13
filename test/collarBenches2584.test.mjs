// TASKS.csv #2584 — collars of a pit's benches side by side: the collar ground uses the lowest there, and the tools say so
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarBenches, collarGround, idwGround, BENCH_PLAN_M, BENCH_RL_M } from "../src/lib/pitShell.js";

// the review's collars (WA lithium pegmatite, grade control in a mined pit): target at E 413650, N 6253130
const T = { x: 413650, y: 6253130 };
const at = (d, bearing, z) => ({ x: T.x + d * Math.sin(bearing * Math.PI / 180), y: T.y + d * Math.cos(bearing * Math.PI / 180), z });
const pit = [at(3.4, 0, 230.0), at(10.3, 180, 219.8), at(11.0, 160, 234.7), at(15.1, 200, 219.8), at(40, 90, 220.1), at(45, 270, 219.6)];

test("a collar with one more than 5 m lower within 15 m in plan is left out; the ground there follows the lower bench", () => {
  assert.equal(BENCH_PLAN_M, 15); assert.equal(BENCH_RL_M, 5);
  const b = collarBenches(pit);
  assert.deepEqual(b.higher.map((c) => c.z).sort(), [230.0, 234.7]);
  assert.equal(b.kept.length, 4);
  const before = idwGround(pit)(T.x, T.y), after = collarGround(pit)(T.x, T.y);
  assert.ok(before > 225, String(before)); // the surface through every collar: a ground that never existed
  assert.ok(after < 220.5 && after > 219.5, String(after)); // the present floor
  // at a left-out collar's own position the ground is the bench below, not the collar
  assert.ok(collarGround(pit)(pit[0].x, pit[0].y) < 221);
});

test("gentle ground and lone collars are untouched; a 5 m step exactly is not a bench", () => {
  const gentle = Array.from({ length: 25 }, (_, k) => ({ x: (k % 5) * 12, y: Math.floor(k / 5) * 12, z: 300 + (k % 5) * 12 * Math.tan(15 * Math.PI / 180) }));
  assert.equal(collarBenches(gentle).higher.length, 0); // a 15 degree slope: 3.2 m per 12 m
  assert.equal(collarBenches([{ x: 0, y: 0, z: 100 }, { x: 10, y: 0, z: 95 }]).higher.length, 0);
  assert.equal(collarBenches([{ x: 0, y: 0, z: 100 }, { x: 16, y: 0, z: 80 }]).higher.length, 0); // over 15 m apart
  assert.equal(collarBenches([{ x: 0, y: 0, z: 100 }, { x: 15, y: 0, z: 94 }]).higher.length, 1);
  assert.equal(collarBenches([]).higher.length, 0);
  assert.equal(collarGround([]), null);
  // the same answer as the old ground when no collar is left out
  const g0 = idwGround(gentle), g1 = collarGround(gentle);
  for (const [x, y] of [[5, 5], [30, 17], [-20, 70]]) assert.equal(g1(x, y), g0(x, y));
});

test("the column tops and the weathered base keep the plain interpolation; every collar-ground tool shows the note", () => {
  const s = fs.readFileSync("src/lib/pitShell.js", "utf8");
  assert.match(s, /return idwGround\(\[\.\.\.tops\.values\(\)\]\);/);
  assert.match(s, /const at = pts\.length \? idwGround\(pts\) : null;/);
  for (const f of ["PitShellPane", "PitDesignPane", "NestedPitsPane", "DumpPane", "DesignLinesPane", "DesignStringsPane", "UndrilledZonesPane", "StopesPane", "PlannedHoleParts", "GradeEstimationModal"]) {
    assert.match(fs.readFileSync(`src/components/${f}.jsx`, "utf8"), /<CollarLevelsNote collars=\{collars\}/, f);
  }
  const n = fs.readFileSync("src/lib/collarLevelsText.js", "utf8"); // the note's text, moved out of CollarLevelsNote.jsx (#2962)
  assert.match(n, /n === 1\s*\? tr\("1 collar has another collar within \{plan\} m/);
  assert.match(fs.readFileSync("src/components/GradeEstimationModal.jsx", "utf8"), /so the lowest collar is used there \(benches\)/);
});
