// TASKS.csv #4023 — delete modelling codes: the intervals re-coded to a code go back to their logged code (or group); the imported rows never change. Made-up data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoNumber, codeOverrides, deleteCodes, codesInUse, effectiveCode, rowKey, connectIntervals } from "../src/lib/modellingCodes.js";

const litho = [
  { hole_id: "H1", from: 0, to: 2, value: "ALU" }, { hole_id: "H1", from: 2, to: 6, value: "DAC" }, { hole_id: "H1", from: 6, to: 9, value: "AND" }, { hole_id: "H1", from: 9, to: 12, value: "DAC" },
  { hole_id: "H2", from: 0, to: 3, value: "ALU" }, { hole_id: "H2", from: 3, to: 8, value: "DAC" },
];
const names = (mc) => codesInUse(litho, mc, null, () => "stratigraphic").map((c) => c.name);

test("auto-number makes DAC1 / DAC2; deleting DAC2 sends its intervals back to DAC, DAC1 stays", () => {
  const mc = { codes: [], assign: autoNumber(litho, ["DAC"], { codes: [], assign: {}, ties: [] }, null), ties: [] };
  assert.deepEqual(names(mc).filter((n) => n.startsWith("DAC")), ["DAC1", "DAC2"]);
  assert.deepEqual([...codeOverrides(mc)], [["DAC1", 2], ["DAC2", 1]], "counts the re-coded intervals per code");
  const r = deleteCodes(mc, ["DAC2"], { logged: new Set(["ALU", "DAC", "AND"]) });
  assert.equal(r.intervals, codeOverrides(mc).get("DAC2"));
  assert.equal(r.codes, 1);
  assert.deepEqual(names(r.mc).filter((n) => n.startsWith("DAC")), ["DAC", "DAC1"], "DAC2's interval is DAC again; DAC1 is untouched");
  assert.equal(effectiveCode(litho[3], r.mc, null), "DAC", "back to the logged code");
});

test("through a lithology group: the interval goes back to its group, not the raw code", () => {
  const groupOf = (v) => (v === "DAC" ? "Felsic" : null);
  const mc = { codes: [], assign: { [rowKey(litho[1])]: "X1" }, ties: [] };
  assert.equal(effectiveCode(litho[1], mc, groupOf), "X1");
  assert.equal(effectiveCode(litho[1], deleteCodes(mc, ["X1"]).mc, groupOf), "Felsic");
});

test("deleting everything with an override: no override is left, the logged codes are what remain, the rows are not changed", () => {
  const before = JSON.stringify(litho);
  const mc = { codes: [], assign: autoNumber(litho, ["DAC", "ALU"], { codes: [], assign: {}, ties: [] }, null), ties: [] };
  const r = deleteCodes(mc, [...codeOverrides(mc).keys()]);
  assert.deepEqual(r.mc.assign, {});
  assert.deepEqual(names(r.mc), ["ALU", "AND", "DAC"]);
  assert.equal(JSON.stringify(litho), before, "the imported data never change");
});

test("a code-list entry goes with the code, but a logged code keeps its colour / role / order", () => {
  const mc = { codes: [{ name: "DAC", role: "intrusion", color: "#112233" }, { name: "DAC2", role: "ignore" }], assign: { [rowKey(litho[3])]: "DAC2", [rowKey(litho[5])]: "DAC" }, ties: [] };
  const r = deleteCodes(mc, ["DAC2", "DAC"], { logged: new Set(["DAC"]) });
  assert.deepEqual(r.mc.codes.map((c) => c.name), ["DAC"], "DAC2 left the list; DAC is logged, so its entry stays");
  assert.deepEqual(r.mc.assign, {});
  assert.equal(r.intervals, 2);
});

test("correlation ties to an interval that was re-coded to a deleted code are dropped; the others stay", () => {
  let mc = { codes: [], assign: {}, ties: [] };
  mc = connectIntervals(mc, litho[1], litho[5], litho, null); // H2's DAC run joins H1's DAC run (same code: DAC)
  mc = { ...mc, assign: { ...mc.assign, [rowKey(litho[3])]: "Z9" }, ties: [...mc.ties, { a: rowKey(litho[3]), b: rowKey(litho[4]) }] };
  const r = deleteCodes(mc, ["Z9"]);
  assert.equal(r.mc.ties.length, mc.ties.length - 1);
  assert.ok(!r.mc.ties.some((t) => t.a === rowKey(litho[3]) || t.b === rowKey(litho[3])));
});

test("nothing to delete: a code only the log has (no override) is unchanged", () => {
  const mc = { codes: [{ name: "ALU", color: "#ff0000" }], assign: {}, ties: [] };
  const r = deleteCodes(mc, ["ALU"], { logged: new Set(["ALU", "DAC", "AND"]) });
  assert.equal(r.intervals, 0); assert.equal(r.codes, 0);
  assert.deepEqual(r.mc, mc);
  assert.equal(codeOverrides(null).size, 0);
  assert.deepEqual(deleteCodes(null, ["X"]).mc, { codes: [], assign: {}, ties: [] });
});

test("wiring: the pane has the x, the picks and Delete all, and says what happens in the confirm", () => {
  const pane = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(pane, /deleteCodes\(/);
  assert.match(pane, /go back to their logged code/);
  assert.match(pane, /pickClick\(/);
});
