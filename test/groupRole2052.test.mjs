// TASKS.csv #2052 (review #2013, 3D Modelling) — a litho group's role came from its NAME in Modelling codes and from its members in the
// stack / implicit picker: 'Intrusive' (13 stratigraphic monzonite / diorite codes) was cross-cutting in one and stratigraphic in the others.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groupMemberRole, groupMcodeRole, groupNameHint } from "../src/lib/layers.js";
const rd = (f) => readFileSync(new URL(f, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const intrusive = { name: "Intrusive", codes: ["IMMOQ", "IMD", "IPAN"] };
const faults = { name: "Faults", codes: ["FLT", "FAULT"] };
const mixed = { name: "Mix", codes: ["IMMOQ", "FLT"] };
const cover = { name: "Cover", codes: ["OVB", "CAS"] };

test("a group's role comes from its members", () => {
  assert.equal(groupMemberRole(intrusive), "stratigraphic");
  assert.equal(groupMemberRole(faults), "cross-cutting");
  assert.equal(groupMemberRole(mixed), "cross-cutting"); // any cross-cutting member keeps it off the stack (the stack's rule)
  assert.equal(groupMemberRole(cover), "overburden");
  assert.equal(groupMemberRole({ name: "Empty", codes: [] }), "stratigraphic");
});
test("Modelling codes reads a group by name through its members; a plain code keeps the code rule", () => {
  assert.equal(groupMcodeRole("Intrusive", [intrusive]), "stratigraphic");
  assert.equal(groupMcodeRole("Intrusive", []), "cross-cutting"); // not a group: the #1541 word rule as before
});
test("the name's own suggestion is shown only when it differs", () => {
  assert.equal(groupNameHint(intrusive), "cross-cutting");
  assert.equal(groupNameHint(faults), null);
});
test("wired: ViewerModule and the modelling runs use it; the pane says the role", () => {
  assert.match(rd("../src/modules/ViewerModule.jsx"), /const mcodeDefaultRole = \(name\) => groupMcodeRole\(name, lithoGroups\);/);
  assert.match(rd("../src/modules/viewer/modellingRuns.js"), /const mcodeDefaultRole = \(name\) => groupMcodeRole\(name, lithoGroups\);/);
  assert.match(rd("../src/modules/viewer/ModellingPanes.jsx"), /tr\("Role: \{role\}, from its codes/);
});
