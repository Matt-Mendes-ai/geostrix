// TASKS.csv #2065 (review #2013, Woodjam) — 'Between holes only' on Cu read 'read only out to 0 m, the furthest lag that clears
// 30 pairs contiguously' and reported a nugget of 0 although no between-hole pair existed below the hole spacing. The reliable run
// now starts at the first bin that clears 30 pairs (reliableFromLag) and the panel flags the nugget as not constrained.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { experimentalVariogram } from "../src/lib/variogram.js";

// holes 50 m apart on a line, samples every 2 m down each: between-hole pairs sit at 50 m and more; the 10 m lags hold
// only a handful of pairs, from a short twin hole
function holes() {
  const pts = [];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let h = 0; h < 12; h++) for (let d = 0; d < 40; d++) pts.push({ hole_id: "H" + h, x: h * 50, y: 0, z: -d * 2, value: 1 + rnd() });
  // a few pairs closer than the hole spacing: a short twin 10 m from H0
  for (let d = 0; d < 2; d++) pts.push({ hole_id: "T", x: 10, y: 0, z: -d * 2, value: 1 + rnd() });
  return pts;
}

test("the reliable run starts where the bins first clear 30 pairs, not at 0 m", () => {
  const vg = experimentalVariogram(holes(), { lagDistance: 10, nLags: 12, lagTolerance: 5, holeMode: "between" });
  const first = vg.bins.find((b) => b.nPairs > 0);
  assert.ok(first.nPairs < 30, "the first bin with pairs is under 30 (" + first.nPairs + ")");
  assert.ok(vg.reliableFromLag >= 40, "the run starts at the hole spacing: " + vg.reliableFromLag);
  assert.ok(vg.maxReliableLag >= vg.reliableFromLag, "and ends at or past it: " + vg.maxReliableLag);
  assert.ok(vg.maxReliableLag > 0, "never '0 m' when a later run clears 30 pairs");
});

test("downhole pairs keep the run from the first lag", () => {
  const vg = experimentalVariogram(holes(), { lagDistance: 2, nLags: 10, lagTolerance: 1, holeMode: "downhole" });
  assert.equal(vg.reliableFromLag, 2);
  assert.ok(vg.maxReliableLag >= 10);
});

test("no bin clears 30 pairs: both 0", () => {
  const pts = [{ hole_id: "a", x: 0, y: 0, z: 0, value: 1 }, { hole_id: "b", x: 10, y: 0, z: 0, value: 2 }];
  const vg = experimentalVariogram(pts, { lagDistance: 10, nLags: 3, lagTolerance: 5, holeMode: "all" });
  assert.equal(vg.reliableFromLag, 0);
  assert.equal(vg.maxReliableLag, 0);
});

test("the panel names the run and flags an unconstrained nugget", () => {
  const src = readFileSync(new URL("../src/components/VariogramModal.jsx", import.meta.url), "utf8");
  assert.match(src, /Read only lags \{a\}–\{b\} m, the run that clears 30 pairs/);
  assert.match(src, /const nuggetFree = .*reliableFromLag <= result\.lag \* 1\.01/);
  assert.match(src, /The nugget is not constrained: no lag closer than \{h\} m holds 30 pairs/);
  assert.match(src, /label=\{tr\("Nugget"\)\} value=\{nuggetFree \? tr\("\{v\} \(not constrained\)"/);
  assert.match(src, /nuggetRatio > 0\.5 && !fitWeak && !nuggetFree/, "no 'High nugget' advice on a guessed nugget");
  assert.match(src, /result\.holeMode !== "downhole" \? " " \+ tr\("Take it from Downhole only/);
});
