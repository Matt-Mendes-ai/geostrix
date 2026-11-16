// TASKS.csv #3415 (#3382) — the drill plan key's lines can be reworded like a legend's rows: el.keyEdits = { title, note, rows: { [the plan's own line]: text } };
// blank is no edit, an edit follows its line, and the sidebar shows the plan's own wording as the placeholder. SYNTHETIC colouring.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyKeyEdits } from "../src/lib/drillPlan.js";

const colouring = { title: "Cu grade × length, whole hole", note: "cut-off 3 % (the P90)", key: [{ label: "< 111 m × %", colour: "#9ecae1" }, { label: "111 – 192 m × %", colour: "#4292c6" }, { label: "assayed, no Cu intercept at the cut-off", colour: "#999", hollow: true }] };

test("a line takes the user's wording and keeps its colour; the others stay as the plan words them", () => {
  const e = applyKeyEdits(colouring, { title: "Copper, metre-percent", rows: { "< 111 m × %": "Low (under 111 m %)" } });
  assert.equal(e.title, "Copper, metre-percent");
  assert.deepEqual(e.key.map((k) => [k.label, k.colour]), [["Low (under 111 m %)", "#9ecae1"], ["111 – 192 m × %", "#4292c6"], ["assayed, no Cu intercept at the cut-off", "#999"]]);
  assert.equal(e.key[2].hollow, true, "the other fields of a row are kept");
  assert.equal(e.note, colouring.note);
  assert.equal(colouring.key[0].label, "< 111 m × %", "the input is not changed");
});

test("blank or whitespace is no edit; no edits is the same object; a line the plan no longer has is ignored", () => {
  assert.equal(applyKeyEdits(colouring, null), colouring);
  const blank = applyKeyEdits(colouring, { title: "  ", note: "", rows: { "< 111 m × %": "   " } });
  assert.equal(blank.title, colouring.title); assert.equal(blank.note, colouring.note); assert.equal(blank.key[0].label, "< 111 m × %");
  const gone = applyKeyEdits(colouring, { rows: { "a class that was dropped": "Anything" } });
  assert.deepEqual(gone.key.map((k) => k.label), colouring.key.map((k) => k.label));
  assert.equal(applyKeyEdits({ ...colouring, title: "", note: "" }, { title: "T", note: "N" }).title, "", "no title to edit, none made");
});

test("wired: the drawing edits its key, keeps the plan's own wording for the sidebar, and the sidebar writes el.keyEdits", () => {
  const d = fs.readFileSync(new URL("../src/components/DrillPlanElement.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(d, /const colouring0 = applyKeyEdits\(colouringRaw, el\.keyEdits\);/);
  assert.match(d, /const keyOriginal = \{ title: colouringRaw\.title \|\| "", note: colouringRaw\.note \|\| "", rows: \(colouringRaw\.key \|\| \[\]\)\.map\(\(k\) => k\.label\) \};/);
  assert.match(d, /keyBox, keyOriginal(, marks, unlabelledNote, biLabels: !!biRows)? \};/); // #3858: the intercept marks and the unlabelled note after it
  const l = fs.readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(l, /\{\(dd\.keyOriginal\.title \|\| dd\.keyOriginal\.rows\.length > 0\) && \(\(\) => \{/);
  assert.match(l, /updateSelected\(\{ keyEdits: \{ \.\.\.ke, rows: \{ \.\.\.\(ke\.rows \|\| \{\}\), \[orig\]: v \} \} \}\)/);
  assert.match(l, /updateSelected\(\{ keyEdits: null \}\)/);
});
