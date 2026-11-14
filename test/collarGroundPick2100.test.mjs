// TASKS.csv #2100 (review #2013, Woodjam) — with no terrain, a pick that hits nothing and the collar solver use the ground interpolated
// between the nearest collars, not a flat plane at the data origin's elevation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarGround } from "../src/lib/pitShell.js";
import { solveCollarForTarget } from "../src/lib/holePlanning.js";
const f = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the collars' ground near TK10-23 is about 1,000 m, not the 967 m plane; the solver lands a collar on it", () => {
  const collars = [{ x: 0, y: 0, z: 1018.9 }, { x: 400, y: 0, z: 1000.8 }, { x: 0, y: 400, z: 1005.7 }, { x: 400, y: 400, z: 1002 }, { x: 5000, y: 5000, z: 900 }];
  const g = collarGround(collars);
  const z = g(200, 200);
  assert.ok(z > 1000 && z < 1019, String(z));
  const r = solveCollarForTarget({ x: 200, y: 200, z: 700 }, 0, -60, { groundAt: g, surfaceZ: NaN });
  assert.ok(r && Math.abs(r.z - g(r.x, r.y)) < 1, JSON.stringify(r));
});

test("the form uses it for a pick on nothing and for Solve collar, and says so", () => {
  assert.match(f, /const collarZ = useMemo\(\(\) => \(!groundAt && collars\?\.length \? collarGround\(collars\) : null\), \[groundAt, collars\]\);/);
  // #3335 — the collar ground judged by the site spacing (collarFillAt), so a pick far from any collar gets no Elev
  assert.match(f, /const fc = !pickedPoint\.on && collarZ \? collarFillAt\(collarZ, siteSpacing, pickedPoint\.x, pickedPoint\.y\) : null;/);
  assert.match(f, /\{ groundAt: ground \|\| null, surfaceZ:/);
  assert.match(f, /the ground interpolated between the nearest collars \(no terrain\)/);
});
