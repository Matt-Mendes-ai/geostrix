// TASKS.csv #2145 — the AI-up trend (sericite / K-feldspar) named from the LOGGED alteration where the user marks a code potassic or
// phyllic; the joint name everywhere else. No K/Al cutoff.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessTrendRole, nameAiUpTrend, GEOCHEM_LABELS, classifyAlterationBox, PROVISIONAL_ALTERATION_BOXES } from "../src/lib/geochemDiagrams.js";
import { colorForAlteration } from "../src/lib/layers.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("#2145 suggestions from the code names (only suggestions: the dialog shows them)", () => {
  for (const c of ["Pot", "POT", "Pot_Ksp", "K-spar", "Kspar", "KSP", "Bio", "biotite", "SecBio", "K"]) assert.equal(guessTrendRole(c), "potassic", c);
  for (const c of ["Phyl", "Phyllic", "Ser", "SER", "Sericite", "QSP", "QS", "Musc"]) assert.equal(guessTrendRole(c), "phyllic", c);
  for (const c of ["ChlSer", "Propy", "Unalt", "Arg", "Sil", "Chl", "Epi", "", null, "preserved"]) assert.equal(guessTrendRole(c), null, String(c));
});

test("#2145 only an AI-up sample in a marked code is renamed; others keep their class", () => {
  const roles = { Pot: "potassic", Phyl: "phyllic", Propy: null };
  assert.equal(nameAiUpTrend("SER", "Pot", roles), "SER-POT");
  assert.equal(nameAiUpTrend("SER", "Phyl", roles), "SER-PHY");
  assert.equal(nameAiUpTrend("SER", "Propy", roles), "SER");
  assert.equal(nameAiUpTrend("SER", null, roles), "SER");     // no logged interval at the sample
  assert.equal(nameAiUpTrend("SER", "Pot", null), "SER");     // nothing marked
  assert.equal(nameAiUpTrend("CHL", "Pot", roles), "CHL");    // another trend is never renamed from the log
  assert.match(GEOCHEM_LABELS["SER-POT"], /^Potassic \(AI-up trend, named from the logged alteration\)$/);
  assert.match(GEOCHEM_LABELS.SER, /phyllic or potassic/);
  assert.notEqual(colorForAlteration("SER-POT"), colorForAlteration("SER-PHY"));
  // the box plot itself is unchanged: an AI-up sample of a dacite is SER
  assert.equal(classifyAlterationBox(80, 30, "dacite", PROVISIONAL_ALTERATION_BOXES), "SER");
});

test("#2145 wiring: the dialog's per-code choice, the run's naming and the basis count in the notice", () => {
  const m = read("src/components/AlterationBoxModal.jsx");
  assert.match(m, /saved\.trendRoles\[c\] : guessTrendRole\(c\)/);
  assert.match(m, /onRun\(\{ boxes, map, source, fitCodes, trendRoles \}\)/);
  const g = read("src/modules/GeochemModule.jsx");
  assert.match(g, /value = nameAiUpTrend\(value, trendRoles \? loggedCodeAt\(a, altByHole\) : null, trendRoles\); trendBasis\[value === "SER" \? "chem" : "log"\]\+\+;/);
  assert.match(g, /\+ trendText \+ sedText \+ jensenText/);
  assert.doesNotMatch(read("src/lib/geochemDiagrams.js").slice(read("src/lib/geochemDiagrams.js").indexOf("export function guessTrendRole"), read("src/lib/geochemDiagrams.js").indexOf("export function guessProtolith")), /K\/Al|2 ?\/ ?3|0\.6/); // no cutoff
});
