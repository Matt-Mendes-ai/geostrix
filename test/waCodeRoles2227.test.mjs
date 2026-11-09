// TASKS.csv #2227 — vein, shear and no-recovery codes read from their notes (not from a code prefix); a blank code is never a unit
import test from "node:test";
import assert from "node:assert/strict";
import { lithologyNoteRoles, setLithologyNoteRoles, roleForLithology, mcodeRoleOf } from "../src/lib/layers.js";

const rows = (pairs) => pairs.map(([value, notes]) => ({ value, notes }));

test("the WA lode-gold codes get their roles from their notes", () => {
  setLithologyNoteRoles(lithologyNoteRoles(rows([
    ["VQZ", "laminated qtz vein"], ["VQZ", "vuggy qtz"], ["VCB", "qcb breccia"],
    ["BSZ", "Carbonate veins within the shear"], ["BSZ", "as previous sz"],
    ["NPRC", "shotcrete"], ["NPRC", "cement!"], ["NPRC", "precollar/HQ core not present"], ["NLST", "last tray accidently thrown out"],
    ["SMP", "sericite schist with qtz veins"], ["SMP", "foliated"],
  ])));
  const role = (c) => mcodeRoleOf(roleForLithology(c));
  assert.equal(roleForLithology("VQZ"), "vein"); assert.equal(roleForLithology("VCB"), "vein");
  assert.equal(roleForLithology("BSZ"), "fault");
  assert.equal(role("NPRC"), "ignore"); assert.equal(role("NLST"), "ignore");
  assert.equal(role("SMP"), "stratigraphic", "a host rock whose notes mention veins stays a unit");
  setLithologyNoteRoles(null);
});

test("host-rock notes that mention veins do not make an intrusive or a breccia a vein (Woodjam ICMOQ / BX)", () => {
  const m = lithologyNoteRoles(rows([
    ["ICMOQ", "mod pot alt cg qtz monz. diss throughout strg vein alt"], ["ICMOQ", "mod pot alt cg qtz monz. ser overprinting vein selvage."],
    ["BX", "brecciated cg qtz monz. stockwork of qtz veining at 312 m"],
  ]));
  assert.equal(m.get("icmoq"), "dyke");
  assert.notEqual(m.get("bx"), "vein");
});

test("the 'Unknown' label of blank cells is never a unit and never takes a role from its notes", () => {
  setLithologyNoteRoles(lithologyNoteRoles(rows([["Unknown", "DIORITE INTRUSIVE"], ["Unknown", "DIORITE INTRUSIVE"]])));
  assert.equal(mcodeRoleOf(roleForLithology("Unknown")), "ignore");
  setLithologyNoteRoles(null);
  assert.equal(roleForLithology("VANSS"), "stratigraphic");
});
