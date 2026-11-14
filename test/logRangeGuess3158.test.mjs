// TASKS.csv #3158 (from #3041) — a valid range per log channel offered from the physical bounds of the unit the column name states (#2953's),
// never preset: the boxes stay blank until it is clicked, and nothing is offered when the unit is not in the name.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { rangeGuessFor, implausibleReadings } from "../src/lib/logUnits.js";

test("the bounds are the unit's physical ones, the same as the import check's", () => {
  assert.deepEqual(rangeGuessFor("g/cc"), { min: 1, max: 5 });
  assert.deepEqual(rangeGuessFor("kg/m³"), { min: 1000, max: 5000 });
  assert.deepEqual(rangeGuessFor("cps"), { min: 0, max: null });
  assert.deepEqual(rangeGuessFor("API"), { min: 0, max: null });
  for (const u of ["", null, "SI", "ohm·m", "ppm"]) assert.equal(rangeGuessFor(u), null, String(u));
  assert.equal(implausibleReadings([0.5, 2.6, 7], "g/cc").n, 2, "#2953's check agrees: 0.5 and 7 are outside 1-5");
});

test("the box offers it only for a unit read from the column name, and only while both boxes are blank", () => {
  const s = fs.readFileSync(new URL("../src/components/LogChannelsBox.jsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(s, /const g = c\.unit \? rangeGuessFor\(c\.unit\) : null, r = modal\.logRanges\?\.\[c\.col\];/);
  assert.match(s, /if \(!g \|\| \(r && \(\(r\.min \?\? ""\) !== "" \|\| \(r\.max \?\? ""\) !== ""\)\)\) return null;/);
  assert.match(s, /value=\{modal\.logRanges\?\.\[c\.col\]\?\.\[k\] \?\? ""\}/, "the boxes themselves are still blank by default");
});
