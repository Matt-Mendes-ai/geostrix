// TASKS.csv #3335 (review #3195, Galore Creek) — a planned collar kilometres from any hole got an Elev to the tenth of a metre from 'the ground
// interpolated between the nearest collars', in the same words as 190 m from a collar. What it rests on is said now; past one site spacing it
// is to the metre; past three, nothing is offered.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { idwGround } from "../src/lib/collarGround.js";
import { collarFillAt, collarFillGround, collarFillSource, distanceText, FAR_SPACINGS } from "../src/lib/collarFill.js";

// two clusters of collars 272 m apart in each, 720 m between their rims; elevations 1,199 to 1,596 m
const collars = [];
for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) collars.push({ x: i * 272, y: j * 272, z: 1199 + 10 * (i + j) });
for (let i = 0; i < 2; i++) collars.push({ x: 1536 + i * 272, y: 0, z: 1596 - i * 50 });
const ground = idwGround(collars), S = 272;

test("near: the nearest collar's plan distance and the elevations of the collars used", () => {
  const n = ground.near(100, 0);
  assert.equal(n.nearestM, 100);
  assert.equal(n.used, 4);
  assert.ok(n.zMin >= 1199 && n.zMax <= 1596 && n.zMin <= n.zMax);
  assert.equal(ground(100, 0), ground(100, 0), "the value itself is unchanged by near()");
});

test("within a spacing: to 0.1 m; past one: to the metre; past three: nothing", () => {
  const a = collarFillAt(ground, S, 136, 136); // inside the grid
  assert.ok(a.nearestM < S && !a.coarse && !a.far);
  assert.equal(a.z, Math.round(ground(136, 136) * 10) / 10);
  const b = collarFillAt(ground, S, 816 + 400, 0); // ~400 m from the nearest collar
  assert.ok(b.coarse && !b.far);
  assert.equal(b.z, Math.round(ground(1216, 0)));
  const c = collarFillAt(ground, S, 360000, 6330000); // kilometres away
  assert.ok(c.far); assert.equal(c.z, null);
  assert.ok(c.nearestM > FAR_SPACINGS * S);
  // no site spacing known: as before, to 0.1 m and the distance said
  const d = collarFillAt(ground, null, 360000, 6330000);
  assert.equal(d.far, false); assert.equal(d.z, Math.round(ground(360000, 6330000) * 10) / 10);
  // a terrain (no .near): its value to 0.1 m, nothing else
  const terrain = (x, y) => 500 + x / 1000 + y / 3000;
  assert.deepEqual(collarFillAt(terrain, S, 1000, 3000), { z: 502 });
  assert.equal(collarFillAt(ground, S, NaN, 0), null);
});

test("the pattern / import ground: NaN where nothing is offered; the z_source words; distances", () => {
  const g = collarFillGround(ground, S);
  assert.ok(Number.isFinite(g(136, 136)));
  assert.ok(Number.isNaN(g(360000, 6330000)));
  assert.equal(collarFillGround(null, S), null);
  assert.equal(distanceText(187.4), "187 m");
  assert.equal(distanceText(3612), "3.6 km");
  const w = collarFillSource(collarFillAt(ground, S, 1216, 0));
  assert.match(w, /^the ground interpolated between the nearest collars \(no terrain; nearest collar \d+ m away, collars used \d+ to \d+ m, to the metre\)$/);
  assert.equal(collarFillSource(null), "the ground interpolated between the nearest collars (no terrain)");
});

test("wiring: the typed E / N offer, the pick, the pattern and the import judge the collar ground; keys", () => {
  const p = readFileSync(new URL("../src/components/PlannedHoleParts.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /if \(collarZ && !groundAt\) return collarFillAt\(collarZ, siteSpacing, x, y\);/);
  assert.match(p, /if \(fc\?\.far\) \{/);
  assert.match(p, /\{zOffer\.z != null && <button/);
  assert.match(p, /groundLabel=\{groundAt \? "the terrain under the hole" : \(x, y\) => collarFillSource\(fillAt\(x, y\)\)\}/);
  const pat = readFileSync(new URL("../src/components/PlannedHolePattern.jsx", import.meta.url), "utf8");
  assert.match(pat, /zSource: typeof groundLabel === "function" \? groundLabel\(h\.x, h\.y\) : groundLabel/);
  const keys = ["Elev is blank: {z} from the ground interpolated between the nearest collars (no terrain): the nearest collar is {d} away, the collars used stand at {a} to {b} m.", "No Elev offered: the nearest collar is {d} away, over three times the site spacing ({s} m), so the ground between the collars says nothing here. Type the Elev, or load a terrain."];
  for (const k of keys) assert.ok(p.includes(`tr("${k}"`), k);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
