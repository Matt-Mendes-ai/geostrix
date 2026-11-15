// TASKS.csv #3614 / #3615 (Fireweed rehearsal) — the CSV tables open at their first row: no '# ' lines above the header by default (a user's choice for the composites and intercepts reports), the
// conventions of a table zip in one provenance.txt beside the CSVs, no backlog number in a stamp; and the epsg column makes our own collars.csv open with no CRS question.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { csvStampOn, setCsvStamp, stampedCsv } from "../src/lib/csvStampPref.js";
import { drillholeTableFiles } from "../src/lib/drillholeTables.js";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const loc = (lang) => JSON.parse(fs.readFileSync(new URL(`../src/locales/${lang}.json`, import.meta.url), "utf8"));

test("the '# ' lines are off by default and a stored choice turns them on; storage unavailable: off", () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  try {
    const csv = "a,b\n1,2\n", lines = ["GeoStrix exploration output — not a Mineral Resource estimate", "Tool: Composites"];
    assert.equal(csvStampOn(), false); assert.equal(stampedCsv(csv, lines), csv, "row 1 is the column names");
    setCsvStamp(true); assert.equal(csvStampOn(), true); assert.equal(stampedCsv(csv, lines), `# ${lines[0]}\n# ${lines[1]}\n${csv}`);
    setCsvStamp(false); assert.equal(stampedCsv(csv, lines), csv); assert.equal(mem.size, 0);
  } finally { delete globalThis.localStorage; }
  assert.equal(csvStampOn(), false);
});

test("a table zip: clean CSVs, provenance.txt with the CRS, the dip sign and a line per file; no disclaimer on a data table; with no CRS no epsg column", () => {
  const collars = [{ hole_id: "H1", x: 1, y: 2, z: 3, azimuth: 90, dip: 60, length: 10, attrs: { year: "2023" } }];
  const f = drillholeTableFiles({ collars, survey: [{ hole_id: "H1", depth: 0, azimuth: 90, dip: 60 }], epsg: 26909, version: "1.2.3" });
  assert.deepEqual(f.map((x) => x.name), ["collars.csv", "collars_fields.csv", "survey.csv", "provenance.txt"]); // collars_fields.csv: #3635's data dictionary
  assert.match(f[0].text, /^hole_id,x,y,z,azim_grid,dip,length,epsg,year\r?\n/);
  assert.match(f[0].text, /\n?H1,1,2,3,90,-60,10,26909,2023/);
  const p = f.find((x) => x.name === "provenance.txt").text;
  assert.match(p, /^GeoStrix drillhole tables \| GeoStrix 1\.2\.3 \| generated /); assert.match(p, /Project CRS: EPSG:26909/); assert.match(p, /Dip: negative = down/);
  assert.match(p, /collars\.csv: one row per hole; the epsg column is the project CRS \(EPSG:26909\), which the import reads/);
  assert.match(p, /survey\.csv: survey stations/);
  assert.doesNotMatch(p, /Mineral Resource/);
  const none = drillholeTableFiles({ collars, epsg: null }); assert.doesNotMatch(none[0].text.split(/\r?\n/)[0], /epsg/);
  assert.deepEqual(drillholeTableFiles({}), [], "nothing to export: no provenance file either");
});

test("the composites and intercepts exports go through the preference, the toggle is beside them, the backlog number is out of the stamp", () => {
  for (const f of ["CompositingModal", "BestIntercepts"]) {
    const s = read(`../src/components/${f}.jsx`);
    assert.match(s, /content: stampedCsv\(toExportCsv\(rows\), stamp\)/); assert.match(s, /<CsvStampToggle \/>/); assert.doesNotMatch(s, /withStamp/);
  }
  assert.doesNotMatch(read("../src/components/CompositingModal.jsx"), /conflict_m \(#532\)/);
  for (const lang of ["es", "pt", "fr", "ar"]) assert.ok(loc(lang)["Add the # header lines (tool, CRS, parameters) to the CSV"], lang);
});
