// TASKS.csv #799 — fetched terrain: isolated source spikes removed, nodes are their cell's mean (no false cones)
import { test } from "node:test";
import assert from "node:assert/strict";
import { despikeMosaic, resampleElevationMosaic } from "../src/lib/srtmFetch.js";

// a tilted plane, 64 x 64 pixels, 1 m per pixel step east and 0.5 m north
const plane = (w, h) => { const a = new Float32Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = 1000 + x + 0.5 * y; return a; };

test("#799 an isolated spike or pit is replaced; a real peak (neighbours rising to it) is kept", () => {
  const a = plane(64, 64);
  a[20 * 64 + 30] += 300; // a spike
  a[40 * 64 + 10] -= 120; // a pit
  // a real narrow summit: 60 m above its neighbours, which themselves rise steeply toward it
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) a[(50 + dy) * 64 + 50 + dx] += 60 - 20 * Math.max(Math.abs(dx), Math.abs(dy));
  const n = despikeMosaic(a, 64, 64);
  assert.equal(n, 2);
  assert.ok(Math.abs(a[20 * 64 + 30] - (1000 + 30 + 10)) < 1e-3);
  assert.ok(Math.abs(a[40 * 64 + 10] - (1000 + 10 + 20)) < 1e-3);
  assert.ok(Math.abs(a[50 * 64 + 50] - (1000 + 50 + 25 + 60)) < 1e-3, "the summit is untouched");
  assert.equal(despikeMosaic(plane(64, 64), 64, 64), 0); // smooth ground: nothing
});

test("#799 nodes are the mean of their cell: a stray pixel no longer becomes a cone", () => {
  const w = 256, h = 256, a = plane(w, h);
  const tiles = { lonMin: 0, lonMax: 1, latMin: 0, latMax: 1 }; // tiny near the equator: Mercator ~ linear here
  const bbox = { lonMin: 0, lonMax: 1, latMin: 0, latMax: 1 };
  const base = resampleElevationMosaic(a, w, h, tiles, bbox, 33, 33); // 8 pixels per node
  const b = Float32Array.from(a); b[128 * w + 128] += 300; // one stray pixel, undespiked
  const spiked = resampleElevationMosaic(b, w, h, tiles, bbox, 33, 33);
  let worst = 0; for (let i = 0; i < base.length; i++) worst = Math.max(worst, Math.abs(spiked[i] - base[i]));
  assert.ok(worst < 300 / 40, `one pixel raises its node by ${worst.toFixed(1)} m, not 300`); // averaged over ~64 pixels
  // a node on smooth ground equals the plane at its position
  const mid = base[16 * 33 + 16];
  assert.ok(Math.abs(mid - (1000 + 127.5 + 0.5 * 127.5)) < 1.5, String(mid));
  // a cell touching a failed (NaN) tile stays NaN for the no-data fill
  const c = Float32Array.from(a); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) c[y * w + x] = NaN;
  assert.ok(Number.isNaN(resampleElevationMosaic(c, w, h, tiles, bbox, 33, 33)[0]));
  // zoomed in (fewer than ~1.5 pixels per node) keeps the bilinear sample
  const fine = resampleElevationMosaic(a, w, h, tiles, bbox, 200, 200);
  assert.ok(Number.isFinite(fine[100 * 200 + 100]));
});
