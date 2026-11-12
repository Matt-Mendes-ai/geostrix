// TASKS.csv #2986 (review #2876, WA iron) — iron ore in the pit tools: priced only in $/lb or $/t of contained metal, no typed cut-off, so a
// real price made every block over a 21.7 % Fe break-even 'ore' (the cover and the unenriched iron formation), and a 55 % cut-off forced
// through the processing cost left Nested pits empty below factor 1. Now: $/dmtu, a typed cut-off that replaces the break-even everywhere.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pitEconomics, pitMetalOf, priceUnitsFor, marginPerTonne, cellMargin, metalAmountText, runPitShell, runPitSeries } from "../src/lib/pitShell.js";

const base = { unit: "%", element: "Fe", recovery: 100, processingCost: 35 };

test("#2986 Fe is offered per dmtu and per tonne, never per pound; 1.6129 $/dmtu is 161.29 $/t Fe", () => {
  assert.deepEqual(priceUnitsFor(pitMetalOf("%", "Fe"), "Fe").map(([k]) => k), ["dmtu", "t"]);
  assert.deepEqual(priceUnitsFor(pitMetalOf("%", "Mn"), "Mn").map(([k]) => k), ["dmtu", "t"]);
  assert.deepEqual(priceUnitsFor(pitMetalOf("%", "Cu"), "Cu").map(([k]) => k), ["lb", "t"], "a base metal unchanged");
  const a = pitEconomics({ ...base, price: 161.29, priceUnit: "t" }), b = pitEconomics({ ...base, price: 1.6129, priceUnit: "dmtu" });
  assert.ok(Math.abs(a.cutoff - 21.7) < 0.01 && Math.abs(b.cutoff - a.cutoff) < 1e-9, "the review's 21.7 % break-even, either unit");
  assert.equal(metalAmountText(1.86e6, "t", "Fe", (x) => String(x)), "1860000 t Fe", "contained iron in tonnes only");
});

test("#2986 a typed cut-off replaces the break-even: below it waste, at or above it ore, at every revenue factor", () => {
  const t = pitEconomics({ ...base, price: 161.29, priceUnit: "t", typedCutoff: 55 });
  assert.equal(t.cutoff, 55); assert.equal(t.cutoffTyped, true); assert.ok(Math.abs(t.breakEven - 21.7) < 0.01);
  assert.equal(marginPerTonne(54.9, t, 3, 35), -3, "below the typed cut-off: waste, though it pays");
  assert.ok(marginPerTonne(55, t, 3, 35) > 0);
  assert.equal(cellMargin({ value: 40 }, t, 3, 35), -3);
  assert.equal(pitEconomics({ ...base, price: 161.29, priceUnit: "t", typedCutoff: 55, revenueFactor: 0.8 }).cutoff, 55);
  assert.equal(pitEconomics({ ...base, price: 161.29, priceUnit: "t", typedCutoff: null }).cutoffTyped, undefined, "blank: the break-even as before");
});

test("#2986 a pit with a typed cut-off leaves the 30 % cover out of the ore, and a series keeps it below factor 1", () => {
  const cells = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 20; k++) {
    const d = 40 - (k + 0.5) * 2;
    cells.push({ x: i * 10 + 5, y: j * 10 + 5, z: 400 + (k + 0.5) * 2, dx: 10, dy: 10, dz: 2, value: d >= 20 && d < 30 && i > 2 && i < 9 && j > 2 && j < 9 ? 60 : 30 });
  }
  const inp = { ...base, cells, price: 161.29, priceUnit: "t", miningCost: 3, density: 2.9, slopeDeg: 40 };
  const be = runPitShell(inp, { groundAt: () => 440 }), ty = runPitShell({ ...inp, typedCutoff: 55 }, { groundAt: () => 440 });
  assert.ok(be.meanGrade < 40, `break-even: the cover is ore (${be.meanGrade} %)`);
  assert.ok(Math.abs(ty.meanGrade - 60) < 1e-6 && ty.cutoffTyped && Math.abs(ty.breakEven - 21.7) < 0.01, "typed: the 60 % bed only");
  const s = runPitSeries({ ...inp, typedCutoff: 55 }, [0.8, 1], { groundAt: () => 440 });
  assert.ok(s.runs.every((r) => r.cutoff === 55 && r.oreT > 0), "factor 0.8 still has a pit at 55 %");
});

test("#2986 the pane: the optional field, its check, the line that says which cut-off is in force, the Fe note, the saved basis", () => {
  const p = fs.readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes('field("typedCutoff", tr("Cut-off ({unit}, optional)"'));
  assert.ok(p.includes('typedCutoff: "" /* #2986 */'), "restored from a pit's inputs like the other fields");
  assert.ok(p.includes("by: byInputs, typedCutoff: typedCut /* #2986 */"));
  assert.ok(p.includes("...(typedCut ? { typedCutoff: typedCut } : {}) /* #2986 */"));
  assert.ok(p.includes("Cut-off grade {c} {unit}, typed: a block below it is waste whatever it would pay."));
  assert.ok(p.includes("UNIT_PRICED.has(String(element || \"\")) && !eco?.cutoffTyped"));
  assert.ok(p.includes('cutoffBasis: "typed by the user'));
});
