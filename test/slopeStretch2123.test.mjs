// TASKS.csv #2123 (review #2013, Maps) — slope and curvature take their colour stretch from the drawn cells, not from the filled
// no-data corners of a reprojected terrain (a 0-10° DEM read 'darkest grey 53° or steeper' and drew the ground almost white).
import test from "node:test";
import assert from "node:assert/strict";
import { fillNoData } from "../src/lib/demFill.js";
import { terrainDerivativeToRasterInput } from "../src/lib/hillshade.js";

globalThis.document = { createElement: () => ({ getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {} }), toDataURL: () => "data:," }) };

// 80 x 80 nodes, 25 m: a plane rising 150 m over 2 km (~4.3°) plus a small knoll; the four corner wedges are no data, as after a reprojection
const W = 80, H = 80, D = 25;
const raw = [];
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const x = c * D, y = (H - 1 - r) * D;
  const corner = Math.min(r, H - 1 - r) + Math.min(c, W - 1 - c) < 22;
  raw.push(corner ? NaN : 900 + 0.075 * x + 40 * Math.exp(-((x - 1000) ** 2 + (y - 1000) ** 2) / (2 * 300 ** 2)));
}
const { elevations, noDataMask } = fillNoData(raw);
const terrain = { bbox: [0, 0, (W - 1) * D, (H - 1) * D], gridW: W, gridH: H, elevations, noDataMask };

test("the slope stretch describes the ground, not the step into the filled corner", () => {
  const out = terrainDerivativeToRasterInput(terrain, "slope");
  assert.ok(out.scale.max < 12, `stretch top ${out.scale.max}`); // was ~50°+, set by the mean-filled wedge
  assert.ok(out.scale.max >= 5);
});
test("curvature too: its stretch is the 98th percentile of |curvature| over the drawn cells", () => {
  const out = terrainDerivativeToRasterInput(terrain, "curvature");
  const vals = []; // decode the grid the derivative keeps (#1626): NaN = hidden
  const f = new Float32Array(Uint8Array.from(Buffer.from(out.grid.values, "base64")).buffer);
  for (const x of f) if (Number.isFinite(x)) vals.push(Math.abs(x));
  vals.sort((a, b) => a - b);
  assert.ok(Math.abs(out.scale.max - vals[Math.floor(0.98 * (vals.length - 1))]) < 1e-9);
});
test("a terrain with no mask keeps every cell", () => {
  const out = terrainDerivativeToRasterInput({ ...terrain, elevations: raw.map((v, k) => (Number.isFinite(v) ? v : elevations[k])), noDataMask: null }, "slope");
  assert.ok(out.scale.max > 20); // the same filled corners, unmasked, are steep: nothing is dropped without a mask
});
