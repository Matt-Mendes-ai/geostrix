// TASKS.csv #3340 (Galore Creek review) — DH_AREA (18 areas) could not colour the Maps plan: the menu silently left out any text field with
// more than 16 values. Up to 40 it is offered (the commonest 15 coloured, the rest one 'other' class); a field with more is named as left out.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collarColourFields, collarFieldsLeftOut, collarColouring } from "../src/lib/collarMapStyle.js";

const cs = [];
for (let i = 0; i < 70; i++) cs.push({ hole_id: `H${i}`, x: i, y: 0, attrs: { DH_AREA: `Area ${i % 18}`, NOTE: `n${i % 50}`, LOGGED: `2023-01-${i}`, TYPE: i % 2 ? "DD" : "RC" } });

test("an 18-value field is offered and coloured: 15 classes and 'other'", () => {
  const f = collarColourFields(cs);
  assert.deepEqual(f.map((x) => [x.key, !!x.grouped]), [["DH_AREA", true], ["TYPE", false]]);
  assert.equal(f[0].values, 18);
  const c = collarColouring(cs, { field: "DH_AREA" });
  assert.equal(c.grouped, true);
  assert.equal(c.legend.length, 16);
  const other = c.legend[15];
  assert.equal(other.other.length, 3);
  assert.equal(other.holes, 70 - c.legend.slice(0, 15).reduce((n, l) => n + Number(l.label.match(/\((\d+)\)$/)[1]), 0));
  assert.ok(cs.every((h) => c.colourOf(h))); // every hole has a colour, 'other' included
  assert.equal(collarColouring(cs, { field: "TYPE" }).grouped, false);
});

test("a field with too many values is named as left out; an id-like field (a different value on every hole) is not", () => {
  assert.deepEqual(collarFieldsLeftOut(cs), [{ key: "NOTE", values: 50 }]);
});

test("the menu lists the left-out fields, disabled, and words the 'other' class", () => {
  const src = readFileSync(new URL("../src/components/MapsPlanView.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(src, /optgroup label=\{tr\("Too many values to colour by"\)\}/);
  assert.match(src, /<option key=\{f\.key\} disabled value="">/);
  assert.match(src, /tr\("Other: \{n\} values \(\{holes\} holes\)"/);
});
