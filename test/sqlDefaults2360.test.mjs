// TASKS.csv #2034 / #2360 / #2204 — the SQL workspace opens on the lead element, highest measured results first, with from / to quoted, and
// lists the columns as a query must write them
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { defaultQueryFor, sqlColumnLabel, quoteIdent } from "../src/lib/sqlDefaults.js";

const tables = [{ name: "assays", columns: ["hole_id", "from", "to", "source", "sample_id", "sample_type", "Co", "U", "U_q", "Th"] }, { name: "collars", columns: ["hole_id", "x"] }];

test("the lead element (U), not sample_id or the first column; measured values only; no cut-off assumed", () => {
  assert.equal(defaultQueryFor(tables, "U"), 'SELECT hole_id, "from", "to", sample_id, "U" FROM assays WHERE "U" IS NOT NULL AND "U_q" IS NULL ORDER BY "U" DESC LIMIT 100;');
  assert.equal(defaultQueryFor(tables, null), 'SELECT hole_id, "from", "to", sample_id, "Co" FROM assays WHERE "Co" IS NOT NULL ORDER BY "Co" DESC LIMIT 100;');
  assert.equal(defaultQueryFor(tables, "Au"), defaultQueryFor(tables, null)); // a lead not in the table: the first element
  assert.equal(defaultQueryFor([{ name: "collars", columns: ["hole_id"] }]), "SELECT * FROM collars LIMIT 100;");
  assert.equal(defaultQueryFor([]), "");
});

test("the opening query runs in SQLite and puts the highest result first, no empty rows on top", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE assays (hole_id TEXT, "from" REAL, "to" REAL, source TEXT, sample_id TEXT, sample_type TEXT, Co REAL, U REAL, U_q TEXT, Th REAL)');
  db.run("INSERT INTO assays VALUES ('A',0,1,'assay','S1','core',1,NULL,NULL,2),('A',1,2,'assay','S2','core',1,950,NULL,2),('A',2,3,'assay','S3','core',1,0.5,'<',2),('B',0,1,'assay','S4','core',1,30,NULL,2)");
  const r = db.exec(defaultQueryFor(tables, "U"))[0];
  assert.deepEqual(r.values.map((v) => v[4]), [950, 30]);
  // #2204 — the length-weighted query written as the list shows the columns
  const lw = db.exec('SELECT SUM(U * ("to" - "from")) / SUM("to" - "from") FROM assays WHERE U IS NOT NULL AND U_q IS NULL')[0].values[0][0];
  assert.equal(lw, 490);
});

test("#2204 — SQL words and odd names are listed quoted, plain names as they are", () => {
  assert.equal(sqlColumnLabel("from"), '"from"');
  assert.equal(sqlColumnLabel("to"), '"to"');
  assert.equal(sqlColumnLabel("Au"), "Au");
  assert.equal(sqlColumnLabel("Li2O"), "Li2O");
  assert.equal(sqlColumnLabel("Gamma eU3O8 (ppm)"), '"Gamma eU3O8 (ppm)"');
  assert.equal(quoteIdent('a"b'), '"a""b"');
  const m = readFileSync(new URL("../src/components/SQLWorkspaceModal.jsx", import.meta.url), "utf8");
  assert.match(m, /t\.columns\.map\(sqlColumnLabel\)\.join\(", "\)/);
});
