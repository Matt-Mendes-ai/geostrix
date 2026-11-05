// TASKS.csv #1623 — a colour picture's uniform white / black border is its background, shown transparent
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { borderKeyColour, keyOutColour, colourFraction, hexRgb } from "../src/lib/rasterKey.js";

const img = (w, h, fill, inner) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, c = x > 2 && y > 2 && x < w - 3 && y < h - 3 ? inner : fill;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c[3] ?? 255;
  }
  return d;
};

test("a uniform white (or near-white) border is the key; a busy one is not", () => {
  assert.equal(borderKeyColour(img(20, 10, [253, 255, 251], [200, 30, 30]), 20, 10), "#ffffff");
  assert.equal(borderKeyColour(img(20, 10, [0, 2, 0], [200, 30, 30]), 20, 10), "#000000");
  assert.equal(borderKeyColour(img(20, 10, [120, 140, 90], [200, 30, 30]), 20, 10), null);
  assert.equal(borderKeyColour(img(20, 10, [255, 255, 255, 0], [200, 30, 30]), 20, 10), null, "already transparent: nothing to do");
});

test("keying out clears only that colour and reports the background share", () => {
  const d = img(20, 10, [255, 255, 255], [200, 30, 30]);
  const frac = colourFraction(d, hexRgb("#ffffff"));
  assert.ok(frac > 0.5 && frac < 0.8, String(frac));
  const n = keyOutColour(d, [255, 255, 255]);
  assert.equal(n, Math.round(frac * 200));
  assert.equal(d[3], 0); const mid = (5 * 20 + 10) * 4; assert.equal(d[mid + 3], 255);
});

test("wired: import sets keyColour and says so; the drape keys a copy; the card can turn it off", () => {
  const r = readFileSync(new URL("../src/lib/raster.js", import.meta.url), "utf8");
  assert.match(r, /borderKeyColour\(px\.data, px\.width, px\.height\)/);
  assert.match(r, /keyColour: kc/);
  const s = readFileSync(new URL("../src/lib/viewer/sceneBuilders.js", import.meta.url), "utf8");
  assert.match(s, /keyedCanvas\(img, r\.keyColour\)/);
  assert.match(s, /\|key:\$\{r\.keyColour\}/);
  const m = readFileSync(new URL("../src/modules/RasterModule.jsx", import.meta.url), "utf8");
  assert.match(m, /updateRaster\(r\.id, \{ keyColour: null \}\)/);
});
