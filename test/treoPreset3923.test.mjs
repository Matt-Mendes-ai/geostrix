// TASKS.csv #3923 (user feedback: total rare earths) — a TREO preset in the Calculated element panel: each rare earth the project holds times its oxide factor (from the
// IUPAC atomic weights), read in ppm, the factors shown in the formula, the missing ones named as left out. Synthetic assays.
import test from "node:test";
import assert from "node:assert/strict";
import { treoPreset, REE_OXIDES, addCalculatedElement, presetUnitsFor } from "../src/lib/calcElement.js";

const el = (symbol, unit = "ppm", extra = {}) => ({ symbol, unit, ...extra });
const factor = (s) => REE_OXIDES.find((r) => r.symbol === s).factor;

test("#3923 the oxide factors come from atomic weights (the usual values for a TREO)", () => {
  const f = Object.fromEntries(REE_OXIDES.map((r) => [r.oxide, r.factor]));
  assert.deepEqual(f, { La2O3: 1.1728, CeO2: 1.2284, Pr6O11: 1.2082, Nd2O3: 1.1664, Sm2O3: 1.1596, Eu2O3: 1.1579, Gd2O3: 1.1526, Tb4O7: 1.1762, Dy2O3: 1.1477, Ho2O3: 1.1455, Er2O3: 1.1435, Tm2O3: 1.1421, Yb2O3: 1.1387, Lu2O3: 1.1372, Y2O3: 1.2699 });
});

test("#3923 the preset is the rare earths the project holds, the factors in the formula, the missing ones named", () => {
  const els = ["La", "Ce", "Pr", "Nd", "Sm", "Y", "Cu", "Au"].map((s) => el(s));
  const p = treoPreset(els);
  assert.equal(p.expr, `La*${factor("La")}+Ce*${factor("Ce")}+Pr*${factor("Pr")}+Nd*${factor("Nd")}+Sm*${factor("Sm")}+Y*${factor("Y")}`);
  assert.deepEqual(p.needs, ["La", "Ce", "Pr", "Nd", "Sm", "Y"]);
  assert.equal(p.unit, "ppm");
  assert.deepEqual(p.units, { La: "ppm", Ce: "ppm", Pr: "ppm", Nd: "ppm", Sm: "ppm", Y: "ppm" });
  assert.match(p.unitNote, /Not in this project, so left out of the total: Eu, Gd, Tb, Dy, Ho, Er, Tm, Yb, Lu/);
  assert.ok(!/\.$/.test(p.unitNote), "the menu adds the full stop");
  assert.equal(presetUnitsFor(p, p.expr), p.units, "the preset's own formula keeps its unit conversion");
});

test("#3923 fewer than three rare earths: no preset; a REE stored as its oxide or as an index is not added", () => {
  assert.equal(treoPreset([el("La"), el("Ce")]), null);
  const p = treoPreset([el("La"), el("Ce"), el("Nd"), el("Y", "% Y2O3"), el("Dy", "index")]);
  assert.deepEqual(p.needs, ["La", "Ce", "Nd"]);
  assert.match(p.unitNote, /Stored as an oxide or in a unit this cannot convert, so not added here: Dy, Y/);
  assert.equal(treoPreset([el("La"), el("Ce"), el("Nd"), el("Eu", "ppm", { calculated: { expr: "La/Ce" } })]).needs.includes("Eu"), false, "a calculated element is not an assay");
});

test("#3923 the TREO it adds: Σ element x oxide factor, in ppm, per assay row; a rare earth stored in % is read in ppm", () => {
  const els = [el("La"), el("Ce"), el("Nd", "%")];
  const p = treoPreset(els);
  const assays = [{ hole_id: "DH-23-001", from: 0, to: 2, values: { La: 100, Ce: 200, Nd: 0.005 } }, { hole_id: "DH-23-001", from: 2, to: 4, values: { La: 10, Ce: 20 } }];
  const r = addCalculatedElement(assays, els, "TREO", p.expr, p.unit, { readUnits: presetUnitsFor(p, p.expr) });
  const expected = 100 * factor("La") + 200 * factor("Ce") + 50 * factor("Nd"); // 0.005 % = 50 ppm
  assert.ok(Math.abs(r.assays[0].values.TREO - expected) < 1e-9, String(r.assays[0].values.TREO));
  assert.equal(r.assays[1].values.TREO, undefined, "a row missing a rare earth gets no total: never a partial one");
  assert.deepEqual([r.computed, r.skipped], [1, 1]);
  assert.deepEqual(r.element.unit, "ppm");
  assert.equal(r.element.calculated.expr, p.expr);
});
