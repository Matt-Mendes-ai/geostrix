// TASKS.csv #3276 (Galore review) — holes drilled all round the compass read 'drill lines 35°, 571 m apart', and By coordinates proposed a
// 17.5 km section (the whole property) with 2 holes in it. Lines only when the neighbour bearings agree; the length from the run of collars
// around the centre. Synthetic collars, not Galore.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { drillLineGeometry } from "../src/modules/viewer/drillLines.js";

const rng = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
// 60 holes scattered over a 2 x 1.5 km cluster, and 10 more out to 29 km east
const scattered = (() => {
  const r = rng(7), pts = [];
  for (let i = 0; i < 60; i++) pts.push({ x: 350000 + r() * 2000, y: 6334000 + r() * 1500 });
  for (let i = 0; i < 10; i++) pts.push({ x: 353000 + r() * 26000, y: 6326000 + r() * 16000 });
  return pts;
})();

test("scattered drilling: no drill lines, no spacing, and a length that covers the cluster, not the property", () => {
  const g = drillLineGeometry(scattered);
  assert.equal(g.lines, false, `share ${g.share}`);
  assert.equal(g.spacing, null);
  assert.ok(g.alongM > 15000, String(g.alongM));
  assert.ok(g.lengthM > 1000 && g.lengthM < 3000, String(g.lengthM));
});

test("random layouts of 20 to 80 holes stay under the line threshold", () => {
  let over = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const r = rng(seed * 7919), n = 20 + (seed % 60), pts = [];
    for (let i = 0; i < n; i++) pts.push({ x: r() * 2000, y: r() * 1500 });
    if (drillLineGeometry(pts).lines) over++;
  }
  assert.ok(over <= 2, `${over} of 200 random layouts read as drill lines`);
});

test("fences still read as lines; the length is the fence through the centre, not the whole extent", () => {
  const az = (120 * Math.PI) / 180, u = [Math.sin(az), Math.cos(az)], v = [Math.cos(az), -Math.sin(az)], pts = [];
  // 6 fences 200 m apart, sites 77 m apart along them, and a second fence group 12 km along strike
  for (const off of [0, 12000]) for (let f = 0; f < 6; f++) for (let k = 0; k < 15; k++) {
    const a = off + k * 77, c = f * 200;
    pts.push({ x: 500000 + u[0] * a + v[0] * c, y: 6680000 + u[1] * a + v[1] * c });
  }
  const g = drillLineGeometry(pts);
  assert.ok(g.lines && g.share > 0.8, String(g.share));
  assert.ok(Math.abs(g.spacing - 200) <= 10, String(g.spacing));
  assert.ok(g.alongM > 12000, String(g.alongM));
  assert.ok(Math.abs(g.lengthM - 14 * 77) < 2, String(g.lengthM));
});

test("the hook: the length from lengthM, the note says when there are no lines", () => {
  const s = readFileSync(new URL("../src/modules/viewer/drillLines.js", import.meta.url), "utf8");
  assert.match(s, /length: roundTo\(Math\.max\(geo\.lengthM \* 1\.1, 200\), 100\)/);
  assert.match(s, /lineNote: geo && !geo\.lines \? tr\("No drill lines found: the holes are not in lines\./);
});
