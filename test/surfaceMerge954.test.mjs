// TASKS.csv #954 — surface imports merge by (sample_id, medium) instead of appending repeat pulls of the same sites.
import test from "node:test";
import assert from "node:assert/strict";
import { mergeSurfaceSamples } from "../src/lib/geochem.js";

const S = (id, values, extra = {}) => ({ sample_id: id, x: 1, y: 2, z: 100, medium: "stream sediment", values, ...extra });

test("#954: an overlapping second pull updates the shared sites and adds only the new ones", () => {
  const prev = [S("A", { Cu: 30 }), S("B", { Cu: 40 })];
  const { samples, updated, added } = mergeSurfaceSamples(prev, [S("B", { Cu: 41 }), S("C", { Cu: 50 })]);
  assert.deepEqual([updated, added, samples.length], [1, 1, 3]);
  assert.equal(samples[1].values.Cu, 41);
});

test("#954: a second package of the same survey adds its elements to the existing samples; flags follow the newest report", () => {
  const prev = [S("A", { Cu: 30, Au: 2.5 }, { bdl: ["Au"], nd: ["Ag"], attrs: { source: "ICP-MS pkg", year: "1987" } })];
  const { samples } = mergeSurfaceSamples(prev, [S("A", { Au: 7, As: 12 }, { z: null, attrs: { source: "INAA pkg" } })]);
  const a = samples[0];
  assert.deepEqual(a.values, { Cu: 30, Au: 7, As: 12 });
  assert.equal(a.bdl, undefined); // Au re-reported as a detected value
  assert.deepEqual(a.nd, ["Ag"]); // not re-reported: kept
  assert.equal(a.z, 100); // a missing elevation does not erase the old one
  assert.deepEqual(a.attrs, { source: "INAA pkg", year: "1987" });
});

test("#954: no id, another medium, or a file's own repeats are never merged", () => {
  const prev = [S("", { Cu: 1 }), S("A", { Cu: 2 })];
  const r = mergeSurfaceSamples(prev, [S("", { Cu: 3 }), S("A", { Cu: 4 }, { medium: "soil" }), S("N", { Cu: 5 }), S("N", { Cu: 6 })]);
  assert.deepEqual([r.updated, r.added, r.samples.length], [0, 4, 6]);
  assert.notStrictEqual(r.samples, prev); // the store gets a new array
  assert.equal(prev.length, 2);
});
