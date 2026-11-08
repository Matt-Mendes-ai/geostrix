// TASKS.csv #1691 — the explicit-surface picker counts the section lines the build uses, not only lines drawn on section images.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sectionLinesOf, explicitPoints } from "../src/lib/explicitSurface.js";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const pt = (x, z) => ({ x, y: 0, z });
const def = { name: "Base of overburden", picks: [{ x: 0, y: 0, z: -5 }, { x: 50, y: 0, z: -6 }, { x: 0, y: 50, z: -4 }] };
const sections = [
  { name: "S1", contacts: [
    { unit: "Base of overburden", points: [pt(0, -5), pt(20, -6), pt(40, -7)] },              // a hard line
    { unit: "Base of overburden", target: "unit", points: [pt(0, -9), pt(10, -9)] },          // a unit outline, not this surface
    { unit: "Base of overburden", isUpperContact: false, points: [pt(0, -3), pt(10, -3)] },   // a lower contact
    { unit: "Volcanic host", points: [pt(0, -50), pt(10, -50)] },                              // another surface
  ] },
  { name: "S2", contacts: [{ unit: "Base of overburden", kind: "fault", points: [pt(0, -1), pt(9, -1)] }] },
];

test("sectionLinesOf keeps only this surface's contact lines, the same ones explicitPoints builds through", () => {
  const l = sectionLinesOf(def, sections);
  assert.equal(l.length, 1);
  assert.equal(l[0].section, "S1");
  assert.equal(explicitPoints(def, sections).lines, l.length);
  assert.deepEqual(sectionLinesOf(def, []), []);
  assert.deepEqual(sectionLinesOf(null, sections), []);
});

test("the picker label adds the section lines to the lines drawn on images", () => {
  const c = read("src/components/ExplicitSurfacePanel.jsx");
  assert.match(c, /const l = \(d\.lines \|\| \[\]\)\.length \+ sectionLinesOf\(d, sections\)\.length;/);
  assert.match(c, /l === 1 \? "\{p\} picks, \{l\} line" : "\{p\} picks, \{l\} lines"/); // a singular for "1 line"
  assert.match(read("src/lib/explicitSurface.js"), /const lines = sectionLinesOf\(def, sections\);/);
});
