// TASKS.csv #2086 (review #2013, Woodjam) — Model from map counted every collar as a logged hole ('544 holes', 8 logged) and left Build
// disabled with one stratigraphic unit without a word
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const m = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");

test("the logged-contacts tick counts the holes with a lithology log, and says of how many", () => {
  assert.match(m, /const loggedHoles = useMemo\(\(\) => new Set\(\(lithoRows \|\| \[\]\)\.map\(\(r\) => r\.hole_id\)\)\.size, \[lithoRows\]\);/);
  assert.match(m, /loggedHoles < holeCount \? tr\("Use the drillholes' logged contacts \(\{n\} of the \{m\} holes have a lithology log\)"/);
});

test("a disabled Build says why when fewer than two units are stratigraphic", () => {
  assert.match(m, /\{groundAt && order\.length < 2 && !busy && <div role="status"/);
  assert.match(m, /Only one unit \(\{unit\}\) is in the stratigraphic role/);
  assert.match(m, /disabled=\{busy \|\| !groundAt \|\| order\.length < 2 \|\| noOrient\}/); // the condition the note explains
});
