// TASKS.csv #2060 (review #2013, Woodjam) — the grade shell's proposed cutoff on an element switch is the P90 of the drill samples:
// QC inserts are left out unless the pane includes them (Cu proposed a CRM's 4470 ppm; the drill samples' P90 is 4120).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { excludeQAQC, setKnownHoleIds } from "../src/lib/qaqc.js";
const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("P90 over drill rows vs with a run of CRM pulps", () => {
  setKnownHoleIds(new Set(["DH"]));
  const drill = Array.from({ length: 90 }, (_, i) => ({ hole_id: "DH", from: i, to: i + 1, values: { Cu: 100 + i * 10 } }));
  const crm = Array.from({ length: 20 }, (_, i) => ({ hole_id: "DH", from: i, to: i, sample_type: "STD", values: { Cu: 6000 } }));
  const p90 = (rows) => { const v = rows.map((a) => a.values.Cu).sort((a, b) => a - b); return v[Math.floor(0.9 * (v.length - 1))]; };
  assert.equal(p90(excludeQAQC([...drill, ...crm])), p90(drill));
  assert.ok(p90([...drill, ...crm]) > p90(drill));
});

test("the element switch proposes from excludeQAQC unless QC is included", () => {
  assert.match(p, /\(numericIncludeQAQC \? \(assays \|\| \[\]\)\.filter\(\(a\) => a\.source !== "pXRF"\) : excludeQAQC\(assays \|\| \[\]\)\)/);
  assert.match(p, /import \{ excludeQAQC \} from "\.\.\/\.\.\/lib\/qaqc\.js";/);
});
