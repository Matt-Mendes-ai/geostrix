// TASKS.csv #3005 (WA iron review) — holeSpacingSummary grid-hashed: the same sites and nearest / median / farthest as the all-pairs loop,
// and fast at 6,400 collars (timing at a generous margin: the machine is shared)
import test from "node:test";
import assert from "node:assert/strict";
import { holeSpacingSummary, sitesAndNearest } from "../src/lib/holeSpacing.js";

function oldCore(collars, padM) {
  const sites = [];
  for (const c of collars || []) {
    if (!Number.isFinite(c?.x) || !Number.isFinite(c?.y)) continue;
    const s = sites.find((q) => Math.hypot(q.x - c.x, q.y - c.y) <= padM);
    if (s) { s.n++; s.x += (c.x - s.x) / s.n; s.y += (c.y - s.y) / s.n; } else sites.push({ x: c.x, y: c.y, n: 1 });
  }
  if (sites.length < 2) return { sites, nn: [] };
  return { sites, nn: sites.map((a) => Math.min(...sites.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))).sort((a, b) => a - b) };
}
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test("identical to the all-pairs loop on random fields with pads", () => {
  for (let t = 0; t < 40; t++) {
    const n = 3 + Math.floor(rnd() * 300), pad = [3, 10, 25][t % 3], spread = [100, 2000, 20000][t % 3];
    const cs = Array.from({ length: n }, () => ({ x: 500000 + rnd() * spread, y: 7000000 + rnd() * spread }));
    for (let k = 0; k < n / 5; k++) { const c = cs[Math.floor(rnd() * cs.length)]; cs.push({ x: c.x + (rnd() - 0.5) * pad, y: c.y + (rnd() - 0.5) * pad }); }
    const a = sitesAndNearest(cs, pad), b = oldCore(cs, pad);
    assert.equal(a.sites.length, b.sites.length, `set ${t}`);
    a.nn.forEach((v, i) => assert.ok(Math.abs(v - b.nn[i]) < 1e-6, `set ${t} nn ${i}`));
  }
  assert.equal(holeSpacingSummary([{ x: 0, y: 0 }]), null);
  assert.deepEqual((({ sites, nearestM, farthestM }) => ({ sites, nearestM, farthestM }))(holeSpacingSummary([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 300, y: 0 }], 5)), { sites: 3, nearestM: 100, farthestM: 200 });
});

test("6,400 collars in patches over a 21 km field: well under the old 8 s", () => {
  const big = []; for (let p = 0; p < 40; p++) { const cx = rnd() * 21000, cy = rnd() * 15000; for (let k = 0; k < 160; k++) big.push({ x: 500000 + cx + (k % 13) * 40, y: 7000000 + cy + Math.floor(k / 13) * 40 }); }
  const t0 = performance.now(); const s = holeSpacingSummary(big); const ms = performance.now() - t0;
  assert.ok(s && s.sites > 1000);
  assert.ok(ms < 2500, `${ms.toFixed(0)} ms`);
});
