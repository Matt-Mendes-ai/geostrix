// TASKS.csv #2035 — the Geochem side panel counts QC samples and calculated elements apart
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");

test("the counts: regular intervals, QC rows, assayed and calculated elements", () => {
  assert.match(g, /(let qc = 0; for \(const a of assays\) if \(classifyQAQCRow\(a\) !== "regular"\) qc\+\+;|const qc = keptMemo\(\[assays\], "qcCount", \(\) => \{ let k = 0; for \(const a of assays\) if \(classifyQAQCRow\(a\) !== "regular"\) k\+\+; return k; \}\);) const calc = assayElements\.filter\(\(e\) => e\.calculated\)\.length; return \{ n: assays\.length - qc, qc, e: assayElements\.length - calc, calc \};/ /* keptMemo: #3120 */);
  assert.match(g, /headCounts\.qc \|\| headCounts\.calc \? headerCounts\(headCounts\) :/);
});

test("each part is its own sentence in every dictionary", () => {
  for (const k of ["{n} intervals + {q} QC samples", "{n} intervals", "{e} elements + {c} calculated", "1 element", "{e} elements"]) {
    assert.ok(g.includes(`tr(${JSON.stringify(k)}`), k);
    for (const lang of ["es", "pt", "fr", "ar"]) {
      const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
      assert.ok(d[k], `${lang}: ${k}`);
    }
  }
});
