// TASKS.csv #3026 (review #2876, WA iron) — the drill plan's 'Series' key listed 125 rows (RHRCMET_0005_A ... each its own series), 1,672 px
// tall in an 800 px frame, and the grade colourings opened on Al (the first element of the alphabet)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeSeries, capPlanKey } from "../src/lib/drillPlan.js";

test("a letter after a separated number stays in the series", () => {
  assert.equal(holeSeries("RHRCMET_0005_A"), "RHRCMET");
  assert.equal(holeSeries("RHRCMET_0009"), "RHRCMET");
  assert.equal(holeSeries("RHRC0001"), "RHRC");
  assert.equal(holeSeries("RHDB-12-B"), "RHDB");
  // #1639's cases hold
  assert.equal(holeSeries("21CCDD042"), "21CCDD"); assert.equal(holeSeries("COP-23-0005"), "COP-23"); assert.equal(holeSeries("21AGBDD043B"), "21AGBDD");
  assert.equal(holeSeries("ABC"), "ABC");
});

test("the key keeps the rows the frame holds and says how many it left out", () => {
  const key = Array.from({ length: 125 }, (_, i) => ({ label: `S${i}`, colour: "#000" }));
  const out = capPlanKey(key, { frameH: 800, rowPx: 13, keyLines: 0, extra: 0, moreLabel: (n) => `+ ${n} more` });
  const fit = Math.floor((800 - 18) / 13); // 60 rows
  assert.equal(out.length, fit);
  assert.deepEqual(out[out.length - 1], { label: `+ ${125 - (fit - 1)} more`, note: true });
  assert.equal(out[0].label, "S0");
  // title lines and the shape rows take their room too
  assert.equal(capPlanKey(key, { frameH: 800, rowPx: 13, keyLines: 2, extra: 3 }).length, fit - 5);
  // a key that fits is unchanged
  const small = key.slice(0, 5);
  assert.equal(capPlanKey(small, { frameH: 800, rowPx: 13 }), small);
  // a tiny frame still shows one row
  assert.equal(capPlanKey(key, { frameH: 20, rowPx: 13 }).length, 2);
});

test("wiring: the key is capped, its note row has no dot; the grade element opens on the lead commodity", () => {
  const E = readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8");
  assert.match(E, /key: capPlanKey\(colouring0\.key, \{ frameH: g\.h, rowPx: fontPx \+ 4,/);
  assert.match(E, /\{k\.note \? null/);
  const C = readFileSync(new URL("../src/components/DrillPlanColourControls.jsx", import.meta.url), "utf8");
  assert.match(C, /elements\.includes\(key\) \? key : preferredElement\(elements, null, lead\) \|\| ""/);
  assert.match(C, /elementOptionLabel\(s, unitOf\[s\]\)/);
});
