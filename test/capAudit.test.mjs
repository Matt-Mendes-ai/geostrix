// TASKS.csv #533 — capping audit: samples capped, metal removed, length-weighted percentile.
import test from "node:test";
import assert from "node:assert/strict";
import { capAudit, lengthWeightedPercentile, capAuditText, compositeDownhole } from "../src/lib/geochem.js";

// ten 1 m samples (one 2 m) in one hole; Au in g/t (ppm)
const vals = [0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2.0, 3.5, 9.0, 40.0];
const assays = vals.map((v, i) => ({ hole_id: "H1", from: i, to: i + (i === 9 ? 2 : 1), values: { Au: v } }));
assays.push({ ...assays[3] }); // an exact duplicate row: counted once
const units = { Au: "ppm" };

test("#533 capAudit on a known set: samples capped and share of metal removed", () => {
  const a = capAudit(assays, "Au", "ppm", units, 5);
  assert.equal(a.nSamples, 10);
  assert.equal(a.nCapped, 2); // 9 and 40
  const before = vals.slice(0, 9).reduce((t, v) => t + v, 0) + 40 * 2; // the last sample is 2 m
  const after = vals.slice(0, 8).reduce((t, v) => t + v, 0) + 5 + 5 * 2;
  assert.ok(Math.abs(a.metalBefore - before) < 1e-9);
  assert.ok(Math.abs(a.metalAfter - after) < 1e-9);
  assert.ok(Math.abs(a.pctMetalRemoved - (100 * (before - after)) / before) < 1e-9);
  assert.equal(a.lenCapped, 3);
  assert.match(capAuditText(a, "g/t"), /^cap 5 g\/t: 2 of 10 samples capped \(20\.0%\), \d+\.\d% of the metal/);
  assert.equal(capAudit(assays, "Au", "ppm", units, null).nCapped, 0);
  assert.equal(capAuditText(capAudit(assays, "Au", "ppm", units, null)), "");
});

test("#533 the audit matches what compositing caps (same raw samples)", () => {
  const a = capAudit(assays, "Au", "ppm", units, 5);
  const comps = compositeDownhole(assays, "Au", "ppm", units, { length: 11, minCoverage: 0, capValue: 5 });
  const compMetal = comps.reduce((t, c) => t + c.avgGrade * c.length * c.coverage, 0);
  assert.ok(Math.abs(compMetal - a.metalAfter) < 1e-6, `${compMetal} vs ${a.metalAfter}`);
});

test("#533 length-weighted percentile: the 2 m sample counts twice", () => {
  // 11 m sampled; P90 = the grade below which 9.9 m lies: 9 m of the smallest nine + 0.9 m of the 40 -> 40
  assert.equal(lengthWeightedPercentile(assays, "Au", "ppm", units, 90), 40);
  assert.equal(lengthWeightedPercentile(assays, "Au", "ppm", units, 50), 1.2); // 5.5 m is first reached inside the 6th smallest (1.2)
  assert.equal(lengthWeightedPercentile([], "Au", "ppm", units, 99), null);
});
