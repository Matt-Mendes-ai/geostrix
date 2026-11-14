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

// TASKS.csv #3351 — a date kept as an Excel serial is not offered as a number, and number classes carry their hole counts
import { looksLikeDateSerials } from "../src/lib/collarMapStyle.js";
test("serial dates are left out of the colour menu; numeric legends count their holes and the unassayed", () => {
  assert.equal(looksLikeDateSerials("STARTDATE", ["45079", "45109", 45131]), true);
  assert.equal(looksLikeDateSerials("DEPTH", ["45079", "45109"]), false); // not named for a date
  assert.equal(looksLikeDateSerials("STARTDATE", ["45079", "2023-05-01"]), false);
  const cs2 = Array.from({ length: 40 }, (_, i) => ({ hole_id: `H${i}`, x: i, y: 0, attrs: { STARTDATE: String(45079 + i), DEPTH_M: String(50 + i * 3) } }));
  assert.deepEqual(collarColourFields(cs2).map((f) => f.key), ["DEPTH_M"]);
  const holes = cs2.slice(0, 10), vals = new Map(holes.slice(0, 8).map((c, i) => [c.hole_id, i * 10]));
  const c = collarColouring(holes, { values: vals });
  assert.equal(c.noValue, 2);
  assert.equal(c.legend.reduce((n, l) => n + Number(l.label.match(/\((\d+)\)$/)[1]), 0), 8);
});

// TASKS.csv #3050 — class breaks typed by the geologist
import { parseBreaks } from "../src/lib/collarMapStyle.js";
test("typed breaks: 50, 55, 60 % Fe make four classes with counts", () => {
  assert.deepEqual(parseBreaks("60, 50; 55 55 x"), [50, 55, 60]);
  assert.deepEqual(parseBreaks(""), []);
  const holes = Array.from({ length: 12 }, (_, i) => ({ hole_id: `F${i}`, x: i, y: 0 }));
  const vals = new Map(holes.map((h, i) => [h.hole_id, 45 + i * 1.5])); // 45 ... 61.5
  const c = collarColouring(holes, { values: vals, breaks: [50, 55, 60] });
  assert.equal(c.legend.length, 4);
  assert.deepEqual(c.legend.map((l) => Number(l.label.match(/\((\d+)\)$/)[1])), [4, 3, 4, 1]); // up to 50: 45 ... 49.5; to 55: 51, 52.5, 54; to 60: 55.5 ... 60; over 60: 61.5
});
