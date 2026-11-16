// TASKS.csv #3705 — a hole renamed also renames it in the sections, planned holes and Layout text that name it; a delete drops a section's asked hole.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renameInText, renameInSections, deleteInSections, renameInPlanned, renameInLayoutPages } from "../src/lib/holeEdit.js";

test("renameInText: the id as a whole word only", () => {
  assert.equal(renameInText("Section through TU009 (az 46°)", "TU009", "TU009X"), "Section through TU009X (az 46°)");
  assert.equal(renameInText("TU009-target", "TU009", "NEW1"), "NEW1-target");
  assert.equal(renameInText("TU0091 and TU009", "TU009", "B"), "TU0091 and B");
  assert.equal(renameInText("JS77-023-1 and JS77-023", "JS77-023", "X"), "JS77-023-1 and X");
  assert.equal(renameInText("A.B (x)", "A.B", "C"), "C (x)", "regex characters in an id");
  assert.equal(renameInText("nothing here", "TU009", "B"), "nothing here");
  assert.equal(renameInText(undefined, "TU009", "B"), undefined);
});

test("sections: the name and the asked hole follow; a delete drops the asked hole; untouched sections are the same objects", () => {
  const secs = [{ id: "s1", name: "Section through TU009 (az 46°)", holeAsked: "TU009" }, { id: "s2", name: "Section 64°" }];
  const out = renameInSections(secs, "TU009", "B1");
  assert.equal(out[0].name, "Section through B1 (az 46°)");
  assert.equal(out[0].holeAsked, "B1");
  assert.equal(out[1], secs[1]);
  assert.equal(renameInSections(secs, "ZZ", "B1"), secs);
  const del = deleteInSections(secs, "TU009");
  assert.ok(!("holeAsked" in del[0]) && del[0].name === secs[0].name);
  assert.equal(deleteInSections(secs, "ZZ"), secs);
});

test("planned holes and Layout pages: names, text, titles and hole filters", () => {
  const planned = [{ id: "p1", name: "TU009-target" }, { id: "p2", name: "PLAN-2" }];
  assert.equal(renameInPlanned(planned, "TU009", "B1")[0].name, "B1-target");
  assert.equal(renameInPlanned(planned, "ZZ", "B1"), planned);
  const pages = [{ id: "g1", name: "Page 1", elements: [{ id: "e1", type: "text", text: "Hole TU009 results" }, { id: "e2", type: "table", holeFilter: "TU009, TU010" }, { id: "e3", type: "north" }] }, { id: "g2", name: "P2", elements: [{ id: "e4", type: "text", text: "no id" }] }];
  const out = renameInLayoutPages(pages, "TU009", "B1");
  assert.equal(out[0].elements[0].text, "Hole B1 results");
  assert.equal(out[0].elements[1].holeFilter, "B1, TU010");
  assert.equal(out[0].elements[2], pages[0].elements[2]);
  assert.equal(out[1], pages[1]);
  assert.equal(renameInLayoutPages(pages, "ZZ", "B1"), pages);
});

test("wiring: the store renames and deletes in them in the same step", () => {
  const st = readFileSync(new URL("../src/lib/store.jsx", import.meta.url), "utf8");
  assert.match(st, /setSections\(\(p\) => H\.renameInSections\(p, from, to\)\); setPlannedHoles\(\(p\) => H\.renameInPlanned\(p, from, to\)\); setLayoutPages\(\(p\) => H\.renameInLayoutPages\(p, from, to\)\)/);
  assert.match(st, /setSections\(\(p\) => H\.deleteInSections\(p, id\)\)/);
});
