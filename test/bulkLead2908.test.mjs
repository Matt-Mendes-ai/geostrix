// TASKS.csv #2908 (WA iron review) — iron was not a commodity the app knew: on a table of 36 % mean Fe the lead was Cu (mean 0.006 %), so
// X-Y, Grade stats, Thresholds, Compositing, QAQC and SQL opened on Cu, and Correlation ticked the sulphide suite
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leadCommodity, correlationDefaults, BULK_COMMODITIES, MINERALIZED_PPM, bestPartner } from "../src/lib/preferredElement.js";

const pct = (v) => v * 10000;
const valueOf = (s, sym) => (s.values[sym] == null ? null : s.u?.[sym] === "%" ? pct(s.values[sym]) : s.values[sym]);

test("an iron-ore table leads on Fe; a BIF-hosted gold project keeps Au; a porphyry keeps Cu", () => {
  // iron ore: Fe 30-62 %, a quarter at or above 50 %; Cu traces (0.006 % mean, a few at 0.1 %)
  const iron = Array.from({ length: 400 }, (_, i) => ({ u: { Fe: "%" }, values: { Fe: 30 + (i % 33), Cu: i % 100 === 0 ? 1200 : 60 } }));
  assert.equal(leadCommodity(iron, valueOf), "Fe");
  // gold in banded iron formation: Fe 25-35 % everywhere, 20 % of samples at or above 0.1 g/t Au
  const bif = Array.from({ length: 400 }, (_, i) => ({ u: { Fe: "%" }, values: { Fe: 25 + (i % 11), Au: i % 5 === 0 ? 0.8 : 0.01 } }));
  assert.equal(leadCommodity(bif, valueOf), "Au");
  // a copper porphyry with magnetite: Fe 3-8 %, Cu 0.3 %
  const por = Array.from({ length: 200 }, (_, i) => ({ u: { Fe: "%" }, values: { Fe: 3 + (i % 6), Cu: 3000 } }));
  assert.equal(leadCommodity(por, valueOf), "Cu");
  assert.deepEqual([...BULK_COMMODITIES], ["Fe", "Mn", "Al"]);
  assert.equal(MINERALIZED_PPM.Fe, 500000);
});

test("Correlation ticks the majors after a bulk lead (ties broken by median grade); the sulphide suite stays for a metal lead", () => {
  const syms = ["Al", "As", "Ba", "Ca", "Cl", "Co", "Cu", "Fe", "K", "Mn", "Na", "P", "S", "Si", "Ti", "Zn", "LOI"];
  const counts = Object.fromEntries(syms.map((s) => [s, 1000]));
  const medians = { Fe: 560000, Si: 60000, Al: 15000, LOI: 60000, Mn: 900, P: 700, Ti: 500, S: 300, Ca: 400, K: 200, Na: 150, Cl: 100, Ba: 50, Cu: 60, Zn: 40, Co: 20, As: 10 };
  const iron = correlationDefaults(syms, 8, { lead: "Fe", counts, medians });
  assert.deepEqual(iron, ["Fe", "Si", "LOI", "Al", "Mn", "P", "Ti", "Ca"]);
  const cu = correlationDefaults(syms, 6, { lead: "Cu", counts });
  assert.deepEqual(cu.slice(0, 3), ["Cu", "S", "Fe"], "without medians: the suite breaks the ties, as before");
});

test("X-Y's partner for Fe is the element that follows it most closely (SiO2 on iron ore)", () => {
  const rows = Array.from({ length: 200 }, (_, i) => { const fe = 30 + (i % 33); return { values: { Fe: fe, Si: Math.max(0.5, (70 - fe) / 2.14), Cu: 50 + (i % 7) * 10, P: 0.05 + (i % 9) * 0.01 } }; });
  assert.equal(bestPartner(rows, "Fe", ["Si", "Cu", "P"]), "Si");
});

test("wiring: Correlation passes medians for a bulk lead only, read from at most 5,000 rows, in the rows' own units", () => {
  const c = readFileSync(new URL("../src/components/CorrelationMatrix.jsx", import.meta.url), "utf8");
  assert.match(c, /\.\.\.\(BULK_COMMODITIES\.has\(lead\) \? \{ medians: mediansOf\(rows, syms, units\) \} : \{\}\)/);
  assert.match(c, /const step = Math\.max\(1, Math\.floor\(\(rows \|\| \[\]\)\.length \/ 5000\)\)/);
  assert.match(c, /Object\.fromEntries\(nextEls\.map\(\(e\) => \[e\.symbol, e\.unit\]\)\)/);
});
