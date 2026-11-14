// TASKS.csv #3206 (#3195, Galore Creek) — a lithology import made one interval's free-text note the meaning of a code for the whole project
// (a code logged once with a 30-word note; an overburden code with 'Sonic hole; … intersected.'). A note column (most texts different) gives a
// code a meaning only when the same text repeats on most of its rows; a legend column (the same text per code) still fills the dictionary.
// Synthetic logs only.
import test from "node:test";
import assert from "node:assert/strict";
import { fillFromRows, descriptionsAreFreeText } from "../src/lib/codeDictionary.js";

const row = (value, description) => ({ hole_id: "H1", from: 0, to: 1, value, description });
// a logged note on each interval: 40 rows, every note different; NR repeats 'no core recovered'; OVB and V9 are logged once
const notes = [
  ...Array.from({ length: 30 }, (_, i) => row(["AND", "BAS", "DAC"][i % 3], `interval ${i}: grey, fine grained, ${i % 2 ? "chloritized" : "weakly veined"}; contact at ${i}.4 m`)),
  row("NR", "no core recovered"), row("NR", "no core recovered"), row("NR", "no core recovered"),
  row("OVB", "Sonic hole; OVB intersected."),
  row("V9", "Fragmental with lithic fragments?; chloritized biotite; altered and weathered-out mafics; fragmental phenocrysts;"),
  ...Array.from({ length: 5 }, (_, i) => row("AND", `andesite, note ${i}`)),
];

test("a note column: only a text that repeats on most of a code's rows becomes its meaning", () => {
  assert.equal(descriptionsAreFreeText(notes), true);
  const r = fillFromRows({}, notes);
  assert.deepEqual(Object.keys(r.dict), ["nr"]);
  assert.equal(r.dict.nr.desc, "no core recovered");
  assert.equal(r.dict.ovb, undefined, "logged once: an interval's note, not the code's meaning");
  assert.equal(r.dict.v9, undefined);
});

test("a legend column (the same text per code, joined into the log) fills every code, including one logged once", () => {
  const legend = [...Array.from({ length: 25 }, (_, i) => row(["AND", "BAS", "DAC", "TUF"][i % 4], ["Andesite", "Basalt", "Dacite", "Tuff"][i % 4])), row("OVB", "Overburden")];
  assert.equal(descriptionsAreFreeText(legend), false);
  const r = fillFromRows({}, legend);
  assert.deepEqual(Object.fromEntries(Object.entries(r.dict).map(([k, v]) => [k, v.desc])), { and: "Andesite", bas: "Basalt", dac: "Dacite", tuf: "Tuff", ovb: "Overburden" });
});

test("too few described rows to judge: the earlier rule stands", () => {
  assert.equal(descriptionsAreFreeText([row("SA", "Saprolite"), row("Q", "vein a"), row("Q", "vein b")]), false);
});
