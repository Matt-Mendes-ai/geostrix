// TASKS.csv #3880 — matching a georeferenced section image to the terrain in elevation. Made-up figures, every one worked by hand:
// a terrain that rises 0.1 m per metre eastward (elevation = 300 + 0.1 x on a 0-1,000 m square), a section line from (100, 500) to (900, 500), and a picture 800 x 400 px of it drawn at 1 px per metre
// across and down, its top edge at 500 m: TL (100, 500, 500), TR (900, 500, 500), BR (900, 500, 100), BL (100, 500, 100). Its drawn topography line floats 60 m above the terrain.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { imageFrame, pxToWorld, worldToPx, imageVE, adjustCorners, adjustedImage, terrainProfilePx, topoPicks, fitVertical, typedAdjustment } from "../src/lib/sectionVertical.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const gridW = 11, gridH = 11;
const terrain = { bbox: [0, 0, 1000, 1000], gridW, gridH, elevations: Float32Array.from({ length: gridW * gridH }, (_, i) => 300 + 0.1 * ((i % gridW) * 100)) };
const im = { id: "i1", width: 800, height: 400, corners: [[100, 500, 500], [900, 500, 500], [900, 500, 100], [100, 500, 100]] };
// the clicks on the drawn topography line: at 0, 400 and 800 m along the picture the line is 60 m above the terrain there (370, 410, 450), i.e. py = 500 - z
const picks = [{ id: "a", px: 0, py: 130 }, { id: "b", px: 400, py: 90 }, { id: "c", px: 800, py: 50 }];

test("the picture's frame: a pixel to the world and back; its own vertical exaggeration is stated", () => {
  const w = pxToWorld(im, 400, 100);
  assert.deepEqual([w.x, w.y, w.z], [500, 500, 400]);
  const p = worldToPx(im, 500, 500, 400); assert.deepEqual([p.px, p.py], [400, 100]);
  assert.equal(imageVE(im), 1);
  // the same 400 m drawn 800 px tall: 2 px per metre down against 1 across -> drawn at 2 x
  assert.equal(imageVE({ ...im, height: 800 }), 2);
  assert.equal(imageFrame({ ...im, corners: null }), null);
});

test("the clicks on the drawn line sit 60 m above the terrain; the height fit brings them to it", () => {
  const rows = topoPicks(im, picks, terrain);
  assert.deepEqual(rows.map((r) => [r.zImage, r.zTerrain, r.diff]), [[370, 310, -60], [410, 350, -60], [450, 390, -60]]);
  const f = fitVertical(rows, "offset");
  assert.equal(f.offset, -60); assert.equal(f.scale, 1); assert.equal(f.rmsBefore, 60); assert.ok(f.rmsAfter < 1e-9);
  const moved = adjustedImage(im, f);
  assert.deepEqual(moved.corners.map((c) => c[2]), [440, 440, 40, 40]); // the whole picture moves 60 m down, its horizontal placement untouched
  assert.deepEqual(moved.corners.map((c) => [c[0], c[1]]), im.corners.map((c) => [c[0], c[1]]));
  assert.ok(topoPicks(moved, picks, terrain).every((r) => Math.abs(r.diff) < 1e-9), "after the move the same clicks are on the terrain");
});

test("height and scale: a picture stretched 25 % taller than the terrain is brought back", () => {
  // heights typed 25 % too large about nothing: zImage = 1.25 zt - 70 over 310 / 350 / 390 -> 317.5 / 367.5 / 417.5. The fit recovers the scale 0.8 and leaves nothing over
  const rows = [310, 350, 390].map((zt) => ({ zTerrain: zt, zImage: 1.25 * zt - 70, diff: zt - (1.25 * zt - 70) }));
  const f = fitVertical(rows, "scale");
  assert.ok(Math.abs(f.scale - 0.8) < 1e-9, `${f.scale}`); assert.ok(f.rmsAfter < 1e-9); assert.ok(f.rmsBefore > 10);
  const back = adjustCorners([[0, 0, 317.5], [0, 0, 417.5]], f);
  assert.ok(Math.abs(back[0][2] - 310) < 1e-9 && Math.abs(back[1][2] - 390) < 1e-9);
  // too few clicks, or all at one height, or an impossible stretch, are said and not fitted
  assert.match(fitVertical(rows.slice(0, 2), "scale").error, /at least 3/);
  assert.match(fitVertical([310, 311, 312].map((z) => ({ zTerrain: z, zImage: z + 5, diff: -5 })), "scale").error, /at least 3/);
  assert.match(fitVertical([0, 10, 20].map((z) => ({ zTerrain: 100 + z * 8, zImage: 100 + z, diff: 7 * z })), "scale").error, /more than 4 times/);
  assert.match(fitVertical([], "offset").error, /Click along/);
});

test("the terrain's profile over the picture, and clicks outside the terrain are left out", () => {
  const runs = terrainProfilePx(im, terrain, 8);
  assert.equal(runs.length, 1); assert.equal(runs[0].length, 9);
  assert.deepEqual(runs[0][0], [0, 190]); assert.ok(Math.abs(runs[0][8][0] - 800) < 1e-6 && Math.abs(runs[0][8][1] - 110) < 1e-6); // 310 m at the left (py 190), 390 m at the right (py 110)
  assert.deepEqual(terrainProfilePx(im, null), []);
  const away = { ...im, corners: im.corners.map(([x, y, z]) => [x + 5000, y, z]) };
  assert.deepEqual(topoPicks(away, picks, terrain), []);
  assert.deepEqual(terrainProfilePx(away, terrain), []);
});

test("the typed offset and scale", () => {
  assert.deepEqual(typedAdjustment({ offset: "-12.5", scalePct: "90", pivot: 400 }), { offset: -12.5, scale: 0.9, pivot: 400 });
  assert.equal(typedAdjustment({ offset: "", scalePct: "100", pivot: 0 }), null);
  assert.equal(typedAdjustment({ offset: "1", scalePct: "0", pivot: 0 }), null);
});

test("wiring: the Section images list opens the dialog, which keeps the original corners and the adjustment; the datum offset of a mine grid is applied", () => {
  const v = read("../src/modules/ViewerModule.jsx");
  assert.match(v, /lazyModal\(\(\) => import\("\.\.\/components\/SectionImageVerticalModal\.jsx"\)\)/);
  assert.match(v, /<SectionImageVerticalModal image=\{/);
  assert.match(v, /<SectionGeorefModal sections=\{sections\} rlOffset=\{rlOffsetOf\(project\)\}/);
  const m = read("../src/components/SectionImageVerticalModal.jsx");
  assert.match(m, /corners0: image\.corners0 \|\| image\.corners/);
  assert.match(m, /updateSectionImage|onApply/);
  const g = read("../src/components/SectionGeorefModal.jsx");
  assert.match(g, /z: rlOffset \? Number\(p\.z\) - rlOffset : p\.z/);
});
