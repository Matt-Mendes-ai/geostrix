// TASKS.csv #1971 — Mine Design panes say what they do today: Pit design has a ramp and sector slopes, Drifts and ramps a profile
// and a solid of the opening; Dump reports the tonnes it holds (not "loose tonnes"); no always-null metalFactor
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (f) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");

test("#1971 no pane describes its own features as missing", () => {
  const pit = read("PitDesignPane.jsx"), lines = read("DesignLinesPane.jsx"), dump = read("DumpPane.jsx");
  assert.doesNotMatch(pit, /no ramp, no slope by sector/i);
  assert.doesNotMatch(pit, /It has no ramp/);
  assert.doesNotMatch(pit, /const metalFactor|, metalFactor }/);
  assert.match(pit, /A ramp, and a face angle and berm per wall sector, can be added/);
  assert.doesNotMatch(lines, /with no profile, ventilation or geotechnical check/);
  assert.doesNotMatch(dump, /Loose tonnes/);
  assert.match(dump, /tr\("Tonnes it holds"\)/);
});

test("#1971 Nested pits lets the user pick the shell whose inputs the series takes", () => {
  const nested = read("NestedPitsPane.jsx"), pit = read("PitDesignPane.jsx");
  assert.match(nested, /pitChoices\.length > 1 &&/);
  assert.match(nested, /aria-label=\{tr\("Pit shell whose inputs the series takes"\)\}/);
  assert.match(nested, /pitChoices\.find\(\(s\) => s\.id === pitId\) \|\| pitChoices\[pitChoices\.length - 1\]/);
  assert.doesNotMatch(nested + pit, /run one above first/);
});
