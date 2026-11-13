// TASKS.csv #3220 / #3222 (review #3195, Galore Creek) — QAQC: (#3220) Method pairs read partial (soluble) copper as a 'bias' against total
// copper and offered it in total copper's place; (#3222) a detection limit inferred from the lowest value was stated as a fact
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { methodPairs, isDifferentMeasurement, suggestDetectionLimit, censoringFloor } from "../src/lib/qaqc.js";

test("#3220 a median ratio under 0.5 or over 2 is a different measurement", () => {
  const assays = Array.from({ length: 40 }, (_, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { Cu: 1000 + i * 10 }, methodValues: { Cu: { Cu_AA17: (1000 + i * 10) * 0.13, Cu_ME: (1000 + i * 10) * 1.04 } } }));
  const g = Object.fromEntries(methodPairs(assays, "Cu").map((m) => [m.header, m]));
  assert.equal(isDifferentMeasurement(g.Cu_AA17), true);
  assert.equal(isDifferentMeasurement(g.Cu_ME), false, "a 4 % bias is a bias");
  assert.equal(isDifferentMeasurement({ medianRatio: 2.5 }), true);
  assert.equal(isDifferentMeasurement({ medianRatio: null }), false);
  const s = readFileSync(new URL("../src/components/MethodPairsTab.jsx", import.meta.url), "utf8");
  assert.match(s, /\{setAssays && assays && !isDifferentMeasurement\(g\)/);
  assert.match(s, /m\.medianRpd == null \|\| isDifferentMeasurement\(m\)/);
});

test("#3222 the next value above the floor; a gap past twice the floor makes it the limit", () => {
  // 80 % of the results on 0.001, the next value 0.005 (the review's Pt)
  const gap = [...Array.from({ length: 80 }, () => ({ values: { Pt: 0.001 } })), ...Array.from({ length: 20 }, (_, i) => ({ values: { Pt: 0.005 + i * 0.001 } }))];
  assert.equal(censoringFloor(gap.map((a) => a.values.Pt)).next, 0.005);
  const s1 = suggestDetectionLimit(gap, "Pt");
  assert.equal(s1.basis, "floor"); assert.equal(s1.limit, 0.005); assert.equal(s1.gap, true);
  // a half-limit substitute: 0.001 then 0.002 and up -> twice the floor
  const sub = [...Array.from({ length: 80 }, () => ({ values: { Pt: 0.001 } })), ...Array.from({ length: 20 }, (_, i) => ({ values: { Pt: 0.002 + i * 0.001 } }))];
  const s2 = suggestDetectionLimit(sub, "Pt");
  assert.equal(s2.limit, 0.002); assert.equal(s2.gap, false); assert.equal(s2.next, 0.002);
  const p = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
  assert.match(p, /the file states no limit\./);
  assert.doesNotMatch(p, /twice the \{floor\} floor that/);
});
