// TASKS.csv #2779 (split from #2428) — structural trend ratios accepted any size (200 : 200 : 1) without a word. The Trends panel now says
// how thin the search becomes across the plane against the drill spacing, when that is less than a typical sample.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { trendThinness, medianSampleLength, trendContext } from "../src/lib/trendThin.js";

test("200 : 200 : 1 on holes 50 m apart is 0.25 m thick: less than a 2 m sample", () => {
  const r = trendThinness({ max: 200, int: 200, min: 1 }, 50, 2);
  assert.ok(r && Math.abs(r.thickM - 0.25) < 1e-9);
  assert.equal(trendThinness({ max: 4, int: 2, min: 1 }, 50, 2), null, "4 : 2 : 1 is 25 m thick");
  assert.ok(trendThinness({ max: 10, int: 10, min: 1 }, 10, 2), "a 10 m grid (WA lithium) at 10 : 10 : 1 is 1 m thick: under a 2 m sample");
  assert.equal(trendThinness({ max: 10, int: 10, min: 1 }, 200, 2), null, "the same ratios on holes 200 m apart: 20 m");
});

test("no spacing or no samples: nothing said", () => {
  assert.equal(trendThinness({ max: 200, int: 200, min: 1 }, null, 2), null);
  assert.equal(trendThinness({ max: 200, int: 200, min: 1 }, 50, null), null);
});

test("the median sample length, from at most a few thousand rows", () => {
  assert.equal(medianSampleLength([{ from: 0, to: 1 }, { from: 1, to: 3 }, { from: 3, to: 5 }]), 2);
  assert.equal(medianSampleLength([]), null);
  const many = Array.from({ length: 100000 }, (_, i) => ({ from: i, to: i + (i % 2 ? 1 : 3) }));
  const m = medianSampleLength(many);
  assert.ok(m === 1 || m === 3);
});

test("the context: the median site spacing and the assays' sample length (the intervals when there are no assays)", () => {
  const collars = []; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) collars.push({ hole_id: `H${i}${j}`, x: i * 40, y: j * 40 });
  const c = trendContext(collars, [], [{ from: 0, to: 1.5 }]);
  assert.ok(Math.abs(c.spacingM - 40) < 1e-9);
  assert.equal(c.sampleM, 1.5);
});

test("the Trends panel says it under each trend", () => {
  const m = readFileSync(new URL("../src/components/TrendsPanel.jsx", import.meta.url), "utf8");
  assert.match(m, /trendThinness\(t\.ratios, ctx\.spacingM, ctx\.sampleM\)/);
  assert.ok(m.includes('tr("At {max} : {int} : {min}, a search that reaches the next drill site ({s} m away) in every direction of the plane is {t} m thick across it, less than a typical sample ({l} m): each block sees only the samples within that distance of its own plane in each hole, often one or none."'));
});

test("the grid-hashed site spacing equals a brute-force median nearest-site distance, and fans from one pad are one site", async () => {
  const { medianSiteSpacing } = await import("../src/lib/trendThin.js");
  let s = 2779; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let trial = 0; trial < 5; trial++) {
    // a jittered grid, uneven per trial (cells 20-100 m by 30-90 m, jitter up to 12 m): every site more than 5 m (the pad) from the next
    const gx = 20 + trial * 20, gy = 30 + trial * 15, c = [];
    for (let i = 0; i < 20; i++) for (let j = 0; j < 20; j++) c.push({ x: i * gx + rnd() * 12, y: j * gy + rnd() * 12 });
    const nn = c.map((a) => Math.min(...c.filter((b) => b !== a).map((b) => Math.hypot(a.x - b.x, a.y - b.y)))).sort((a, b) => a - b);
    assert.ok(nn[0] > 5);
    assert.ok(Math.abs(medianSiteSpacing(c) - nn[nn.length >> 1]) < 1e-9, `trial ${trial}`);
  }
  const fans = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 100, y: 0 }, { x: 101, y: 1 }];
  assert.equal(Math.round(medianSiteSpacing(fans)), 100, "two pads 100 m apart");
  assert.equal(medianSiteSpacing([{ x: 0, y: 0 }, { x: 2, y: 2 }]), null, "one pad");
  const t0 = performance.now(), big = []; for (let i = 0; i < 8000; i++) big.push({ x: rnd() * 5000, y: rnd() * 5000 });
  medianSiteSpacing(big);
  assert.ok(performance.now() - t0 < 1500, "8,000 collars well under the 8 s of a pairwise search");
});
