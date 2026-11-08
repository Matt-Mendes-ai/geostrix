// TASKS.csv #2106 — the estimation dialog's one-hole / dominated / support tallies are recounted from the blocks kept after its
// trims (a modelled volume, a design-string area, the terrain): the terrain cut left '15,416 of the estimated blocks (102%)' on Woodjam.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { retallyKeptCells, DOMINANT_SHARE } from "../src/lib/estimation.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const kept = [
  { nHoles: 1, holeShare: 1, support: "extrapolated" },
  { nHoles: 1, holeShare: 1, support: "extrapolated" },
  { nHoles: 2, holeShare: DOMINANT_SHARE, support: "interpolated" }, // effectively one hole
  { nHoles: 3, holeShare: 0.6, support: "interpolated" },
  { nHoles: 2, holeShare: 0.5, support: "extrapolated" },
];
const before = { interpolated: 40, extrapolated: 60, unsupported: 900, searchLimited: 50 };

test("recounts from the kept blocks; never more one-hole blocks than blocks", () => {
  const t = retallyKeptCells(kept, { method: "idw2", supportCounts: before });
  assert.equal(t.singleHoleCells, 2);
  assert.equal(t.dominatedCells, 1);
  assert.deepEqual(t.supportCounts, { interpolated: 2, extrapolated: 3, unsupported: 900, searchLimited: 3 }); // unsupported: the grid's, kept
  assert.ok(t.singleHoleCells + t.dominatedCells <= kept.length);
});

test("a volume trim drops the unsupported count (inside or outside cannot be told); NN has no dominated blocks; no classification -> no counts", () => {
  assert.equal(retallyKeptCells(kept, { method: "idw2", supportCounts: before, dropUnsupported: true }).supportCounts.unsupported, 0);
  assert.equal(retallyKeptCells(kept, { method: "nn", supportCounts: before }).dominatedCells, 0);
  assert.equal(retallyKeptCells(kept, { method: "idw2" }).supportCounts, undefined);
  assert.deepEqual(retallyKeptCells([], { method: "ok", supportCounts: before }), { singleHoleCells: 0, dominatedCells: 0, supportCounts: { interpolated: 0, extrapolated: 0, unsupported: 900, searchLimited: 0 } });
});

test("the dialog runs it once, after every trim", () => {
  const m = read("src/components/GradeEstimationModal.jsx");
  const at = (re) => m.search(re);
  const recount = at(/const t = retallyKeptCells\(est\.cells, \{ method, supportCounts: est\.supportCounts, dropUnsupported: !!inShell \}\);/);
  assert.ok(recount > 0);
  assert.ok(at(/est\.blocksBeforeTrims = est\.cells\.length;/) < at(/if \(inShell\) \{ \/\/ #517/));
  assert.ok(at(/if \(groundAt && belowGround\) \{/) < recount && at(/if \(areaString\) \{/) < recount, "after the area and terrain trims");
  assert.ok(!/est\.singleHoleCells = est\.cells\.filter/.test(m), "the volume trim's own partial recount is gone");
});
