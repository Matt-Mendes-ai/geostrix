// TASKS.csv #1619 (review #1497, Lawyers) — contours stop at the terrain's filled no-data nodes
import test from "node:test";
import assert from "node:assert/strict";
import { contourTerrain } from "../src/lib/contours.js";

// a 41 x 41 grid over 0..400 m: a cone (1,800 m at the centre) where there is data, the rest filled at the mean, 1,748 m
function terrain(withMask) {
  const W = 41, H = 41, el = new Array(W * H), bits = new Uint8Array(Math.ceil((W * H) / 8));
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c, d = Math.hypot(c - 20, r - 20);
    if (d <= 12) el[i] = 1800 - d * 6; // 1,728-1,800 m
    else { el[i] = 1748; bits[i >> 3] |= 1 << (i & 7); }
  }
  return { bbox: [0, 0, 400, 400], gridW: W, gridH: H, elevations: el, ...(withMask ? { noDataMask: bits } : {}) };
}
const touches = (r, c) => [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]].some(([rr, cc]) => Math.hypot(cc - 20, rr - 20) > 12);
const fillTouching = (t, p) => { // is every grid cell holding p (two or four when p sits on a cell edge) one with a filled corner?
  const fx = p.x / 10, fy = (400 - p.y) / 10;
  const cs = Number.isInteger(fx) ? [fx - 1, fx] : [Math.floor(fx)], rs = Number.isInteger(fy) ? [fy - 1, fy] : [Math.floor(fy)];
  const cells = cs.flatMap((c) => rs.map((r) => [r, c])).filter(([r, c]) => r >= 0 && c >= 0 && r < 40 && c < 40);
  return cells.every(([r, c]) => touches(r, c));
};

test("with the mask no contour vertex lies in a cell touching the fill", () => {
  const t = terrain(true);
  const { levels } = contourTerrain(t, { interval: 10 });
  const pts = levels.flatMap((l) => l.polylines.flat());
  assert.ok(pts.length > 50, "the cone is contoured");
  assert.equal(pts.filter((p) => fillTouching(t, p)).length, 0);
});

test("without the mask the fill makes the rim the review saw (the control)", () => {
  const t = terrain(false);
  const pts = contourTerrain(t, { interval: 10 }).levels.flatMap((l) => l.polylines.flat());
  assert.ok(pts.filter((p) => fillTouching(t, p)).length > 0);
});

test("the elevation range ignores the fill value", () => {
  const { min, max } = contourTerrain(terrain(true), { interval: 10 });
  assert.ok(min >= 1728 - 1e-9 && max === 1800, `${min}-${max}`);
});
