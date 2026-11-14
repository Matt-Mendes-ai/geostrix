// TASKS.csv #3210 (#3195, Galore Creek) — a soil log was guessed as Specific gravity from its 'Relative Density (for non cohesive soils)' column of
// words ('Very Dense', 'N/A') and loaded 0 of 374 rows; its overlap hint named 'Dry Strength = M' as what may mark the out-of-date rows.
// Synthetic table with the same column-name pattern.
import { test } from "node:test";
import assert from "node:assert/strict";
import { guessTargetFor, valueColumnIsWords } from "../src/lib/layers.js";
import { overlapSummary } from "../src/lib/importRowFilter.js";

const H = ["HOLE_ID", "FROM", "TO", "Relative Density (for non cohesive soils)", "Dry Strength", "Moisture"];
const words = ["Very Dense", "Dense", "Loose", "N/A", "Medium Dense"];
const rows = Array.from({ length: 40 }, (_, i) => ({ HOLE_ID: "SY-" + (i % 4), FROM: String(i), TO: String(i + 1), "Relative Density (for non cohesive soils)": words[i % 5], "Dry Strength": ["L", "M", "H"][i % 3], Moisture: "moist" }));

test("a numeric kind is not guessed from a value column of words", () => {
  assert.equal(guessTargetFor(H, "soil_log.csv"), "sg", "the headers alone still say density (no rows to look at)");
  assert.equal(valueColumnIsWords("sg", H, rows), true);
  assert.equal(guessTargetFor(H, "soil_log.csv", rows), "custom", "with the rows: a custom layer, which asks for its value");
  const numeric = rows.map((r, i) => ({ ...r, "Relative Density (for non cohesive soils)": String(1.8 + (i % 5) / 10) }));
  assert.equal(guessTargetFor(H, "soil_log.csv", numeric), "sg", "numbers keep Specific gravity");
  const sg = [{ HOLE_ID: "A", FROM: "0", TO: "1", SG: "2.71" }, { HOLE_ID: "A", FROM: "1", TO: "2", SG: "<2" }, { HOLE_ID: "A", FROM: "2", TO: "3", SG: "N/A" }];
  assert.equal(guessTargetFor(["HOLE_ID", "FROM", "TO", "SG"], "sg.csv", sg), "sg", "a few words among numbers do not change it");
  assert.equal(valueColumnIsWords("litho", H, rows), false, "a code layer is not affected");
});

test("the overlap hint names a column only when its name or its values read as a flag", () => {
  const cols = { hole: "HOLE_ID", from: "FROM", to: "TO" };
  // 12 overlapping re-logged rows, all Dry Strength = M; 30 clean rows of L / H
  const base = Array.from({ length: 30 }, (_, i) => ({ HOLE_ID: "SY-" + (i % 3), FROM: String(Math.floor(i / 3)), TO: String(Math.floor(i / 3) + 1), "Dry Strength": i % 2 ? "L" : "H", Current: "Y" }));
  const over = Array.from({ length: 12 }, (_, i) => ({ HOLE_ID: "SY-" + (i % 3), FROM: String(Math.floor(i / 3) + 0.5), TO: String(Math.floor(i / 3) + 1.5), "Dry Strength": "M", Current: "Y" }));
  const o1 = overlapSummary([...base, ...over], cols, ["HOLE_ID", "FROM", "TO", "Dry Strength", "Current"]);
  assert.ok(o1.n > 0); assert.equal(o1.col, null, "a soil property is not a version flag");
  const flagged = [...base, ...over.map((r) => ({ ...r, Current: "N" }))];
  const o2 = overlapSummary(flagged, cols, ["HOLE_ID", "FROM", "TO", "Dry Strength", "Current"]);
  assert.equal(o2.col, "Current"); assert.equal(o2.value, "N");
  const relog = [...base.map((r) => ({ ...r, Pass: "original" })), ...over.map((r) => ({ ...r, Pass: "relogged" }))];
  assert.equal(overlapSummary(relog, cols, ["HOLE_ID", "FROM", "TO", "Dry Strength", "Pass"]).col, "Pass", "flag-like values under any name");
});
