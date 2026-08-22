// TASKS.csv #190/#191 — GeoPackage (.gpkg) export + import for vector layers, using sql.js (a MIT-
// licensed WebAssembly build of real SQLite: https://github.com/sql-js/sql.js). Unlike shapefile.js's
// hand-rolled binary writer/reader — a small, well-documented, non-relational format that was cheap to
// implement from scratch — a GeoPackage file IS a SQLite database file (the OGC GeoPackage spec is
// built directly on top of the SQLite file format, down to requiring a specific `application_id`
// PRAGMA and specific system tables), so a spec-compliant .gpkg genuinely needs a real SQLite engine
// to read or write correctly. sql.js is the standard way to get one inside a browser/Electron
// renderer with zero native compilation. Ships one extra ~650KB .wasm asset (bundled by Vite via the
// `?url` import below), which is a reasonable, well-precedented trade for a format that otherwise
// can't be produced correctly at all.
//
// Feature model matches shapefile.js exactly on purpose — { features: [{geometry, attributes}],
// geomType: 'point'|'polyline'|'polygon' } — so the same buildVectorFeatures() output ViewerModule's
// shapefile export already builds also works here unchanged, and gpkgFeaturesToRows (below) mirrors
// shapefileFeaturesToRows so both formats plug into the exact same CSV-row-shaped import pipelines.
//
// Geometry encoding: GeoPackage's own binary geometry format is an 8-byte "GeoPackageBinaryHeader"
// (magic "GP", version, flags, srs_id) followed by a standard ISO WKB geometry (no envelope is
// written here — the flags byte says so — since GeoPackage readers must compute one on demand anyway
// and omitting it keeps the writer simpler with no loss of validity). Only Point/PointZ (WKB type
// 1/1001) and LineString/LineStringZ (WKB type 2/1002) are written/read — the same scope shapefile.js
// covers (this app's own data is never a polygon on write; on import, a polygon ring is read the same
// way a polyline's vertex list is, matching shapefile.js's own "polygon comes in as its outline"
// approach).

import initSqlJs from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { prjWktFor } from "./shapefile.js";

let sqlPromise = null;
function loadSQL() {
  if (!sqlPromise) sqlPromise = initSqlJs({ locateFile: () => sqlWasmUrl });
  return sqlPromise;
}

const GPKG_APPLICATION_ID = 0x47504b47; // "GPKG" as a big-endian uint32, per the OGC spec
const GPKG_USER_VERSION = 10300; // "1.3.0" encoded as Major*10000+Minor*100+Patch, per the spec

// ---------- WKB writer (ISO extended, Z-only, byte order 1 = little-endian) ----------
function wkbPointZ(x, y, z) {
  const buf = new ArrayBuffer(1 + 4 + 24);
  const dv = new DataView(buf);
  dv.setUint8(0, 1);
  dv.setUint32(1, 1001, true); // PointZ
  dv.setFloat64(5, x, true); dv.setFloat64(13, y, true); dv.setFloat64(21, z ?? 0, true);
  return new Uint8Array(buf);
}
function wkbLineStringZ(pts) {
  const n = pts.length;
  const buf = new ArrayBuffer(1 + 4 + 4 + n * 24);
  const dv = new DataView(buf);
  let off = 0;
  dv.setUint8(off, 1); off += 1;
  dv.setUint32(off, 1002, true); off += 4; // LineStringZ
  dv.setUint32(off, n, true); off += 4;
  pts.forEach(([x, y, z]) => { dv.setFloat64(off, x, true); off += 8; dv.setFloat64(off, y, true); off += 8; dv.setFloat64(off, z ?? 0, true); off += 8; });
  return new Uint8Array(buf);
}
// flags byte: bit0=1 (header ints are little-endian), bits1-3=0 (no envelope), bit5=0 (not empty).
function gpbBlob(wkbBytes, srsId) {
  const out = new Uint8Array(8 + wkbBytes.length);
  out[0] = 0x47; out[1] = 0x50; // "GP" magic
  out[2] = 0; // version 0
  out[3] = 0x01; // flags
  new DataView(out.buffer).setInt32(4, srsId, true);
  out.set(wkbBytes, 8);
  return out;
}

// ---------- WKB reader ----------
function readWkbGeometry(dv, off) {
  const le = dv.getUint8(off) === 1; off += 1;
  let type = dv.getUint32(off, le); off += 4;
  const hasZ = type > 1000 && type < 2000; // ISO extended Z range (1001-1999)
  const baseType = hasZ ? type - 1000 : type;
  const readCoord = () => {
    const x = dv.getFloat64(off, le); off += 8;
    const y = dv.getFloat64(off, le); off += 8;
    const z = hasZ ? (() => { const v = dv.getFloat64(off, le); off += 8; return v; })() : 0;
    return [x, y, z];
  };
  if (baseType === 1) { const pt = readCoord(); return { type: "point", pts: [pt], nextOff: off }; }
  if (baseType === 2) {
    const n = dv.getUint32(off, le); off += 4;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(readCoord());
    return { type: "polyline", pts, nextOff: off };
  }
  if (baseType === 3) {
    // Polygon: numRings, then per ring numPoints + coords — only the first (outer) ring is kept,
    // matching shapefile.js's own "a polygon import comes in as its outline" scope.
    const numRings = dv.getUint32(off, le); off += 4;
    let outerPts = [];
    for (let r = 0; r < numRings; r++) {
      const n = dv.getUint32(off, le); off += 4;
      const ringPts = [];
      for (let i = 0; i < n; i++) ringPts.push(readCoord());
      if (r === 0) outerPts = ringPts;
    }
    return { type: "polygon", pts: outerPts, nextOff: off };
  }
  return null; // unsupported geometry type (Multi*, GeometryCollection, etc.) — caller skips + counts it
}
// Strips the GeoPackageBinaryHeader (validates the "GP" magic) and returns the WKB geometry parsed
// from what follows, honoring the flags byte's envelope-length bits so envelope bytes (if any — e.g.
// a file written by QGIS, which always includes one) are skipped correctly rather than assumed absent.
function parseGpbBlob(bytes) {
  if (bytes.length < 8 || bytes[0] !== 0x47 || bytes[1] !== 0x50) return null; // not a GeoPackage geometry blob
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const flags = bytes[3];
  const envelopeCode = (flags >> 1) & 0x07;
  const envelopeLen = [0, 32, 48, 48, 64][envelopeCode] || 0;
  const isEmpty = (flags >> 4) & 0x01;
  if (isEmpty) return null;
  const off = 8 + envelopeLen;
  return readWkbGeometry(dv, off);
}

// ---------- public: build a .gpkg from one or more vector layers ----------
// layers: [{ name, features: [{geometry, attributes}], geomType: 'point'|'polyline', epsg }]
// Returns a Uint8Array of the complete SQLite/.gpkg file.
export async function buildGeoPackage(layers) {
  const SQL = await loadSQL();
  const db = new SQL.Database();
  db.run(`PRAGMA application_id = ${GPKG_APPLICATION_ID};`);
  db.run(`PRAGMA user_version = ${GPKG_USER_VERSION};`);
  db.run(`
    CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY,
      organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL, description TEXT
    );
    CREATE TABLE gpkg_contents (
      table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE,
      description TEXT DEFAULT '', last_change DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER,
      CONSTRAINT fk_gc_r_srs_id FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name),
      CONSTRAINT uk_gc_table_name UNIQUE (table_name),
      CONSTRAINT fk_gc_tn FOREIGN KEY (table_name) REFERENCES gpkg_contents(table_name),
      CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id) REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
  `);
  // The two "undefined" SRS rows every conformant GeoPackage must have, plus WGS84 (srs_id 4326) —
  // matches what QGIS/GDAL themselves always pre-populate a new .gpkg with.
  db.run(`INSERT INTO gpkg_spatial_ref_sys VALUES
    ('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', 'undefined cartesian coordinate reference system'),
    ('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', 'undefined geographic coordinate reference system'),
    ('WGS 84 geodetic', 4326, 'EPSG', 4326, 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]', 'longitude/latitude coordinates in WGS 84');`);

  const usedSrsIds = new Set([-1, 0, 4326]);
  layers.forEach((layer) => {
    if (!layer.features?.length) return;
    const epsg = Number(layer.epsg);
    const srsId = Number.isFinite(epsg) ? epsg : 0;
    if (!usedSrsIds.has(srsId)) {
      const wkt = prjWktFor(srsId) || "undefined";
      db.run("INSERT INTO gpkg_spatial_ref_sys (srs_name, srs_id, organization, organization_coordsys_id, definition) VALUES (?, ?, 'EPSG', ?, ?);", [`EPSG:${srsId}`, srsId, srsId, wkt]);
      usedSrsIds.add(srsId);
    }

    const tableName = (layer.name || "layer").replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^(\d)/, "_$1").slice(0, 60) || "layer";
    const columns = Array.from(layer.features.reduce((set, f) => { Object.keys(f.attributes || {}).forEach((k) => set.add(k)); return set; }, new Set()));
    const colDefs = columns.map((col) => {
      const numeric = layer.features.every((f) => { const v = f.attributes[col]; return v == null || v === "" || (typeof v === "number" && Number.isFinite(v)); });
      const safeName = col.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^(\d)/, "_$1") || "field";
      return { safeName, origName: col, sqlType: numeric ? "REAL" : "TEXT" };
    });
    const geomTypeName = layer.geomType === "polyline" ? "LINESTRING" : "POINT";
    db.run(`CREATE TABLE "${tableName}" (fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB${colDefs.length ? ", " + colDefs.map((c) => `"${c.safeName}" ${c.sqlType}`).join(", ") : ""});`);
    db.run("INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', ?, ?, 1, 0);", [tableName, geomTypeName, srsId]);

    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    const insertSQL = `INSERT INTO "${tableName}" (geom${colDefs.length ? ", " + colDefs.map((c) => `"${c.safeName}"`).join(", ") : ""}) VALUES (?${colDefs.length ? ", " + colDefs.map(() => "?").join(", ") : ""});`;
    const stmt = db.prepare(insertSQL);
    layer.features.forEach((f) => {
      const wkb = layer.geomType === "polyline" ? wkbLineStringZ(f.geometry) : wkbPointZ(...f.geometry[0]);
      const blob = gpbBlob(wkb, srsId);
      f.geometry.forEach(([x, y]) => { if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; });
      const values = [blob, ...colDefs.map((c) => { const v = f.attributes[c.origName]; return v == null || v === "" ? null : (c.sqlType === "REAL" ? Number(v) : String(v)); })];
      stmt.run(values);
    });
    stmt.free();
    if (!Number.isFinite(xmin)) { xmin = ymin = xmax = ymax = 0; }
    db.run("INSERT INTO gpkg_contents (table_name, data_type, identifier, min_x, min_y, max_x, max_y, srs_id) VALUES (?, 'features', ?, ?, ?, ?, ?, ?);", [tableName, layer.name || tableName, xmin, ymin, xmax, ymax, srsId]);
  });

  const bytes = db.export();
  db.close();
  return bytes;
}

// ---------- public: parse a .gpkg into { layers: [{name, features, geomType, epsg, skippedCount}] } ----------
export async function parseGeoPackage(gpkgBytes) {
  const SQL = await loadSQL();
  const db = new SQL.Database(gpkgBytes instanceof Uint8Array ? gpkgBytes : new Uint8Array(gpkgBytes));
  try {
    const contentsRes = db.exec("SELECT table_name, srs_id FROM gpkg_contents WHERE data_type = 'features';");
    if (!contentsRes.length) throw new Error("No feature tables found in this GeoPackage (gpkg_contents has no data_type='features' rows).");
    const geomColRes = db.exec("SELECT table_name, column_name, srs_id FROM gpkg_geometry_columns;");
    const geomColByTable = {};
    (geomColRes[0]?.values || []).forEach(([table, col, srsId]) => { geomColByTable[table] = { col, srsId }; });
    const srsRes = db.exec("SELECT srs_id, organization, organization_coordsys_id FROM gpkg_spatial_ref_sys;");
    const epsgBySrsId = {};
    (srsRes[0]?.values || []).forEach(([srsId, org, orgCode]) => { if (String(org).toUpperCase() === "EPSG") epsgBySrsId[srsId] = orgCode; });

    const layers = [];
    for (const [tableName] of contentsRes[0].values) {
      const geomInfo = geomColByTable[tableName];
      if (!geomInfo) continue; // no registered geometry column — not something this app can render
      const rowsRes = db.exec(`SELECT * FROM "${tableName}";`);
      if (!rowsRes.length) { layers.push({ name: tableName, features: [], geomType: "point", epsg: epsgBySrsId[geomInfo.srsId], skippedCount: 0 }); continue; }
      const cols = rowsRes[0].columns;
      const geomIdx = cols.indexOf(geomInfo.col);
      const fidIdx = cols.indexOf("fid");
      const features = [];
      let skippedCount = 0;
      let geomTypeSeen = null;
      rowsRes[0].values.forEach((row) => {
        const blob = row[geomIdx];
        const parsed = blob instanceof Uint8Array ? parseGpbBlob(blob) : null;
        if (!parsed) { skippedCount++; return; }
        geomTypeSeen = geomTypeSeen || parsed.type;
        const attributes = {};
        cols.forEach((c, i) => { if (i !== geomIdx && i !== fidIdx) attributes[c] = row[i]; });
        features.push({ geometry: parsed.pts, attributes });
      });
      layers.push({ name: tableName, features, geomType: geomTypeSeen || "point", epsg: epsgBySrsId[geomInfo.srsId], skippedCount });
    }
    return { layers };
  } finally {
    db.close();
  }
}

// Mirrors shapefile.js's shapefileFeaturesToRows exactly — same flattening rule (first vertex ->
// x/y/z, last vertex of a multi-vertex geometry -> x2/y2/z2), so a .gpkg and a .zip shapefile import
// through the identical downstream mapping/commit code with no format-specific special-casing.
export function gpkgFeaturesToRows({ features, geomType }) {
  const rows = features.map((f) => {
    const [x, y, z] = f.geometry[0] || [];
    const row = { ...f.attributes, x, y, z };
    if (geomType !== "point" && f.geometry.length > 1) {
      const [x2, y2, z2] = f.geometry[f.geometry.length - 1];
      row.x2 = x2; row.y2 = y2; row.z2 = z2;
    }
    return row;
  });
  const headers = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set()));
  return { rows, headers };
}
