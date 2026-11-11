// TASKS.csv #2140 — scale bars print '5 km', not '5000 m', and label the half-way tick; #2143 — Insert > Logo selects the new logo;
// #2138 — the plain north arrow says GN (every Layout map is in the project grid)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scaleBarLabel, scaleBarMidLabel } from "../src/lib/scaleBarLabel.js";

const m = readFileSync(new URL("../src/modules/LayoutModule.jsx", import.meta.url), "utf8");

test("#2140 — kilometres from 1 km, separators, and the half-way label", () => {
  assert.equal(scaleBarLabel(20000), "20 km");
  assert.equal(scaleBarLabel(5000), "5 km");
  assert.equal(scaleBarLabel(1000), "1 km");
  assert.equal(scaleBarLabel(2500), "2.5 km");
  assert.equal(scaleBarLabel(250), "250 m");
  assert.equal(scaleBarLabel(100), "100 m");
  assert.equal(scaleBarLabel(1500000), "1,500 km");
  assert.equal(scaleBarMidLabel(5000, 378), "2.5"); // '0  2.5  5 km'
  assert.equal(scaleBarMidLabel(1000, 76), "500 m"); // the half is in metres, so it keeps its unit
  assert.equal(scaleBarMidLabel(200, 50), null); // too short a bar for a third label
  assert.match(m, /\{scaleBarLabel\(el\.meters \|\| 100\)/);
  assert.doesNotMatch(m, />\{el\.meters\} m<\/text>/);
});

test("#2143 — the logo is selected once it is added", () => {
  assert.match(m, /reader\.onload = \(\) => \{ const id = `logo_\$\{Date\.now\(\)\}`; setElements\([^\n]*setSelected\(id\);/);
});

test("#2138 — the plain arrow is labelled GN, and the sidebar says grid north", () => {
  assert.match(m, /fontFamily="'Exo 2', system-ui, sans-serif">GN<\/text>/);
  assert.match(m, /Follows its view's grid north \(GN\)\./);
});
