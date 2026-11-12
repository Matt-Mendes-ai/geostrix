// TASKS.csv #1521 (review #1497, Lawyers) — Isocon groups built by a filter (log code, element range, holes, depth), and calculated
// elements kept out of the mass balance
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/components/IsoconTool.jsx", import.meta.url), "utf8");

test("add by filter: a log code at the midpoint, an element range, holes and a depth range, added to either group", () => {
  assert.match(src, /const codeOf = flt\.code && domainRows \? codeFn\(domainRows\) : null;/); // the code the interval overlaps most since #2766
  assert.match(src, /holesMatching\(\[\.\.\.new Set\(rows\.map\(\(r\) => r\.a\.hole_id\)\)\], flt\.holes\)/);
  assert.match(src, /const mid = \(Number\(a\.from\) \+ Number\(a\.to\)\) \/ 2;/);
  assert.match(src, /if \(flt\.sym\) \{ const v = valueIn\(a, flt\.sym, elementUnits\[flt\.sym\] \|\| "ppm", elementUnits\); if \(v == null \|\| !Number\.isFinite\(v\) \|\| v < lo \|\| v > hi\) return false; \}/);
  assert.match(src, /const addMatches = \(setSet\) => setSet\(\(prev\) => new Set\(\[\.\.\.prev, \.\.\.matchIds\]\)\);/);
  for (const t of ["Add intervals by filter", "{n} intervals match", "Add to precursor", "Add to altered", "Clear precursor", "Clear altered"]) assert.ok(src.includes(`tr("${t}")`) || src.includes(`tr("${t}",`), t);
  assert.ok(!src.includes("if (!active) return rows"), "no filter: nothing matches (a blank filter must not add every interval)");
});

test("a calculated element is left out of the immobile list and the mass-balance table, and named under it", () => {
  assert.match(src, /const calcSymbols = useMemo\(\(\) => assayElements\.filter\(\(e\) => e\.calculated\)\.map\(\(e\) => e\.symbol\)/);
  assert.match(src, /useState\(new Set\(concSymbols\.filter\(\(s\) => DEFAULT_IMMOBILE\.includes\(s\)\)\)\)/);
  assert.match(src, /const table = concSymbols/);
  assert.match(src, /\{concSymbols\.map\(\(s\) => \(/);
  assert.match(src, /Left out of the mass balance \(calculated indices and equivalents, not concentrations\): \{list\}/);
});
