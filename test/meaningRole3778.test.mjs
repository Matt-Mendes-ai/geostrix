// TASKS.csv #3778 — Modelling codes said OVBN ('overburden') and LMP ('lamprophyre') were 'Not recognized: assumed stratigraphic' although the
// project's code dictionary says what they are. The role reads the dictionary since #3735; now the tooltip says where the suggestion came from,
// and the 'order from the holes' note says down the hole is not age on inclined holes across steep units.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setLithologyMeanings, roleForLithology, roleIsAssumed, roleMeaningText } from "../src/lib/layers.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("a code the dictionary names is given a role and says where it came from; a code the name rules know is not 'from the dictionary'", () => {
  setLithologyMeanings({ OVBN: { desc: "overburden" }, LMP: { desc: "lamprophyre" }, AND: { desc: "andesite" }, FLT: { desc: "gouge" } });
  try {
    assert.equal(roleForLithology("OVBN"), "overburden"); assert.equal(roleIsAssumed("OVBN"), false); assert.equal(roleMeaningText("OVBN"), "overburden");
    assert.equal(roleForLithology("LMP"), "dyke"); assert.equal(roleMeaningText("LMP"), "lamprophyre");
    assert.equal(roleForLithology("AND"), "stratigraphic"); assert.equal(roleIsAssumed("AND"), true); assert.equal(roleMeaningText("AND"), null); // nothing said what an andesite does
    assert.equal(roleMeaningText("FLT"), null); // 'flt' is a name rule's: not the dictionary's doing
    assert.equal(roleMeaningText("unknown"), null);
  } finally { setLithologyMeanings(null); }
  assert.equal(roleMeaningText("OVBN"), null); // no dictionary, no claim
});

test("wired: the role's tooltip and the order note", () => {
  const p = read("../src/components/ModellingCodesPane.jsx");
  assert.match(p, /coverWhy\(c\) \|\| meaningWhy\(c\) \|\| tr\(ROLE_HELP\[c\.role\]\)/);
  assert.match(p, /const m = roleMeaningText\(c\.name\);/);
  for (const k of [
    'Suggested as {role} from its meaning in the code dictionary: "{meaning}". Check it before modelling.',
    "Down the hole is the order the drill met the units, not their age, when holes cross steep units at an angle: check it.",
  ]) for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(JSON.parse(read(`../src/locales/${lang}.json`))[k], `${lang}: ${k.slice(0, 40)}`);
});
