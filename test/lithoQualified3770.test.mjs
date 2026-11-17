// TASKS.csv #3770 (Scottie Gold review) — Suggest groups never folds an altered / mineralized / deformed unit into its host rock: it is set apart and offered as its own group,
// unticked. Synthetic codes and meanings.
import test from "node:test";
import assert from "node:assert/strict";
import { suggestGroups, qualifiersOf, meaningOf } from "../src/lib/lithoHarmonize.js";

const rows = (code, n) => Array.from({ length: n }, (_, i) => ({ hole_id: `H${i}`, from: i, to: i + 1, value: code }));
const litho = [...rows("AND", 50), ...rows("MZNA", 37), ...rows("SLT", 15), ...rows("MZNS", 11), ...rows("OVBN", 6), ...rows("CSG", 3)];
const dict = { and: { desc: "andesite" }, mzna: { desc: "altered sulphidized deformed andesite" }, slt: { desc: "siltstone" }, mzns: { desc: "altered sulphidized deformed siltstone" }, ovbn: { desc: "overburden" }, csg: { desc: "casing" } };

test("the qualifiers before the rock word", () => {
  assert.deepEqual(qualifiersOf("altered sulphidized deformed andesite", "andesite"), ["altered", "sulphidized", "deformed"]);
  assert.deepEqual(qualifiersOf("andesite", "andesite"), []);
  assert.deepEqual(qualifiersOf("fine grained basalt", "basalt"), [], "a texture word is not a qualifier");
  assert.deepEqual(qualifiersOf("silicified, veined siltstone", "siltstone"), ["silicified", "veined"]);
  assert.deepEqual(meaningOf("MZNA", { dictDesc: "altered sulphidized deformed andesite" }).qualifiers, ["altered", "sulphidized", "deformed"]);
});

test("the mineralized zone is not folded into its host: its own group, unticked; the plain host codes are left alone", () => {
  const r = suggestGroups(litho, [], dict);
  const mzna = r.proposals.find((p) => p.code === "MZNA"), mzns = r.proposals.find((p) => p.code === "MZNS");
  assert.ok(mzna && mzns);
  assert.equal(mzna.groupName, mzns.groupName);
  assert.match(mzna.groupName, /^Altered sulphidized deformed$/);
  assert.equal(mzna.tick, false); assert.equal(mzns.tick, false);
  assert.ok(!r.proposals.some((p) => /^(Andesite|Siltstone)$/.test(p.groupName)), "no group named for the host rocks holds them");
  assert.ok(r.alone.some((a) => a.code === "AND") && r.alone.some((a) => a.code === "SLT"), "AND and SLT are each the only plain code of their rock");
});

test("a qualified code alone in its qualifier set is left alone, not folded; plain codes that name one rock still group as before", () => {
  const two = [...rows("AND", 5), ...rows("And", 4), ...rows("MZNA", 3)];
  const r = suggestGroups(two, [], { mzna: { desc: "altered sulphidized deformed andesite" } });
  assert.ok(r.proposals.filter((p) => p.groupName === "Andesite").map((p) => p.code).sort().join() === "AND,And" || r.proposals.some((p) => p.code === "AND"));
  assert.ok(!r.proposals.some((p) => p.code === "MZNA"));
  assert.ok(r.alone.some((a) => a.code === "MZNA" && a.qualifiers.includes("altered")));
});
