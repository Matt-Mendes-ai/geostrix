// TASKS.csv #2964 (review #2876, WA iron) — weights of evidence on a drilled-out bulk deposit: one 2 m sample at the cut-off made a hole an
// occurrence (4,800 of 6,031 holes at 55 % Fe), the header's hole counts were the whole project's whatever the grid, and the 'Circular'
// warning was missing for the per-hole metres card. Now: an optional 'at least {m} m' occurrence rule, the counts of the cells used, the
// circular test covering per-hole cards, and a warning when most drilled cells are occurrences.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holesInCells } from "../src/lib/evidence.js";
import { occurrenceHoles } from "../src/lib/evidenceSources.js";

test("#2964 the holes of the cells used, not the project's", () => {
  const g = { x0: 0, yTop: 100, dx: 10, dy: 10, nx: 10, ny: 10 }; // cell centres at 0, 10 ... 90
  const samples = [{ hole: "IN1", x: 10, y: 90, v: 60 }, { hole: "IN2", x: 20, y: 90, v: 40 }, { hole: "OUT", x: 500, y: 500, v: 70 }, { hole: "OFFMASK", x: 50, y: 50, v: 70 }];
  const mask = new Uint8Array(100); mask[1 * 10 + 1] = 1; mask[1 * 10 + 2] = 1; // the two drilled cells (j = 1)
  assert.deepEqual([...holesInCells(g, samples, mask)].sort(), ["IN1", "IN2"], "outside the grid or the mask: not counted");
  assert.deepEqual([...holesInCells(g, samples, mask, 55)], ["IN1"], "with the cut-off");
  assert.deepEqual([...holesInCells(g, samples, new Set([11]))], ["IN1"], "a Set of cells too");
});

test("#2964 'at least m metres at or above the cut-off': one 2 m sample no longer makes an occurrence", () => {
  const rows = [
    { hole_id: "A", from: 0, to: 2, g: 56 }, { hole_id: "A", from: 2, to: 4, g: 40 },                       // 2 m at or above 55
    { hole_id: "B", from: 0, to: 2, g: 58 }, { hole_id: "B", from: 2, to: 4, g: 57 }, { hole_id: "B", from: 6, to: 8, g: 60 }, // 6 m
    { hole_id: "C", from: 0, to: 2, g: null },
  ];
  const v = (a) => a.g;
  assert.deepEqual([...occurrenceHoles(rows, v, 55, 6)], ["B"]);
  assert.deepEqual([...occurrenceHoles(rows, v, 55, 2)].sort(), ["A", "B"], "exactly the metres: in");
  assert.equal(occurrenceHoles(rows, v, 55, ""), null, "blank: no metres rule (every hole may be one, as before)");
  assert.equal(occurrenceHoles(rows, v, NaN, 6), null);
});

test("#2964 the pane: the metres field, the counts of the cells used, the circular test, the most-are-hits warning", () => {
  const p = fs.readFileSync(new URL("../src/components/EvidenceOverlayPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('aria-label={tr("Metres at or above the cut-off in a hole")}'));
  assert.ok(p.includes("holeGradePoints(occurrenceRows(t, min), t.symbol"), "the occurrences follow the rule");
  assert.ok(p.includes("holesInCells(grid, trainingSamples, trainMask).size") && p.includes("holesInCells(grid, trainingSamples.filter((x) => x.occ), D,"));
  assert.ok(!p.includes("trainingHoles"), "no project-wide count left");
  assert.match(p, /l\.kind === "numeric" && parseGtRef\(l\.ref\)\?\.symbol === training\.symbol/);
  assert.ok(p.includes("mostAreHits: !!drilled && ND / N > 0.5"));
  assert.ok(p.includes("% of the drilled cells are occurrences: the weights have little to set them apart from"));
});
