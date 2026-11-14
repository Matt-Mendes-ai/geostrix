// TASKS.csv #3251 (Matt: "even images from the US which were supposed to have 0.6m res are low res. this example is from Colorado") — the
// fetched picture's grid was capped at the level's longest side (1,024 / 2,048 / 3,072 px): a 3 km area came in at 2.9 / 1.5 / 1.0 m pixels,
// while Colorado's 2023 NAIP is 0.3 m. 'Full' fetches at the imagery's own pixels in up to 2 x 2 pictures of at most 4,096 px; the fetched
// pixel size is on the raster's card.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { naipTiles, TILE_PX, MAX_SIDE_TILES } from "../src/lib/naipFetch.js";
import { SAT_LEVELS, planLatestFetch } from "../src/lib/imageryLevels.js";

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const box = (km, x0 = 400000, y0 = 4340000) => [x0, y0, x0 + km * 1000, y0 + km * 1000];

test("one picture when the area fits 4,096 px at the imagery's own pixels", () => {
  const p = naipTiles(box(1), 0.3);
  assert.equal(p.cell, 0.3); assert.equal(p.tiles.length, 1);
  assert.deepEqual([p.tiles[0].width, p.tiles[0].height], [3333, 3333]);
});

test("a larger area: up to 2 x 2 pictures at the own pixels, edge to edge, covering the area exactly; past that, pixels just coarse enough", () => {
  const p = naipTiles(box(2), 0.3); // 6,667 px a side at 0.3 m
  assert.equal(p.cell, 0.3); assert.deepEqual([p.nx, p.ny], [2, 2]); assert.equal(p.tiles.length, 4);
  for (const t of p.tiles) assert.ok(t.width <= TILE_PX && t.height <= TILE_PX);
  assert.equal(p.tiles[0].width + p.tiles[1].width, p.width);
  assert.ok(near(p.tiles[0].box[2], p.tiles[1].box[0]), "west and east meet");
  assert.ok(near(p.tiles[0].box[1], p.tiles[2].box[3]), "north and south meet");
  assert.ok(near(p.tiles[0].box[0], 400000) && near(p.tiles[0].box[3], 4342000), "from the north-west corner");
  const big = naipTiles(box(5), 0.3);
  assert.ok(near(big.cell, 5000 / (MAX_SIDE_TILES * TILE_PX)), `5 km: ${big.cell} m`);
  assert.equal(big.tiles.length, 4);
  for (const t of big.tiles) assert.ok(t.width <= TILE_PX && t.height <= TILE_PX);
  const wide = naipTiles([0, 0, 2000, 500], 0.6); // 3,333 x 833: one picture
  assert.equal(wide.tiles.length, 1);
});

test("the picker's plan: Full gives the own pixels and says how many pictures and how much graphics memory", () => {
  assert.equal(SAT_LEVELS.full.gridMax, 4096);
  const lat = 39.25, lon = -106.29, km = (k) => [lon - k / 2 / (111.32 * Math.cos(lat * Math.PI / 180)), lat - k / 2 / 110.574, lon + k / 2 / (111.32 * Math.cos(lat * Math.PI / 180)), lat + k / 2 / 110.574];
  const vh = planLatestFetch(km(3), "veryhigh", 0.6, { naip: true }), full = planLatestFetch(km(3), "full", 0.6, { naip: true });
  assert.ok(near(vh.pixelM, 3000 / 3072, 0.01), `very high: ${vh.pixelM}`);
  assert.equal(full.pixelM, 0.6); assert.equal(full.parts, 4); assert.ok(full.gpuMB > 100 && full.gpuMB < 200, `${full.gpuMB} MB`);
  assert.equal(planLatestFetch(km(1), "full", 0.6, { naip: true }).parts, 1);
  // Sentinel-2's Full: one picture of up to 4,096 px
  const s2 = planLatestFetch(km(60), "full", 10);
  assert.equal(s2.parts, 1); assert.ok(near(s2.pixelM, 60000 / 4096, 0.2));
});

test("wired: the fetch passes Full, each part is added with its pixel size, and the card says it", () => {
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /full: satLevel === "full"/);
  assert.match(m, /for \(const part of r\.parts \|\| \[r\]\)/);
  assert.match(m, /pixelM: p\.pixelM, gridW: p\.gridW, gridH: p\.gridH/);
  assert.match(m, /\{r\.pixelM > 0 && <span/);
  assert.match(m, /planLatestFetch\(bbox, satLevel, naip \? NAIP_FINEST_M : undefined, \{ naip \}\)/);
  const n = readFileSync(new URL("../src/lib/naipFetch.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(n, /const plan = full \? naipTiles\(whole\.box, finest\) : \{ cell: whole\.cell, tiles: \[whole\] \};/);
  assert.match(readFileSync(new URL("../src/lib/imageryFetch.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /pixelM: Math\.max\(out\.scaleX, out\.scaleY\)/);
});
