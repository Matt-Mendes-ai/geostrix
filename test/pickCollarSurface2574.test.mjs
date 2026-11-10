// TASKS.csv #2574 (review #2486, WA lithium) — Pick on view with no terrain follows the click ray to the collar surface, not a flat plane
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pickOnCollarSurface } from "../src/modules/viewer/pickGround.js";
import { collarGround } from "../src/lib/pitShell.js";

// a ridge of collars at RL 330 over a plain at 250; the scene origin at the data's centre, RL 249 (the flat fallback plane)
const collars = [];
for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) collars.push({ hole_id: `H${i}_${j}`, x: 413500 + i * 25, y: 6252300 + j * 25, z: Math.abs(i) <= 1 ? 330 : 250 });
const origin = { x: 413500, y: 6252300, z: 249 };
// a perspective ray looking down at 45 degrees towards +x (scene coordinates: y up, z = -northing)
const dir = { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 };
const ray = { origin: { x: -150, y: 160, z: 0 }, direction: dir };
const planeHit = () => { const t = (0 - ray.origin.y) / ray.direction.y; return { x: ray.origin.x + dir.x * t + origin.x, y: -(ray.origin.z + dir.z * t) + origin.y, z: origin.z, on: null }; };

test("the pick lands where the ray meets the collar surface, not on the flat plane under it", () => {
  const flat = planeHit(); // the old pick: E 413510, 80 m under the ridge
  const p = pickOnCollarSurface(ray, flat, collars, origin);
  const g = collarGround(collars);
  assert.ok(p.onCollarSurface);
  assert.ok(Math.abs(g(p.x, p.y) - p.z) < 0.5, `${g(p.x, p.y)} vs ${p.z}`); // on the surface
  assert.ok(flat.x - p.x > 40, `${flat.x} vs ${p.x}`); // the review's 39-45 m: the plane hit lies past the ridge along the ray
  // and on the ray: the scene point is origin + t * dir
  const sx = p.x - origin.x, sy = p.z - origin.z, t = (sx - ray.origin.x) / dir.x;
  assert.ok(Math.abs(ray.origin.y + dir.y * t - sy) < 0.5);
});

test("a hit on a real object, or a project with terrain, is left as it is", () => {
  const hit = { x: 1, y: 2, z: 3, on: "collar RC545" };
  assert.equal(pickOnCollarSurface(ray, hit, collars, origin), hit);
  const flat = planeHit();
  assert.equal(pickOnCollarSurface(ray, flat, null, origin), flat);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /pickOnView\(raycaster\.ray, hits, \(h\) => worldPointFromHits\(raycaster, h\), terrain \? null : collars, originRef\.current\)/); // #2447: pickOnView ends in pickOnCollarSurface
});
