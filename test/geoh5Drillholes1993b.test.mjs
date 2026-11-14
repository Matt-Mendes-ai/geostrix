// TASKS.csv #1993 step 1b — drillholes from a .geoh5: collar, End of hole, Surveys, interval data (FROM / TO) and point data (DEPTH), written as plain CSV
// tables for the 3D View's own import queue. SYNTHETIC file (test/helpers/geoh5Fixture.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { geoh5FixtureBytes } from "./helpers/geoh5Fixture.mjs";
import { parseGeoh5 } from "../src/lib/geoh5.js";
import { geoh5ToProjectObjects, drillholeTables } from "../src/lib/geoh5Import.js";
const buf = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const rows = (text) => text.trim().split(/\r\n/).map((l) => l.split(","));

test("the reader: collar, surveys as the file has them, intervals from FROM / TO with their columns, points at DEPTH", async () => {
  const ws = await parseGeoh5(buf(await geoh5FixtureBytes()));
  const dh = ws.elements.find((e) => e.kind === "drillhole" && e.name === "DH-1");
  assert.deepEqual(dh.collar, [1000, 2000, 360]); assert.equal(dh.endOfHole, 120);
  assert.deepEqual(dh.surveys, [[0, 90, -60], [100, 92, -58]], "dip negative down, as geoh5 writes it");
  assert.deepEqual(dh.intervals.from, [0, 10, 40]); assert.deepEqual(dh.intervals.to, [10, 40, 120]);
  assert.deepEqual(dh.intervals.columns.Lithology, ["BAS", "AND", "BAS"]);
  assert.ok(Number.isNaN(dh.intervals.columns.Cu_ppm[1]), "the float no-data value is blank");
  assert.deepEqual(Array.from(dh.points.columns.MagSus), [0.002, 0.015], "float32 noise rounded to its 7 digits");
  assert.equal(ws.elements.find((e) => e.name === "DH-2").points, null, "no DEPTH entry: no point table");
});

test("the tables: collars, surveys, numeric intervals together, each code column apart, points", async () => {
  const r = await geoh5ToProjectObjects(buf(await geoh5FixtureBytes()), 1e6, { baseName: "My survey.geoh5" });
  assert.equal(r.drillholes, 2);
  const by = Object.fromEntries(r.drillholeTables.map((f) => [f.name, rows(f.text)]));
  assert.deepEqual(Object.keys(by), ["My_survey_geoh5_collars.csv", "My_survey_geoh5_surveys.csv", "My_survey_geoh5_interval_values.csv", "My_survey_geoh5_Lithology.csv", "My_survey_geoh5_points.csv"]);
  assert.deepEqual(by["My_survey_geoh5_collars.csv"], [["hole_id", "x", "y", "z", "azimuth", "dip", "depth"], ["DH-1", "1000", "2000", "360", "90", "-60", "120"], ["DH-2", "1050", "2010", "358", "270", "-75", "80"]]);
  assert.equal(by["My_survey_geoh5_surveys.csv"].length, 4);
  assert.deepEqual(by["My_survey_geoh5_interval_values.csv"][2], ["DH-1", "10", "40", ""]);
  assert.deepEqual(by["My_survey_geoh5_Lithology.csv"][0], ["hole_id", "from", "to", "Lithology"]);
  assert.deepEqual(by["My_survey_geoh5_points.csv"].slice(1), [["DH-1", "5", "0.002"], ["DH-1", "50", "0.015"]]);
});

test("a cell with a comma or a quote is quoted; a hole with no data is still a collar", () => {
  const t = drillholeTables([{ name: 'A,"1"', collar: [1, 2, 3], azimuth: NaN, dip: NaN, endOfHole: NaN, surveys: [], intervals: null, points: null }]);
  assert.equal(t.length, 1); assert.match(t[0].text, /^hole_id,x,y,z,azimuth,dip,depth\r\n"A,""1""",1,2,3,,,\r\n$/);
});

test("wired: the Geophysics import hands the tables to the 3D View's import queue", () => {
  const g = fs.readFileSync(new URL("../src/modules/GeophysicsModule.jsx", import.meta.url), "utf8");
  assert.match(g, /requestModuleAction\("import-dropped-files", \{ files: res\.drillholeTables\.map/);
});
