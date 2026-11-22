// TASKS.csv #3999 — Strat. stack "Add all": the candidates (what the stack takes, what stays out and why), the three choices, the order the holes give, the units already in the stack kept, and the
// cut-down over GemPy's 16. Made-up logs (DH-23-xxx).
import test from "node:test";
import assert from "node:assert/strict";
import { loggedMetres, addAllCandidates, chooseUnits, planAddAll, cutOrder, leftOutLine, leftOutWhy, DEFAULT_MIN_PCT } from "../src/lib/stackAddAll.js";

// holes: [[[code, metres], ...]] each hole's intervals top-down
const logs = (holes) => holes.flatMap((h, i) => { let d = 0; return h.map(([value, m]) => { const r = { hole_id: `DH-23-${String(i).padStart(3, "0")}`, from: d, to: d + m, value }; d += m; return r; }); });
const many = (n, h) => Array.from({ length: n }, () => h);
const roles = { CAS: "overburden", OVB: "overburden", UNKNOWN: "no recovery", FLT: "fault", DYK: "dyke", SKIP: "ignore" };
const roleOf = (c) => roles[c] || "stratigraphic";

test("#3999 loggedMetres: metres and holes per code", () => {
  const m = loggedMetres(logs(many(3, [["A", 10], ["B", 5]])));
  assert.deepEqual(m.get("A"), { metres: 30, holes: 3 }); assert.deepEqual(m.get("B"), { metres: 15, holes: 3 });
  assert.equal(m.size, 2); assert.equal(loggedMetres([{ hole_id: "x", from: 5, to: 5, value: "Z" }, { hole_id: "x", from: 0, to: 4, value: "" }]).size, 0);
});

test("#3999 candidates: what the stack takes, and what stays out with its reason (left out, cover / casing, no recovery, cross-cutting); units already in it are not added again", () => {
  const rows = logs(many(6, [["CAS", 3], ["A", 20], ["B", 20], ["DYK", 2], ["UNKNOWN", 1], ["SKIP", 4], ["C", 30]]));
  const litho_units = ["CAS", "A", "B", "DYK", "UNKNOWN", "SKIP", "C"];
  const c = addAllCandidates({ rows, litho_units, roleOf, stackUnits: ["B"] });
  assert.deepEqual(c.logged.map((x) => x.unit), ["A", "C"], "B is in the stack already");
  assert.deepEqual(c.leftOut.map((x) => [x.label, x.why]), [["CAS", "cover / casing"], ["DYK", "cross-cutting"], ["UNKNOWN", "no recovery"], ["SKIP", "left out"]]);
  assert.equal(c.total, 6 * 80);
  assert.deepEqual(leftOutLine(c.leftOut), [{ why: "cover / casing", names: ["CAS"], more: 0 }, { why: "cross-cutting", names: ["DYK"], more: 0 }, { why: "no recovery", names: ["UNKNOWN"], more: 0 }, { why: "left out", names: ["SKIP"], more: 0 }]);
  assert.equal(leftOutWhy("stratigraphic"), null); assert.equal(leftOutWhy("ignore"), "left out");
  // modelling codes: the stratigraphic ones; a code with a Modelling codes entry is listed there, not as a raw code too
  const mc = addAllCandidates({ rows, litho_units, roleOf, modellingCodeList: [{ name: "A", role: "stratigraphic" }, { name: "Cover", role: "overburden" }, { name: "Skip", role: "ignore" }, { name: "Done", role: "stratigraphic" }], stackUnits: ["mcode:Done"], codesOf: (u) => (u === "mcode:A" ? ["A"] : []) });
  assert.deepEqual(mc.modelling.map((x) => x.unit), ["mcode:A"]); assert.equal(mc.modelling[0].metres, 120);
  assert.ok(!mc.logged.some((x) => x.unit === "A"), "A is the modelling code's");
  assert.deepEqual(mc.leftOut.filter((x) => x.unit.startsWith("mcode:")).map((x) => [x.label, x.why]), [["Cover", "cover / casing"], ["Skip", "left out"]]);
  // a code whose group is already in the stack, and a modelling code whose group twin is
  const g = addAllCandidates({ rows, litho_units, roleOf, groupOf: (u) => u === "C", modellingCodeList: [{ name: "Twin", role: "stratigraphic" }], twinInStack: (n) => n === "Twin" });
  assert.ok(!g.logged.some((x) => x.unit === "C")); assert.deepEqual(g.modelling, []);
});

test("#3999 the three choices: all modelling codes, all logged codes, the logged codes with at least a share of the metres (1 % by default, said)", () => {
  // 1,000 logged metres: A 700, B 250, C 40, D 9, E 1
  const rows = logs([[["A", 700], ["B", 250], ["C", 40], ["D", 9], ["E", 1]]]);
  const c = addAllCandidates({ rows, litho_units: ["A", "B", "C", "D", "E"], roleOf, modellingCodeList: [] });
  assert.equal(c.total, 1000); assert.equal(DEFAULT_MIN_PCT, 1);
  assert.deepEqual(chooseUnits(c, "logged").add.map((x) => x.unit), ["A", "B", "C", "D", "E"]);
  const s = chooseUnits(c, "share");
  assert.deepEqual(s.add.map((x) => x.unit), ["A", "B", "C"], "D (0.9 %) and E (0.1 %) are under 1 %"); assert.deepEqual(s.rare.map((x) => x.unit), ["D", "E"]);
  assert.deepEqual(chooseUnits(c, "share", 5).add.map((x) => x.unit), ["A", "B"]);
  assert.deepEqual(chooseUnits(c, "share", 0).add.map((x) => x.unit), ["A", "B", "C", "D", "E"], "0 %: every logged code");
  const m = addAllCandidates({ rows, litho_units: ["A", "B"], roleOf, modellingCodeList: [{ name: "G", role: "stratigraphic" }], codesOf: () => ["A"] });
  assert.deepEqual(chooseUnits(m, "modelling").add.map((x) => x.unit), ["mcode:G"]);
});

test("#3999 the units go in already in the holes' order; the units already in the stack are kept; units the holes do not place keep their place at the end", () => {
  const rows = logs(many(6, [["E", 5], ["C", 5], ["A", 5], ["B", 5]]));
  const add = ["A", "B", "C", "E", "Q"].map((u) => ({ unit: u, label: u, metres: 30, holes: 6 })); // Q is in no log
  const p = planAddAll(rows, ["B"], add);
  assert.deepEqual(p.added, ["A", "C", "E", "Q"]); assert.ok(p.order.includes("B"), "the existing unit stays");
  assert.deepEqual(p.order, ["E", "C", "A", "B", "Q"], "youngest first, as the holes log them; Q, which they do not place, stays last");
  assert.equal(p.over, 0); assert.equal(p.cut, null);
  assert.deepEqual(p.plan.moves.map((m) => m.unit).sort(), ["A", "B", "C", "E"].sort().filter((u) => p.plan.moves.some((m) => m.unit === u)), "the plan says what moved");
});

test("#3999 over GemPy's 16 units: said, and the cut-down keeps the existing units and the most logged, drops the rest with their figures, in the holes' order", () => {
  const names = Array.from({ length: 22 }, (_, i) => `U${String(i).padStart(2, "0")}`);
  const rows = logs(many(5, names.map((n, i) => [n, 2 + (i % 7) * 3]))); // U00 2 m, U01 5 m, ... U06 20 m, U07 2 m ...
  const c = addAllCandidates({ rows, litho_units: names, roleOf, modellingCodeList: [], stackUnits: ["U00"] });
  const add = chooseUnits(c, "logged").add;
  const p = planAddAll(rows, ["U00"], add);
  assert.equal(p.over, 22 - 16); assert.equal(p.cut.keep.length, 16); assert.equal(p.cut.dropped.length, 6);
  assert.ok(p.cut.keep.includes("U00"), "the existing unit is kept whatever its metres");
  assert.ok(p.cut.dropped.every((d) => d.metres <= Math.min(...p.cut.keep.filter((u) => u !== "U00").map((u) => add.find((x) => x.unit === u).metres))), "what is dropped has no more metres than what is kept");
  assert.deepEqual(p.cut.dropped.map((d) => d.metres), [...p.cut.dropped.map((d) => d.metres)].sort((a, b) => b - a), "dropped listed most logged first");
  const q = cutOrder(rows, ["U00"], add);
  assert.equal(q.order.length, 16); assert.equal(q.over, 0);
  assert.deepEqual([...q.order].sort(), [...p.cut.keep].sort(), "the cut-down order holds exactly the kept units");
  const inLogOrder = names.filter((n) => q.order.includes(n));
  assert.deepEqual(q.order, inLogOrder, "in the order the holes log them");
  // at the limit exactly: no cut
  assert.equal(planAddAll(rows, [], add.slice(0, 16)).over, 0);
  assert.equal(planAddAll(rows, [], add.slice(0, 16)).cut, null);
});
