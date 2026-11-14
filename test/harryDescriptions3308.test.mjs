// TASKS.csv #3308 — Harry's lithology from the BCGS drillhole database carries the litho table's comments as its description (101 of the
// report's 343 intervals in GeoFile 2025-11), quoted where it holds a comma; a database without the column converts as before.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
let sqlite = null; try { sqlite = require("node:sqlite"); } catch { /* older Node */ }
const ss = require("../electron/sampleSources.js");

test("#3308 Harry's litho comments become the description", { skip: !sqlite && "node:sqlite needs Node 22.5+" }, () => {
  const root = mkdtempSync(path.join(tmpdir(), "gx3308-")), db = path.join(root, "ardh.gpkg");
  try {
    const d = new sqlite.DatabaseSync(db);
    d.exec(`CREATE TABLE collar (hole_id INTEGER, hole_name TEXT, easting REAL, northing REAL, elevation REAL, azimuth REAL, dip REAL, length REAL, ar_number TEXT);
      CREATE TABLE litho (fid INTEGER, litholog_id INTEGER, hole_id INTEGER, litho_unit TEXT, comments TEXT, from_depth REAL, to_depth REAL, unit_code INTEGER);
      CREATE TABLE sample (fid INTEGER, sample_id INTEGER, hole_id INTEGER, from_depth REAL, to_depth REAL);
      CREATE TABLE code_analytes (analyte_code INTEGER, analyte_abbr TEXT);
      CREATE TABLE determin (sample_id INTEGER, analyte_code INTEGER, method_code INTEGER, abundance TEXT);
      INSERT INTO collar VALUES (1, '17HR-268', 463375.03, 6177691.17, 1160.9, 210, -45, 184, '37584');
      INSERT INTO litho VALUES (1, 1, 1, 'DACT', 'altered after 149.5 - Fe-carbonate?', 7.76, 11.2, 9), (2, 2, 1, 'CAS', NULL, 0, 7.76, 1), (3, 3, 1, 'MINT', 'coarse, "megacrysts"', 11.2, 20, 9);
      INSERT INTO sample VALUES (10, 100, 1, 7.76, 9);
      INSERT INTO code_analytes VALUES (54, 'Au');
      INSERT INTO determin VALUES (100, 54, 30, '0.018');`);
    d.close();
    const out = {}; ss.convertHarry(db, (n, b) => { out[n] = b.toString(); });
    assert.equal(out["litho.csv"], 'hole_id,from,to,lithology,description\n17HR-268,0.0,7.76,CAS,\n17HR-268,7.76,11.2,DACT,altered after 149.5 - Fe-carbonate?\n17HR-268,11.2,20.0,MINT,"coarse, ""megacrysts"""\n');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
