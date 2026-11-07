// TASKS.csv #1566 — a weights-of-evidence row with a negative contrast is flagged, not bolded, with a one-click flip of the card.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bestCutoff } from "../src/lib/evidence.js";

test("an evidence whose occurrences sit at its LOW end gets a negative best contrast as 'favourable when high'", () => {
  // 200 cells, value = index; the 12 occurrence cells are among the lowest values
  const values = Float32Array.from({ length: 200 }, (_, i) => i);
  const valid = new Uint8Array(200).fill(1);
  const D = new Set([1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23]);
  const up = bestCutoff(values, D, valid, { direction: "increasing" }).best;
  const down = bestCutoff(values, D, valid, { direction: "decreasing" }).best;
  assert.ok(up.studC < 0, `increasing C/s ${up.studC}`);
  assert.ok(down.studC > 2, `decreasing C/s ${down.studC}`);
});

test("the pane: negative contrast in the warning colour, bold only for C/s >= 2, the sentence and the flip", () => {
  const s = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.match(s, /const against = !r\.none && r\.studC < 0, strongAgainst = against && r\.studC <= -2;/);
  assert.match(s, /fontWeight: !r\.none && r\.studC >= 2 \? 600 : 400/);
  assert.doesNotMatch(s, /Math\.abs\(r\.studC\) >= 2/);
  assert.match(s, /updateLayer\(r\.id, \{ shape: r\.direction === "decreasing" \? "increasing" : "decreasing" \}\); setResult\(null\);/);
});
