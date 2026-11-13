// TASKS.csv #2923 (review #2876, WA iron) — Best intercepts offered 'FeEq' with a $/lb price for Fe, Si, Al and P: the penalty elements of an
// iron ore priced as payable metals. A bulk commodity is offered no metal equivalent and the panel says why; the price rows name a kept oxide
// ('Si as SiO2') and '$/lb recovery' has its space
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BULK_COMMODITIES } from "../src/lib/preferredElement.js";

test("Fe, Mn and Al are bulk commodities; Cu and Au are not", () => {
  for (const s of ["Fe", "Mn", "Al"]) assert.ok(BULK_COMMODITIES.has(s), s);
  for (const s of ["Cu", "Au", "Zn"]) assert.ok(!BULK_COMMODITIES.has(s), s);
});

test("wiring: no equivalent offered for a bulk lead, the note instead; the rows' names and the spacing", () => {
  const b = readFileSync(new URL("../src/components/BestIntercepts.jsx", import.meta.url), "utf8");
  assert.match(b, /const bulkLead = BULK_COMMODITIES\.has\(symbol\);/);
  assert.match(b, /useMemo\(\(\) => \(meqOn && !bulkLead \? meqSymbols/); // the symbols less any LOI (#2924)
  assert.match(b, /\{symbols\.length > 1 && bulkLead && <div[^\n]*no metal equivalent is offered/);
  assert.match(b, /\{symbols\.length > 1 && !bulkLead && \(/);
  assert.match(b, /elementOptionLabel\(s, elementUnits\[s\]\)/);
  assert.match(b, /\(PRECIOUS_METALS\.has\(s\) \? "\$\/oz" : "\$\/lb"\) \+ " "/);
});
