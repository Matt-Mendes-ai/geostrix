// TASKS.csv #3719 (round 3 slips): (a) whole-number GeoPackage columns are INTEGER, (b) the autosave time is per tab, (c) Undo says it covers this session only,
// (f) the data credit is written once in collars.csv, (g) the unsampled legend words follow the language, (i) the export-all tooltip says what it is for.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./helpers/viteUrlLoader.mjs", import.meta.url);
const { buildGeoPackage, parseGeoPackage } = await import("../src/lib/gpkg.js");
import { collarTableRows } from "../src/lib/drillholeTables.js";
import { undoMessage, undoTooltip } from "../src/lib/undoLabels.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("(a) a column of whole numbers is INTEGER, a decimal column REAL, text TEXT; the year reads 2023 back", async () => {
  const initSqlJs = (await import("sql.js")).default, SQL = await initSqlJs();
  const features = [
    { geometry: [[0, 0, 0]], attributes: { year: 2023, depth: 12.5, name: "A", n: 7 } },
    { geometry: [[1, 1, 0]], attributes: { year: 2019, depth: 8, name: "B", n: null } },
  ];
  const bytes = await buildGeoPackage([{ name: "pts", features, geomType: "point", epsg: 26910 }]);
  const db = new SQL.Database(bytes);
  const sql = db.exec("SELECT sql FROM sqlite_master WHERE name = 'pts'")[0].values[0][0];
  assert.match(sql, /"year" INTEGER/);
  assert.match(sql, /"depth" REAL/);
  assert.match(sql, /"name" TEXT/);
  assert.match(sql, /"n" INTEGER/, "blanks do not make it REAL");
  db.close();
  const { layers } = await parseGeoPackage(bytes);
  assert.equal(layers[0].features[0].attributes.year, 2023);
});

test("(c) the Undo tooltip and message say it covers this session only", () => {
  assert.match(undoTooltip("undo", null, ""), /nothing to undo\. Undo covers this session only/);
  assert.match(undoMessage("undo", null), /Undo covers this session only/);
  assert.equal(undoMessage("redo", null), "Nothing to redo.");
});

test("(f) collars.csv carries the credit once, on the first hole; the importer takes the first one", () => {
  const rows = collarTableRows([{ hole_id: "A", x: 1, y: 2, z: 3 }, { hole_id: "B", x: 4, y: 5, z: 6 }, { hole_id: "C", x: 7, y: 8, z: 9 }], { epsg: 26909, dataCredit: "Courtesy of X Corp." });
  assert.equal(rows[0].data_credit, "Courtesy of X Corp.");
  assert.equal(rows[1].data_credit, "");
  assert.equal(rows[2].data_credit, "");
  assert.ok(!("data_credit" in collarTableRows([{ hole_id: "A", x: 1, y: 2, z: 3 }], { epsg: 26909 })[0]), "no credit: no column");
});

test("(b) (g) (i) wiring: the autosave note resets with the tab, the unsampled words are translated, the export tooltip is rewritten", () => {
  assert.match(read("../src/App.jsx"), /useEffect\(\(\) => \{ setAutosavedAt\(null\); \}, \[activeTabId\]\);/);
  assert.match(read("../src/lib/legendGroups.js"), /label: tr\("Not sampled"\), items: \[\[tr\("bare trace: no sample here"\)/);
  assert.match(read("../src/modules/ViewerModule.jsx"), /title=\{tr\("One CSV per table \(collars, survey, every layer, assays\) in a \.zip, for Leapfrog, Micromine or any database \(Postgres COPY, MySQL LOAD DATA\)"\)\}/); // #3899: shorter
});
