// TASKS.csv #1541 — dyke, intrusive, no-recovery and overburden words inside longer codes get their role suggestion
import { test } from "node:test";
import assert from "node:assert/strict";
import { roleForLithology, mcodeRoleOf } from "../src/lib/layers.js";

test("the review's Lawyers codes", () => {
  const want = { "Felsic Dyke": "cross-cutting", "Mafic Dyke": "cross-cutting", "Intermediate Dyke": "cross-cutting", "I-Mafic": "cross-cutting", "I-Felsic": "cross-cutting", "I-Intermed": "cross-cutting", "No Recovery": "ignore", Sand: "overburden" };
  for (const [code, role] of Object.entries(want)) assert.equal(mcodeRoleOf(roleForLithology(code)), role, code);
});

test("whole words only: units that merely contain the letters stay stratigraphic", () => {
  for (const code of ["FAULTED LMST", "VBX", "Volcanic Breccia", "veined andesite", "V-Hbl-Intermed", "Sandstone", "Andesite", "Dykehead tuff"]) assert.equal(roleForLithology(code), "stratigraphic", code);
  assert.equal(roleForLithology("Quartz Vein"), "vein");
  assert.equal(roleForLithology("Fault Zone"), "fault");
  assert.equal(roleForLithology("Glacial till"), "overburden");
});

test("the Strat. stack picker leaves out a group with a member in the stack, and a code whose group is in it", async () => {
  const { readFileSync } = await import("node:fs");
  const m = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.equal((m.match(/!\(g\.codes \|\| \[\]\)\.some\(\(c\) => stackUnits\.includes\(c\)\)/g) || []).length, 2);
  assert.match(m, /!lithoGroups\.some\(\(g\) => stackUnits\.includes\(lithoGroupKey\(g\)\) && \(g\.codes \|\| \[\]\)\.includes\(u\)\)/);
});
