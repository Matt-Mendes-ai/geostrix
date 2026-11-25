// TASKS.csv #3767 (Scottie Gold review) — a lithology group is ONE unit in the tools that listed raw codes only: Veins / dykes, Correlate sheets / Auto-number, 'Set the plane
// from'. Synthetic codes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { veinSourceUnits } from "../src/lib/layers.js";
import { codedRuns, topsForCode } from "../src/lib/modellingCodes.js";
import { modellingPanesSource } from "./helpers/modellingPanesSource.mjs"; // TASKS.csv #4070 — the panes in their own files

const litho = [
  { hole_id: "H1", from: 0, to: 10, value: "AND" }, { hole_id: "H1", from: 10, to: 20, value: "MZNA" }, { hole_id: "H1", from: 20, to: 30, value: "MZNS" }, { hole_id: "H1", from: 30, to: 40, value: "SLT" },
  { hole_id: "H2", from: 0, to: 12, value: "AND" }, { hole_id: "H2", from: 12, to: 18, value: "MZNS" }, { hole_id: "H2", from: 18, to: 25, value: "SLT" },
];
const groups = [{ id: "g1", name: "Mineralized zone", codes: ["MZNA", "MZNS"], color: "#c33" }];

test("Veins / dykes: a cross-cutting group is one unit in place of its member codes; a group that is not cross-cutting is not offered", () => {
  assert.deepEqual(veinSourceUnits({ litho }, { codes: [{ name: "Mineralized zone", role: "cross-cutting" }] }, groups), ["mcode:Mineralized zone"]);
  // its role from the Modelling codes entry; with none, from its members' roles (all stratigraphic here: not offered)
  assert.deepEqual(veinSourceUnits({ litho }, null, groups), []);
  // a member code that is cross-cutting by name is not offered on its own once it is in a group
  const withDyke = [...litho, { hole_id: "H1", from: 40, to: 42, value: "DYK" }];
  assert.deepEqual(veinSourceUnits({ litho: withDyke }, null, [{ id: "g2", name: "Intrusives", codes: ["DYK"] }]).filter((u) => u === "litho:DYK"), []);
  assert.deepEqual(veinSourceUnits({ litho: withDyke }, null, null), ["litho:DYK"], "no groups: as before");
});

test("the group's runs carry its name: tops of the group exist, tops of a member code do not (which is why the tools must offer the group)", () => {
  const groupOf = (v) => (v === "MZNA" || v === "MZNS" ? "Mineralized zone" : null);
  const runs = codedRuns(litho, null, groupOf);
  const asGroup = topsForCode(runs, "Mineralized zone", null, () => "stratigraphic").tops;
  assert.equal(asGroup.length, 2, "one top in each hole: MZNA + MZNS touching is one run");
  assert.equal(topsForCode(runs, "MZNA", null, () => "stratigraphic").tops.length, 0);
});

test("wiring: Correlate sheets / Auto-number tick the group and read its rows; 'Set the plane from' lists the group; the vein list reads the groups", () => {
  const rd = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
  const c = rd("components/ModellingCodesPane.jsx");
  assert.match(c, /return v && groupOf \? groupOf\(r\.value\) \|\| v : v;/);
  assert.match(c, /const pickedRow = \(r\) => numberCodes\.includes\(String\(r\.value\)\) \|\| \(!!groupOf && numberCodes\.includes\(groupOf\(r\.value\)\)\);/);
  assert.doesNotMatch(c, /numberCodes\.includes\(String\(r\.value\)\)\)\.map\(rowKey\)/);
  const m = modellingPanesSource();
  assert.match(m, /units=\{tiedUnits\(litho_units, lithoGroups\)\}/);
  assert.match(rd("modules/ViewerModule.jsx"), /veinSourceUnits\(layers, modellingCodes, lithoGroups\)/);
});
