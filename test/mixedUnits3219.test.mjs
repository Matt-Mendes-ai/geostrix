// TASKS.csv #3219 (review #3195, Galore Creek) — a ratio of two elements stored in different units was taken on the raw numbers: soluble /
// total Cu 10,000 times too small in Calc. element ('range 0.00-0.00') and on the X-Y statistics line, and no 1:1 line was drawn
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mixedUnitReads, addCalculatedElement } from "../src/lib/calcElement.js";
import { ratioFactor, xyStats, xyDiagram, axisOf } from "../src/lib/geochemXY.js";

const els = [{ symbol: "CuAA17", unit: "%" }, { symbol: "Cu", unit: "ppm" }, { symbol: "Au", unit: "g/t" }, { symbol: "Ag", unit: "ppm" }, { symbol: "Si", unit: "% SiO2" }];

test("Calc. element: a typed ratio across units is offered in ppm, never converted on its own", () => {
  assert.deepEqual(mixedUnitReads("CuAA17/Cu", els), { CuAA17: "ppm", Cu: "ppm" });
  assert.equal(mixedUnitReads("Au/Ag", els), null, "g/t and ppm are one unit");
  assert.equal(mixedUnitReads("CuAA17 + Cu", els), null, "no division");
  assert.equal(mixedUnitReads("Si/Cu", els), null, "an oxide basis: as stored");
  const rows = [{ values: { CuAA17: 0.001, Cu: 80 } }];
  const raw = addCalculatedElement(rows, els, "R", "CuAA17/Cu");
  assert.ok(Math.abs(raw.assays[0].values.R - 0.0000125) < 1e-12, "as stored when not asked");
  assert.deepEqual(raw.mixedUnits, [{ sym: "CuAA17", unit: "%" }, { sym: "Cu", unit: "ppm" }]);
  const ppm = addCalculatedElement(rows, els, "R", "CuAA17/Cu", "index", { readUnits: mixedUnitReads("CuAA17/Cu", els) });
  assert.ok(Math.abs(ppm.assays[0].values.R - 0.125) < 1e-12, `read in ppm: 10 / 80, got ${ppm.assays[0].values.R}`);
  assert.equal(ppm.mixedUnits, null);
  // a formula with its own factor is untouched (the K/Rb preset's form)
  const k = addCalculatedElement([{ values: { K: 3, Rb: 600 } }], [{ symbol: "K", unit: "%" }, { symbol: "Rb", unit: "ppm" }], "KRb", "K*10000/Rb");
  assert.equal(k.assays[0].values.KRb, 50);
});

test("X-Y: Y / X and the 1:1 line in ppm / ppm when the two element axes differ", () => {
  const x = axisOf({ kind: "element", symbol: "Cu", unit: "ppm" }, {}), y = axisOf({ kind: "element", symbol: "CuAA17", unit: "%" }, {});
  assert.equal(ratioFactor(x, y), 10000);
  assert.equal(ratioFactor(x, axisOf({ kind: "element", symbol: "Ag", unit: "ppm" }, {})), 1);
  const s = [{ from: 0, to: 1, values: { Cu: 80, CuAA17: 0.001 } }, { from: 1, to: 2, values: { Cu: 100, CuAA17: 0.0012 } }, { from: 2, to: 3, values: { Cu: 200, CuAA17: 0.0026 } }];
  const st = xyStats(x, y, s, { Cu: "ppm", CuAA17: "%" });
  assert.ok(Math.abs(st.medianRatio - 0.125) < 1e-9, String(st.medianRatio)); // 0.12, 0.125, 0.13
  assert.equal(st.inPpm, true);
  // no 1:1 line where equal concentrations fall outside both axes (soluble Cu an eighth of total)
  assert.equal(xyDiagram(x, y, s, { Cu: "ppm", CuAA17: "%" }, { oneToOne: true }).tieLines, undefined);
  const s2 = [{ values: { Cu: 80, CuAA17: 0.006 } }, { values: { Cu: 100, CuAA17: 0.009 } }, { values: { Cu: 200, CuAA17: 0.015 } }];
  const d = xyDiagram(x, y, s2, { Cu: "ppm", CuAA17: "%" }, { oneToOne: true });
  const [t] = d.tieLines;
  assert.equal(t.label, "1:1 (equal ppm)");
  assert.ok(Math.abs(t.from[1] - t.from[0] / 10000) < 1e-12, "y (in %) = x (in ppm) / 10,000");
});

test("wiring: the dialog's tick, the notice and the statistics line", () => {
  const g = readFileSync(new URL("../src/modules/GeochemModule.jsx", import.meta.url), "utf8");
  assert.match(g, /calc\.readPpm \? mixedUnitReads\(calc\.expr, assayElements\) : null/);
  assert.match(g, /calc\.readPpm \? mixedUnitReads\(calc\.expr, surfaceElements\) : null/);
  assert.equal((g.match(/r\.mixedUnits \? tr\(/g) || []).length, 2);
  assert.match(g, /xyStat\.inPpm \?/);
  assert.match(g, /min: sigFig\(r\.min\), max: sigFig\(r\.max\)/);
});
