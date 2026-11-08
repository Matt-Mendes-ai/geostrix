// TASKS.csv #2046 (review #2013, Woodjam) — role suggestions for NCR, the *Dyk dyke codes, and codes read from their logged notes.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roleForLithology, lithologyNoteRoles, setLithologyNoteRoles, mcodeRoleOf } from "../src/lib/layers.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("name rules: NCR is no recovery (ignored), FDyk / MDyk / IDyk are dykes; units stay units", () => {
  setLithologyNoteRoles(null);
  assert.equal(roleForLithology("NCR"), "no recovery");
  assert.equal(mcodeRoleOf(roleForLithology("NCR")), "ignore");
  for (const c of ["FDyk", "MDyk", "IDyk", "fdyk"]) assert.equal(roleForLithology(c), "dyke", c);
  for (const c of ["VANSS", "VBX", "BMM", "IMMOQ", "DYKSTRA"]) assert.equal(roleForLithology(c), "stratigraphic", c); // by name alone (BMM / IMMOQ: from notes, below)
});

test("note rules: half of a code's noted rows decide; a passing mention does not", () => {
  const row = (value, note, extra = {}) => ({ hole_id: "TF24-124", from: 0, to: 1, value, note, ...extra });
  const rows = [
    row("NCR", "Tricone through overburden, basalt and SS/SI"), row("NCR", "Reduced from HQ to NQ - Lost Core Interval"), row("NCR", "Lost Core Interval"),
    row("BMM", "Matrix supported polymict breccia with a magmatic matrix"), row("BMM", "Polymict breccia, magmatic matrix"), row("BMM", ""),
    row("IMMOQ", "Monzonite, quartz-bearing, crowded porphyritic"), row("IMMOQ", "Monzonite"), row("IMMOQ", "Pale, K-spar flooded"),
    row("XQD", "Plag phyric mafic dyke"),
    row("ICMOQ", "mod pot alt cg qtz monz. wt rounded mafic clasts"), row("ICMOQ", "med grained qzmonz, weak perv pot alt"), row("ICMOQ", "strg pot alt"), // logged abbreviations
    row("UTG", "clayey and chl-ser alt. flt gouge"), row("UTG", "rounded fault breccia associated to underlying"),
    row("VANSS", "Andesite volcanic sandstone"), row("VANSS", "Volcaniclastic, cut by a 0.3 m dyke at 23 m"), row("VANSS", "Andesite"), row("VANSS", "Andesite, chlorite"),
    row("VBX", "Volcanic breccia, polymict, andesite clasts"), // a breccia in the pile: no magmatic / hydrothermal word -> stays a unit
    { hole_id: "X", from: 0, to: 1, value: "LST" }, // no note column at all
  ];
  const m = lithologyNoteRoles(rows);
  assert.deepEqual(Object.fromEntries([...m].sort()), { bmm: "breccia", icmoq: "dyke", immoq: "dyke", ncr: "no recovery", utg: "fault", xqd: "dyke" });
  setLithologyNoteRoles(m);
  assert.equal(roleForLithology("BMM"), "breccia");
  assert.equal(roleForLithology("IMMOQ"), "dyke");
  assert.equal(roleForLithology("VANSS"), "stratigraphic");
  assert.equal(roleForLithology("VBX"), "stratigraphic");
  assert.equal(roleForLithology("FLT"), "fault", "names still come first");
  setLithologyNoteRoles(new Map());
  assert.equal(roleForLithology("BMM"), "stratigraphic");
  assert.deepEqual([...lithologyNoteRoles(null)], []);
});

test("the store registers them from the lithology layer, and Modelling codes says the roles are guesses", () => {
  assert.match(read("src/lib/store.jsx"), /useMemo\(\(\) => setLithologyNoteRoles\(lithologyNoteRoles\(layers\.litho\)\), \[layers\.litho\]\);/);
  assert.match(read("src/components/ModellingCodesPane.jsx"), /A code nothing recognises is assumed stratigraphic: check the roles before modelling\./);
});
