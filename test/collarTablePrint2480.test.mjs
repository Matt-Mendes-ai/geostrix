// TASKS.csv #2480 — a continued collar table no longer prints its editing hint ('a table with that First row, or Continue on new pages')
// on paper: the printed copy says how many holes follow and from which row; the screen keeps the hint
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the closing row has a print form without the keyboard instruction", () => {
  const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");
  assert.match(m, /\{print \? tr\("… \{n\} more hole\(s\), from row \{r\}", \{ n: more, r: nextRow \}\) [^:]*: tr\("… and \{n\} more hole\(s\), from row \{r\}: a table with that First row, or Continue on new pages"/);
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(d["… {n} more hole(s), from row {r}"], lang);
  }
});
