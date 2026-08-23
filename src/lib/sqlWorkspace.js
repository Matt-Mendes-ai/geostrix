// TASKS.csv #50 — "a query panel ... letting a user write SQL directly against the currently loaded
// collars/assays/layers, e.g. 'all intervals where Au > 1 and lithology = V6', without needing a full
// Postgres connection (#8) for data that's already sitting in memory." Idea adopted from GeoLibre via
// duckdb-wasm, per this task's own note — implemented here with sql.js instead, a real SQLite engine
// already a dependency of this project (gpkg.js uses it for GeoPackage read/write) rather than adding
// a second, much larger (tens of MB) WASM SQL engine for the same end-user capability: "type SQL,
// query the data that's already loaded." SQLite's SQL dialect covers everything this task's own
// example needs (WHERE, comparisons, string equality) and every ad hoc query a geologist would
// realistically type here — DuckDB's own analytical extras (window functions over huge datasets,
// Parquet/S3 reads) aren't relevant to querying data that's already sitting in browser memory in the
// hundreds-to-low-thousands-of-rows range this app deals with.
//
// Builds a FRESH in-memory database from whatever's currently loaded every time the workspace opens —
// not a live-synced mirror — so a query always reflects the data as of "when I opened this," which is
// exactly what "ad hoc" means here; if the project changes, reopen the workspace for a fresh snapshot.
import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let sqlPromise = null;
function loadSQL() {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
  return sqlPromise;
}

// SQLite table/column names are more restrictive than this app's own free-form hole_id/element-symbol
// strings (a symbol can be anything a lab export happened to call a column) — quoted identifiers in
// every query below sidestep almost all of that, but a genuinely unusable name (empty, or all
// punctuation) still needs a safe fallback so table creation itself can't fail.
function safeIdent(name, fallback) {
  const s = String(name ?? "").trim();
  return s || fallback;
}

// One row per assay interval, one column per loaded element symbol — the wide/spreadsheet shape a SQL
// WHERE clause like "Au > 1" needs (assays are stored internally as {values: {symbol: value}}, which
// SQL can't reach into directly).
function createAssaysTable(db, assays, assayElements) {
  if (!assays.length) return;
  const symbols = assayElements.map((e) => e.symbol);
  const cols = ["hole_id TEXT", "\"from\" REAL", "\"to\" REAL", "source TEXT", ...symbols.map((s) => `"${s}" REAL`)];
  db.run(`CREATE TABLE assays (${cols.join(", ")});`);
  const placeholders = ["?", "?", "?", "?", ...symbols.map(() => "?")].join(",");
  const stmt = db.prepare(`INSERT INTO assays VALUES (${placeholders})`);
  assays.forEach((a) => {
    stmt.run([a.hole_id, a.from, a.to, a.source ?? null, ...symbols.map((s) => (a.values[s] != null ? a.values[s] : null))]);
  });
  stmt.free();
}

function createCollarsTable(db, collars) {
  if (!collars.length) return;
  db.run(`CREATE TABLE collars (hole_id TEXT, x REAL, y REAL, z REAL, azimuth REAL, dip REAL, length REAL);`);
  const stmt = db.prepare("INSERT INTO collars VALUES (?,?,?,?,?,?,?)");
  collars.forEach((c) => stmt.run([c.hole_id, c.x, c.y, c.z, c.azimuth ?? null, c.dip ?? null, c.length ?? null]));
  stmt.free();
}

function createSurveyTable(db, survey) {
  if (!survey.length) return;
  db.run(`CREATE TABLE survey (hole_id TEXT, depth REAL, azimuth REAL, dip REAL);`);
  const stmt = db.prepare("INSERT INTO survey VALUES (?,?,?,?)");
  survey.forEach((s) => stmt.run([s.hole_id, s.depth, s.azimuth, s.dip]));
  stmt.free();
}

// One table per loaded layer key (litho/alt/vein/geotech/recovery/sg/mnlgy/magsusc/structure/etc.) —
// iterates whatever keys actually have rows in `layers` rather than a hardcoded list of known keys, so
// this doesn't need updating every time a new layer type is added elsewhere in the app (see #137's own
// notes on how easy it is to miss one of those hardcoded lists). Interval rows get from/to; point rows
// (depth-based) get depth instead — both also get whatever `value`/`extra`/`description` fields exist.
function createLayerTables(db, layers) {
  Object.entries(layers).forEach(([key, rows]) => {
    if (!Array.isArray(rows) || !rows.length || key === "geophys_pts") return; // geophys_pts has no hole_id — its own x/y/z shape doesn't fit this hole-relative table set
    const tableName = safeIdent(key, "layer").replace(/[^a-zA-Z0-9_]/g, "_");
    const hasFromTo = rows[0].from !== undefined;
    const hasDepth = rows[0].depth !== undefined;
    const cols = ["hole_id TEXT"];
    if (hasFromTo) cols.push('"from" REAL', '"to" REAL');
    if (hasDepth) cols.push("depth REAL");
    cols.push("value TEXT", "extra REAL", "description TEXT");
    db.run(`CREATE TABLE "${tableName}" (${cols.join(", ")});`);
    const colCount = cols.length;
    const stmt = db.prepare(`INSERT INTO "${tableName}" VALUES (${Array(colCount).fill("?").join(",")})`);
    rows.forEach((r) => {
      const vals = [r.hole_id];
      if (hasFromTo) vals.push(r.from, r.to);
      if (hasDepth) vals.push(r.depth);
      vals.push(r.value != null ? String(r.value) : null, r.extra ?? null, r.description ?? null);
      stmt.run(vals);
    });
    stmt.free();
  });
}

// Boundaries/claims: one row per part (a multi-part boundary's own vertex count varies per part, so
// there's no single sensible "one row per boundary" shape) — mainly useful for querying claim
// metadata (status/expiry/tenure number) rather than geometry, which SQL has no natural use for here.
function createBoundariesTable(db, boundaries) {
  if (!boundaries.length) return;
  db.run(`CREATE TABLE boundaries (name TEXT, kind TEXT, status TEXT, tenure_number TEXT, expiry_date TEXT, part_count INTEGER, vertex_count INTEGER);`);
  const stmt = db.prepare("INSERT INTO boundaries VALUES (?,?,?,?,?,?,?)");
  boundaries.forEach((b) => {
    const vertexCount = (b.polylines || []).reduce((s, p) => s + p.length, 0);
    stmt.run([b.name, b.kind || "boundary", b.status ?? null, b.tenureNumber ?? null, b.expiryDate ?? null, (b.polylines || []).length, vertexCount]);
  });
  stmt.free();
}

// Builds a fresh in-memory sql.js database from whatever's currently loaded. Returns { db, tables }
// where `tables` is [{name, columns}] — a quick schema reference for the workspace UI, since a user
// querying data they didn't design the table shape for needs to see what's actually queryable.
export async function buildWorkspaceDatabase({ collars, survey, layers, assays, assayElements, boundaries }) {
  const SQL = await loadSQL();
  const db = new SQL.Database();
  createCollarsTable(db, collars || []);
  createSurveyTable(db, survey || []);
  createAssaysTable(db, assays || [], assayElements || []);
  createLayerTables(db, layers || {});
  createBoundariesTable(db, boundaries || []);

  const tables = [];
  const tableNames = db.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
  (tableNames[0]?.values || []).forEach(([name]) => {
    const info = db.exec(`PRAGMA table_info("${name}");`);
    const columns = (info[0]?.values || []).map(([, colName]) => colName);
    tables.push({ name, columns });
  });
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
