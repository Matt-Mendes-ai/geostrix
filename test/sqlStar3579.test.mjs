// TASKS.csv #3579 — SELECT * leaves out the computed oxide columns unless the query names them
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { runQuery } from "../src/lib/sqlRun.js";
const require = createRequire(import.meta.url);
test("#3579 'SELECT *' omits the generated oxide columns and says so; naming one keeps it", async () => {
  const SQL = await require("sql.js")();
  const db = new SQL.Database();
  db.run('CREATE TABLE assays (h TEXT, "Zn" REAL, "ZnO" REAL GENERATED ALWAYS AS ("Zn" * 1.245) VIRTUAL);');
  db.run("INSERT INTO assays (h, Zn) VALUES ('x', 10)");
  const a = runQuery(db, "SELECT * FROM assays");
  assert.deepEqual(a.columns, ["h", "Zn"]); assert.deepEqual(a.rows, [["x", 10]]); assert.deepEqual(a.omitted, ["ZnO"]);
  const b = runQuery(db, "select * from assays where ZnO > 1");
  assert.deepEqual(b.columns, ["h", "Zn", "ZnO"]); assert.equal(b.omitted, undefined);
  const c = runQuery(db, "SELECT h, ZnO FROM assays");
  assert.deepEqual(c.columns, ["h", "ZnO"]);
  assert.deepEqual(runQuery(db, "SELECT a.* FROM assays a").columns, ["h", "Zn"]);
});
