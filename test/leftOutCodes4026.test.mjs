// TASKS.csv #4026 — 'Leave out of the model' per code (a logged code too): the modelling tools read the log without those intervals; the log itself is unchanged. Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLeftOut, leftOutNames, withoutLeftOut, leftOutLayers, leftOutIn, isLeftOutUnit, codeInfo, codesInUse, codedRuns, rowKey } from "../src/lib/modellingCodes.js";

const litho = [
  { hole_id: "H1", from: 0, to: 2, value: "ALU" }, { hole_id: "H1", from: 2, to: 4, value: "CID" }, { hole_id: "H1", from: 4, to: 9, value: "DAC" },
  { hole_id: "H2", from: 0, to: 3, value: "ALU" }, { hole_id: "H2", from: 3, to: 8, value: "DAC" },
];
const none = { codes: [], assign: {}, ties: [] };

test("everything is in by default; leaving a logged code out keeps the log as it is", () => {
  assert.equal(leftOutNames(none).size, 0);
  assert.equal(withoutLeftOut(litho, none, null), litho, "the same array: nothing to filter");
  const before = JSON.stringify(litho);
  const mc = setLeftOut(none, ["CID"], true);
  assert.deepEqual([...leftOutNames(mc)], ["CID"]);
  assert.deepEqual(withoutLeftOut(litho, mc, null).map((r) => r.value), ["ALU", "DAC", "ALU", "DAC"]);
  assert.equal(JSON.stringify(litho), before, "the imported rows are not changed");
  assert.equal(codeInfo(mc, "CID").leftOut, true);
  assert.equal(codeInfo(mc, "ALU").leftOut, false);
  assert.ok(codesInUse(litho, mc, null, () => "stratigraphic").some((c) => c.name === "CID"), "the code list still shows it, so it can be put back");
});

test("put back: the flag goes, and an entry that held nothing else goes too (no 'modelling code' of its own)", () => {
  const mc = setLeftOut(none, ["CID"], true);
  assert.deepEqual(setLeftOut(mc, ["CID"], false).codes, []);
  const kept = setLeftOut({ codes: [{ name: "CID", role: "intrusion", color: "#112233" }], assign: {}, ties: [] }, ["CID"], true);
  assert.deepEqual(kept.codes, [{ name: "CID", role: "intrusion", color: "#112233", leftOut: true }]);
  assert.deepEqual(setLeftOut(kept, ["CID"], false).codes, [{ name: "CID", role: "intrusion", color: "#112233" }], "its role and colour stay");
});

test("several at once, and a code already left out stays so", () => {
  const mc = setLeftOut(setLeftOut(none, ["CID"], true), ["CID", "ALU"], true);
  assert.deepEqual([...leftOutNames(mc)].sort(), ["ALU", "CID"]);
  assert.equal(mc.codes.length, 2);
});

test("a re-coded interval and a lithology group are left out by the code the tools read, not the logged value", () => {
  const assign = { [rowKey(litho[2])]: "X1" }; // H1's DAC is X1
  const groupOf = (v) => (v === "ALU" ? "Cover" : null);
  const mc = setLeftOut({ codes: [], assign, ties: [] }, ["X1", "Cover"], true);
  assert.deepEqual(withoutLeftOut(litho, mc, groupOf).map((r) => `${r.hole_id}:${r.value}`), ["H1:CID", "H2:DAC"]);
  assert.equal(isLeftOutUnit(mc, groupOf, "ALU"), true, "a raw code in a left-out group");
  assert.equal(isLeftOutUnit(mc, groupOf, "DAC"), false);
  assert.deepEqual(leftOutIn(litho, mc, groupOf), ["Cover", "X1"]);
});

test("a left-out unit is a gap: the unit below it gets no top there", () => {
  const mc = setLeftOut(none, ["CID"], true);
  const runs = codedRuns(withoutLeftOut(litho, mc, null).filter((r) => r.hole_id === "H1"), mc, null);
  assert.deepEqual(runs.map((r) => [r.code, r.above?.code ?? null]), [["ALU", null], ["DAC", null]], "DAC no longer sits directly below a logged unit");
  const all = codedRuns(litho.filter((r) => r.hole_id === "H1"), none, null);
  assert.equal(all[2].above?.code, "CID", "with CID in, DAC sits below it");
});

test("leftOutLayers swaps only the Lithology rows, and returns the same object when nothing is left out", () => {
  const layers = { litho, structure: [{ a: 1 }] };
  assert.equal(leftOutLayers(layers, none, null), layers);
  const out = leftOutLayers(layers, setLeftOut(none, ["CID"], true), null);
  assert.equal(out.structure, layers.structure);
  assert.equal(out.litho.length, 4);
  assert.equal(leftOutLayers({ structure: [] }, none, null).litho, undefined);
});

test("wiring: the code row has the toggle, the pick bar has Leave out / Put back, the runs read the filtered Lithology and say what was left out", () => {
  const pane = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(pane, /setLeftOut\(/);
  assert.match(pane, /Leave out of the model/);
  const runs = readFileSync(new URL("../src/modules/viewer/modellingRuns.js", import.meta.url), "utf8");
  assert.match(runs, /isLeftOutUnit\(/);
  const panes = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(panes, /leftOutLayers\(/);
  const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
  assert.match(vm, /leftOutLayers\(/);
});
