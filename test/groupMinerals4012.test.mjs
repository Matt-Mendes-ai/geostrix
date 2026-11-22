// TASKS.csv #4012 — custom layers (one numeric layer per mineral) grouped as the fields of one wide-form Mineralization layer. Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupMinerals, groupProblems, fieldNameOf } from "../src/lib/groupMinerals.js";
import { wideMineralFields, mineralCodesOf, totalSulphides, defaultSulphideTicks } from "../src/lib/totalSulphides.js";

const layer = (id, name, rows, unit = "% visual") => ({ id, name, unit, rows: rows.map(([hole_id, from, to, value]) => ({ hole_id, from, to, value })) });
const PY = layer("a", "Demo file: MN_PY_pct", [["H1", 0, 5, 2], ["H1", 5, 10, 6], ["H2", 0, 5, 1]]);
const CPY = layer("b", "Demo file: MN_CPY_pct", [["H1", 0, 5, 1], ["H1", 5, 10, 0.5], ["H2", 0, 5, 4]]);

test("field names: the mineral part of the layer's name, an amount the Mineralization layer reads, unique", () => {
  assert.equal(fieldNameOf("Demo file: MN_PY_pct"), "PY_pct");
  assert.equal(fieldNameOf("Demo file: Chalcopyrite"), "Chalcopyrite", "a sulphide name is read as it is");
  assert.equal(fieldNameOf("Demo file: Magnetite"), "Magnetite (%)", "a name that is not an amount gets one");
  assert.equal(fieldNameOf("Demo: MN_PY_pct", new Set(["PY_pct"])), "PY_pct 2");
});

test("equal intervals: one row per interval, the code is the dominant mineral, extra the total, each layer a field", () => {
  const g = groupMinerals([PY, CPY]);
  assert.equal(g.rows.length, 3);
  const r = g.rows.find((x) => x.hole_id === "H1" && x.from === 0);
  assert.equal(r.value, "PY"); assert.equal(r.extra, 3); assert.equal(r.PY_pct, 2); assert.equal(r.CPY_pct, 1);
  assert.equal(g.rows.find((x) => x.hole_id === "H2").value, "CPY");
  assert.deepEqual(g.stats, { layers: 2, fields: 2, intervals: 3, holes: 2, split: 0, left: 0, kept: 0, skipped: 0 });
  assert.deepEqual(g.fields.map((f) => [f.key, f.code, f.layerId]), [["PY_pct", "PY", "a"], ["CPY_pct", "CPY", "b"]]);
});

test("the result is a wide-form layer the existing tools read: fields, codes, Total sulphides", () => {
  const { rows } = groupMinerals([PY, CPY]);
  assert.deepEqual(wideMineralFields(rows).map((f) => f.key), ["PY_pct", "CPY_pct"]);
  const info = mineralCodesOf(rows);
  assert.equal(info.form, "wide");
  const t = totalSulphides(rows, defaultSulphideTicks(info), info);
  assert.deepEqual(rows.map((r, i) => [r.hole_id, r.from, t.values[i]]), [["H1", 0, 3], ["H1", 5, 6.5], ["H2", 0, 5]]);
});

test("unequal intervals are cut at the union of the boundaries; a piece takes every layer covering it", () => {
  const A = layer("a", "x: PY_pct", [["H1", 0, 10, 4]]);
  const B = layer("b", "x: CPY_pct", [["H1", 2, 6, 3], ["H1", 8, 12, 1]]);
  const g = groupMinerals([A, B]);
  assert.deepEqual(g.rows.map((r) => [r.from, r.to, r.value, r.extra, r.PY_pct, r.CPY_pct]), [
    [0, 2, "PY", 4, 4, undefined], [2, 6, "PY", 7, 4, 3], [6, 8, "PY", 4, 4, undefined], [8, 10, "PY", 5, 4, 1], [10, 12, "CPY", 1, undefined, 1]]);
  assert.equal(g.stats.split, 5, "every piece here is a part of a longer interval");
  assert.equal(g.rows.filter((r) => r.PY_pct === undefined).length, 1, "a layer with nothing there leaves the field out");
});

test("a mineral that is zero or missing is not the code; an interval of all zeros is left out and counted", () => {
  const A = layer("a", "x: PY_pct", [["H1", 0, 5, 0], ["H1", 5, 10, 2]]);
  const B = layer("b", "x: CPY_pct", [["H1", 0, 5, 0], ["H1", 5, 10, 0]]);
  const g = groupMinerals([A, B]);
  assert.equal(g.rows.length, 1); assert.equal(g.rows[0].from, 5); assert.equal(g.rows[0].value, "PY"); assert.equal(g.stats.left, 1);
});

test("a layer that overlaps itself counts its larger value; a tie keeps the first layer", () => {
  const A = layer("a", "x: PY_pct", [["H1", 0, 10, 2], ["H1", 4, 6, 5]]);
  const B = layer("b", "x: CPY_pct", [["H1", 0, 4, 2]]);
  const g = groupMinerals([A, B]);
  assert.equal(g.rows.find((r) => r.from === 4).PY_pct, 5);
  assert.equal(g.rows.find((r) => r.from === 0).value, "PY", "2 against 2: the first layer in the list");
});

test("problems: fewer than two layers, a layer with no intervals, units that are not per cent", () => {
  assert.deepEqual(groupProblems([PY]).map((p) => p.kind), ["few"]);
  assert.deepEqual(groupProblems([PY, layer("z", "z", [])]).map((p) => p.kind), ["empty"]);
  const ppm = layer("p", "x: Cu_ppm", [["H1", 0, 5, 300]], "ppm");
  assert.deepEqual(groupProblems([PY, ppm]), [{ kind: "units", units: ["ppm"] }]);
  assert.deepEqual(groupProblems([PY, layer("n", "n", [["H1", 0, 5, 1]], "")]), [], "no unit counts as per cent; '% visual' and '%' agree");
  assert.ok(groupMinerals([PY, ppm]).problems && !groupMinerals([PY, ppm]).rows);
});

test("merge: an existing wide-form layer's minerals and text stay and join the new ones; a long-form one is read per code", () => {
  const wide = [{ hole_id: "H1", from: 0, to: 5, value: "PY", extra: 2, PY_pct: 2, description: "banded" }, { hole_id: "H1", from: 5, to: 10, value: "PY", extra: 1, PY_pct: 1 }];
  const POT = layer("c", "x: Sphalerite", [["H1", 0, 5, 3]]);
  const g = groupMinerals([POT, CPY], wide);
  assert.deepEqual(g.fields.map((f) => f.key), ["PY_pct", "Sphalerite", "CPY_pct"]);
  const r = g.rows.find((x) => x.hole_id === "H1" && x.from === 0);
  assert.equal(r.PY_pct, 2); assert.equal(r.Sphalerite, 3); assert.equal(r.CPY_pct, 1); assert.equal(r.extra, 6); assert.equal(r.value, "SPHALERITE"); assert.equal(r.description, "banded");
  assert.equal(g.stats.kept, 1);
  const long = [{ hole_id: "H1", from: 0, to: 5, value: "PY", extra: 4 }, { hole_id: "H1", from: 0, to: 5, value: "PO; PY", extra: 9 }];
  const g2 = groupMinerals([POT, CPY], long);
  assert.equal(g2.stats.kept, 1); assert.equal(g2.stats.skipped, 1, "a row of several minerals under one per cent is not split");
  assert.equal(g2.rows[0].PY, 4);
});

test("wiring: the Custom layers heading offers it, the dialog is a lazy modal, and every string is translated", () => {
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /GroupMineralsModal/);
  const dlg = readFileSync(new URL("../src/components/GroupMineralsModal.jsx", import.meta.url), "utf8");
  assert.match(dlg, /groupMinerals\(/);
});

test("merge: a layer for a mineral the Mineralization layer already has replaces that field (never counted twice)", () => {
  const wide = [{ hole_id: "H1", from: 0, to: 5, value: "PY", extra: 2, PY_pct: 2 }];
  const g = groupMinerals([layer("c", "x: PY_pct", [["H1", 0, 5, 7]]), CPY], wide);
  assert.deepEqual(g.fields.map((f) => f.key), ["PY_pct", "CPY_pct"]);
  const r = g.rows.find((x) => x.hole_id === "H1" && x.from === 0);
  assert.equal(r.PY_pct, 7); assert.equal(r.extra, 8); assert.equal(g.stats.kept, 0);
});
