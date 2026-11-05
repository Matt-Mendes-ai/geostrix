// TASKS.csv #50 — "a query panel ... letting a user write SQL directly against the currently loaded
// collars/assays/layers, e.g. 'all intervals where Au > 1 and lithology = V6', without needing a full
// Postgres connection (#8) for data that's already sitting in memory." Idea adopted from GeoLibre via
// duckdb-wasm, per this task's own note — implemented here with sql.js instead, a real SQLite engine
// already a dependency of this project (gpkg.js uses it for GeoPackage read/write) rather than adding
// a second, much larger (tens of MB) WASM SQL engine for the same end-user capability: "type SQL,
// query the data that's already loaded." SQLite's SQL dialect covers everything this task's own
// example needs (WHERE, comparisons, string equality) and every ad hoc query a geologist would
// realistically type here — DuckDB's own analytical extras (window functions over huge datasets,
// Parquet/S3 reads) aren't relevant to querying data that's already sitting in browser memory.
//
// Builds a FRESH in-memory database from whatever's currently loaded every time the workspace opens —
// not a live-synced mirror — so a query always reflects the data as of "when I opened this," which is
// exactly what "ad hoc" means here; if the project changes, reopen the workspace for a fresh snapshot.
// The tables themselves are built in sqlTables.js (TASKS.csv #1516: in transactions, in chunks, with progress).
import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { buildTables } from "./sqlTables.js";

let sqlPromise = null;
function loadSQL() {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
  return sqlPromise;
}

// Builds a fresh in-memory sql.js database from whatever's currently loaded. Returns { db, tables }
// where `tables` is [{name, columns}] — a quick schema reference for the workspace UI, since a user
// querying data they didn't design the table shape for needs to see what's actually queryable.
// onProgress({ table, done, total }) is called between chunks of a big table (#1516).
export async function buildWorkspaceDatabase(data, onProgress) {
  const SQL = await loadSQL();
  const db = new SQL.Database();
  const tables = await buildTables(db, data, onProgress);
  return { db, tables };
}

// Runs an arbitrary query and returns { columns, rows } (rows as plain arrays, matching columns'
// order) or throws sql.js's own error message directly — a SQL syntax/reference error is exactly the
// kind of thing that should surface verbatim to a user who just typed the query themselves, not get
// wrapped/genericized.
export function runQuery(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return { columns: [], rows: [] };
  return { columns: res[0].columns, rows: res[0].values };
}
