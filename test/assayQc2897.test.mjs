// TASKS.csv #2897 (review #2876, WA bedded iron) — Data QC said nothing about the 341 holes with no assays, and each of the 100 field
// duplicates (RCB... beside RCA..., same interval, different results) was reported twice: 'Overlapping' and 'likely imported twice'.
import test from "node:test";
import assert from "node:assert/strict";
import { runDataQC } from "../src/lib/dataQC.js";

const collars = ["H1", "H2", "H3", "BORE1"].map((id, i) => ({ hole_id: id, x: i * 50, y: 0, z: 440, azimuth: 0, dip: -90, length: 50 }));
const texts = (r) => (Array.isArray(r) ? r : r.issues).map((i) => i.message || i.text || JSON.stringify(i));

test("a field duplicate pair is one line, worded from the sample ids", () => {
  const assays = [
    { hole_id: "H1", from: 40, to: 42, sample_id: "RCA0470790", values: { Fe: 55 } },
    { hole_id: "H1", from: 42, to: 44, sample_id: "RCA0470791", values: { Fe: 57 } },
    { hole_id: "H1", from: 42, to: 44, sample_id: "RCB0470791", values: { Fe: 56.2 } },
    { hole_id: "H2", from: 0, to: 2, sample_id: "RCA1", values: { Fe: 40 } },
    { hole_id: "H3", from: 0, to: 2, sample_id: "RCA2", values: { Fe: 41 } },
  ];
  const t = texts(runDataQC({ collars, survey: [], layers: {}, assays }));
  assert.ok(t.some((x) => /^Two samples at 42–44m \(RCA0470791, RCB0470791\): a field or lab duplicate pair, not a double import/.test(x)), t.join(" | "));
  assert.ok(!t.some((x) => /Overlapping assay intervals/.test(x)), "not also an overlap");
  assert.ok(!t.some((x) => /likely imported twice/.test(x)));
});

test("the same interval with no ids (or the same id) is still 'likely imported twice'; a real overlap is still an overlap", () => {
  const assays = [
    { hole_id: "H1", from: 0, to: 2, values: { Fe: 55 } }, { hole_id: "H1", from: 0, to: 2, values: { Fe: 55 } },
    { hole_id: "H2", from: 0, to: 3, values: { Fe: 50 } }, { hole_id: "H2", from: 2, to: 4, values: { Fe: 51 } },
    { hole_id: "H3", from: 0, to: 2, values: { Fe: 41 } },
  ];
  const t = texts(runDataQC({ collars, survey: [], layers: {}, assays }));
  assert.equal(t.filter((x) => /Duplicate assay interval 0–2m — likely imported twice\./.test(x)).length, 1, t.join(" | "));
  assert.equal(t.filter((x) => /Overlapping assay intervals: 0–3m and 2–4m\./.test(x)).length, 1);
  assert.equal(t.filter((x) => /Overlapping assay intervals: 0–2m and 0–2m/.test(x)).length, 0);
});

test("the holes with no assays, when most holes have some", () => {
  const assays = ["H1", "H2", "H3"].map((h) => ({ hole_id: h, from: 0, to: 2, values: { Fe: 50 } }));
  const t = texts(runDataQC({ collars, survey: [], layers: {}, assays }));
  assert.ok(t.some((x) => /^1 of 4 holes with a collar have no assays \(checked because more than half the holes have assays\): BORE1\./.test(x)), t.join(" | "));
  const few = texts(runDataQC({ collars, survey: [], layers: {}, assays: assays.slice(0, 1) }));
  assert.ok(!few.some((x) => /have no assays/.test(x)), "one assayed hole of four: not checked");
});
