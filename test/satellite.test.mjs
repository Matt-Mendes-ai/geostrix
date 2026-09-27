// TASKS.csv #423 — satellite mosaic resampling: rows in Web Mercator (not latitude), failed tiles transparent,
// and no dark fringe beside a missing tile.
import test from "node:test";
import assert from "node:assert/strict";
import { resampleMosaic, unpremultiply } from "../src/lib/satelliteFetch.js";

const TILE = 256;
const tileLat = (y, z) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))) * 180) / Math.PI;
const tileLon = (x, z) => (x / 2 ** z) * 360 - 180;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// A mosaic of tilesX x tilesY tiles at zoom z starting at tile (x0, y0); paint(px, py) -> [r,g,b,a]
function mosaic(z, x0, y0, tilesX, tilesY, paint) {
  const mw = tilesX * TILE, mh = tilesY * TILE, rgba = new Uint8ClampedArray(mw * mh * 4);
  for (let py = 0; py < mh; py++) for (let px = 0; px < mw; px++) rgba.set(paint(px, py), (py * mw + px) * 4);
  const tiles = { lonMin: tileLon(x0, z), lonMax: tileLon(x0 + tilesX, z), latMax: tileLat(y0, z), latMin: tileLat(y0 + tilesY, z) };
  return { rgba, mw, mh, tiles };
}

test("#423 rows are placed by Web Mercator: a line at a known latitude lands there (z11, 8 tiles tall)", () => {
  // Golden Triangle, ~56.5 N. At z11 one tile is ~0.1 degrees tall; the mosaic spans 8 tiles north-south (the most a fetch uses).
  const z = 11, x0 = 360, y0 = 640, tilesY = 8;
  const latTop = tileLat(y0, z), latBot = tileLat(y0 + tilesY, z);
  const mh = tilesY * TILE;
  // the pixel row whose CENTRE is at 45 % of the way down in Mercator
  const row = Math.round(0.45 * mh);
  const lineLat = (() => { const y = mercY(latTop) - ((row + 0.5) / mh) * (mercY(latTop) - mercY(latBot)); return (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI; })();
  const m = mosaic(z, x0, y0, 1, tilesY, (px, py) => (py === row ? [255, 255, 255, 255] : [0, 0, 0, 255]));
  const gridH = 4001, bbox = { lonMin: m.tiles.lonMin + 0.01, lonMax: m.tiles.lonMax - 0.01, latMin: latBot + 0.001, latMax: latTop - 0.001 };
  const out = resampleMosaic(m.rgba, m.mw, m.mh, m.tiles, bbox, 3, gridH);
  let best = 0; for (let r = 0; r < gridH; r++) if (out.r[r * 3 + 1] > out.r[best * 3 + 1]) best = r;
  const foundLat = bbox.latMax - (best / (gridH - 1)) * (bbox.latMax - bbox.latMin);
  const errM = Math.abs(foundLat - lineLat) * 111320;
  const pixelM = ((latTop - latBot) * 111320) / mh;
  assert.ok(errM < pixelM, `line found ${errM.toFixed(1)} m from its latitude (pixel ${pixelM.toFixed(1)} m)`);
  // what linear-in-latitude sampling did: the same line would have been placed this far off
  const linearLat = latTop - ((row + 0.5) / mh) * (latTop - latBot);
  assert.ok(Math.abs(linearLat - lineLat) * 111320 > 150, `sanity: the old linear-latitude placement was ${(Math.abs(linearLat - lineLat) * 111320).toFixed(0)} m off here`);
});

test("#423 a failed tile is transparent and its neighbour keeps its real colour up to the seam", () => {
  const z = 12, m = mosaic(z, 720, 1280, 2, 1, (px) => (px < TILE ? [200, 50, 50, 255] : [0, 0, 0, 0]));
  const gridW = 101, gridH = 5;
  const out = resampleMosaic(m.rgba, m.mw, m.mh, m.tiles, { lonMin: m.tiles.lonMin, lonMax: m.tiles.lonMax, latMin: m.tiles.latMin, latMax: m.tiles.latMax }, gridW, gridH);
  const img = unpremultiply(out.r, out.g, out.b, out.a, new Uint8ClampedArray(gridW * gridH * 4));
  const px = (c) => [...img.slice((2 * gridW + c) * 4, (2 * gridW + c) * 4 + 4)];
  assert.deepEqual(px(0), [200, 50, 50, 255]);
  assert.deepEqual(px(100), [0, 0, 0, 0], "over the failed tile: transparent, not opaque black");
  // every visible pixel has the real colour (no fade toward black at the seam)
  for (let c = 0; c < gridW; c++) { const p = px(c); if (p[3] > 0) assert.deepEqual(p.slice(0, 3), [200, 50, 50], `column ${c}: ${p}`); }
  const visible = Array.from({ length: gridW }, (_, c) => px(c)[3] > 0).filter(Boolean).length;
  assert.ok(visible >= 49 && visible <= 51, `${visible} of 101 columns visible (half the mosaic)`);
});

test("#423 an all-good mosaic comes out opaque with its colours unchanged", () => {
  const m = mosaic(13, 1440, 2560, 2, 2, (px, py) => [px % 256, py % 256, 77, 255]);
  const out = resampleMosaic(m.rgba, m.mw, m.mh, m.tiles, { lonMin: m.tiles.lonMin, lonMax: m.tiles.lonMax, latMin: m.tiles.latMin, latMax: m.tiles.latMax }, 64, 64);
  const img = unpremultiply(out.r, out.g, out.b, out.a, new Uint8ClampedArray(64 * 64 * 4));
  for (let i = 0; i < 64 * 64; i++) { assert.equal(img[i * 4 + 3], 255); assert.equal(img[i * 4 + 2], 77); }
  // unpremultiply treats NaN (outside a reprojected footprint) as transparent
  const nan = unpremultiply([NaN], [NaN], [NaN], [NaN], new Uint8ClampedArray(4));
  assert.deepEqual([...nan], [0, 0, 0, 0]);
});
