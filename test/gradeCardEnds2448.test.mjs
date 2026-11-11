// TASKS.csv #2448 (review #2325, WA uranium) — a drill-grade card's top end follows what it maps, and a saturated score is said
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeEndsFromSamples, topScoreShare } from "../src/lib/evidenceEnds.js";

// WA-like: most 1 m assays are background (P50 ~4, P95 ~200), but each hole's best bin is far richer
const rows = [];
for (let i = 0; i < 2000; i++) rows.push({ from: i, to: i + 1, U: i % 20 === 0 ? 200 + (i % 7) * 30 : 2 + (i % 5) });
const mapped = Array.from({ length: 400 }, (_, i) => 150 + i * 25); // the per-bin maxima the card maps: 150 .. 10,125

test("the top end is raised to the mapped values' P90 when the assays' P95 sits under them; the low end stays the assays' P50", () => {
  const plain = gradeEndsFromSamples(rows, (r) => r.U);
  assert.equal(plain.highFrom, "assays");
  const e = gradeEndsFromSamples(rows, (r) => r.U, { mapped });
  assert.equal(e.low, plain.low); // #2099's low end kept
  assert.equal(e.highFrom, "mapped"); assert.equal(e.m, 400);
  assert.ok(e.high > 9000 && e.high > plain.high);
  // mapped values under the assays' P95: the assays' end stays
  assert.equal(gradeEndsFromSamples(rows, (r) => r.U, { mapped: Array(50).fill(3) }).highFrom, "assays");
  // too few mapped values: ignored
  assert.equal(gradeEndsFromSamples(rows, (r) => r.U, { mapped: [1e6, 2e6] }).highFrom, "assays");
});

test("the share of the scored cells at the top score", () => {
  const s = Float32Array.from([0.99, 0.99, 0.99, 0.5, NaN, 0.2]);
  const t = topScoreShare(s);
  assert.equal(t.n, 5); assert.equal(t.at, 3); assert.ok(Math.abs(t.share - 0.6) < 1e-9);
  assert.equal(topScoreShare([NaN]), null);
});

test("the pane passes the mapped values, says where the top came from, and warns on a saturated score", () => {
  const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.match(p, /\{ mapped: holeGradePoints\(cleanAssays, sym, assayUnits\[sym\] \|\| "ppm", assayUnits, traces, undefined, level(, lowest)?\)\.map\(\(p\) => p\.value\) \}/); // lowest: #2578
  assert.match(p, /the 90th percentile of the \{m\} values this card maps/);
  assert.match(p, /result\.topShare && result\.topShare\.share > 1 \/ 3 &&/);
});
