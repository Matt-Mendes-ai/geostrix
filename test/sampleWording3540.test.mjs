// TASKS.csv #3540 — the Macpass card said 'a zinc-lead-silver prospect' for a file with 14 prospects on 7 properties and 'their bulk density' for 32,498 of 32,546 intervals, and the File menu listed
// the sample twelfth of fifteen while the cards put it second. The two phrases name the project and the count; the menu follows the cards' ranked list.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SAMPLE_RANK, sampleCardsFor, sampleFootnote } from "../src/lib/sampleCards.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("the card and the footnote name the Macpass project and the 32,498 densities, not 'a prospect' and 'their bulk density'", () => {
  const card = sampleCardsFor("drillhole").find((c) => c.id === "yk_macpass");
  assert.match(card.title, /drilling of the Macpass project in east Yukon \(1952-2023\): 559 holes with down-hole surveys, 32,546 sampled intervals \(Ag, Pb, Zn\) and 32,498 bulk densities/);
  assert.match(sampleFootnote(), /559 holes drilled 1952-2023 on the Macpass project, with down-hole surveys, 32,546 sampled intervals \(Ag, Pb, Zn\) and 32,498 bulk densities/);
  for (const t of [card.title, sampleFootnote()]) { assert.doesNotMatch(t, /zinc-lead-silver prospect/); assert.doesNotMatch(t, /their bulk density/); }
});

test("the File > Open Sample Project menu lists the samples in the cards' order (SAMPLE_RANK)", () => {
  const m = read("../electron/main.js");
  const a = m.indexOf('{ label: L("Open Sample Project"), submenu:'), b = m.indexOf("])((() => { try { return sampleStatus();", a);
  const ids = [...m.slice(a, b).matchAll(/"menu", "sample:(\w+)"/g)].map((x) => x[1]);
  const asRank = (id) => (id === "blake" ? "blake" : id);
  assert.deepEqual(ids.map(asRank), SAMPLE_RANK, "same ids, same order");
  assert.equal(ids.indexOf("yk_macpass"), 1, "second, as on the cards");
});

test("the changed sentences are in every language", () => {
  for (const lang of ["es", "pt", "fr", "ar"]) {
    const d = JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["Macpass (Fireweed Metals Corp., Yukon): 559 holes drilled 1952-2023 on the Macpass project, with down-hole surveys, 32,546 sampled intervals (Ag, Pb, Zn) and 32,498 bulk densities — nothing synthesized."]) assert.ok(d[k], `${lang}`);
  }
});
