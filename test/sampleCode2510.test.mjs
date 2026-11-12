// TASKS.csv #2510 — one rule for the logged code a sample falls in (largest overlap), shared by the diagram filter, Grade stats and
// Thresholds, with one name for the no-code class ('no code logged')
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codeIndex, codeAt, lithologyBySample, NO_CODE } from "../src/lib/sampleLithology.js";
import { drillDomainKeyFn } from "../src/lib/thresholds.js";

const litho = [
  { hole_id: "A", from: 0, to: 4.6, value: "P " }, // trailing space: trimmed
  { hole_id: "A", from: 4.6, to: 10, value: "G" },
  { hole_id: "A", from: 12, to: 15, value: "" }, // an empty value is no code
  { hole_id: "B", from: 5, to: 8, value: "A" },
];

test("the sample takes the code it overlaps most; a point sample the interval holding it, half-open", () => {
  const ix = codeIndex(litho);
  assert.equal(codeAt(ix, "A", 4, 5), "P", "0.6 m of P, 0.4 m of G");
  assert.equal(codeAt(ix, "A", 4.2, 5.2), "G", "0.4 m of P, 0.6 m of G");
  assert.equal(codeAt(ix, "A", 4.1, 5), "P", "the middle (4.55) is in P, and P covers 0.5 of 0.9 m");
  assert.equal(codeAt(ix, "A", 4.6, 4.6), "G", "a point on a contact goes to the interval below (from <= depth < to)");
  assert.equal(codeAt(ix, "A", 10, 11), null, "touching G only at its base is not in G");
  assert.equal(codeAt(ix, "A", 12, 13), null, "an empty value");
  assert.equal(codeAt(ix, "C", 0, 1), null, "a hole with no log");
  assert.equal(codeAt(ix, "B", 4, 6), "A");
});

test("the diagram filter, Thresholds and the index give the same code for every sample", () => {
  const samples = [];
  for (let i = 0; i < 300; i++) { const f = (i * 0.37) % 16; samples.push({ hole_id: i % 3 ? "A" : "B", from: f, to: f + 0.5 + (i % 4) * 0.4 }); }
  const byDiagram = lithologyBySample(samples, litho);
  const keyOf = drillDomainKeyFn("litho", { litho });
  const ix = codeIndex(litho);
  for (const s of samples) {
    const c = codeAt(ix, s.hole_id, s.from, s.to);
    assert.equal(byDiagram.get(s), c);
    assert.equal(keyOf(s), c ?? NO_CODE);
  }
  assert.equal(NO_CODE, "no code logged");
});

test("wired: Grade stats uses the shared helper; one no-code name in the Geochem tools", () => {
  const g = readFileSync(new URL("../src/components/GradeStatistics.jsx", import.meta.url), "utf8");
  assert.match(g, /const lith = domainIdx \? codeAt\(domainIdx, s\.hole_id, s\.from, s\.to\) : null;/);
  assert.match(g, /domainRows \? codeIndex\(domainRows\) : null/);
  assert.doesNotMatch(g, /lith == null \? "\(unclassified\)"/);
  const m = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(m, /tr\("not logged"\)/);
  const v = readFileSync(new URL("../src/components/VolcanicCodesModal.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(v, /tr\("not logged"\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["no code logged"], lang); // reached through a ternary in Grade stats, which i18n786 does not see
  }
});
