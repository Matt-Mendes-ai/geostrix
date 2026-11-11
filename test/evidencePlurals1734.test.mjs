// TASKS.csv #1734 — 'one occurrence point', 'only one occurrence cell', 'the rest lack evidence': whole singular / plural phrases
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("the occurrence count lines have a singular and a plural phrase, and no 'an evidence'", () => {
  const p = fs.readFileSync("src/components/EvidenceOverlayPane.jsx", "utf8");
  assert.ok(p.includes('tr(result.fewPoints === 1 ? "Only {k} occurrence cell: weights of evidence need at least 3." : "Only {k} occurrence cells: weights of evidence need at least 3."'));
  assert.ok(p.includes('tr(trainingPoints.length === 1 ? "{n} occurrence point." : "{n} occurrence points."'));
  assert.ok(p.includes('"Fuzzy score on {v} of {n} cells (the rest lack evidence)."') && !p.includes("lack an evidence"));
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(`src/locales/${lang}.json`, "utf8"));
    for (const k of ["Only {k} occurrence cell: weights of evidence need at least 3.", "{n} occurrence point.", "Fuzzy score on {v} of {n} cells (the rest lack evidence)."]) assert.ok(d[k], `${lang}: ${k}`);
  }
});
