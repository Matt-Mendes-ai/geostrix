// TASKS.csv #4003 — the small Help and label leftovers from the card batches (#3982 / #3980):
// (1) Map layers says "Symbol size" like the interface, (2) the projected-hole caution on the section pages,
// (3) the Arabic "Scale 1 :" labels keep their colon with the 1, (4) one shared "Section window" card.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PAGES, pageById, searchPages } from "../src/help/content.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("(1) no Help page calls the outcrop symbol size a 'disc size': the interface says Symbol size", () => {
  for (const p of PAGES) assert.doesNotMatch(JSON.stringify(p), /disc size/i, p.id);
  const ml = pageById("map-layers");
  assert.ok(ml.fields.some((f) => /Symbol size/.test(f.name)));
  assert.ok(searchPages("symbol size").some((r) => (r.page || r).id === "map-layers"), "search finds it by the interface's word");
  assert.match(read("../src/components/SurfaceMappingPanel.jsx"), /tr\("Symbol size"\)/, "the label the page now names");
});

test("(2) the section pages say in view that a dashed hole is projected and carries no data", () => {
  for (const id of ["section-by-coordinates", "slice-series", "section-window"]) {
    const c = pageById(id).cautions;
    assert.equal(c.length, 1, id);
    assert.match(c[0], /dashed/); assert.match(c[0], /projected/); assert.match(c[0], /no data/);
  }
  // the message itself is still said in full, on the page it was on and on the window's card
  for (const id of ["section-by-coordinates", "section-window"]) assert.ok(pageById(id).warnings.some((w) => /projected onto the section, no data drawn here/.test(w.says)), id);
});

test("(3) in Arabic, 'Scale 1 :' and 'Typed scale 1 :' hold their colon to the 1 with a no-break space", () => {
  const ar = JSON.parse(read("../src/locales/ar.json"));
  for (const k of ["Scale 1 :", "Typed scale 1 :"]) assert.match(ar[k], /1 :$/, k);
  // the other languages keep an ordinary space
  for (const l of ["es", "pt", "fr"]) assert.equal(JSON.parse(read(`../src/locales/${l}.json`))["Scale 1 :"].endsWith("1 :"), true);
});

test("(4) the section window's settings are one card both section pages link to, said once", () => {
  const w = pageById("section-window");
  assert.ok(w.line && w.picture && w.keys.length >= 2);
  for (const id of ["section-by-coordinates", "slice-series"]) {
    const p = pageById(id);
    assert.ok(p.related.includes("section-window"), `${id} links to it`);
    assert.ok(!p.fields.some((f) => /\(section window\)/.test(f.name)), `${id}: the window's settings are not repeated`);
  }
  assert.ok(w.fields.some((f) => /^Buffer/.test(f.name)) && w.fields.some((f) => /^VE/.test(f.name)) && w.fields.some((f) => /^Plan a hole/.test(f.name)));
  assert.ok(searchPages("exaggeration").some((r) => (r.page || r).id === "section-window"), "found by search");
});
