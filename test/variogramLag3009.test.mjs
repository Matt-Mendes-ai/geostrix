// TASKS.csv #3009 — the lag suggestions' nearest-neighbour search grid-hashed: the same lags as the 600 x n scan, fast on 147,000 composites
import test from "node:test";
import assert from "node:assert/strict";
import { suggestBetweenHoleLag, suggestLagDistance, nearestAmong } from "../src/lib/variogram.js";

let seed = 21; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const brute = (queries, pts, accept) => queries.map((a) => { let best = Infinity; for (const b of pts) { const d2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2; if (d2 < best && accept(a, b, d2)) best = d2; } return best; }).filter((v) => v < Infinity).map(Math.sqrt);

test("nearestAmong: the same distances as the full scan (between holes and any other point), on clustered and spread fields", () => {
  for (let t = 0; t < 8; t++) {
    const pts = [];
    const holes = 20 + Math.floor(rnd() * 80), spread = [200, 5000, 20000][t % 3];
    for (let h = 0; h < holes; h++) { const x = rnd() * spread, y = rnd() * spread * 0.5, n = 3 + Math.floor(rnd() * 20); for (let k = 0; k < n; k++) pts.push({ x: x + k * 0.3 * (t % 2), y, z: -k * 2, hole_id: `H${h}` }); }
    const q = pts.filter((_, i) => i % 7 === 0);
    for (const accept of [(a, b) => b.hole_id !== a.hole_id, (a, b, d2) => d2 > 0]) {
      const fast = nearestAmong(q, pts, accept).sort((a, b) => a - b), slow = brute(q, pts, accept).sort((a, b) => a - b);
      assert.equal(fast.length, slow.length); fast.forEach((v, i) => assert.ok(Math.abs(v - slow[i]) < 1e-9, `set ${t}`));
    }
  }
});

test("147,000 composites in 40 m patterns: both suggestions well under the 2.9 s the scan took", () => {
  const pts = []; for (let p = 0; p < 40; p++) { const cx = rnd() * 21000, cy = rnd() * 15000; for (let k = 0; k < 160; k++) for (let j = 0; j < 23; j++) pts.push({ x: cx + (k % 13) * 40, y: cy + Math.floor(k / 13) * 40, z: 440 - j * 2 - 1, hole_id: `H${p}_${k}`, value: 1 }); }
  let t0 = performance.now(); const between = suggestBetweenHoleLag(pts); const tb = performance.now() - t0;
  t0 = performance.now(); const down = suggestLagDistance(pts); const td = performance.now() - t0;
  assert.ok(Math.abs(between - 40) < 1e-6, String(between)); assert.ok(Math.abs(down - 2) < 1e-6, String(down));
  assert.ok(tb < 1500 && td < 1500, `${tb.toFixed(0)} / ${td.toFixed(0)} ms`);
});
