// TASKS.csv #2053 (review #2013, Woodjam) — Model from map with no map said 'the 544 drillhole(s) are not used' though, since #1718,
// the tool matches the logged holes to the map's units once a map is loaded (10 of the 544 had a trace, 8 a log); Model settings'
// Model area counted 544 of 544. The note says what the tool does with the logged holes, and Model area says how many have a trace.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("the no-map note names the logged holes the tool will use", () => {
  const m = readFileSync(new URL("../src/components/MapModelPanel.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(m, /the \{n\} drillhole\(s\) are not used/);
  assert.match(m, /loggedHoles > 0 \/\* TASKS\.csv #2053[^\n]*\n\s*\? tr\("Once a geological map with unit polygons is loaded, the \{n\} drillhole\(s\) with a lithology log \(of \{m\}\) can be matched to its units here/);
  assert.match(m, /: tr\("None of the \{m\} drillhole\(s\) has a lithology log, so this tool builds from the map and the outcrop measurements only\.", \{ m: holeCount \}\)/);
});

test("Model area says how many of the holes have a trace", () => {
  const p = readFileSync(new URL("../src/modules/viewer/ModellingPanes.jsx", import.meta.url), "utf8");
  assert.match(p, /const tracedHoles = useMemo\(\(\) => new Set\(\(tracesRef\?\.current \|\| \[\]\)\.filter\(\(t\) => t\?\.pts\?\.length >= 2\)\.map\(\(t\) => t\.hole_id\)\)\.size, \[tracesSeq\]\);/);
  assert.match(p, /tracedHoles < checkedHoleCount\(collars, visibleHoles\)\.all/);
  assert.match(p, /"Holes checked in the Holes list \(\{n\} of \{m\}; \{t\} of the holes have a trace\)"/);
});
