// TASKS.csv #1716 (review #1645, Copley) — a big GeoPackage opened read-only in the main process with Node's built-in SQLite, so the
// renderer gets the list of feature tables (with their extents) and then only the features inside an area, through each table's
// R-tree index. Reading the 791 MB BC surficial geology file whole in the renderer (sql.js) froze the window 55 s and took the heap to
// 2.7 GB. Rows are read in batches that yield to the event loop, so the main process keeps serving the window during a long scan.
"use strict";

const BATCH = 4000;
const yieldNow = () => new Promise((r) => setImmediate(r));
const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

function openReadOnly(filePath) {
  const { DatabaseSync } = require("node:sqlite");
  return new DatabaseSync(filePath, { readOnly: true });
}

function hasTable(db, name) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?").get(name);
}

// The feature tables (name, geometry column, srs id, extent from gpkg_contents, row count, whether an R-tree index exists) and the
// spatial reference rows, so the renderer can work out each table's EPSG code as parseGeoPackage does.
function indexGpkg(filePath) {
  const db = openReadOnly(filePath);
  try {
    if (!hasTable(db, "gpkg_contents")) throw new Error("This file has no gpkg_contents table: it is not a GeoPackage.");
    const geomCols = {};
    if (hasTable(db, "gpkg_geometry_columns")) for (const r of db.prepare("SELECT table_name, column_name, geometry_type_name, srs_id FROM gpkg_geometry_columns").all()) geomCols[r.table_name] = r;
    const srs = hasTable(db, "gpkg_spatial_ref_sys") ? db.prepare("SELECT srs_id, organization, organization_coordsys_id, definition FROM gpkg_spatial_ref_sys").all().map((r) => ({ ...r })) : [];
    const tables = [];
    for (const c of db.prepare("SELECT table_name, srs_id, min_x, min_y, max_x, max_y FROM gpkg_contents WHERE data_type = 'features'").all()) {
      const g = geomCols[c.table_name];
      if (!g || !hasTable(db, c.table_name)) continue;
      const rtree = `rtree_${c.table_name}_${g.column_name}`;
      const count = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${q(c.table_name)}`).get().n);
      const extent = [c.min_x, c.min_y, c.max_x, c.max_y].every((v) => Number.isFinite(v)) ? [c.min_x, c.min_y, c.max_x, c.max_y] : null;
      tables.push({ name: c.table_name, geomCol: g.column_name, geomType: g.geometry_type_name, srsId: g.srs_id ?? c.srs_id, extent, count, indexed: hasTable(db, rtree) });
    }
    return { tables, srs };
  } finally {
    db.close();
  }
}

// The envelope in a GeoPackage geometry blob header, [minx, miny, maxx, maxy], or null when the blob carries none (then the row is kept
// and the renderer's own clip decides)
function blobEnvelope(b) {
  if (!(b instanceof Uint8Array) || b.length < 8 || b[0] !== 0x47 || b[1] !== 0x50) return null;
  const flags = b[3], le = (flags & 1) === 1, ind = (flags >> 1) & 7;
  if (ind < 1 || ind > 4 || b.length < 8 + 32) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const minx = dv.getFloat64(8, le), maxx = dv.getFloat64(16, le), miny = dv.getFloat64(24, le), maxy = dv.getFloat64(32, le);
  return [minx, miny, maxx, maxy].every(Number.isFinite) ? [minx, miny, maxx, maxy] : null;
}
const meets = (e, b) => e[2] >= b[0] && e[0] <= b[2] && e[3] >= b[1] && e[1] <= b[3];

// The rows of one table whose geometry meets bbox [xmin, ymin, xmax, ymax] (in the table's own CRS): through the R-tree when the table
// has one, else a scan that tests each blob's envelope. At most `max` rows come back; `truncated` says more matched.
async function readGpkgTable(filePath, { table, bbox, max = 100000 }) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new Error("No area to read.");
  const db = openReadOnly(filePath);
  try {
    const known = db.prepare("SELECT g.column_name AS col FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name WHERE c.table_name = ? AND c.data_type = 'features'").get(table);
    if (!known) throw new Error(`No feature table named ${table} in this GeoPackage.`);
    const col = known.col;
    const pk = db.prepare(`PRAGMA table_info(${q(table)})`).all().find((r) => r.pk === 1)?.name || "rowid";
    const rtree = `rtree_${table}_${col}`;
    const indexed = hasTable(db, rtree);
    const sql = indexed
      ? `SELECT * FROM ${q(table)} WHERE ${q(pk)} IN (SELECT id FROM ${q(rtree)} WHERE maxx >= ? AND minx <= ? AND maxy >= ? AND miny <= ?)`
      : `SELECT * FROM ${q(table)}`;
    const stmt = db.prepare(sql);
    stmt.setReturnArrays(true);
    const columns = stmt.columns().map((c) => c.name);
    const gi = columns.indexOf(col);
    const rows = [];
    let truncated = false, scanned = 0;
    const it = indexed ? stmt.iterate(bbox[0], bbox[2], bbox[1], bbox[3]) : stmt.iterate();
    for (const row of it) {
      if (++scanned % BATCH === 0) await yieldNow();
      if (!indexed) { const e = blobEnvelope(row[gi]); if (e && !meets(e, bbox)) continue; }
      if (rows.length >= max) { truncated = true; break; }
      rows.push(row);
    }
    return { columns, geomCol: col, rows, truncated, indexed, scanned };
  } finally {
    db.close();
  }
}

module.exports = { indexGpkg, readGpkgTable, blobEnvelope };
