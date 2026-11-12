// TASKS.csv #2990 (WA iron review) — the Maps plan drew a terrain's hillshade over its whole box: a terrain built from collars (98 % of it
// filled cells, marked in the no-data mask) showed as a grey slab. The plan's picture now leaves the filled cells transparent. SYNTHETIC.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hillshadeRGBA } from "../src/lib/hillshade.js";
import { fillNoData, decodeNoDataMask } from "../src/lib/demFill.js";

test("filled cells are transparent, ground cells opaque grey", () => {
  const W = 40, H = 30, el = new Float32Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) el[j * W + i] = i < 10 && j < 8 ? 300 + 3 * i + 2 * j : NaN; // ground in one corner only
  const fill = fillNoData(el);
  const t = { bbox: [0, 0, 390, 290], gridW: W, gridH: H, elevations: fill.elevations, noDataMask: fill.noDataMask };
  const px = hillshadeRGBA(t, decodeNoDataMask(t.noDataMask));
  let opaque = 0;
  for (let k = 0; k < W * H; k++) if (px[k * 4 + 3] === 255) opaque++;
  assert.equal(opaque, 80); // the 10 x 8 ground cells
  assert.equal(px[(5 * W + 5) * 4 + 3], 255);
  assert.equal(px[(20 * W + 30) * 4 + 3], 0);
  // no mask: everything opaque, as before
  const all = hillshadeRGBA({ ...t, noDataMask: null });
  assert.ok([...Array(W * H).keys()].every((k) => all[k * 4 + 3] === 255));
});

test("wired: the plan's hillshade reads the terrain's mask", () => {
  const p = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8");
  assert.match(p, /img\.data\.set\(hillshadeRGBA\(t, decodeNoDataMask\(t\.noDataMask\)\)\);/);
});
