// TASKS.csv #2001 — the posterior's standard deviation, ROC-AUC on the occurrence cells, and a quartic-kernel density of the occurrences
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { posterior, rocAuc, kdeEvidence, weights } from "../src/lib/evidence.js";

test("the posterior's sd: P (1 - P) sqrt(1/ND + s^2 of the weights applied)", () => {
  const values = Float32Array.from([1, 0]), valid = Uint8Array.from([1, 1]);
  const w = weights(50, 8, 1000, 10); // 50 cells in the pattern, 8 of the 10 occurrences
  const L = { values, cutoff: 0.5, direction: "increasing", ...w };
  const r = posterior([L], valid, 1000, 10);
  const p0 = r.prob[0], p1 = r.prob[1];
  assert.ok(Math.abs(r.sd[0] - p0 * (1 - p0) * Math.sqrt(1 / 10 + w.sPlus ** 2)) < 1e-6);
  assert.ok(Math.abs(r.sd[1] - p1 * (1 - p1) * Math.sqrt(1 / 10 + w.sMinus ** 2)) < 1e-6);
});

test("ROC-AUC: 1 when every occurrence outranks the rest, 0.5 for ties, 0 when below", () => {
  const sc = Float32Array.from([0.1, 0.2, 0.3, 0.9, 0.8]);
  assert.equal(rocAuc(sc, new Set([3, 4])), 1);
  assert.equal(rocAuc(sc, new Set([0])), 0);
  assert.equal(rocAuc(Float32Array.from([1, 1, 1, 1]), new Set([0])), 0.5);
  assert.equal(rocAuc(sc, new Set()), null);
});

test("the kernel density integrates to the number of occurrences, and is 0 beyond the bandwidth", () => {
  const g = { x0: 0, yTop: 200, dx: 5, dy: 5, nx: 41, ny: 41 };
  const v = kdeEvidence(g, [{ x: 100, y: 100 }, { x: 60, y: 100 }], 30);
  let sum = 0; for (const a of v) sum += (a * 25) / 1e6;
  assert.ok(Math.abs(sum - 2) < 0.02, String(sum));
  assert.equal(v[0], 0);
});

test("the pane: the sd to the map, the AUC line, the density card (circular with the occurrences)", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(p, /onClick=\{\(\) => toMap\("posteriorSd"\)\}/);
  assert.match(p, /out\.auc = \{ fuzzy: rocAuc\(fuzzy, D, valid\)/);
  assert.match(p, /\{ key: "kde", label: tr\("Density of the known occurrences \(quartic kernel\)"\), kind: "kde"/);
  assert.match(p, /training\.source !== "none" && layers\.some\(\(l\) => l\.kind === "kde"\)/);
  assert.match(p, /sPlus: r\.sPlus, sMinus: r\.sMinus/);
});
