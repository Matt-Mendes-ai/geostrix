// TASKS.csv #2433 (review #2325, WA uranium) — the arc pattern stands as close to the typed slope as the cap allows, and never steeper
// for a flatter typed slope; the pit's name and the Pit design check quote the walls as drawn
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { precedenceArcs, coneWalls, wallAngles, MAX_ARCS } from "../src/lib/pitShell.js";
import { slopeName, shellWallCompare } from "../src/lib/pitWalls.js";

test("6 m cubes: 27-29 deg no longer fall back to the 35-43 deg one-level pattern", () => {
  for (const s of [27, 28, 29]) {
    const a = precedenceArcs(6, 6, 6, s), w = wallAngles(6, 6, 6, s);
    assert.ok(a.length <= MAX_ARCS, String(a.length));
    assert.ok(w.flattest < 33 && w.steepest < 34, `${s}: ${w.flattest}-${w.steepest}`); // 32.3-33.2, as 30 deg (was 35.3-42.8)
    assert.ok(w.flattest >= s - 1e-6); // never flatter than typed
  }
});

test("the attained wall never steepens as the typed slope flattens (15-70 deg, 6 m and 12 x 12 x 6 m cells)", () => {
  for (const [dx, dz] of [[6, 6], [12, 6]]) {
    let prev = 0;
    for (let s = 15; s <= 70; s++) {
      const a = precedenceArcs(dx, dx, dz, s);
      assert.ok(a && a.length <= MAX_ARCS, `${dx}/${s}: a pattern within the cap`); // 15-18 deg on 6 m cubes had none
      const f = coneWalls(a, dx, dx, dz).flattest;
      assert.ok(f >= s - 1e-6 && f + 1e-6 >= prev, `${dx}/${s}: ${f} after ${prev}`);
      prev = f;
    }
  }
});

test("the pit's name and the Pit design check say the walls as drawn", () => {
  assert.equal(slopeName(45, { flattest: 45.0, steepest: 45.8 }), "45");
  assert.equal(slopeName(28, { flattest: 32.3, steepest: 33.2 }), "28° typed, walls 32–33");
  assert.equal(slopeName(28, null), "28");
  assert.deepEqual(shellWallCompare(30, [32.3, 33.2], 28), { side: -1, walls: [32.3, 33.2] }); // flatter than the walls, though steeper than typed
  assert.equal(shellWallCompare(32.8, [32.3, 33.2], 28), null);
  assert.deepEqual(shellWallCompare(30, null, 28), { side: 1 }); // an older pit: the typed slope, as before
  const p = readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
  assert.match(p, /slope: slopeName\(inputs\.slopeDeg, inputs\.sectorSlopes \? null : r\.walls\)/);
  const n = readFileSync(new URL("../src/components/NestedPitsPane.jsx", import.meta.url), "utf8");
  assert.match(n, /slope: slopeName\(inputs\.slopeDeg, /);
  const d = readFileSync(new URL("../src/components/PitDesignPane.jsx", import.meta.url), "utf8");
  assert.match(d, /shellWallCompare\(interRamp, pit\?\.params\?\.wallAnglesDeg, shellSlope/);
});
