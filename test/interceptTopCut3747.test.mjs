// TASKS.csv #3747 (Scottie Gold review, nuggety gold) — Best intercepts: an optional top cut (none = uncut, said everywhere), the cut grade beside the uncut one,
// the share of an intercept's metal in its two richest samples, 'Length (m, downhole)'. Synthetic data, no deposit style assumed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeBestIntercepts } from "../src/lib/geochem.js";
import { interceptRows } from "../src/lib/drillReportExport.js";

// one hole: ten 1 m samples, two nuggets (76 and 123) among background 0.5 / 1: the DH23-236 shape
const g = [0.5, 76, 1, 0.5, 123, 1, 0.5, 1, 0.5, 1];
const assays = g.map((v, i) => ({ hole_id: "H1", from: i, to: i + 1, values: { Au: v } }));
const U = { Au: "ppm" };

test("uncut by default: no cut grade, the share of metal in the two richest samples (from four samples up)", () => {
  const [r] = computeBestIntercepts(assays, "Au", "ppm", U, { cutoff: 0.4, maxInternalDilution: 2, minLength: 0 });
  assert.equal(r.length, 10);
  assert.equal(r.cutGrade, undefined);
  const total = g.reduce((t, x) => t + x, 0);
  assert.ok(Math.abs(r.avgGrade - total / 10) < 1e-9);
  assert.ok(Math.abs(r.concentration.top2 - (76 + 123) / total) < 1e-9, JSON.stringify(r.concentration));
  assert.ok(Math.abs(r.concentration.top1 - 123 / total) < 1e-9);
  assert.equal(r.concentration.samples, 10);
  assert.ok(r.concentration.top2 > 0.8, "mostly two samples");
});

test("a top cut limits each sample inside the intercept; the uncut grade stays as it was", () => {
  const [u] = computeBestIntercepts(assays, "Au", "ppm", U, { cutoff: 0.4, maxInternalDilution: 2 });
  const [c] = computeBestIntercepts(assays, "Au", "ppm", U, { cutoff: 0.4, maxInternalDilution: 2, topCut: 30 });
  assert.equal(c.avgGrade, u.avgGrade, "the grade column is the uncut one");
  const capped = g.map((v) => Math.min(v, 30)).reduce((t, x) => t + x, 0) / 10;
  assert.ok(Math.abs(c.cutGrade - capped) < 1e-9, `${c.cutGrade} vs ${capped}`);
  assert.equal(c.cutN, 2);
  // the cut-off and the bridging still read the real values: the same intercepts
  assert.equal(computeBestIntercepts(assays, "Au", "ppm", U, { cutoff: 0.4, topCut: 30 }).length, 1);
  // a cut above every sample changes nothing
  const [z] = computeBestIntercepts(assays, "Au", "ppm", U, { cutoff: 0.4, maxInternalDilution: 2, topCut: 1000 });
  assert.equal(z.cutN, 0); assert.ok(Math.abs(z.cutGrade - z.avgGrade) < 1e-9);
});

test("three samples are not a finding: no share said; unsampled metres are not samples", () => {
  const few = [5, 6, 7].map((v, i) => ({ hole_id: "H", from: i, to: i + 1, values: { Au: v } }));
  assert.equal(computeBestIntercepts(few, "Au", "ppm", U, { cutoff: 1 })[0].concentration, undefined);
  const gap = [{ hole_id: "H", from: 0, to: 1, values: { Au: 9 } }, { hole_id: "H", from: 1, to: 2, values: { Au: 8 } }, { hole_id: "H", from: 3, to: 4, values: { Au: 7 } }, { hole_id: "H", from: 4, to: 5, values: { Au: 1 } }, { hole_id: "H", from: 5, to: 6, values: { Au: 6 } }];
  const r = computeBestIntercepts(gap, "Au", "ppm", U, { cutoff: 1, maxInternalDilution: 2 })[0];
  assert.equal(r.concentration.samples, 5, "the 1 m unsampled gap is not a sample");
});

test("the CSV says uncut or cut, the cut grade and the samples cut, and the share in the top two", () => {
  const rs = computeBestIntercepts(assays, "Au", "ppm", U, { cutoff: 0.4, topCut: 30 });
  const uncut = interceptRows(computeBestIntercepts(assays, "Au", "ppm", U, { cutoff: 0.4 }), { symbol: "Au", unit: "ppm", topCut: null, concentration: true })[0];
  assert.equal(uncut.grade_top_cut, "none (uncut)");
  assert.ok(Number.isFinite(Number(uncut.metal_in_top2_samples_pct)) && uncut.metal_in_top2_samples_pct > 80);
  const cut = interceptRows(rs, { symbol: "Au", unit: "ppm", topCut: 30, concentration: true })[0];
  assert.match(cut.grade_top_cut, /^30 ppm per sample/);
  assert.equal(cut.samples_cut, 2);
  assert.ok(Math.abs(cut.avg_Au_ppm_cut - rs[0].cutGrade) < 1e-4);
  // older callers: nothing added
  assert.ok(!("grade_top_cut" in interceptRows(rs, { symbol: "Au", unit: "ppm" })[0]));
});

test("wiring: the dialog has the Top cut box (blank = uncut), says uncut in the dialog, the Layout note and the CSV, and heads the length column downhole", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /useKeptState\(keptScope, "bi\.topCut", ""\)/);
  assert.match(b, /computeBestIntercepts\(A, S, unit, U, \{ cutoff, maxInternalDilution, minLength, densityAt, topCut: topCutStored \}\)/);
  assert.match(b, /tr\("Grades are uncut: no top cut has been applied\."\)/);
  assert.match(b, /cutNote, \/\/ #3747/);
  assert.match(b, /"Top cut: none, the grades are UNCUT"/);
  assert.match(b, /tr\("Length \(m, downhole\)"\) \/\* #3747 \*\//);
  assert.equal((b.match(/tr\("Length \(m\)"\)/g) || []).length, 0, "no plain 'Length (m)' heading left");
  assert.match(b, /topCut: topCutStored, concentration: true/);
});
