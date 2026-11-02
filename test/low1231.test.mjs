import test from "node:test";
import assert from "node:assert/strict";
import { onSectionPlane } from "../src/lib/sectionDigitise.js";
import { signedOffset } from "../src/lib/sectionCorridor.js";
import { pointEvidence } from "../src/lib/evidence.js";

test("#1231 a snapped vertex moves onto the plane and keeps its hole; a free point is left alone", () => {
  const sec = { ax: 1000, ay: 2000, ux: 1, uy: 0 };
  const snapped = { l: 40, z: 900, x: 1040, y: 2067, hole_id: "H1", md: 154.8, snap: "boundary" };
  const p = onSectionPlane(snapped, sec);
  assert.deepEqual([p.x, p.y, p.z, p.hole_id, p.md], [1040, 2000, 900, "H1", 154.8]);
  assert.equal(p.projected, true);
  assert.equal(signedOffset(p.x, p.y, { x: 1000, y: 2000 }, { x: 2000, y: 2000 }), 0);
  assert.equal(signedOffset(snapped.x, snapped.y, { x: 1000, y: 2000 }, { x: 2000, y: 2000 }), 67);
  const free = { l: 10, z: 5, x: 1010, y: 2000 };
  assert.equal(onSectionPlane(free, sec), free);
});
test("#1281 point evidence matches a brute-force reading, negative coordinates included", () => {
  const g = { nx: 40, ny: 30, x0: -2000, yTop: 1500, dx: 100, dy: 100 };
  const pts = [[-1500, 900, 1], [-1450, 880, 5], [300, 200, 2], [1500, -1200, 9], [310, 210, 4]].map(([x, y, value]) => ({ x, y, value }));
  const R = 300, out = pointEvidence(g, pts, { maxDistance: R });
  for (let k = 0; k < out.length; k++) {
    const x = g.x0 + (k % g.nx) * g.dx, y = g.yTop - Math.floor(k / g.nx) * g.dy;
    const near = pts.map((p) => [Math.hypot(p.x - x, p.y - y), p.value]).filter(([d]) => d <= R);
    if (!near.length) { assert.ok(Number.isNaN(out[k]), `cell ${k}`); continue; }
    const hit = near.find(([d]) => d < 1e-9);
    const want = hit ? hit[1] : near.reduce((a, [d, v]) => a + v / d ** 2, 0) / near.reduce((a, [d]) => a + 1 / d ** 2, 0);
    assert.ok(Math.abs(out[k] - want) < 1e-4 * Math.max(1, Math.abs(want)), `cell ${k}: ${out[k]} vs ${want}`);
  }
});
