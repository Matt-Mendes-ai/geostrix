// TASKS.csv #2563 — Inversion's IGRF answers sit beside the button; an out-of-range date is refused with the date as typed; an IGRF source
// for another date is dropped; a note goes with a survey / method change; no 'density contrast (g/cc) contrast'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { igrfField, igrfYearRange, decimalYear } from "../src/lib/igrf.js";

test("#2563 the model's years, and a decimal year said to one decimal", () => {
  assert.deepEqual(igrfYearRange(), { first: 1900, last: 2030 });
  assert.throws(() => igrfField(116, -33.9, 0.27, decimalYear("2031-06-30")), /IGRF-14 covers 1900-2030; got 2031\.5\./);
});

test("#2563 the panel's wiring", () => {
  const p = readFileSync(new URL("../src/components/InversionPanel.jsx", import.meta.url), "utf8");
  const i = p.indexOf("const computeIgrf = async () => {"), body = p.slice(i, p.indexOf("\n  };", i));
  assert.ok(i > 0 && !/setMsg\(/.test(body), "computeIgrf answers through igrfMsg only");
  assert.match(body, /tr\("IGRF-14 covers \{first\} to \{last\}; \{date\} is outside it\.", \{ first: range\.first, last: range\.last, date: field\.date \}\)/);
  assert.match(p, /\{igrfMsg && <div role=\{igrfMsg\.ok \? "status" : "alert"\}/);
  assert.match(p, /String\(p\.source \|\| ""\)\.startsWith\("IGRF"\) && !String\(p\.source\)\.startsWith\(`IGRF-14 for \$\{date\} `\) \? \{ source: "" \} : \{\}/);
  assert.match(p, /if \(noteSeen\.current !== k\) \{ noteSeen\.current = k; setMsg\(null\); setIgrfMsg\(null\); \}/);
  assert.match(p, /String\(M\.property\)\.replace\(\/\^density contrast\/, "density"\)/);
});
