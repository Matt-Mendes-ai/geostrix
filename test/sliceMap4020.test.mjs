// TASKS.csv #4020 (Matt: "mag and other voxels won't display well in the 3d slice") — in a 3D slice a block model is one filled colour map sampled
// from its cells (lib/viewer/sliceMap.js), not its boxes clipped to a layer (three.js does not cap a clipped box: only edge-on walls were left, a moiré
// of single-pixel dots). A synthetic magnetic model on a made-up grid.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sliceImage, planeAxes, MAX_SAMPLES } from "../src/lib/viewer/sliceMap.js";
import { buildVoxelLookup } from "../src/lib/voxelSample.js";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// 20 x 20 x 6 cells of 50 m; value = 100 i + j + k / 10 (so a texel's colour names its cell)
const cells = [];
for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) for (let k = 0; k < 6; k++) cells.push({ x: 1000 + i * 50 + 25, y: 5000 + j * 50 + 25, z: 300 - k * 50 - 25, dx: 50, dy: 50, dz: 50, value: 100 * i + j + k / 10 });
const lookup = buildVoxelLookup(cells), origin = { x: 1500, y: 5500, z: 0 };
const got = [];
const rgb = (v) => { got.push(v); return [Math.floor(v / 100), Math.floor(v % 100), Math.round((v % 1) * 10)]; };
const at = (img, i, j) => [...img.rgba.slice((j * img.width + i) * 4, (j * img.width + i) * 4 + 4)];
const level = (zWorld, t) => ({ n: { x: 0, y: 1, z: 0 }, nc: zWorld - origin.z, t });

test("#4020 a level slab: a texel every cell over the whole model, coloured by the cell at the slab's middle", () => {
  const img = sliceImage({ cells, lookup, slab: level(140, 20), origin, rgb }); // world z 140: layer k = 3 (150 > z > 100)
  assert.equal(img.width, 20); assert.equal(img.height, 20); assert.equal(img.filled, 400, "every cell of the layer: the whole slice");
  assert.equal(img.reduce, "middle");
  assert.deepEqual(at(img, 0, 0), [0, 19, 3, 255], "first texel: the west-most cell (i 0) and, scene z being south, the north-most (j 19)");
  assert.deepEqual(at(img, 7, 19), [7, 0, 3, 255]);
  assert.deepEqual(img.centre, { x: 0, y: 140, z: 0 }, "the plane's middle at the slab level, over the model's middle");
  assert.equal(img.sizeA, 1000); assert.equal(img.sizeB, 1000);
});

test("#4020 a slab thinner than a cell still draws the cells it cuts, though no centre lies in it", () => {
  const img = sliceImage({ cells, lookup, slab: level(102, 2), origin, rgb }); // 101-103 m: layer k = 3 (centre 125 m, outside the slab)
  assert.equal(img.filled, 400); assert.deepEqual(at(img, 0, 19).slice(0, 3), [0, 0, 3]);
});

test("#4020 a thick slab: each texel the mean across the slab (a continuous model); a discrete one keeps the middle cell", () => {
  const img = sliceImage({ cells, lookup, slab: level(150, 200), origin, rgb }); // 50-250 m: layers k = 1..4, mean k 2.5
  assert.equal(img.reduce, "mean"); assert.ok(img.samples >= 2 && img.samples <= MAX_SAMPLES);
  got.length = 0; sliceImage({ cells, lookup, slab: level(150, 200), origin, rgb });
  assert.ok(Math.abs(got[0] - 19.25) < 1e-9, `the first texel, cell (0, 19): 19 + the mean of k / 10 over k 1..4: ${got[0]}`);
  const disc = sliceImage({ cells, lookup, slab: level(150, 200), origin, rgb, discrete: true });
  assert.equal(disc.reduce, "middle"); assert.equal(disc.samples, 1);
});

test("#4020 an upright slab: up and along its strike; the cells it crosses; nothing when it misses the model", () => {
  const ax = planeAxes({ x: 1, y: 0, z: 0 });
  assert.deepEqual(ax.e1, { x: 0, y: 1, z: 0 }); assert.deepEqual(ax.e2, { x: -0, y: 0, z: 1 });
  const img = sliceImage({ cells, lookup, slab: { n: { x: 1, y: 0, z: 0 }, nc: 10, t: 20 }, origin, rgb }); // world x 1510: column i = 10
  assert.equal(img.width, 6); assert.equal(img.height, 20); assert.equal(img.filled, 120);
  assert.equal(at(img, 0, 0)[0], 10);
  assert.equal(sliceImage({ cells, lookup, slab: level(5000, 20), origin, rgb }), null, "a slab above the model");
  assert.equal(sliceImage({ cells: [], lookup, slab: level(140, 20), origin, rgb }), null);
});

test("#4020 a big model is drawn at a coarser step, never more than maxTex texels a side", () => {
  const img = sliceImage({ cells, lookup, slab: level(140, 20), origin, rgb, maxTex: 8 });
  assert.ok(img.width <= 8 && img.height <= 8); assert.equal(img.step, 125);
});

test("#4020 wiring: the boxes hidden in a slab, the face drawn from the model's own colours, the pane says what a thick slab shows", () => {
  const f = read("../src/lib/viewer/sliceModelFace.js"), v = read("../src/modules/ViewerModule.jsx"), h = read("../src/modules/viewer/useSliceModelFace.js");
  assert.match(f, /rgb: makeVoxelColorResolverRGB\(model\), discrete: model\?\.colorMode === "discrete"/, "the voxel's own ramp or classes: the legend's");
  assert.match(f, /\(model\?\.cells \|\| \[\]\)\.filter\(\(c\) => voxelCellShown\(model, c\)\)/, "the cells the model shows (its cut-offs)");
  assert.match(f, /tex\.magFilter = THREE\.NearestFilter/);
  assert.match(h, /slice3d\?\.pos, slice3d\?\.azimuth, slice3d\?\.mode/, "made again when the slab moves");
  assert.match(v, /sliceFaceReduce === "mean" \? tr\("Block models: each point the mean of the cells across the slab, on its far side\."\)/);
  for (const l of ["es", "pt", "fr", "ar"]) { const j = JSON.parse(read(`../src/locales/${l}.json`)); assert.ok(j["Block models: the cells at the slab's middle, on its far side."], l); }
});
