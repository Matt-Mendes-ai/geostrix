// TASKS.csv #3251 part 2 (Matt: a large AWS-terrain area comes in blurry, a small one sharp) — the terrain's tile budget follows its detail
// (36 tiles held a 10 km area at zoom 13, 14.7 m pixels, under a 1,025-node grid 9.8 m apart); a Full (2,049-node) detail; the picker says
// the ground detail an area gets against the source's own pixel, its memory against this computer's, and offers the centre of the area at
// full resolution; a fetch over a quarter of this computer's memory is refused before it starts (imagery and terrain).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tileBudget, planTerrainFetch } from "../src/lib/srtmFetch.js";
import { planLatestFetch } from "../src/lib/imageryLevels.js";
import { FETCH_RAM_SHARE, fetchBudgetMB, fetchFits, centreBox } from "../src/lib/fetchMemory.js";

const lat = 39.8, box = (km) => [-105.5 - km / 2 / (111.32 * Math.cos(lat * Math.PI / 180)), lat - km / 2 / 110.574, -105.5 + km / 2 / (111.32 * Math.cos(lat * Math.PI / 180)), lat + km / 2 / 110.574];
const sideKm = (b) => [(b[2] - b[0]) * 111.32 * Math.cos(((b[1] + b[3]) / 2) * Math.PI / 180), (b[3] - b[1]) * 110.574];

test("the tile budget follows the detail: 36 at the floor, enough tiles for a source pixel per node above it", () => {
  assert.deepEqual([200, 513, 1025, 2049].map(tileBudget), [36, 36, 49, 121]);
});

test("a 10 km area at Very high: zoom 14 (7.3 m pixels), not 13 (14.7 m) as the 36-tile budget gave; Full halves the node spacing", () => {
  const vh = planTerrainFetch(box(10), 1025, "aws"), full = planTerrainFetch(box(10), 2049, "aws");
  assert.equal(vh.zoom, 14); assert.ok(vh.sourcePixelM < 8 && vh.sourcePixelM > 7, `${vh.sourcePixelM}`);
  assert.ok(vh.tiles <= 49 && vh.downloadMB < 6, `${vh.tiles} tiles`);
  assert.ok(Math.abs(full.nodeM - vh.nodeM / 2) < 0.1, `${full.nodeM} vs ${vh.nodeM}`);
  assert.ok(full.memoryMB > vh.memoryMB && full.memoryMB < 400, `${full.memoryMB} MB`);
  // a 3 km area: already the source's own pixel at High; Full resolution covers 15 km at 2,049 nodes
  const s = planTerrainFetch(box(3), 2049, "aws");
  assert.equal(s.effectiveM, s.sourcePixelM); assert.ok(Math.abs(s.fullSideKm - s.nativeM * 2.048) < 1e-9);
  const cop = planTerrainFetch(box(30), 1025, "copernicus");
  assert.equal(cop.nativeM, 30); assert.equal(cop.tiles, 0); assert.equal(cop.downloadMB, null);
});

test("this computer's share: a quarter of its memory, 16 GB assumed where it cannot be read", () => {
  assert.equal(FETCH_RAM_SHARE, 0.25);
  assert.equal(fetchBudgetMB(null), 4000); assert.equal(fetchBudgetMB(8), 2000);
  assert.equal(fetchFits(1999, 8), true); assert.equal(fetchFits(2001, 8), false);
});

test("the centre of the drawn area at full resolution: a square of the side asked, inside the area", () => {
  const b = box(10), c = centreBox(b, 3000), [w, h] = sideKm(c);
  assert.ok(Math.abs(w - 3) < 0.01 && Math.abs(h - 3) < 0.01, `${w} x ${h}`);
  assert.ok(c[0] > b[0] && c[2] < b[2] && c[1] > b[1] && c[3] < b[3]);
  assert.deepEqual(centreBox(b, 50000).map((v) => +v.toFixed(9)), b.map((v) => +v.toFixed(9)), "no larger than the area");
  const p = planLatestFetch(box(10), "full", 0.3, { naip: true });
  assert.ok(Math.abs(p.fullSideM - 0.3 * 4096 * 2) < 1e-6); assert.ok(p.memoryMB > p.gpuMB);
});

test("wired: the Full detail, the refusals before a fetch, the picker's plan and its smaller-area button, the card, the mesh budget", () => {
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(g, /<option value=\{2049\}>\{tr\("Full \(2,049 nodes\)"\)\}<\/option>/);
  assert.match(g, /const plan = planTerrainFetch\(bboxLonLat, terrainDetail, terrainSource\);\n\s*if \(!fetchFits\(plan\.memoryMB, ramGB\)\)/);
  assert.match(g, /extraControls=\{\(bbox, \{ setArea \}\) => \{/);
  assert.match(g, /onClick=\{\(\) => setArea\(centreBox\(bbox, p\.fullSideKm \* 1000\)\)\}/);
  assert.match(g, /terrain\.source\?\.nodeM \? ` · \$\{/);
  assert.match(readFileSync(new URL("../src/components/BasemapView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /extraControls\(bbox, \{ setArea: pickAreaFromLayer/);
  assert.match(readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /\{ maxTriangles: gridW \* gridH > 1100 \* 1100 \? 480000 : 160000 \}/);
  const r = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(r, /const w = satWorst\(bboxLonLat\); if \(!fetchFits\(w\.memoryMB, ramGB\)\)/);
  assert.match(r, /onClick=\{\(\) => setArea\(centreBox\(bbox, p\.fullSideM\)\)\}/);
  assert.match(readFileSync(new URL("../src/lib/srtmFetch.js", import.meta.url), "utf8").replace(/\r\n/g, "\n"), /const zoom = pickZoom\(lonMin, latMin, lonMax, latMax, tileBudget\(gridMax\)\);/);
});
