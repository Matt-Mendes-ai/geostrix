// TASKS.csv #1188 named dropdowns; #1193 a line says which surface it is for; #1182 the guessed elevation
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("#1188 the dropdowns the review found unnamed have names", () => {
  assert.match(read("src/App.jsx"), /<select aria-label=\{tr\("Desurvey method"\)\}/);
  assert.match(read("src/modules/ViewerModule.jsx"), /<select aria-label=\{tr\("Hole labels"\)\}/);
  assert.match(read("src/modules/GeochemModule.jsx"), /<select aria-label=\{tr\("Diagram"\)\}/);
  assert.match(read("src/components/ImportMappingModal.jsx"), /<select aria-label=\{tr\(f\.label\)\}/);
});

test("#1193 a line for the logged unit does not feed the surface of that name, and old lines still do", () => {
  const src = read("src/lib/explicitSurface.js");
  assert.match(src, /c\.target === "unit"/);
  assert.match(read("src/modules/viewer/modellingRuns.js"), /c\.target === "explicit"/);
  const win = read("src/components/SectionWindow.jsx");
  assert.match(win, /value=\{`e:\$\{u\}`\}/);
  assert.match(win, /unit: pickName, \.\.\.\(tagExplicit\.includes\(pickName\) \? \{ target:/);
});

test("#1182 a picked elevation with no terrain is flagged", () => {
  assert.match(read("src/components/PlannedHoleParts.jsx"), /noTerrain && pickedPoint/);
  assert.match(read("src/modules/ViewerModule.jsx"), /noTerrain=\{!terrain\}/);
});
