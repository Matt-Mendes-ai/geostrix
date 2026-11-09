// TASKS.csv #2252 (review #2174, WA gold) — an evidence on one hole emptied the gamma score unnamed: each card's coverage, the cards named
// when the score is empty, and no empty score sent to the map or a GeoTIFF
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceCoverage, scoreBlockers, fuzzyCombine, LOW_COVERAGE } from "../src/lib/evidence.js";

const n = 1000;
const everywhere = Float32Array.from({ length: n }, (_, i) => i / n);
const oneHole = Float32Array.from({ length: n }, (_, i) => (i < 3 ? 0.8 : NaN)); // Recovery % on one hole: 3 cells of 1,000

test("coverage per evidence", () => {
  assert.equal(evidenceCoverage(everywhere), 1);
  assert.equal(evidenceCoverage(oneHole), 0.003);
  assert.equal(evidenceCoverage([]), 0);
  assert.equal(LOW_COVERAGE, 0.05);
});

test("gamma with a one-hole evidence: 3 cells scored, the card named; Or / Sum are not blocked", () => {
  const fz = fuzzyCombine([everywhere, oneHole], "gamma", 0.9);
  const nValid = fz.filter(Number.isFinite).length;
  assert.equal(nValid, 3);
  const b = scoreBlockers([{ label: "Grade", values: everywhere }, { label: "Recovery %", values: oneHole }], nValid, n, "gamma");
  assert.equal(b[0].label, "Recovery %"); assert.equal(b[0].coverage, 0.003);
  assert.deepEqual(scoreBlockers([{ label: "Recovery %", values: oneHole }], nValid, n, "or"), []);
  assert.deepEqual(scoreBlockers([{ label: "Grade", values: everywhere }], n, n, "gamma"), []); // a full score: nothing to say
});

test("the pane: the coverage line on each card, the alert naming the cards, the exports disabled on an empty score", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const c = evidenceCoverage\(l\.values\);/);
  assert.match(p, /blockers: scoreBlockers\(layers, nValid, n, operator\)/);
  assert.match(p, /result\.blockers\?\.length > 0 && <div role="alert"/);
  assert.equal((p.match(/disabled=\{!result\.nValid\}/g) || []).length, 2);
});
