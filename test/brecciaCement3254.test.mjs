// TASKS.csv #3254 (#3195, Galore Creek modelling review) — a breccia whose notes describe its cement ('silica cement', 'cemented by …') was read as
// 'no recovery' by #2227's note rule and ignored by the modelling tools. Synthetic notes.
import test from "node:test";
import assert from "node:assert/strict";
import { lithologyNoteRoles, setLithologyNoteRoles, roleForLithology, mcodeRoleOf } from "../src/lib/layers.js";

const rows = (pairs) => pairs.map(([value, notes]) => ({ value, notes }));

test("a breccia described by its cement is not lost core", () => {
  const m = lithologyNoteRoles(rows([
    ["B", "polymict breccia, silica cement"], ["B", "clast supported, cemented by tourmaline and qtz"], ["B", "bx with carbonate cement"],
    ["B", "matrix and cement of fine rock flour"], ["B", "angular clasts, chlorite cement, minor cpy in cement"], ["B", "monomict"],
  ]));
  assert.notEqual(m.get("b"), "no recovery");
  setLithologyNoteRoles(m);
  assert.notEqual(mcodeRoleOf(roleForLithology("B")), "ignore", "the modelling tools keep it");
  setLithologyNoteRoles(null);
});

test("#2227's real no-recovery notes still are, and a cement plug or grout too", () => {
  const m = lithologyNoteRoles(rows([
    ["NPRC", "shotcrete"], ["NPRC", "cement!"], ["NPRC", "precollar/HQ core not present"],
    ["CEM", "Cement"], ["CEM", "cement plug"], ["CEM", "grouted"],
    ["NLST", "last tray accidently thrown out"],
  ]));
  assert.equal(m.get("nprc"), "no recovery");
  assert.equal(m.get("cem"), "no recovery");
  assert.equal(m.get("nlst"), "no recovery");
});
