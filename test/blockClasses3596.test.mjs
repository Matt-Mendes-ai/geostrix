// TASKS.csv #3596 (Fireweed rehearsal, Macpass) — an element's estimate is drawn in the holes' classes of that element (same colours, same limits),
// one model of a grid is shown at a time (a density or calculated model added later no longer draws over the Zn blocks), and a calculated model
// is labelled 'Calculated', not 'CSV'.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classStops, visibleOnLattice, elementClasses } from "../src/lib/viewer/modelLegendOnAdd.js";
import { blockModelLattice } from "../src/lib/estimationMeta.js";
import { sameLattice } from "../src/lib/densityFromModel.js";
import { colorForVoxelValue } from "../src/lib/layers.js";

test("classStops: the holes' classes as a stepped legend; a block takes its class's colour", () => {
  const breaks = [{ max: 0.3, color: "#f5ecd7" }, { max: 1, color: "#e8c98a" }, { max: 3, color: "#d39b46" }, { max: 10, color: "#a5651f" }, { max: Infinity, color: "#5c3410" }];
  const L = classStops(breaks, 0.003);
  assert.equal(L.colorMode, "discrete");
  assert.deepEqual(L.stops.map((s) => s.value), [0.003, 0.3, 1, 3, 10]);
  const model = { ...L, min: 0.003, max: 22.7 };
  assert.deepEqual([0.1, 0.5, 2, 5, 22].map((v) => colorForVoxelValue(model, v)), ["#f5ecd7", "#e8c98a", "#d39b46", "#a5651f", "#5c3410"]);
  assert.equal(classStops([{ max: 1, color: "#000000" }], 0), null, "one class: no legend from it");
  assert.equal(classStops(null, 0), null);
});

test("visibleOnLattice: the visible models on the same blocks; another lattice or a hidden model is left alone", () => {
  const cells = (ox, dx = 10) => [0, 1, 2].map((i) => ({ x: ox + i * dx, y: 5, z: 5, dx, dy: 10, dz: 10, value: 1 }));
  const zn = { id: "zn", visible: true, cells: cells(5) }, ag = { id: "ag", visible: false, cells: cells(5) }, other = { id: "o", visible: true, cells: cells(7) }, coarse = { id: "c", visible: true, cells: cells(5, 20) };
  const ids = visibleOnLattice([zn, ag, other, coarse], cells(25), { latticeOf: blockModelLattice, sameLattice }).map((m) => m.id);
  assert.deepEqual(ids, ["zn"]);
});

test("wiring: the estimate's colours from the classes, the others on the grid hidden, the calculator likewise; 'Calculated'", () => {
  const e = readFileSync(new URL("../src/components/GradeEstimationModal.jsx", import.meta.url), "utf8");
  assert.match(e, /const ec = element \? elementClasses\(assayStyle, element, \{ rows: assays, unit: elementUnits\[element\]/); // #3596 reopened
  assert.match(e, /const classes = ec \? classStops\(ec\.breaks, gMin\) : null;/);
  assert.match(e, /for \(const m of visibleOnLattice\(voxelModels, result\.cells, \{ latticeOf: blockModelLattice, sameLattice \}\)\) updateVoxelModel\?\.\(m\.id, \{ visible: false \}\);/);
  assert.match(e, /\.\.\.rampOf\(result\.cells, sourceKey === "assay" \? p0 : null\)/);
  const c = readFileSync(new URL("../src/components/BlockCalculatorModal.jsx", import.meta.url), "utf8");
  assert.match(c, /for \(const m of visibleOnLattice\(voxelModels, rec\.cells, \{ latticeOf: blockModelLattice, sameLattice \}\)\) updateVoxelModel\?\.\(m\.id, \{ visible: false \}\);/);
  const v = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(v, /<GradeEstimationModal\r?\n\s+assayStyle=\{assayStyle\} \/\/ #3596/);
  const g = readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /model\.source === "calc" \? tr\("Calculated"\)/);
});

// #3596 reopened (round 3): Ag and Pb of the set stayed on the ramp, only Zn (shown on the holes) took its classes
test("elementClasses: the holes' own breaks first; an element never shown gets the classes seeded for it, from its assays", () => {
  const own = [{ max: 1, color: "#111111" }, { max: Infinity, color: "#222222" }];
  assert.deepEqual(elementClasses({ Zn: { breaks: own } }, "Zn", { rows: [] }), { breaks: own, seeded: false });
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rows = Array.from({ length: 400 }, (_, i) => ({ hole_id: `H${i % 20}`, from: i, to: i + 1, values: { Pb: Math.exp(r() * 6 - 3) } }));
  const pb = elementClasses({}, "Pb", { rows, unit: "%", elements: ["Zn", "Ag", "Pb"] });
  assert.equal(pb.seeded, true);
  assert.ok(pb.breaks.length >= 3 && pb.breaks.every((b) => typeof b.color === "string" && b.seeded), JSON.stringify(pb.breaks));
  const L = classStops(pb.breaks, 0.01);
  assert.equal(L.colorMode, "discrete");
  assert.equal(elementClasses({}, "Cu", { rows, unit: "%" }), null, "no assays of the element: the ramp");
});
