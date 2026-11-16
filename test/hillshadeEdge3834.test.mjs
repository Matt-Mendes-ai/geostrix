// TASKS.csv #3834 — the hillshade of a terrain with gaps: the cells beside a no-data cell were shaded against its fill value (a black stair-step 'cliff').
// SYNTHETIC: a plane falling gently to the east over 12 x 12 nodes, its eastern third no data and filled with a low value.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hillshadeRGBA, hillshadeValues, terrainDerivativeValues } from "../src/lib/hillshade.js";

const W = 12, H = 12, el = new Float32Array(W * H), mask = new Uint8Array(Math.ceil((W * H) / 8));
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const k = r * W + c; if (c >= 8) { el[k] = 0; mask[k >> 3] |= 1 << (k & 7); } else el[k] = 100 - c * 2; }
const t = { bbox: [0, 0, 110, 110], gridW: W, gridH: H, elevations: el };

test("beside a gap the cells are shaded like the ground that is there, not against the fill", () => {
  const plain = hillshadeValues(el, W, H, 10, 10), healed = hillshadeValues(el, W, H, 10, 10, { noData: mask });
  const row = 5, k = (c) => row * W + c, interior = healed[k(3)];
  assert.ok(Math.abs(healed[k(7)] - interior) < 0.05, `${healed[k(7)]} vs ${interior}`); // the last real column beside the gap
  assert.ok(Math.abs(plain[k(7)] - interior) > 0.2, `the fill made a cliff: ${plain[k(7)]} vs ${interior}`); // what it did before
});

test("the plan's picture: the gap's own cells stay transparent, the edge cells are as light as the interior", () => {
  const rgba = hillshadeRGBA(t, mask), k = (c) => (5 * W + c) * 4;
  assert.equal(rgba[k(9) + 3], 0); assert.equal(rgba[k(7) + 3], 255);
  assert.ok(Math.abs(rgba[k(7)] - rgba[k(3)]) < 14, `${rgba[k(7)]} vs ${rgba[k(3)]}`);
});

test("the derivative products read the same: slope beside the gap is the ground's slope", () => {
  const s = terrainDerivativeValues("slope", el, W, H, 10, 10, { noData: mask }), s0 = terrainDerivativeValues("slope", el, W, H, 10, 10);
  assert.ok(Math.abs(s[5 * W + 7] - s[5 * W + 3]) < 3, `${s[5 * W + 7]} vs ${s[5 * W + 3]}`);
  assert.ok(s0[5 * W + 7] > s[5 * W + 3] + 10, "unhealed: a cliff");
});

test("no mask: unchanged", () => {
  const a = hillshadeValues(el, W, H, 10, 10), b = hillshadeValues(el, W, H, 10, 10, { noData: null });
  assert.deepEqual(a, b);
});
