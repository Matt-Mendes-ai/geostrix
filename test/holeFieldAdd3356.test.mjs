// TASKS.csv #3356 (#3278's follow-up) — with a collar-field pick in the Holes filter box, a second menu adds another to it ('+ Add another…'):
// values of one field join by OR, different fields by AND (#3278). A pick already in the box is greyed out; the no-value pick is not offered.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { holesForFilter } from "../src/lib/holeFilter.js";

const src = fs.readFileSync(new URL("../src/modules/viewer/HoleFilterBar.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const collars = [
  { hole_id: "A1", attrs: { type: "RC", year: "2021" } }, { hole_id: "A2", attrs: { type: "DD", year: "2021" } },
  { hole_id: "A3", attrs: { type: "AC", year: "2022" } }, { hole_id: "A4", attrs: { type: "RC", year: "2022" } },
];

test("what the added term does: one field OR, two fields AND", () => {
  const ids = (f) => holesForFilter(collars, f).holes.map((c) => c.hole_id);
  assert.deepEqual(ids("type=RC"), ["A1", "A4"]);
  assert.deepEqual(ids("type=RC type=DD"), ["A1", "A2", "A4"]);
  assert.deepEqual(ids("type=RC type=DD year=2022"), ["A4"]);
});

test("the second menu: only with a field pick in the box, appending its term; picks already there disabled; no (no value) entry", () => {
  assert.match(src, /adding = terms\.some\(\(t\) => \/\^\[\^=\]\+=\.\/\.test\(t\)\) && !holesWithoutField\(collars, filter\);/);
  assert.match(src, /\{choices\.length > 0 && adding && \( \/\* #3356 \*\/\n\s+<select value="" aria-label=\{tr\("Add a collar field pick to the filter"\)\}[^\n]*onChange=\{\(e\) => \{ if \(e\.target\.value\) setFilter\(`\$\{filter\.trim\(\)\} \$\{e\.target\.value\}`\); \}\}/);
  assert.match(src, /<option value="">\{tr\("\+ Add another…"\)\}<\/option>\n\s+\{fieldOptions\(true\)\}/);
  assert.match(src, /disabled=\{more && terms\.includes\(termOf\(ch\.key, v\)\)\}/);
  assert.match(src, /\{!more && ch\.missing > 0 && <option value=\{noValuePick\(ch\.key\)\}>/);
  // the first menu still replaces the box, as before
  assert.match(src, /onChange=\{\(e\) => \{ if \(e\.target\.value\) setFilter\(e\.target\.value\); \}\} style=\{selStyle\}>\n\s+<option value="">\{tr\("By a collar field…"\)\}<\/option>\n\s+\{fieldOptions\(false\)\}/);
});
