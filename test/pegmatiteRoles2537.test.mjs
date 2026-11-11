// TASKS.csv #2537 — role suggestions knew no pegmatite: PEG, Pegmatite, APL, Dolerite, FILL ... came out 'stratigraphic', and nothing marked
// which roles were guesses. Any deposit type: the intrusive that carries the ore is as common as the one that cuts it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roleForLithology, roleIsAssumed, isCrossCuttingRole } from "../src/lib/layers.js";

test("pegmatite, aplite, dolerite / diabase and lamprophyre words are intrusive (cross-cutting); fill is overburden", () => {
  for (const c of ["PEG", "PEGM", "Pegmatite", "pegmatites", "APL", "Aplite", "Dolerite", "DIAB", "Diabase", "LAMP", "Lamprophyre", "Spodumene pegmatite", "Felsic aplite dyke"]) {
    assert.ok(isCrossCuttingRole(roleForLithology(c)), `${c}: ${roleForLithology(c)}`);
    assert.equal(roleIsAssumed(c), false, c);
  }
  for (const c of ["FILL", "Backfill", "made ground"]) assert.equal(roleForLithology(c), "overburden", c);
});

test("ambiguous short codes stay unrecognized and say so; known ones are not 'assumed'", () => {
  for (const c of ["P", "PG", "DOL", "NS", "LMST", "BAS"]) { assert.equal(roleForLithology(c), "stratigraphic", c); assert.equal(roleIsAssumed(c), true, c); }
  for (const c of ["QV", "FAULT", "NRCV", "unknown", "PEGMATITIC"]) assert.equal(roleIsAssumed(c), c === "PEGMATITIC", c); // a prefix of a word is not the word
  assert.equal(roleForLithology("PEGMATITIC"), "stratigraphic");
});

test("the codes pane marks an assumed role", () => {
  const p = readFileSync(new URL("../src/components/ModellingCodesPane.jsx", import.meta.url), "utf8");
  assert.match(p, /const assumedRole = \(name\) => !\(mc\?\.codes \|\| \[\]\)\.some\(\(x\) => x\.name === name && x\.role\) && !\(groupOf && groupOf\(name\)\) && roleIsAssumed\(name\);/);
  assert.match(p, /assumedRole\(c\.name\) \? tr\("Not recognized: assumed stratigraphic\. Check it before modelling\."\)/);
  for (const l of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(readFileSync(new URL(`../src/locales/${l}.json`, import.meta.url), "utf8"))["Not recognized: assumed stratigraphic. Check it before modelling."], l);
});
