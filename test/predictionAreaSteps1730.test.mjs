// TASKS.csv #1730 — with fewer than 10 occurrence cells the prediction-area crossing lies on a threshold: a whole number of cells, no Nd
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { predictionArea } from "../src/lib/evidence.js";

// 1,000 cells scored 0..1; 8 occurrence cells at chosen scores
const n = 1000, score = Float64Array.from({ length: n }, (_, k) => k / (n - 1)), valid = new Uint8Array(n).fill(1);

test("8 occurrence cells: the rate is a multiple of 1/8 and hits counts them", () => {
  const D = new Set([990, 950, 900, 820, 760, 700, 300, 100]);
  const pa = predictionArea(score, D, valid);
  assert.equal(pa.nTrain, 8);
  const k = pa.point.rate * 8;
  assert.ok(Math.abs(k - Math.round(k)) < 1e-9, String(pa.point.rate));
  assert.equal(pa.point.hits, Math.round(k));
  assert.ok(Math.abs(pa.point.rate + pa.point.area - 1) < 0.15, JSON.stringify(pa.point)); // still near the crossing
});

test("10 or more cells: interpolated as before", () => {
  const D = new Set(Array.from({ length: 40 }, (_, i) => 990 - i * 12));
  const pa = predictionArea(score, D, valid);
  assert.equal(pa.nTrain, 40);
  assert.ok(Math.abs(pa.point.rate + pa.point.area - 1) < 1e-6, JSON.stringify(pa.point));
  assert.equal(pa.point.hits, Math.round(pa.point.rate * 40));
});

test("the plot's text gives counts under 10 cells", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /fuzzy\.nTrain < 10 \? tr\("fuzzy \{k\} of \{n\} occurrence cells in \{a\}% of the area"/);
  assert.match(p, /post\.nTrain < 10 \? tr\("posterior \{k\} of \{n\} occurrence cells in \{a\}% of the area"/);
});
