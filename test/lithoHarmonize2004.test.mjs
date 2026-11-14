// TASKS.csv #2004 (design docs/ideas/litho-code-harmonization.md; Main 2026-11-14: our own list, no download) — codes logged by different
// systems (BAS, Bslt, Basalt, DIAB, Dolerite) are proposed into the project's lithology groups from their meaning: the dictionary entry, the code
// read as a rock word, the code as an unambiguous abbreviation, then a bounded fuzzy match that starts unticked. SYNTHETIC code lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { THESAURUS, tablesOf } from "../src/lib/lithoThesaurus.js";
import { matchRock, editDistance, meaningOf, suggestGroups, groupingPlan } from "../src/lib/lithoHarmonize.js";

const log = (spec) => Object.entries(spec).flatMap(([code, n]) => Array.from({ length: n }, () => ({ value: code })));

test("the thesaurus: about 150 names, no word or abbreviation that two rocks claim", () => {
  assert.ok(THESAURUS.length >= 130 && THESAURUS.length <= 170, `${THESAURUS.length} names`);
  const owner = new Map();
  for (const [name, , syn] of THESAURUS) for (const k of [name.toLowerCase(), ...syn]) { assert.ok(!owner.has(k) || owner.get(k) === name, `${k}: ${owner.get(k)} and ${name}`); owner.set(k, name); }
  const T = tablesOf();
  for (const bad of ["DOL", "MB", "SLT", "MS", "SA", "CL", "BR", "PYR"]) assert.equal(T.abbr.has(bad), false, `${bad} is ambiguous and not an abbreviation`);
  const claims = new Map();
  for (const [name, , , ab] of THESAURUS) for (const a of ab) { assert.ok(!claims.has(a) || claims.get(a) === name, `abbreviation ${a}`); claims.set(a, name); }
});

test("edit distance and matching: exact, synonym, last noun wins, fuzzy only on words of 5+ letters and never on a tie", () => {
  assert.equal(editDistance("basalt", "basalte"), 1); assert.equal(editDistance("abc", "xyzabc", 2), 3);
  assert.deepEqual([matchRock("Basalt").how, matchRock("basaltic").how, matchRock("bazalt").how], ["exact", "synonym", "fuzzy"]);
  assert.equal(matchRock("basaltic andesite").rock, "Andesite", "the noun is last");
  assert.equal(matchRock("mudstone breccia").rock, "Breccia");
  assert.equal(matchRock("quartz diorite").rock, "Diorite");
  assert.equal(matchRock("Granodiorit").rock, "Granodiorite");
  assert.equal(matchRock("tuf"), null, "no fuzzy under 5 letters");
  assert.equal(matchRock("xyzzy"), null);
  assert.equal(matchRock("bazalt", { fuzzy: false }), null);
});

test("a code's meaning: the dictionary first, then the code as a word, then an abbreviation; the ambiguous abbreviation is none", () => {
  assert.equal(meaningOf("MB", { dictDesc: "Mafic basalt" }).rock, "Basalt");
  assert.equal(meaningOf("MB", { dictDesc: "Mafic basalt" }).source, "dictionary");
  assert.deepEqual([meaningOf("Bslt").source, meaningOf("Bslt").how], ["name", "synonym"]);
  assert.deepEqual([meaningOf("GWK").source, meaningOf("GWK").rock], ["abbreviation", "Greywacke"]);
  assert.equal(meaningOf("DOL"), null); assert.equal(meaningOf("MB"), null);
  const d = meaningOf("X", { dictDesc: "Basalt", descriptions: ["Basalt", "Andesite flow"] });
  assert.deepEqual(d.others, ["Andesite"], "descriptions that name another rock are listed");
});

test("proposals: spellings of one rock into one new group, an existing group takes the next of its rock, fuzzy and mixed start unticked", () => {
  const rows = [...log({ BAS: 20, Bslt: 5, Basalt: 40, bazalt: 3, DIAB: 9, Dolerite: 12, DOL: 7, GWK: 30, ZZZ: 3, AND: 6, ANDS: 2, DAC: 4, Dacite: 1 }),
    ...Array.from({ length: 3 }, () => ({ value: "M2", description: "Mafic basalt" })), ...Array.from({ length: 2 }, () => ({ value: "M2", description: "Andesite flow" }))];
  const groups = [{ id: "g1", name: "Volcanic host", codes: ["ANDS"] }, { id: "g2", name: "Intrusive", codes: ["Gabbro"] }];
  const r = suggestGroups(rows, groups, null);
  const by = (c) => r.proposals.find((p) => p.code === c);
  assert.deepEqual(["Basalt", "BAS", "Bslt", "bazalt", "M2"].map((c) => by(c).groupName), ["Basalt", "Basalt", "Basalt", "Basalt", "Basalt"]);
  assert.deepEqual(["BAS", "Bslt", "Basalt", "bazalt", "M2"].map((c) => by(c).tick), [true, true, true, false, false], "fuzzy and mixed meanings start unticked");
  assert.deepEqual(by("M2").others, ["Andesite"]);
  assert.equal(by("bazalt").how, "fuzzy"); assert.equal(by("bazalt").distance, 1);
  assert.deepEqual([by("DIAB").groupName, by("Dolerite").groupName], ["Dolerite", "Dolerite"]);
  assert.deepEqual([by("AND").groupId, by("AND").groupName], ["g1", "Volcanic host"], "the group that holds an andesite takes the next one");
  assert.equal(by("ANDS"), undefined, "a code already in a group is not proposed");
  assert.deepEqual(r.alone.map((a) => a.code), ["GWK"], "one code alone for its rock: nothing to harmonize");
  assert.deepEqual(r.unrecognized.map((u) => u.code), ["DOL", "ZZZ"]);
  const plan = groupingPlan(r.proposals.filter((p) => p.tick));
  assert.deepEqual(plan.adds.map((a) => [a.name, a.codes.sort()]), [["Basalt", ["BAS", "Basalt", "Bslt"]], ["Dacite", ["DAC", "Dacite"]], ["Dolerite", ["DIAB", "Dolerite"]]]);
  assert.deepEqual(plan.extends, [{ id: "g1", codes: ["AND"] }]);
});

test("the dictionary's description decides over the code, and a group's own name can be the rock", () => {
  const rows = log({ MB: 4, MFB: 3 });
  const dict = { mb: { code: "MB", desc: "Mudstone breccia", source: "user" }, mfb: { code: "MFB", desc: "Mudstone breccia", source: "user" } };
  const r = suggestGroups(rows, [], dict);
  assert.deepEqual(r.proposals.map((p) => [p.code, p.groupName, p.source]), [["MB", "Breccia", "dictionary"], ["MFB", "Breccia", "dictionary"]]);
  const named = suggestGroups(log({ BAS: 2 }), [{ id: "x", name: "Basalt", codes: [] }], null);
  assert.deepEqual([named.proposals[0].groupId, named.proposals[0].groupName], ["x", "Basalt"], "a group named for the rock takes its codes");
});
