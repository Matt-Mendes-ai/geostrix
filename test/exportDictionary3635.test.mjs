// TASKS.csv #3635 (follow-up of #3613) — the drillhole tables zip names every collar column: collars_fields.csv (meaning, type, holes with a value, an example), beside collars.csv and provenance.txt.
// TASKS.csv #3639 — the tool panes that make a surface or a block model carry an 'Export' line in their Help page. SYNTHETIC holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { drillholeTableFiles } from "../src/lib/drillholeTables.js";
import { pageById } from "../src/help/content.js";

test("collars_fields.csv lists each collar column with its type and fill", () => {
  const collars = [{ hole_id: "A", x: 1, y: 2, z: 3, azimuth: 90, dip: 60, length: 100, attrs: { year: 2023, prospect: "North" } }, { hole_id: "B", x: 4, y: 5, z: 6, length: 50, attrs: { year: 2024 } }];
  const files = drillholeTableFiles({ collars, survey: [], epsg: 26909, version: "x" });
  const f = files.find((x) => x.name === "collars_fields.csv"); assert.ok(f);
  const lines = f.text.trim().split(/\r?\n/), head = lines[0].split(",");
  assert.deepEqual(head, ["field", "meaning", "type", "holes_with_a_value", "holes", "distinct_values", "example"]);
  const by = Object.fromEntries(lines.slice(1).map((l) => [l.split(",")[0], l]));
  assert.match(by.year, /,number,2,2,2,2023$/); assert.match(by.prospect, /,text,1,2,1,North$/); assert.match(by.epsg, /EPSG code/);
  assert.match(files.find((x) => x.name === "provenance.txt").text, /collars_fields\.csv/);
});
test("the tool panes that make a surface or a block model say where the export is", () => {
  for (const id of ["grade-shell", "implicit-surface", "pit-shell", "stope-outlines", "dump-stockpile", "grade-estimation", "block-calculator"]) {
    const f = pageById(id).fields.find((x) => x.name === "Export"); assert.ok(f, id); assert.match(f.choose, /Export: what goes where/, id);
  }
});
