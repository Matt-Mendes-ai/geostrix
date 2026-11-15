// TASKS.csv #3623 (Fireweed rehearsal) — Macpass's 559 collars carry no azimuth / dip (the attitude is in the survey): the collar table read 'NaN', and the report CSV, the intercepts CSV and the
// collar exports left both columns empty. Now a blank cell for 'no value', and the first survey station's attitude, marked as such, wherever the collar has none. SYNTHETIC holes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { collarsWithFirstStation, attFromText } from "../src/lib/collarAttrExport.js";
import { collarTableRows, drillholeTableFiles } from "../src/lib/drillholeTables.js";
import { projectReportRows } from "../src/lib/analysisExports.js";
import { interceptLocations } from "../src/lib/interceptLocation.js";
import { buildVectorFeatures } from "../src/lib/viewer/vectorFeatures.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const collars = [{ hole_id: "A", x: 1, y: 2, z: 3, length: 100 }, { hole_id: "B", x: 4, y: 5, z: 6, length: 50, azimuth: 10, dip: 60 }, { hole_id: "C", x: 7, y: 8, z: 9, length: 10 }];
// dips are stored positive down
const survey = [{ hole_id: "A", depth: 30, azimuth: 91, dip: 55 }, { hole_id: "A", depth: 0, azimuth: 90, dip: 60 }, { hole_id: "B", depth: 0, azimuth: 99, dip: 20 }];

test("the first (shallowest) station fills what the collar lacks; a value the collar has stays; nothing changes in the input", () => {
  const out = collarsWithFirstStation(collars, survey);
  assert.deepEqual([out[0].azimuth, out[0].dip, out[0]._attFrom], [90, 60, "azimuth and dip"]);
  assert.deepEqual([out[1].azimuth, out[1].dip, out[1]._attFrom], [10, 60, undefined]);
  assert.equal(out[2], collars[2]); assert.equal(collars[0].azimuth, undefined);
  assert.equal(attFromText(out[0]), "first survey station: azimuth and dip"); assert.equal(attFromText(out[1]), "");
});

test("collars.csv, the report, the intercepts and the collar features carry it, marked", () => {
  const rows = collarTableRows(collarsWithFirstStation(collars, survey));
  assert.deepEqual([rows[0].azim_grid, rows[0].dip, rows[0].attitude_from], [90, -60, "first survey station: azimuth and dip"]);
  assert.equal(rows[2].azim_grid, "");
  const files = drillholeTableFiles({ collars, survey, epsg: 26909 });
  assert.match(files.find((f) => f.name === "collars.csv").text.split(/\r?\n/)[1], /A,1,2,3,90,-60,100/);
  const rep = projectReportRows({ project: {}, collars, survey, surfaceSampleCount: 0, report: { totalMetres: 0, layerCounts: [], assayStats: [], surfaceStats: [], mediumCounts: {}, qaqcExcluded: 0 }, generated: "x" });
  const at = rep.findIndex((r) => r[0] === "hole_id");
  assert.deepEqual(rep[at], ["hole_id", "x", "y", "z", "azimuth", "dip", "length", "attitude_from"]); assert.equal(rep[at + 1][4], 90); assert.equal(rep[at + 1][5], -60);
  const loc = interceptLocations([{ hole_id: "A", from: 0, to: 1 }], collars, survey)({ hole_id: "A", from: 0, to: 1 });
  assert.deepEqual([loc.azimuth_grid, loc.dip, loc.attitude_from], [90, -60, "first survey station: azimuth and dip"]);
  const f = buildVectorFeatures("collars", null, { collars, survey, epsg: null }).features;
  assert.equal(f[0].attributes.azim_grid, 90); assert.equal(f[0].attributes.att_from, "first survey station: azimuth and dip"); assert.equal(f[1].attributes.att_from, "");
  assert.equal(buildVectorFeatures("collars", null, { collars }).features[0].attributes.azim_grid, null, "without the survey: as before");
});

test("the table shows an empty cell, never NaN; the call passes the survey", () => {
  assert.match(read("../src/components/AttributeTableModal.jsx"), /typeof r\[c\] === "number" && !Number\.isFinite\(r\[c\]\) \? ""/);
  assert.match(read("../src/components/ProjectReportModal.jsx"), /projectReportRows\(\{ project, collars, survey,/);
});
