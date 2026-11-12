// TASKS.csv #3013 (WA iron review) — Grade-tonnage 'Density by' lists every code, the blocks' codes first (most blocks first), 30 shown
// until 'Show all', and names the codes whose blocks took the default
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codesByMetres } from "../src/lib/densityByCode.js";

test("35 codes: none dropped, by logged metres (the codes past the 30th alphabetically, TNAM and SONAM, are there)", () => {
  const rows = [];
  for (let i = 0; i < 33; i++) rows.push({ value: `A${String(i).padStart(2, "0")}`, from: 0, to: 1 });
  rows.push({ value: "TNAM", from: 0, to: 50 }, { value: "SONAM", from: 0, to: 20 });
  const codes = codesByMetres(rows).map((c) => c.code);
  assert.equal(codes.length, 35); assert.deepEqual(codes.slice(0, 2), ["TNAM", "SONAM"]);
});

test("the modal: blocks' codes first, Show all, the untyped codes named", () => {
  const g = readFileSync(new URL("../src/components/GradeTonnageModal.jsx", import.meta.url), "utf8");
  assert.ok(!g.includes(".sort().slice(0, 30)"), "the first 30 by name is gone");
  assert.match(g, /const layerCodesOrdered = useMemo\(\(\) => \[\.\.\.\[\.\.\.blockCodes\]\.sort\(\(a, b\) => b\[1\] - a\[1\]\)\.map\(\(\[c\]\) => c\), \.\.\.layerCodesAll\.filter\(\(c\) => !blockCodes\.has\(c\)\)\]/);
  assert.match(g, /const layerCodes = allCodes \? layerCodesOrdered : layerCodesOrdered\.slice\(0, 30\);/);
  assert.match(g, /tr\("No density typed for \{list\}: their blocks take the default \(\{rho\} t\/m³\)\."/);
});
