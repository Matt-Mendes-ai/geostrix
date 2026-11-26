// TASKS.csv #2033 — QAQC's Standards tab counts insertions like the other tabs (and names the CRM groups);
// TASKS.csv #2036 — Correlation marks a calculated element and leaves it out of the default selection
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const q = readFileSync(new URL("../src/components/QAQCPanel.jsx", import.meta.url), "utf8");
const c = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");

test("#2033 — 'Standards (109 in 4 CRMs)': the insertions, then the groups; the select names the groups", () => {
  // #4088 — the tab label with the count became the Data step's number (the insertions); the select still names the groups
  assert.match(q, /\{ label: tr\("Standards"\), value: counts\.standard \}/);
  assert.match(q, /tr\(groups\.length === 1 \? "Standard \(1 CRM\)" : "Standard \(\{groups\} CRMs\)"/);
});

test("#2036 — calculated elements: marked, out of the defaults, named in the CSV", () => {
  assert.match(c, /const calcSyms = new Set\(assayElements\.filter\(\(e\) => e\.calculated\)\.map\(\(e\) => e\.symbol\)\);/);
  assert.match(c, /correlationDefaults\(measuredOf\(syms\), 12,/);
  assert.match(c, /\{calcSyms\.has\(s\) && <span title=\{tr\("Calculated from other elements/);
  assert.match(c, /# Calculated, not measured: /);
});

test("the new keys are in every dictionary", () => {
  const keys = ["Standard ({groups} CRMs)", "Standard (1 CRM)", "calc."];
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of keys) assert.ok(d[k], `${lang}: ${k}`);
  }
});
