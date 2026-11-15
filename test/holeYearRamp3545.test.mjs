// TASKS.csv #3545 (#3538, Fireweed rehearsal, Macpass) — 'Colour holes by' a numeric collar field (a year) as a ramp, and an all-integer year column
// stored as a number at import.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { holeColourScheme, holeColourLegendGroup, NO_VALUE_COLOUR } from "../src/lib/viewer/holeColours.js";
import { yearAttrKeys, yearsAsNumbers } from "../src/lib/collarYear.js";

const years = [1966, 1975, 1980, 1990, 2006, 2014, 2018, 2023];
const collars = years.map((y, i) => ({ hole_id: `H${i}`, attrs: { year: String(y), type: i % 2 ? "DD" : "RC" } })).concat([{ hole_id: "X", attrs: { type: "DD" } }]);

test("six or more numbers: a ramp from the smallest to the largest, the oldest and the newest at its ends", () => {
  const s = holeColourScheme(collars, "year");
  assert.deepEqual(s.ramp, { min: 1966, max: 2023 });
  const hexOf = (y) => s.items.find(([v]) => v === String(y))[1];
  assert.notEqual(hexOf(1966), hexOf(2023));
  assert.match(hexOf(1980), /^#[0-9a-f]{6}$/);
  assert.equal(s.colourOf({ attrs: { year: "1966" } }), hexOf(1966));
  assert.equal(s.colourOf({ attrs: { year: 1966 } }), hexOf(1966), "a year stored as a number");
  assert.equal(s.colourOf({ attrs: {} }), NO_VALUE_COLOUR);
  const g = holeColourLegendGroup(s, "Holes by year", "(no value)");
  assert.equal(g.ramp.kind, "ramp");
  assert.deepEqual([g.ramp.minLabel, g.ramp.maxLabel, g.ramp.colors.length], ["1966", "2023", 17]);
  assert.deepEqual(g.items, [["(no value) (1)", NO_VALUE_COLOUR]]);
});

test("text, or fewer than six numbers, stays classes", () => {
  assert.equal(holeColourScheme(collars, "type").ramp, null);
  const few = years.slice(0, 4).map((y, i) => ({ hole_id: `F${i}`, attrs: { year: String(y) } }));
  assert.equal(holeColourScheme(few, "year").ramp, null);
  assert.ok(!holeColourLegendGroup(holeColourScheme(few, "year"), "Holes by year", "(no value)").ramp);
});

test("a year field of whole years is stored as a number; any other value keeps the column as text", () => {
  const rows = [{ attrs: { year: "2019", drill_year: "2020", "ENDDATE year": "2021", yearly_cost: "2019", status: "2019" } }, { attrs: { year: "", drill_year: "2021?", "ENDDATE year": "2022" } }, { x: 1 }];
  assert.deepEqual(yearAttrKeys(rows).sort(), ["ENDDATE year", "year"]);
  const out = yearsAsNumbers(rows);
  assert.deepEqual(out[0].attrs, { year: 2019, drill_year: "2020", "ENDDATE year": 2021, yearly_cost: "2019", status: "2019" });
  assert.deepEqual(out[1].attrs, { year: "", drill_year: "2021?", "ENDDATE year": 2022 });
  assert.equal(out[2], rows[2]);
  assert.equal(yearsAsNumbers([{ attrs: { year: "1650" } }])[0].attrs.year, "1650", "not a drilling year");
  const s = readFileSync(new URL("../src/modules/viewer/importPipelineImpl.js", import.meta.url), "utf8");
  assert.match(s, /rows = yearsAsNumbers\(rows\); \/\/ TASKS\.csv #3545/);
});
