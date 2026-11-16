// TASKS.csv #3770 (Scottie Gold review) — Suggest groups never folds an altered / mineralized / deformed unit into its host rock: it is set apart and offered as its own group,
// unticked. Synthetic codes and meanings.
import test from "node:test";
import assert from "node:assert/strict";
import { suggestGroups, qualifiersOf, meaningOf } from "../src/lib/lithoHarmonize.js";

const rows = (code, n) => Array.from({ length: n }, (_, i) => ({ hole_id: `H${i}`, from: i, to: i + 1, value: code }));
const litho = [...rows("AND", 50), ...rows("ASDA", 37), ...rows("SLT", 15), ...rows("ASDS", 11), ...rows("OVBN", 6), ...rows("CSG", 3)];
const dict = { and: { desc: "andesite" }, asda: { desc: "altered sulphidized deformed andesite" }, slt: { desc: "siltstone" }, asds: { desc: "altered sulphidized deformed siltstone" }, ovbn: { desc: "overburden" }, csg: { desc: "casing" } };

test("the qualifiers before the rock word", () => {
  assert.deepEqual(qualifiersOf("altered sulphidized deformed andesite", "andesite"), ["altered", "sulphidized", "deformed"]);
  assert.deepEqual(qualifiersOf("andesite", "andesite"), []);
  assert.deepEqual(qualifiersOf("fine grained basalt", "basalt"), [], "a texture word is not a qualifier");
  assert.deepEqual(qualifiersOf("silicified, veined siltstone", "siltstone"), ["silicified", "veined"]);
  assert.deepEqual(meaningOf("ASDA", { dictDesc: "altered sulphidized deformed andesite" }).qualifiers, ["altered", "sulphidized", "deformed"]);
});

test("the mineralized zone is not folded into its host: its own group, unticked; the plain host codes are left alone", () => {
  const r = suggestGroups(litho, [], dict);
  const asda = r.proposals.find((p) => p.code === "ASDA"), asds = r.proposals.find((p) => p.code === "ASDS");
  assert.ok(asda && asds);
  assert.equal(asda.groupName, asds.groupName);
  assert.match(asda.groupName, /^Altered sulphidized deformed$/);
  assert.equal(asda.tick, false); assert.equal(asds.tick, false);
  assert.ok(!r.proposals.some((p) => /^(Andesite|Siltstone)$/.test(p.groupName)), "no group named for the host rocks holds them");
  assert.ok(r.alone.some((a) => a.code === "AND") && r.alone.some((a) => a.code === "SLT"), "AND and SLT are each the only plain code of their rock");
});

test("a qualified code alone in its qualifier set is left alone, not folded; plain codes that name one rock still group as before", () => {
  const two = [...rows("AND", 5), ...rows("And", 4), ...rows("ASDA", 3)];
  const r = suggestGroups(two, [], { asda: { desc: "altered sulphidized deformed andesite" } });
  assert.ok(r.proposals.filter((p) => p.groupName === "Andesite").map((p) => p.code).sort().join() === "AND,And" || r.proposals.some((p) => p.code === "AND"));
  assert.ok(!r.proposals.some((p) => p.code === "ASDA"));
  assert.ok(r.alone.some((a) => a.code === "ASDA" && a.qualifiers.includes("altered")));
});
