// TASKS.csv #2851 / #2858 / #2861 (review GSC geophysics) — (2851) the log stretch the app suggests is one click away, and a floor value is said;
// (2858) a fresh import's bar gives the stretch its picture was drawn with; (2861) a small TIFF is read whole once, not one read per strip.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { floorShare, FLOOR_SHARE_MIN } from "../src/lib/rasterColour.js";
import { rangedTiffSource, WHOLE_READ_MAX } from "../src/lib/raster.js";
const read = (p) => fs.readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("#2851 a floor value", () => {
  const tau = Array.from({ length: 1000 }, (_, i) => (i < 448 ? 46 : 46 + i / 3));
  const f = floorShare(tau);
  assert.equal(f.min, 46); assert.ok(Math.abs(f.share - 0.448) < 1e-9); assert.ok(f.share >= FLOOR_SHARE_MIN);
  assert.ok(floorShare(Array.from({ length: 100 }, (_, i) => i)).share < FLOOR_SHARE_MIN);
  assert.equal(floorShare([NaN]), null);
  const c = read("components/RasterColourControls.jsx");
  assert.ok(c.includes('decades > 1 && style.stretch !== "log"') && c.includes('onClick={() => apply({ stretch: "log" })}>{tr("Use a log scale")}'));
  assert.ok(c.includes("floor && floor.share >= FLOOR_SHARE_MIN"));
});

test("#2858 the importer's own stretch on the bar", () => {
  assert.ok(read("lib/raster.js").includes("const st = own || makeStretch(parsed.grid.values, \"p2-98\");"));
});

test("#2861 a small file is read once; a big one by range", async () => {
  let reads = 0, slices = 0;
  const bytes = new Uint8Array(1000).map((_, i) => i % 256);
  const small = { size: 1000, arrayBuffer: async () => { reads++; return bytes.buffer; }, slice: () => { slices++; return { arrayBuffer: async () => new ArrayBuffer(0) }; } };
  const src = rangedTiffSource(small);
  const got = await src.fetch(Array.from({ length: 144 }, (_, k) => ({ offset: k * 6, length: 6 })));
  assert.equal(reads, 1); assert.equal(slices, 0);
  assert.equal(new Uint8Array(got[10])[0], 60);
  let bigSlices = 0;
  const big = { size: WHOLE_READ_MAX + 1, arrayBuffer: async () => { throw new Error("not whole"); }, slice: (a, b) => { bigSlices++; return { arrayBuffer: async () => new ArrayBuffer(b - a) }; } };
  await rangedTiffSource(big).fetch([{ offset: 0, length: 8 }, { offset: 8, length: 8 }]);
  assert.equal(bigSlices, 2);
});
