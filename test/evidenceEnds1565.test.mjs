// TASKS.csv #1565 — a card's default ends follow its recomputed values (medium, reach, filter), unless the user typed one.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { defaultEvidenceEnds } from "../src/lib/evidenceEnds.js";

test("10th / 90th percentiles, ignoring empty cells; a distance runs 0 to the median; site-spacing kinds are left alone", () => {
  const v = new Float32Array(101).map((_, i) => i); v[3] = NaN;
  const e = defaultEvidenceEnds("element", v);
  assert.ok(e.low > 10 && e.low < 11.5 && e.high > 89.5 && e.high < 90.5, JSON.stringify(e));
  assert.equal(e.log, false);
  assert.equal(defaultEvidenceEnds("grade", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).log, true);
  assert.deepEqual(defaultEvidenceEnds("distance", [0, 10, 20, 30, 40]), { low: 0, high: 20, log: false });
  for (const k of ["drilled", "pick", "zone"]) assert.equal(defaultEvidenceEnds(k, [1, 2, 3]), null);
  assert.equal(defaultEvidenceEnds("element", [NaN, NaN]), null);
});

test("the pane: recompute resets untouched ends; typing one, or a restored card, keeps them", () => {
  const s = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(s, /const ends = next\.endsEdited \? null : defaultEvidenceEnds\(next\.kind, v\);/);
  assert.equal((s.match(/endsEdited: true \/\* #1565 \*\//g) || []).length, 2);
  assert.match(s, /endsEdited: true \/\* #1565 — a saved card's ends were chosen \*\//);
});
