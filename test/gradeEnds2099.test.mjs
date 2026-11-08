// TASKS.csv #2099 (review #2013, Woodjam) — a drill-grade evidence card's default ends come from the assays (length-weighted P50 / P95),
// not from the grid of IDW'd bin maxima, and the card says where its ends came from.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gradeEndsFromSamples } from "../src/lib/evidenceEnds.js";
const p = readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("length-weighted percentiles of the samples", () => {
  // 100 one-metre samples 1..100 ppm, plus one 10 m sample at 1000 ppm: weight 110 m in all
  const rows = Array.from({ length: 100 }, (_, i) => ({ from: i, to: i + 1, Cu: i + 1 })).concat([{ from: 200, to: 210, Cu: 1000 }]);
  const e = gradeEndsFromSamples(rows, (r) => r.Cu);
  assert.equal(e.low, 55);   // 50 % of 110 m = 55 m: the 55th one-metre sample
  assert.equal(e.high, 1000); // the long high-grade sample holds the top 10 m (9 %)
  assert.equal(e.n, 101); assert.deepEqual(e.q, [50, 95]); assert.equal(e.log, true);
  assert.equal(gradeEndsFromSamples(rows.slice(0, 5), (r) => r.Cu), null, "under 10 samples");
  assert.equal(gradeEndsFromSamples(rows.map((r) => ({ ...r, Cu: 0 })), (r) => r.Cu), null, "no positive grade");
});

test("the pane uses them for a grade card, keeps them through a re-grid, and says where the ends came from", () => {
  assert.match(p, /const ge = src\.kind === "grade" \? gradeEnds\(src\.ref\) : null;/);
  assert.match(p, /if \(ge\) \{ low = ge\.low; high = ge\.high; log = true; endsFrom = \{ kind: "assays", q: ge\.q, n: ge\.n \}; \}/);
  assert.match(p, /const ends = next\.endsEdited \? null : ge \|\| defaultEvidenceEnds\(next\.kind, v\);/);
  assert.match(p, /\{l\.endsFrom && !l\.endsEdited && <div/);
});
