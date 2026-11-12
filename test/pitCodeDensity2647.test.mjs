// TASKS.csv #2647 — a density per logged code (LIG 1.3, SAN 1.9 ...) for the pit tools: each block weighed at its code's density
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { runPitShell } from "../src/lib/pitShell.js";
import { benchedPit, shellFloors } from "../src/lib/pitDesign.js";
import { cellsWithCodeDensity, typedCodeDensities, modelWithCodeDensity, layerCodeLookup } from "../src/lib/densityByCode.js";

const econ = { unit: "g/t", price: 2000, priceUnit: "oz", recovery: 90, miningCost: 3, processingCost: 15, density: 2.7, slopeDeg: 45 };
const body = () => {
  const cells = [];
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) for (let k = 0; k < 12; k++) cells.push({ x: 500 + i * 10, y: 500 + j * 10, z: 995 - k * 10, dx: 10, dy: 10, dz: 10, value: k < 2 ? 0 : 1.5 });
  return cells;
};

test("the typed table: blanks and non-positive left out; null when nothing is typed", () => {
  assert.deepEqual(typedCodeDensities({ LIG: "1.3", SAN: 1.9, CLY: "", BAD: "-1", ZER: "0" }), { LIG: 1.3, SAN: 1.9 });
  assert.equal(typedCodeDensities({ LIG: "" }), null);
});

test("a block takes its code's density; the pit's tonnes follow it, ore and waste alike; untyped codes keep the pane's densities", () => {
  const codeOf = (c) => (c.z > 975 ? "LIG" : c.z > 900 ? "SAN" : "BSM");
  const j = cellsWithCodeDensity(body(), codeOf, { LIG: 1.3, SAN: 1.9 });
  const used = Object.fromEntries(j.used.map((u) => [String(u.code), [u.n, u.rho]]));
  assert.deepEqual(used, { SAN: [1152, 1.9], LIG: [288, 1.3], null: [288, null] }); // BSM has no density typed: the pane's
  const plain = runPitShell({ ...econ, cells: body() }, { groundAt: () => 1000 });
  const coded = runPitShell({ ...econ, cells: j.cells }, { groundAt: () => 1000 });
  assert.ok(plain.oreT > 0 && coded.oreT > 0);
  // the ore of the SAN levels at 1.9 instead of 2.7: fewer tonnes, the grade unchanged
  assert.ok(coded.oreT < plain.oreT, `${coded.oreT} vs ${plain.oreT}`);
  assert.ok(Math.abs(coded.meanGrade - 1.5) < 1e-9);
});

test("modelWithCodeDensity builds the lookup from the saved inputs' layer; nothing typed or no layer: the model as it is", () => {
  const collars = [{ hole_id: "H", x: 560, y: 560, z: 1000 }];
  const survey = [{ hole_id: "H", depth: 0, azimuth: 0, dip: 90 }, { hole_id: "H", depth: 120, azimuth: 0, dip: 90 }];
  const layers = { litho: [{ hole_id: "H", from: 0, to: 20, value: "LIG" }, { hole_id: "H", from: 20, to: 120, value: "SAN" }] };
  const model = { name: "m", cells: body() };
  assert.equal(modelWithCodeDensity(model, { densityLayer: "litho", densityByCode: {} }, layers, collars, survey).model, model);
  assert.equal(modelWithCodeDensity(model, {}, layers, collars, survey).model, model);
  const r = modelWithCodeDensity(model, { densityLayer: "litho", densityByCode: { LIG: 1.3, SAN: 1.9 } }, layers, collars, survey);
  const top = r.model.cells.find((c) => c.x === 560 && c.y === 560 && c.z === 995), deep = r.model.cells.find((c) => c.x === 560 && c.y === 560 && c.z === 935);
  assert.equal(top.density, 1.3); assert.equal(deep.density, 1.9);
  assert.ok(r.used.some((u) => u.code === "LIG") && r.used.some((u) => u.code === "SAN"));
  assert.ok(layerCodeLookup([], collars, survey) === null);
});

test("Pit design weighs its ore at the blocks' densities", () => {
  const pos = [];
  for (let y = -70; y <= 70; y += 10) for (let x = -70; x <= 70; x += 10) pos.push(500000 + x, 5000000 + y, Math.abs(x) <= 45 && Math.abs(y) <= 45 ? 940 : 1000);
  const shell = shellFloors(Float64Array.from(pos), () => 1000);
  const cells = [];
  for (let x = -65; x <= 65; x += 10) for (let y = -65; y <= 65; y += 10) for (let z = 945; z < 1000; z += 10) cells.push({ x: 500000 + x, y: 5000000 + y, z, dx: 10, dy: 10, dz: 10, value: z < 970 ? 2 : 0 });
  const opts = { groundAt: () => 1000, cutoff: 1, benchH: 10, berm: 5, batterDeg: 60, density: 2.7 };
  const a = benchedPit(shell, { ...opts, cells }), b = benchedPit(shell, { ...opts, cells: cells.map((c) => ({ ...c, density: 1.35 })) });
  assert.ok(Math.abs(b.totals.oreT - a.totals.oreT / 2) < 1e-6 * a.totals.oreT, `${b.totals.oreT} vs ${a.totals.oreT}`);
  assert.ok(Math.abs(b.totals.meanGrade - a.totals.meanGrade) < 1e-9);
  assert.ok(!("oreM" in b.benches[0]));
});

test("the panes: Pit shell's table and the saved inputs; Nested pits and Pit design weigh as the shell; the clients carry the density", () => {
  const p = fs.readFileSync("src/components/PitShellPane.jsx", "utf8");
  assert.match(p, /densityLayer: "", densityByCode: \{\} \/\* #2647 \*\//);
  assert.match(p, /\.\.\.\(f\.densityLayer && typedCodeDensities\(f\.densityByCode\) \? \{ densityLayer: f\.densityLayer, densityByCode: typedCodeDensities\(f\.densityByCode\) \} : \{\}\)/);
  assert.match(p, /coded = modelWithCodeDensity\(clip\(model\), inputs, layers, collars, survey, desurveyMethod\), mIn = coded\.model/);
  assert.ok(p.includes("const missing = limitBad /* #2665 */ || codeDensityBad /* #2647 */ ||")); // #2665 put its check first
  for (const f of ["NestedPitsPane", "PitDesignPane"]) {
    const s = fs.readFileSync(`src/components/${f}.jsx`, "utf8");
    assert.match(s, /const coded = modelWithCodeDensity\(/, f);
    assert.match(s, /densityUsedText\(res\.densityUsed\)/, f);
  }
  for (const f of ["pitShellClient", "pitSeriesClient", "pitDesignClient"]) assert.match(fs.readFileSync(`src/lib/${f}.js`, "utf8"), /if \(c\.density > 0\) columns\.density\[i\] = c\.density;/, f);
  for (const f of ["pitShell.worker", "pitSeries.worker", "pitDesign.worker"]) assert.match(fs.readFileSync(`src/lib/${f}.js`, "utf8"), /\.\.\.\(c\.density\?\.\[i\] > 0 \? \{ density: c\.density\[i\] \} : \{\}\)/, f);
});
