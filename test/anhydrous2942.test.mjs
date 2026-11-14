// TASKS.csv #2942 (split from #2734) — the classification diagrams on major oxides recalculated to 100 % volatile-free, as an option
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { anhydrousRows, sourceRow, majorOxides, sampleOxides } from "../src/lib/oxideTotals.js";
import { DIAGRAMS } from "../src/lib/geochemDiagrams.js";

const els = ["Si", "Ti", "Al", "Fe", "Mn", "Mg", "Ca", "Na", "K", "P"].map((s) => ({ symbol: s, unit: `% ${{ Si: "SiO2", Ti: "TiO2", Al: "Al2O3", Fe: "Fe2O3", Mn: "MnO", Mg: "MgO", Ca: "CaO", Na: "Na2O", K: "K2O", P: "P2O5" }[s]}` }));
const majors = majorOxides(els);
const basalt = { hole_id: "H1", from: 0, to: 1, values: { Si: 47.5, Ti: 1.5, Al: 15, Fe: 11, Mn: 0.2, Mg: 7, Ca: 10, Na: 2.4, K: 0.6, P: 0.3, LOI: 4.5, Cu: 120 } }; // sums 95.5 (+ 4.5 LOI)
const short = { hole_id: "H1", from: 1, to: 2, values: { Si: 50, Al: 15 } };

test("each sample's majors scaled to sum to 100 %; LOI and traces untouched; a sample missing a major is left out", () => {
  const out = anhydrousRows([basalt, short], majors);
  assert.equal(out.length, 1); assert.equal(out.leftOut, 1);
  const r = out[0];
  assert.ok(Math.abs(sampleOxides(r, majors).total - 100) < 1e-9);
  assert.ok(Math.abs(r.values.Si - (47.5 * 100) / 95.5) < 1e-9);
  assert.equal(r.values.LOI, 4.5); assert.equal(r.values.Cu, 120);
  assert.equal(basalt.values.Si, 47.5, "the stored row is not changed");
  assert.equal(sourceRow(r), basalt); assert.equal(sourceRow(basalt), basalt);
  assert.equal(Object.keys(r).includes("source"), false, "the link is not enumerable");
});

test("TAS moves; a ratio diagram does not", () => {
  const units = Object.fromEntries(els.map((e) => [e.symbol, e.unit]));
  const [r] = anhydrousRows([basalt], majors);
  const a = DIAGRAMS.tas.project(basalt, units), b = DIAGRAMS.tas.project(r, units);
  assert.ok(b.x > a.x && b.y > a.y, "SiO2 and the alkalis rise by 100 / 95.5");
  assert.ok(Math.abs(b.x / a.x - 100 / 95.5) < 1e-9);
});

test("wiring: an option once the project has the majors, the left-out count and the figure caption", () => {
  const s = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(s, /return anhydrousOn \? anhydrousRows\(rows, anhMajors\) : rows;/);
  assert.match(s, /anhMajors\.length >= MIN_MAJORS && !\(ALL_DIAGRAMS\[diagramId\]\?\.spider\)/);
  assert.match(s, /sampleLith\.get\(sourceRow\(sample\)\)/);
  assert.match(s, /anhydrousOn \? `\$\{tr\("Major oxides recalculated to 100 % volatile-free\."\)\} `/);
});
