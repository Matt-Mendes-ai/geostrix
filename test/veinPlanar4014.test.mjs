// TASKS.csv #4014 (Matt, 2026-11-22: "same thing for dykes and veins unless they are folded") — a vein or dyke built with flat walls
// (vein.js planar: the midplane is the plane itself) unless its intercept midpoints read as folded; parallel sheets of a set each their own
// vein. Made-up intercepts only.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalOf, planeFrame } from "../src/lib/sheetedPlanes.js";
import { buildVeinModel } from "../src/lib/vein.js";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test("#4014 a vein built planar: its midplane is the plane itself (flat walls), its misfit says how far the midpoints lie off it", () => {
  // 9 vertical holes on a 100 m grid cutting a 2 m vein dipping 45 towards 090 whose midpoints wobble +-3 m off the plane
  const { n } = planeFrame(normalOf(45, 90));
  const ic = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x = i * 100, y = j * 100, wob = ((i + 2 * j) % 3 - 1) * 3, zMid = -x + wob / n[2]; // the plane z = -x through the origin, shifted along z
    ic.push({ holeId: `H${i}${j}`, from: 100 - zMid - 1.4, to: 100 - zMid + 1.4, hw: { x, y, z: zMid + 1.4 }, fw: { x, y, z: zMid - 1.4 } });
  }
  const curved = buildVeinModel(ic, { dip: 45, dipDir: 90 });
  const flat = buildVeinModel(ic, { dip: 45, dipDir: 90, planar: true, attitudeSource: "fitted to intercept midpoints" });
  assert.equal(flat.plane.planar, true);
  assert.equal(flat.plane.attitudeSource, "fitted to intercept midpoints", "the set's attitude source is kept");
  const off = (p) => (p.x - flat.plane.centroid.x) * flat.plane.normal.x + (p.y - flat.plane.centroid.y) * flat.plane.normal.y + (p.z - flat.plane.centroid.z) * flat.plane.normal.z;
  for (const p of flat.midplane.positions) near(off(p), 0, 1e-6, "the planar midplane is the plane");
  assert.ok(curved.midplane.positions.some((p) => Math.abs(off(p)) > 0.5), "the curved midplane follows the wobble");
  assert.ok(flat.checks.contactResidualRms > curved.checks.contactResidualRms, "flat walls miss the wobbling contacts by more, and say so");
});

test("#4014 the vein run: planar unless folded, parallel sheets each their own vein, each landing in turn", () => {
  const r = fs.readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(r, /const setN = normalOf\(model\.plane\.dip, model\.plane\.dipDir\), fold = foldTest\(used\.map\(midOf\), setN\);/);
  assert.match(r, /if \(fold\.folded\) jobNotices\(/);
  assert.match(r, /planar: true \}\); Object\.assign\(m\.plane, plane\); return m; \};/);
  assert.match(r, /const landOne = async \(\{ model, label, used \}\) => \{/);
  assert.match(r, /for \(const r of runs\) if \(!\(await landOne\(r\)\)\) break;/);
  assert.match(r, /if \(!\(await landed\(job\)\)\) return; \/\/ TASKS\.csv #3953[^\n]*#4014: undefined, so the sheets stop/);
  assert.match(r, /return true; \/\/ #4014: the next sheet still lands/);
});
