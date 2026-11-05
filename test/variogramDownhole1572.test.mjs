// TASKS.csv #1572 (review #1497, Lawyers) — the downhole variogram uses every composite of every hole (whole holes under a
// pair budget), so the composite-length lags hold the pairs the nugget needs; a stride-subsampled omnidirectional run says
// the shortest lag it holds, and the kriging auto-fit takes its nugget ratio from the downhole variogram
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { experimentalVariogram, downholeGroups, DOWNHOLE_PAIR_BUDGET } from "../src/lib/variogram.js";

// 400 holes x 120 composites of 2 m on a 50 m grid: 48,000 composites, far over the 6,000-point stride
const field = () => {
  const pts = [];
  for (let h = 0; h < 400; h++) for (let k = 0; k < 120; k++) pts.push({ hole_id: `H${h}`, x: (h % 20) * 50, y: Math.floor(h / 20) * 50, z: -2 * k, value: Math.sin(k / 3) + (h % 7) / 7 });
  return pts;
};

test("downhole pairs come from every composite: the 2 m lag holds a pair per consecutive composite of every hole", () => {
  const d = experimentalVariogram(field(), { lagDistance: 2, nLags: 12, holeMode: "downhole" });
  assert.equal(d.nPoints, 48000);
  assert.equal(d.subsampled, false);
  assert.equal(d.holesUsed, 400);
  assert.equal(d.bins[0].nPairs, 400 * 119); // 47,600 pairs at 2 m — was none under 16 m
  assert.equal(d.bins[1].nPairs, 400 * 118);
  assert.ok(d.bins[0].gamma > 0 && d.bins[0].gamma < d.bins[5].gamma); // the variogram rises from the nugget
});

test("the stride subsample of an all-pairs run says its shortest lag with pairs", () => {
  const a = experimentalVariogram(field(), { lagDistance: 2, nLags: 12 });
  assert.equal(a.subsampled, true);
  assert.equal(a.nPoints, 6000);
  assert.equal(a.holesTotal, null);
  assert.equal(a.firstPairLag, 16); // every 8th composite of a hole: 16 m
  assert.equal(a.bins[0].nPairs, 0);
});

test("over the pair budget, whole holes are kept (the same ones every run) so every lag of a kept hole is there", () => {
  const pts = field();
  const g = downholeGroups(pts, 50000);
  assert.equal(g.subsampled, true);
  assert.equal(g.holesTotal, 400);
  assert.ok(g.holesUsed >= 7 && g.holesUsed <= 8, String(g.holesUsed));
  for (const grp of g.groups) assert.equal(grp.length, 120); // a kept hole is whole
  assert.deepEqual(downholeGroups(pts, 50000).groups.map((x) => x[0].hole_id), g.groups.map((x) => x[0].hole_id)); // seeded
  const d = experimentalVariogram(pts, { lagDistance: 2, nLags: 12, holeMode: "downhole", maxPairs: 50000 });
  assert.equal(d.bins[0].nPairs, g.holesUsed * 119);
  assert.equal(d.holesUsed, g.holesUsed);
  assert.ok(DOWNHOLE_PAIR_BUDGET >= 10e6);
});

test("under the budget, nothing is dropped; between-hole pairs are untouched", () => {
  const small = field().filter((p) => Number(p.hole_id.slice(1)) < 20);
  const d = experimentalVariogram(small, { lagDistance: 2, nLags: 3, holeMode: "downhole" });
  assert.equal(d.subsampled, false);
  assert.equal(d.nPairsUsed, 20 * (119 + 118 + 117));
  const b = experimentalVariogram(small, { lagDistance: 50, nLags: 2, holeMode: "between" });
  assert.ok(b.nPairsUsed > 0 && b.bins[0].nPairs > 0);
});

test("the kriging auto-fit takes its nugget ratio from the downhole variogram when the subsample holds no short pair; the caption says the gap", () => {
  const e = readFileSync(new URL("../src/lib/estimation.js", import.meta.url), "utf8");
  assert.match(e, /holeMode: "downhole"/);
  assert.match(e, /ev\.firstPairLag > 1\.5 \* dhLag/);
  assert.match(e, /nuggetFrom/);
  const m = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(m, /no pairs closer than \{h\} m — Downhole only resolves the nugget/);
  assert.match(m, /\{used\} of \{total\} holes, whole holes, for the pair loop/);
});
