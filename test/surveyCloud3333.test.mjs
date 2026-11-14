// TASKS.csv #3333 (review #3195, Galore Creek) — Evidence overlay flattened a 3D IP cloud to plan: each cell took the 12 readings nearest in plan
// whatever their depth (RL 914 to 1,380 m in one cell), the Level did not touch it, and the result still said 'Read at RL 5,000 to 6,000 m'.
// A survey stacked in elevation is now read at the Level and says so; a surface survey stays a map; 'Read at RL' only when a card read it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveyPoints, surveyCloud, CLOUD_RATIO } from "../src/lib/evidenceSources.js";

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// an IP pseudo-section survey: 6 lines 200 m apart, stations every 25 m, 8 n-levels under each midpoint (pseudo-depths 12.5 m apart), the
// midpoints shifting half a spacing with n, on ground rising 30 m per 100 m
const ip = [];
for (let line = 0; line < 6; line++) for (let st = 0; st < 40; st++) for (let n = 1; n <= 8; n++) {
  const x = 352000 + st * 25 + n * 12.5, y = 6331700 + line * 200, ground = 1300 + 0.3 * (x - 352000);
  ip.push({ _src: "IP.xyz", x, y, z: ground - n * 12.5 * 4, value: 6 + 20 * rnd() });
}
// a ground magnetic survey on steep ground (45 degrees: 1,140 m of relief across 1,140 m), stations 10 m apart on lines 50 m apart
const mag = [];
for (let line = 0; line < 20; line++) for (let st = 0; st < 115; st++) mag.push({ _src: "mag", x: st * 10, y: line * 50, z: 500 + st * 10 + 5 * rnd(), value: 50000 + 100 * rnd() });
// an airborne survey at a constant 60 m clearance over rolling ground
const air = [];
for (let line = 0; line < 30; line++) for (let st = 0; st < 200; st++) air.push({ _src: "air", x: st * 15, y: line * 100, z: 800 + 80 * Math.sin(st / 20) + 60, value: rnd() });

test("surveyCloud: a pseudo-section is a cloud; a ground survey on 45-degree ground and an airborne survey are maps; no elevations: null", () => {
  const c = surveyCloud(surveyPoints(ip, "IP.xyz"));
  assert.equal(c.cloud, true);
  assert.equal(c.n, ip.length);
  assert.ok(c.zMin < c.zMax);
  assert.equal(surveyCloud(surveyPoints(mag, "mag")).cloud, false);
  assert.equal(surveyCloud(surveyPoints(air, "air")).cloud, false);
  assert.equal(surveyCloud(surveyPoints(mag.map(({ z, ...r }) => r), "mag")), null);
  assert.ok(CLOUD_RATIO >= 2);
});

test("surveyPoints keeps z and, given a level, only the readings inside it", () => {
  const all = surveyPoints(ip, "IP.xyz");
  assert.ok(all.every((p) => Number.isFinite(p.z)));
  const lv = { zMin: 1200, zMax: 1300 };
  const inside = surveyPoints(ip, "IP.xyz", lv);
  assert.ok(inside.length > 0 && inside.length < all.length);
  assert.ok(inside.every((p) => p.z >= 1200 && p.z <= 1300));
  assert.equal(surveyPoints(ip, "IP.xyz", { zMin: 5000, zMax: 6000 }).length, 0, "above every reading: nothing");
  assert.equal(surveyPoints([{ _src: "x", x: 1, y: 2, value: 3 }], "x", lv).length, 0, "no elevation: not inside a level");
  assert.deepEqual(surveyPoints([{ _src: "x", x: 1, y: 2, value: 3 }], "x"), [{ x: 1, y: 2, value: 3, z: null }]);
});

test("wiring: a 3D survey is a Level card; the card says how it is read; 'Read at RL' only when a card read the Level; keys", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(p, /const levelKind = \(l\) => LEVEL_KINDS\.has\(l\.kind\) \|\| \(l\.kind === "survey" && !!cloudInfo\(l\.ref\)\?\.cloud\);/);
  assert.match(p, /pts = cloudInfo\(src\.ref\)\?\.cloud && lv \? surveyPoints\(geophysPts, src\.ref, lv\) : all;/);
  assert.match(p, /\|L\$\{levelKind\(src\) \?/);
  assert.equal((p.match(/LEVEL_KINDS\.has\(l\.kind\)/g) || []).length, 1, "every other Level test goes through levelKind");
  assert.match(p, /out\.levelUsed = levelSet\(level\) && layers\.some\(\(l\) => levelKind\(l\) && !\(l\.kind === "voxel" && \(l\.zMin != null \|\| l\.zMax != null\)\)\);/);
  assert.equal((p.match(/levelUsed=\{result\.levelUsed\}/g) || []).length, 2);
  assert.match(p, /levelUsed \? tr\("Read at RL \{a\} to \{b\} m \(the Level\)\."/);
  const keys = ["The Level (RL {a} to {b} m) was not used: none of these cards reads elevations.", "A 3D survey (readings at RL {a} to {b} m): read inside the Level, {n} of its {total} readings.", "A 3D survey (readings at RL {a} to {b} m): each cell takes the readings nearest in plan at every depth, mixed. Set a Level to read one depth band."];
  for (const k of keys) assert.ok(p.includes(`tr("${k}"`), k);
  for (const l of ["es", "pt", "fr", "ar"]) { const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8")); for (const k of keys) assert.ok(d[k], `${l}: ${k}`); }
});
