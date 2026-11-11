// TASKS.csv #2521 — the SQL workspace: no survey type, below-detection substitutes as plain numbers (MIN(Li) = 0.0023226645607841317),
// 16-digit REALs, a starter query on sample_id. (The collar fields came with #2504.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { buildTables, qualifiedSymbols, surveyExtraColumns, sqlCellText } from "../src/lib/sqlTables.js";

const SQL = await initSqlJs();

test("assays carry Li_q beside Li: the measured values can be told from the substitutes", async () => {
  const assays = [
    { hole_id: "H1", from: 0, to: 1, sample_id: "S1", values: { Li: 0.0023226645607841317, Ta: 0.01 }, qualifiers: { Li: "<" } },
    { hole_id: "H1", from: 1, to: 2, sample_id: "S2", values: { Li: 1.2, Ta: 0.02 } },
    { hole_id: "H1", from: 2, to: 3, sample_id: "S3", values: { Li: 3.3, Ta: 0.03 }, qualifiers: { Li: ">" } },
  ];
  assert.deepEqual(qualifiedSymbols(assays, ["Li", "Ta"]), ["Li"]);
  const db = new SQL.Database();
  const tables = await buildTables(db, { assays, assayElements: [{ symbol: "Li" }, { symbol: "Ta" }] });
  assert.deepEqual(tables.find((t) => t.name === "assays").columns, ["hole_id", "from", "to", "source", "sample_id", "Li", "Ta", "Li_q"]);
  assert.deepEqual(db.exec("SELECT MIN(Li) FROM assays WHERE Li_q IS NULL")[0].values, [[1.2]]);
  assert.deepEqual(db.exec("SELECT COUNT(*) FROM assays WHERE Li_q = '<'")[0].values, [[1]]);
  db.close();
});

test("survey carries its other fields (the station type)", async () => {
  const survey = [{ hole_id: "H1", depth: 0, azimuth: 90, dip: 60, Surv_Type: "Assumed", run: 1 }, { hole_id: "H1", depth: 50, azimuth: 92, dip: 61, Surv_Type: "Gyro", run: 2 }];
  assert.deepEqual(surveyExtraColumns(survey), [{ key: "Surv_Type", numeric: false }, { key: "run", numeric: true }]);
  const db = new SQL.Database();
  const tables = await buildTables(db, { survey });
  assert.deepEqual(tables.find((t) => t.name === "survey").columns, ["hole_id", "depth", "azimuth", "dip", "Surv_Type", "run"]);
  assert.deepEqual(db.exec("SELECT hole_id FROM survey GROUP BY hole_id HAVING SUM(Surv_Type <> 'Assumed') = 0")[0]?.values ?? [], []);
  assert.deepEqual(db.exec("SELECT dip FROM survey ORDER BY depth")[0].values, [[-60], [-61]], "dip still negative = down (#1034)");
  db.close();
  const db2 = new SQL.Database();
  assert.deepEqual((await buildTables(db2, { survey: [{ hole_id: "H", depth: 0, azimuth: 0, dip: 90 }] })).find((t) => t.name === "survey").columns, ["hole_id", "depth", "azimuth", "dip"]);
  db2.close();
});

test("the grid shows six significant figures; integers and text as they are", () => {
  assert.equal(sqlCellText(74.17110132658513), "74.1711");
  assert.equal(sqlCellText(0.0023226645607841317), "0.00232266");
  assert.equal(sqlCellText(21974), "21974");
  assert.equal(sqlCellText("RC546"), "RC546");
});

test("the starter query is on an element, not on sample_id or a qualifier column", () => {
  const s = readFileSync(new URL("../src/components/SQLWorkspaceModal.jsx", import.meta.url), "utf8");
  // #2360 moved the builder to lib/sqlDefaults.js (tested in sqlDefaults2360.test.mjs): the same columns are never the starter element
  const d = readFileSync(new URL("../src/lib/sqlDefaults.js", import.meta.url), "utf8");
  assert.match(d, /new Set\(\["hole_id", "from", "to", "source", "sample_id", "sample_type", "parent_id", "qc_code"\]\)/);
  assert.match(d, /!NOT_ELEMENTS\.has\(c\) && !\/_q\$\/\.test\(c\)/);
  assert.match(s, /defaultQueryFor\(tables, leadFor\(assays, assayElements\)\)/);
  assert.match(s, /\{v === null \? "—" : sqlCellText\(v\)\}/);
});
