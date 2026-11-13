// TASKS.csv #2924 (review #2876, WA iron) — loss on ignition behaved as an element: an Isocon 'immobile element' with a mass change in ppm and a
// row in the metal equivalent. It is left out of both, and QAQC > Totals counts an LOI over 60 % (no rock's: an empty or failed sample)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isLoiHeader } from "../src/lib/geochem.js";
import { oxideTotals, majorOxides, LOI_HIGH } from "../src/lib/oxideTotals.js";

test("LOI-like symbols are recognised; elements are not", () => {
  for (const s of ["LOI", "LOItotal", "LOI1000"]) assert.ok(isLoiHeader(s), s);
  for (const s of ["Fe", "Si", "Li", "Lu"]) assert.ok(!isLoiHeader(s), s);
});

test("an LOI over 60 % is counted in the totals' LOI line", () => {
  const els = ["Si", "Ti", "Al", "Fe", "Mn", "Mg"].map((s) => ({ symbol: s, unit: "%" }));
  const row = (loi) => ({ values: { Si: 10, Ti: 0.1, Al: 2, Fe: 50, Mn: 0.1, Mg: 0.2, LOI: loi } });
  const r = oxideTotals([row(5), row(8), row(100), row(72)], majorOxides(els));
  assert.equal(LOI_HIGH, 60);
  assert.equal(r.loi.over60, 2);
  assert.equal(oxideTotals([row(5)], majorOxides(els)).loi.over60, 0);
});

test("wiring: Isocon's lists and note, the metal equivalent's rows, the Totals tab's line", () => {
  const i = readFileSync(new URL("../src/components/IsoconTool.jsx", import.meta.url), "utf8");
  assert.match(i, /assayElements\.filter\(\(e\) => !e\.calculated && !isLoiHeader\(e\.symbol\)\)/);
  assert.match(i, /Left out of the mass balance: \{list\} \(loss on ignition is a property of the sample, not an element\)\./);
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /const meqSymbols = useMemo\(\(\) => \[symbol, \.\.\.extraSymbols\]\.filter\(\(s\) => !isLoiHeader\(s\)\)/);
  const t = readFileSync(new URL("../src/components/OxideTotalsTab.jsx", import.meta.url), "utf8");
  assert.match(t, /res\.loi\?\.over60 \?/);
});
