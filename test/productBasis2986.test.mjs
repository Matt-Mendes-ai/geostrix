// TASKS.csv #2986 part 2 (Matt's decision, 2026-11-12) — a 'product' price basis for the pit tools: a price per dmt of product at a typed
// reference grade, a typed specification grade (a block below it is waste), an optional premium / discount per 1 unit from the reference,
// the mass yield in place of the recovery, and penalty lines (another model on the same grid, a typed limit, $ per dmt per 1 unit over it).
// Any element; no default price, spec or limit (#264).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pitEconomics, productRevenue, cellMargin, marginPerTonne, runPitShell, runPitSeries } from "../src/lib/pitShell.js";

const base = { unit: "%", element: "Fe", priceBasis: "product", price: 100, refGrade: 62, adjPerUnit: 1.6129, recovery: 100, typedCutoff: 55, processingCost: 35, penalties: [{ limit: 4, perUnit: 1.5 }] };

test("#2986 part 2 the product revenue: yield x (price + premium x (grade - reference) - penalties), the spec decides the ore", () => {
  const e = pitEconomics(base);
  assert.equal(e.cutoff, 55); assert.equal(e.cutoffTyped, true);
  assert.ok(Math.abs(productRevenue(62, [4], e) - 100) < 1e-9, "at the reference, at the limit");
  assert.ok(Math.abs(productRevenue(60, [6], e) - (100 - 1.6129 * 2 - 1.5 * 2)) < 1e-9);
  assert.ok(Math.abs(productRevenue(65, [2], e) - (100 + 1.6129 * 3)) < 1e-9, "under the limit: no penalty");
  assert.equal(cellMargin({ value: 54.9, pen: [2] }, e, 3, 35), -3, "below the spec: waste, though it would pay");
  assert.ok(Math.abs(marginPerTonne(62, e, 3, 35) - (100 - 35 - 3)) < 1e-9);
  assert.ok(Math.abs(productRevenue(62, null, pitEconomics({ ...base, recovery: 80 })) - 80) < 1e-9, "the mass yield");
  assert.ok(Math.abs(productRevenue(62, null, pitEconomics({ ...base, revenueFactor: 0.8 })) - 80) < 1e-9, "the revenue factor");
  assert.equal(productRevenue(70, [NaN], e), 100 + 1.6129 * 8, "a block the penalty model does not reach: no penalty");
  assert.ok(Math.abs(e.breakEven - (62 + (35 - 100) / 1.6129)) < 1e-9);
  assert.equal(pitEconomics({ ...base, adjPerUnit: 0 }).breakEven, null, "no premium: the revenue does not follow the grade");
});

test("#2986 part 2 nothing is assumed: no spec, no reference or a yield over 100 gives no economics", () => {
  assert.equal(pitEconomics({ ...base, typedCutoff: null }), null);
  assert.equal(pitEconomics({ ...base, refGrade: null }), null);
  assert.equal(pitEconomics({ ...base, recovery: 120 }), null);
  assert.ok(pitEconomics({ ...base, unit: "ppm", element: "Nb", refGrade: 5000, typedCutoff: 3000 }), "any element, its own unit");
});

test("#2986 part 2 a pit and a series: the penalty model joined by centre, the spec kept at every factor", () => {
  const cells = [], si = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 15; k++) {
    const c = { x: i * 10 + 5, y: j * 10 + 5, z: 380 + (k + 0.5) * 4, dx: 10, dy: 10, dz: 4 }, ore = i > 2 && i < 9 && j > 2 && j < 9 && c.z > 404 && c.z < 424;
    cells.push({ ...c, value: ore ? (i < 6 ? 60 : 64) : 30 }); si.push({ ...c, value: ore ? (i < 6 ? 8 : 3) : 40 });
  }
  const inp = { ...base, cells, miningCost: 3, density: 2.9, slopeDeg: 45, penaltyCells: [{ cells: si }] };
  const r = runPitShell(inp, { groundAt: () => 440 }), noPen = runPitShell({ ...inp, penaltyCells: [], penalties: [] }, { groundAt: () => 440 });
  assert.equal(r.meanGrade, 62); assert.deepEqual(r.penaltyMatched, [1]); assert.equal(r.productT, r.oreT, "a yield of 100 %");
  // the penalty: 4 % over on the 60 % half of the ore, 1.5 $/dmt per 1 %: 6 $/t on half the ore tonnes
  assert.ok(Math.abs((noPen.money - r.money) - 6 * r.oreT / 2) < 1, `${noPen.money - r.money}`);
  const s = runPitSeries(inp, [0.8, 1], { groundAt: () => 440 });
  assert.ok(s.runs.every((x) => x.cutoff === 55 && x.oreT > 0), "the spec at every factor");
});

test("#2986 part 2 the pane: the basis, the product fields, Mass yield, penalty lines, saved and restored; Nested pits passes them", () => {
  const p = fs.readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
  for (const k of ['aria-label={tr("Price basis")}', 'tr("Product price ($/dmt)")', 'tr("Mass yield (%)")', 'tr("Specification grade ({unit})"', 'tr("+ add a penalty line")', 'priceBasis: "metal", refGrade: "", adjPerUnit: "", penalties: []']) assert.ok(p.includes(k), k);
  assert.ok(p.includes("runPitShellAsync(mIn, runInputs, terrain, (phases) => setBusy(phases), collars, byIn, alsoIn, penModels)"));
  assert.ok(p.includes('k !== "sectorSlopes" && k !== "penalties"'), "the penalty lines restored as rows, not String(array)");
  assert.ok(p.includes("{model && !isProduct && <label style={row}>{tr(\"By-product (optional)\")}"), "no by-product with the product basis");
  const n = fs.readFileSync(new URL("../src/components/NestedPitsPane.jsx", import.meta.url), "utf8");
  assert.ok(n.includes('penaltyModels: (inputs.priceBasis === "product" ? inputs.penalties || [] : [])'));
  for (const w of ["pitShell.worker.js", "pitSeries.worker.js"]) assert.ok(fs.readFileSync(new URL(`../src/lib/${w}`, import.meta.url), "utf8").includes("penaltyCells"), w);
});
