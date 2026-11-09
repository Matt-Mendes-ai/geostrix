// TASKS.csv #2230 (review #2174, WA gold) — intensity letters (W / M / S / I) ranked, so the halo's floor can read 'at least M'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { intensityRank, intensityVocabFields } from "../src/lib/intensityVocab.js";

test("letters and words to an order", () => {
  assert.deepEqual(["W", "M", "S", "I"].map(intensityRank), [2, 3, 4, 5]);
  assert.deepEqual(["weak", "Moderate", "STRONG", "pervasive", "trace", "nil"].map(intensityRank), [2, 3, 4, 5, 1, 0]);
  assert.equal(intensityRank("ASRC"), null);
  assert.equal(intensityRank(""), null);
});

test("the WA alteration log's intensity field is offered, with its letters in order; a code field is not", () => {
  const rows = [];
  ["W", "M", "S", "I", "W", "M", "W", "S"].forEach((v, i) => rows.push({ hole_id: "A", from: i, to: i + 1, value: "ASRC", intensity: v }));
  const f = intensityVocabFields(rows, { min: 3 });
  assert.equal(f.length, 1);
  assert.equal(f[0].field, "intensity");
  assert.deepEqual(f[0].levels.map((l) => `${l.label}:${l.rank}`), ["W:2", "M:3", "S:4", "I:5"]);
  assert.deepEqual(intensityVocabFields([{ value: "ASRC", x: "M" }, { value: "ACCH", x: "W" }]), []); // too few
  assert.deepEqual(intensityVocabFields(rows.map((r) => ({ ...r, intensity: "W" }))), []); // one level only
});

test("the pane offers the field and a letter floor; the run compares ranks and records the floor", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /const altVocabFields = useMemo\(\(\) => intensityVocabFields\(altSourceRows, \{ min: 3 \}\), \[altSourceRows\]\);/);
  assert.match(p, /vocab: !!\(altSource\.field && altSource\.vocab\), minLabel: altSource\.minLabel \|\| null/);
  const r = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(r, /minField\.vocab \? \(intensityRank\(r\[minField\.field\]\) \?\? -1\) : Number\(r\[minField\.field\]\)\) >= minField\.min/);
  assert.match(r, /intensityFloor: \{ field: minField\.field, atLeast:/);
});
