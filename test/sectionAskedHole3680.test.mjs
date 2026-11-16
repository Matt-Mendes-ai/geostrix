// TASKS.csv #3680 — 'Section through' a hole unchecked in the Holes list draws it (asked for by name), says so, and a section with no holes names the unchecked ones.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const vm = readFileSync(new URL("../src/modules/ViewerModule.jsx", import.meta.url), "utf8");
const sw = readFileSync(new URL("../src/components/SectionWindow.jsx", import.meta.url), "utf8");

test("the band filter keeps the hole asked for by name although it is unchecked", () => {
  assert.match(vm, /\(visibleHoles\[t\.hole_id\] !== false \|\| t\.hole_id === scope\.holeAsked/);
});

test("openHoleSection: an unchecked hole makes a section that remembers it, and a notice says why", () => {
  assert.match(vm, /const unchecked = visibleHolesRef\.current\[holeId\] === false;/);
  assert.match(vm, /openDefinedSection\(g, `Section through \$\{holeId\} \(az \$\{g\.azimuth\.toFixed\(0\)\}°\)`, unchecked \? \{ holeAsked: holeId \} : null\)/);
  assert.match(vm, /notice\("\{holeId\} is not checked in the Holes list; it is drawn in this section because you asked for it by name\."/);
});

test("Refresh and the same line again keep the asked hole; the payload carries the unchecked count", () => {
  assert.match(vm, /s\.holeAsked \? \{ \.\.\.\(s\.scope \|\| \{\}\), holeAsked: s\.holeAsked \} : \(s\.scope \|\| \{\}\)/);
  assert.match(vm, /hiddenHoleCount: Object\.values\(visibleHoles\)\.filter\(\(v\) => v === false\)\.length/);
  assert.match(vm, /extra\?\.holeAsked && same\.holeAsked !== extra\.holeAsked/);
});

test("the section window says why it has no holes when some are unchecked", () => {
  assert.match(sw, /!\(data\.holes\?\.length > 0\) && data\.hiddenHoleCount > 0/);
  assert.match(sw, /No hole is drawn: \{n\} hole is unchecked in the Holes list/);
  assert.match(sw, /No hole is drawn: \{n\} holes are unchecked in the Holes list/);
});
