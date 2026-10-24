// TASKS.csv #840 — bigger WMS imports: detail levels, the GetMap tile grid within the server's limit, each tile's
// BBOX, and the ground pixel size shown before fetching
import test from "node:test";
import assert from "node:assert/strict";
import { WMS_DETAIL, wmsTilePlan, wmsTileBbox, wmsPixelMetres, wmsImageSize } from "../src/lib/webLayers.js";

test("#840 three detail levels up to 4,096 px", () => {
  assert.deepEqual(Object.values(WMS_DETAIL).map((d) => d.longPx), [1024, 2048, 4096]);
});

test("#840 one request when the image fits the server's limit", () => {
  assert.deepEqual(wmsTilePlan(1024, 600, 2048), [{ x0: 0, y0: 0, w: 1024, h: 600 }]);
});

test("#840 tiles cover the image exactly, none over the limit, no gaps or overlaps", () => {
  for (const [W, H, mw, mh] of [[4096, 2271, 2048, 2048], [4096, 4096, 1000, 1000], [3001, 1499, 1024, 768]]) {
    const tiles = wmsTilePlan(W, H, mw, mh);
    const cover = new Uint8Array(W * H);
    for (const t of tiles) {
      assert.ok(t.w <= mw && t.h <= mh && t.w > 0 && t.h > 0, JSON.stringify(t));
      for (let y = t.y0; y < t.y0 + t.h; y++) for (let x = t.x0; x < t.x0 + t.w; x++) cover[y * W + x]++;
    }
    assert.ok(cover.every((c) => c === 1), `${W}x${H} @ ${mw}x${mh}`);
  }
  assert.equal(wmsTilePlan(4096, 4096, 1000, 1000).length, 25);
});

test("#840 tile BBOXes meet exactly and span the request", () => {
  const box = [-71.3, 46.7, -71.1, 46.9], W = 4096, H = 4096;
  const tiles = wmsTilePlan(W, H, 2048, 2048);
  const b = tiles.map((t) => wmsTileBbox(box, W, H, t));
  assert.equal(b.length, 4);
  // first row: north half; the west tile's east edge is the east tile's west edge
  assert.ok(Math.abs(b[0][2] - b[1][0]) < 1e-12 && Math.abs(b[0][1] - b[2][3]) < 1e-12);
  assert.deepEqual([Math.min(...b.map((x) => x[0])), Math.min(...b.map((x) => x[1])), Math.max(...b.map((x) => x[2])), Math.max(...b.map((x) => x[3]))].map((v) => +v.toFixed(12)), box);
  assert.ok(Math.abs(b[0][3] - 46.9) < 1e-12, "row 0 is the north edge");
});

test("#840 ground pixel size: a 4 km area reaches metre scale at Very high", () => {
  // ~4 km x 4 km at 46.8 N (Quebec City): 0.0526 degrees of longitude, 0.036 of latitude
  const box = [-71.2263, 46.782, -71.1737, 46.818];
  const std = wmsPixelMetres(box, 1024), vh = wmsPixelMetres(box, 4096);
  assert.ok(std > 3.7 && std < 4.2, String(std));
  assert.ok(vh > 0.9 && vh < 1.05, String(vh));
  const s = wmsImageSize(box, 4096);
  assert.ok(Math.max(s.width, s.height) === 4096);
});
