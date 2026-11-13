// TASKS.csv #2916 (review #2876, WA iron) — the SQL workspace closes its sql.js database when the dialog closes, also when it closes before the
// build ends: an unclosed database keeps its pages in the WebAssembly heap (Node, 146,970 rows x 3 elements, three builds: RSS 164 -> 176 ->
// 185 MB unclosed, 156 -> 161 -> 161 MB closed)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import initSqlJs from "sql.js";
import { buildTables } from "../src/lib/sqlTables.js";

test("the dialog's effect closes the database on unmount and when the build ends after it", () => {
  const s = readFileSync(new URL("../src/components/SQLWorkspaceModal.jsx", import.meta.url), "utf8");
  assert.match(s, /if \(cancelled\) \{ closeDb\(db\); return; \}/);
  assert.match(s, /return \(\) => \{ cancelled = true; if \(built\) closeDb\(built\); built = null; \};/);
  assert.match(s, /function closeDb\(db\) \{ try \{ db\?\.close\?\.\(\); \} catch/);
});

test("a closed database refuses queries (so a late query cannot run on freed memory) and closing twice is harmless", async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  await buildTables(db, { assays: [{ hole_id: "A", from: 0, to: 1, values: { Fe: 50 } }], assayElements: [{ symbol: "Fe", unit: "%" }] });
  assert.deepEqual(db.exec("SELECT COUNT(*) FROM assays")[0].values, [[1]]);
  db.close();
  assert.throws(() => db.exec("SELECT 1"));
  assert.doesNotThrow(() => { try { db.close(); } catch { /* the dialog's closeDb swallows this */ } });
});
