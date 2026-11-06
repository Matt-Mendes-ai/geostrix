// TASKS.csv #1376 — '+ New' > 'Top of McDame (explicit)' left the Unit as the surface's own name, hiding 'Add the logged tops'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guessUnitFromName } from "../src/lib/explicitUnits.js";

const units = ["Earn clastics", "McDame carbonate", "LMST", "SLST", "Basalt", "Basalt flow"];

test("'Top of X' / 'Base of X' names the unit when X matches one", () => {
  assert.deepEqual(guessUnitFromName("Top of McDame (explicit)", units), { unit: "McDame carbonate", contact: "upper" });
  assert.deepEqual(guessUnitFromName("top of lmst", units), { unit: "LMST", contact: "upper" });
  assert.deepEqual(guessUnitFromName("Base of SLST", units), { unit: "SLST", contact: "lower" });
  assert.deepEqual(guessUnitFromName("Lower contact of Earn clastics", units), { unit: "Earn clastics", contact: "lower" });
  assert.deepEqual(guessUnitFromName("Top of Basalt", units), { unit: "Basalt", contact: "upper" }); // exact beats 'Basalt flow'
});

test("no guess when the name says nothing or matches nothing / several", () => {
  assert.equal(guessUnitFromName("Fault 3", units), null);
  assert.equal(guessUnitFromName("Top of granite", units), null);
  assert.equal(guessUnitFromName("Top of Ba", ["Basalt", "Barite"]), null); // two units start with it... and neither with 'Ba '
  assert.equal(guessUnitFromName("Top of Mc", ["Mc A", "Mc B"]), null);
  assert.equal(guessUnitFromName("", units), null);
});

test("+ New uses it", () => {
  const s = readFileSync(new URL("../src/components/ExplicitSurfacePanel.jsx", import.meta.url), "utf8");
  assert.match(s, /const guess = guessUnitFromName\(n, \[\.\.\.defs\.map\(unitOf\), \.\.\.\(unitChoices \|\| \[\]\), \.\.\.loggedUnits\]\);/);
  assert.match(s, /\.\.\.\(guess \? \{ unit: guess\.unit, contact: guess\.contact \} : \{\}\)/);
});
