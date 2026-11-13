// TASKS.csv #2995 (review #2876, WA iron) — the pit reports gave iron alone: no SiO2, Al2O3 or P beside the Fe of the ore, though those block
// models were on the same grid (the review's ore carried 5.96 % SiO2, 4.13 % Al2O3, 0.053 % P: over a 62 % product's limits). Pit shell now
// reports other models' grades over the ore; a unit naming its oxide is not followed by the element ('118 % SiO2 Si'); a break-even cut-off
// over 100 % is said.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell, joinAlso, unitWithElement, gradeWithElement } from "../src/lib/pitShell.js";

const grid = (f) => { const out = []; for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) for (let k = 0; k < 10; k++) { const c = { x: i * 10 + 5, y: j * 10 + 5, z: 400 + k * 4 + 2, dx: 10, dy: 10, dz: 4 }, ore = i > 2 && i < 8 && j > 2 && j < 8 && k < 6; const v = f(ore, i); if (v != null) out.push({ ...c, ...v }); } return out; };

test("#2995 other grades of the same blocks, over the ore, with the share of the ore that has one", () => {
  const cells = grid((ore) => ({ value: ore ? 60 : 30 }));
  const alsoCells = [
    { label: "SiO2", unit: "% SiO2", element: "Si", cells: grid((ore) => ({ value: ore ? 6 : 40 })) },
    { label: "Al2O3", unit: "% Al2O3", element: "Al", cells: grid((ore, i) => (i === 3 ? null : { value: ore ? 4 : 10 })) }, // one ore column has no Al
    { label: "far", unit: "%", cells: grid(() => ({ value: 1 })).map((c) => ({ ...c, x: c.x + 1000 })) },                   // another grid
  ];
  const r = runPitShell({ unit: "%", element: "Fe", price: 161.29, priceUnit: "t", recovery: 100, miningCost: 3, processingCost: 35, density: 2.9, slopeDeg: 45, typedCutoff: 55, cells, alsoCells }, { groundAt: () => 440 });
  assert.equal(r.meanGrade, 60);
  const [s, a, far] = r.alsoGrades;
  assert.equal(s.meanGrade, 6); assert.equal(s.oreShare, 1);
  assert.equal(a.meanGrade, 4); assert.ok(Math.abs(a.oreShare - 0.8) < 1e-9, "4 of the 5 ore columns have a value");
  assert.equal(far.matchedShare, 0); assert.equal(far.meanGrade, null);
  assert.equal(runPitShell({ unit: "%", element: "Fe", price: 161.29, priceUnit: "t", recovery: 100, miningCost: 3, processingCost: 35, density: 2.9, slopeDeg: 45, cells }, { groundAt: () => 440 }).alsoGrades, null, "none asked: none reported");
  assert.deepEqual(joinAlso([{ x: 1, y: 2, z: 3 }], [{ cells: [{ x: 1, y: 2, z: 3, value: 7 }] }]).cells[0].also, [7]);
});

test("#2995 the unit once: '% SiO2' is not followed by 'Si'; others unchanged", () => {
  assert.equal(unitWithElement("% SiO2", "Si"), "% SiO2");
  assert.equal(unitWithElement("%", "Fe"), "% Fe");
  assert.equal(unitWithElement("ppm", "Au"), "g/t Au");
  assert.equal(unitWithElement("% SO3", "S"), "% SO3");
  assert.equal(unitWithElement("%", "S"), "% S");
  assert.equal(gradeWithElement(118, "% SiO2", "Si"), "118 % SiO2");
  assert.equal(gradeWithElement(0.555, "%", "Li"), "0.555 % Li (1.19 % Li2O)", "#2594 unchanged");
});

test("#2995 the pane: the list, the run, the result line, the saved grades, the cut-off over 100 %", () => {
  const p = fs.readFileSync(new URL("../src/components/PitShellPane.jsx", import.meta.url), "utf8");
  assert.ok(p.includes("Report these grades too"));
  assert.ok(p.includes("runPitShellAsync(mIn, runInputs, terrain, (phases) => setBusy(phases), collars, byIn, alsoIn") /* penModels: #2986 part 2 */);
  assert.ok(p.includes("Other grades of the ore: {list}."));
  assert.ok(p.includes("const alsoLabel = (m) => (valueUnit(m) ? elementOfModel(m) || m.name : m.property || m.name);"), "a model without a stated unit reads by its property, not a bare element ('6 Si', found live)");
  assert.ok(p.includes("a.unit ? gradeWithElement(a.meanGrade, a.unit, a.element) : `${a.label} ${Number(a.meanGrade.toPrecision(3))}`"));
  assert.ok(p.includes("otherGrades: r.alsoGrades.map("));
  assert.ok(p.includes("A cut-off over 100 %: no block can pay at these inputs."));
  assert.ok(!p.includes('${element ? ` ${element}` : ""}'), "every unit through unitWithElement");
  const w = fs.readFileSync(new URL("../src/lib/pitShell.worker.js", import.meta.url), "utf8");
  assert.ok(w.includes("runPitShell({ ...inputs, cells, byCells, alsoCells")); // penaltyCells after it: #2986 part 2
});
