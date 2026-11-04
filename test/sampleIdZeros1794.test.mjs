// TASKS.csv #1794 (review #1646, Kodiak) — numeric sample ids match across leading zeros when surface samples are joined
import test from "node:test";
import assert from "node:assert/strict";
import { mergeSurfaceSamples, sampleIdKey } from "../src/lib/geochem.js";

test("'45601' (Excel dropped the zero) joins '045601'; text ids and other ids unchanged", () => {
  assert.equal(sampleIdKey("045601"), "45601");
  assert.equal(sampleIdKey(" 0 "), "0");
  assert.equal(sampleIdKey("KD-0451"), "KD-0451");
  const prev = [{ sample_id: "045601", medium: "soil", x: 1, y: 2, values: { Cu: 88 } }];
  const r = mergeSurfaceSamples(prev, [{ sample_id: "45601", medium: "soil", x: 1, y: 2, values: {}, attrs: { site: "L1+00N" } }]);
  assert.deepEqual([r.updated, r.added, r.samples.length], [1, 0, 1]);
  assert.equal(r.samples[0].values.Cu, 88);
});
