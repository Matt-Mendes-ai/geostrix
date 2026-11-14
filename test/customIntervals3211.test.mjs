// TASKS.csv #3211 (#3195, Galore Creek) — a custom layer import kept a reversed interval and its overlaps without a word, and Data QC did not look at
// custom layers. Synthetic layer.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runDataQC, customIntervalLayers } from "../src/lib/dataQC.js";
import { skippedRowsText } from "../src/lib/viewer/importHelpers.js";

const collars = [{ hole_id: "SY-1", x: 0, y: 0, z: 100, length: 50 }, { hole_id: "SY-2", x: 10, y: 0, z: 100, length: 50 }];
const lock = { id: "c1", name: "Lock angles", rows: [
  { hole_id: "SY-1", from: 0, to: 2, value: "Y" }, { hole_id: "SY-1", from: 2, to: 4, value: "N" }, { hole_id: "SY-1", from: 3, to: 5, value: "Y" }, // an overlap
  { hole_id: "SY-2", from: 8, to: 6, value: "Y" }, // reversed (as the store would hold one imported before this change)
  { hole_id: "SY-2", from: 40, to: 60, value: "N" }, // past the end of the hole
] };
const binned = { id: "c2", name: "gamma", binM: 1, rows: [{ hole_id: "SY-1", from: 0, to: 1, value: 5 }, { hole_id: "SY-1", from: 0.5, to: 1.5, value: 6 }] };
const modelled = { id: "c3", name: "units", rows: [{ hole_id: "SY-1", from: 0, to: 1, value: "A", modelled: true }, { hole_id: "SY-1", from: 0.5, to: 2, value: "B", modelled: true }] };
const points = { id: "c4", name: "readings", rows: [{ hole_id: "SY-1", depth: 1, value: 3 }, { hole_id: "SY-1", depth: 1, value: 4 }] };

test("Data QC checks custom interval layers, not binned logs, modelled layers or point readings", () => {
  assert.deepEqual(customIntervalLayers([lock, binned, modelled, points]).map((l) => l.id), ["c1"]);
  const r = runDataQC({ project: {}, collars, survey: [], layers: {}, boundaries: [], assays: [], customLayers: [lock, binned, modelled, points] });
  const mine = r.issues.filter((i) => i.category === "Custom layer: Lock angles");
  assert.ok(mine.length >= 3, JSON.stringify(mine));
  const text = mine.map((i) => i.message).join(" | ");
  assert.match(text, /overlap/i);
  assert.match(text, /8.*6|from.*to/i, "the reversed interval");
  assert.ok(!r.issues.some((i) => /gamma|units|readings/.test(i.category)));
});

test("the import leaves a reversed interval out and names it, and counts the overlaps", () => {
  const t = skippedRowsText([{ reason: "reversed", example: "SY-2 8-6" }], 10);
  assert.match(t, /Skipped 1 of 10 row\(s\): 1 To less than From \(a reversed interval\) \(SY-2 8-6\)/);
  const u = fs.readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(u, /row\.to < row\.from\) \{ cDropped\.push\(\{ reason: "reversed"/);
  assert.match(u, /skippedRowsText\(cDropped, allRows\.length\) \+ customOverlapText\(rows\)/);
});
