// TASKS.csv #3285 (Galore Creek review) — a between-holes variogram from 11 drill sites showed 89,407 to 551,134 pairs a lag and never
// tripped the 30-pair caution: they are composite pairs, and each lag rests on a handful of hole pairs. Each bin now carries holePairs, and
// between holes a lag is reliable only with at least MIN_HOLE_PAIRS of them.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { experimentalVariogram, MIN_HOLE_PAIRS } from "../src/lib/variogram.js";

const vhole = (id, x, y, n = 120) => Array.from({ length: n }, (_, k) => ({ x, y, z: -k * 2, value: Math.sin(x / 50 + k / 9) + (k % 7) * 0.1, hole_id: id }));

test("three holes: thousands of composite pairs a lag, at most three hole pairs, and not reliable between holes", () => {
  const pts = [...vhole("A", 0, 0), ...vhole("B", 100, 0), ...vhole("C", 0, 100)];
  const v = experimentalVariogram(pts, { lagDistance: 50, nLags: 6, holeMode: "between" });
  const filled = v.bins.filter((b) => b.nPairs > 0);
  assert.ok(filled.some((b) => b.nPairs >= 1000), "many composite pairs");
  for (const b of filled) { assert.ok(b.holePairs >= 1 && b.holePairs <= 3, String(b.holePairs)); assert.equal(b.reliable, false); }
  assert.equal(v.maxReliableLag, 0); assert.equal(v.reliableFromLag, 0);
  assert.equal(MIN_HOLE_PAIRS, 5);
});

test("a grid of twelve holes: lags with five hole pairs or more are reliable; all pairs and downhole keep their rules", () => {
  const pts = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) pts.push(...vhole(`H${i}${j}`, i * 60, j * 60, 60));
  const v = experimentalVariogram(pts, { lagDistance: 60, nLags: 4, holeMode: "between" });
  const first = v.bins[0]; // 60 m: the 17 neighbouring hole pairs of the grid
  assert.ok(first.holePairs >= MIN_HOLE_PAIRS && first.reliable, JSON.stringify(first));
  assert.ok(v.maxReliableLag >= 60);
  // all pairs: hole pairs counted for its between-hole pairs, reliability on the 30 pairs alone (as before)
  const all = experimentalVariogram([...vhole("A", 0, 0), ...vhole("B", 100, 0)], { lagDistance: 50, nLags: 4, holeMode: "all" });
  for (const b of all.bins) { if (b.nPairs >= 30) assert.equal(b.reliable, true); assert.ok(b.holePairs <= 1); }
  // downhole: no hole pairs at all
  const dh = experimentalVariogram(vhole("A", 0, 0), { lagDistance: 2, nLags: 6, holeMode: "downhole" });
  assert.ok(dh.bins.every((b) => b.holePairs === undefined)); assert.ok(dh.maxReliableLag > 0);
});

test("wiring: the point colour and tooltip, the note; keys", () => {
  const m = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(m, /fill=\{\(b\.reliable \?\? b\.nPairs >= 30\) \? "#4a9be0" : "#d98f8f"\}/);
  assert.match(m, /tr\(" from \{h\} hole pair\(s\)", \{ h: b\.holePairs\.toLocaleString\(\) \}\)/);
  assert.match(m, /const holePairsLow = result && result\.holeMode === "between" && result\.vg\.bins\.some\(\(b\) => b\.nPairs >= 30 && b\.holePairs != null && b\.holePairs < MIN_HOLE_PAIRS\);/);
  assert.match(m, /\{holePairsLow && <div role="note"/);
  // the nugget note between holes names the hole-pair rule (found live: 'no lag holds 30 pairs' beside lags of 1,631 pairs from 2 hole pairs)
  assert.match(m, /result\.holeMode === "between" \/\* #3285[^*]*\*\/\s*\? \(result\.vg\.reliableFromLag > 0/);
  assert.match(m, /tr\("The nugget is not constrained: between holes, no lag holds 30 pairs from \{m\} or more pairs of holes/);
  for (const l of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"));
    for (const k of [" from {h} hole pair(s)", " (from under {m} pairs of holes — not a reliable measurement between holes)",
      "Between holes, each lag rests on the pairs of holes it spans: some lags here come from under {m} pairs of holes (shown in red), each counted many times over in the pairs of composites. Read them as a few hole-to-hole comparisons, not as that many measurements."]) assert.ok(d[k], `${l}: ${k}`);
  }
});
