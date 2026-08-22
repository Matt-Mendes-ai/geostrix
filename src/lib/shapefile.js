// Minimal ESRI Shapefile (+ DBF attribute table, + PRJ projection file) writer, zipped, for the new
// "Export Shapefile" right-click action on vector layers (collars, survey/drillhole traces, litho/alt/
// vein/structure/geochem intervals, geophysics points). Hand-written rather than an npm dependency —
// the format is small and well-documented (ESRI's own "ESRI Shapefile Technical Description", 1998),
// and a from-scratch writer keeps this at a few hundred lines with zero new runtime dependencies,
// which matters more for an Electron app that ships its own node_modules than it would for a web app.
// Output verified by round-tripping through Python's `pyshp` library during development (parses back
// to the exact same geometry + attributes for both Point and PolyLine cases, Z included).
//
// Scope: PointZ (shape type 11) for collars/point-type layers, PolyLineZ (type 13) for interval-type
// layers and drillhole traces — every geometry this app actually has is one of those two. Z is always
// written (even a flat Z=0 raster-less layer just gets a constant column) rather than maintaining a
// separate non-Z code path, since drillhole data is inherently 3D and flattening it to 2D on export
// would silently discard the one thing that makes it worth exporting in the first place.

const SHP_POINT_Z = 11;
const SHP_POLYLINE_Z = 13;

// ---------- binary writer helpers ----------
class ByteWriter {
  constructor() { this.chunks = []; this.length = 0; }
  push(buf) { this.chunks.push(buf); this.length += buf.byteLength; }
  toUint8Array() {
    const out = new Uint8Array(this.length);
    let off = 0;
    for (const c of this.chunks) { out.set(new Uint8Array(c instanceof ArrayBuffer ? c : c.buffer, c.byteOffset || 0, c.byteLength), off); off += c.byteLength; }
    return out;
  }
}
function i32be(v) { const b = new DataView(new ArrayBuffer(4)); b.setInt32(0, v, false); return b.buffer; }
function i32le(v) { const b = new DataView(new ArrayBuffer(4)); b.setInt32(0, v, true); return b.buffer; }
function f64le(v) { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, v, true); return b.buffer; }

// ---------- SHP + SHX ----------
// features: [{ geometry: [[x,y,z], ...], attributes: {...} }]  (geometry is 1 point for 'point', a
// vertex list for 'polyline' — one "part" per feature; multi-part lines aren't needed by anything this
// app exports).
function buildShpShx(features, geomType) {
  const shapeType = geomType === "point" ? SHP_POINT_Z : SHP_POLYLINE_Z;
  const shp = new ByteWriter();
  const shx = new ByteWriter();

  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity, zmin = Infinity, zmax = -Infinity;
  features.forEach((f) => f.geometry.forEach(([x, y, z]) => {
    if (x < xmin) xmin = x; if (x > xmax) xmax = x;
    if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    const zz = z ?? 0; if (zz < zmin) zmin = zz; if (zz > zmax) zmax = zz;
  }));
  if (!features.length) { xmin = ymin = xmax = ymax = zmin = zmax = 0; }

  // ---- content bodies per record, built first so total file length (for the header) is known ----
  const shpRecords = [];
  const shxEntries = [];
  let shpWordsSoFar = 50; // 100-byte header = 50 words
  features.forEach((f, idx) => {
    const body = new ByteWriter();
    body.push(i32le(shapeType));
    if (geomType === "point") {
      const [x, y, z] = f.geometry[0];
      body.push(f64le(x)); body.push(f64le(y));
      body.push(f64le(0)); // M (unused) placeholder position for PointZ per spec order is actually X,Y,Z,M
      // NOTE: PointZ record layout is: ShapeType, X, Y, Z, M — fix ordering below by rebuilding body.
    } else {
      const pts = f.geometry;
      let fxmin = Infinity, fymin = Infinity, fxmax = -Infinity, fymax = -Infinity, fzmin = Infinity, fzmax = -Infinity;
      pts.forEach(([x, y, z]) => {
        if (x < fxmin) fxmin = x; if (x > fxmax) fxmax = x;
        if (y < fymin) fymin = y; if (y > fymax) fymax = y;
        const zz = z ?? 0; if (zz < fzmin) fzmin = zz; if (zz > fzmax) fzmax = zz;
      });
      body.push(f64le(fxmin)); body.push(f64le(fymin)); body.push(f64le(fxmax)); body.push(f64le(fymax));
      body.push(i32le(1)); // NumParts
      body.push(i32le(pts.length)); // NumPoints
      body.push(i32le(0)); // Parts[0] = 0 (single part starting at vertex 0)
      pts.forEach(([x, y]) => { body.push(f64le(x)); body.push(f64le(y)); });
      body.push(f64le(fzmin)); body.push(f64le(fzmax));
      pts.forEach(([, , z]) => body.push(f64le(z ?? 0)));
      body.push(f64le(0)); body.push(f64le(0)); // Mmin, Mmax (unused)
      pts.forEach(() => body.push(f64le(0))); // M array (unused, still required to be present)
    }
    shpRecords.push({ idx, body });
  });

  // Fix PointZ body properly (X, Y, Z, M order) — rebuilt cleanly here rather than patched above.
  if (geomType === "point") {
    shpRecords.length = 0;
    features.forEach((f, idx) => {
      const [x, y, z] = f.geometry[0];
      const body = new ByteWriter();
      body.push(i32le(shapeType));
      body.push(f64le(x)); body.push(f64le(y)); body.push(f64le(z ?? 0)); body.push(f64le(0));
      shpRecords.push({ idx, body });
    });
  }

  shp.push(shpHeader(shapeType, xmin, ymin, xmax, ymax, zmin, zmax, () => {
    let words = 50;
    shpRecords.forEach((r) => { words += 4 + r.body.length / 2; });
    return words;
  }));
  shx.push(shpHeader(shapeType, xmin, ymin, xmax, ymax, zmin, zmax, () => 50 + shpRecords.length * 4));

  let offsetWords = 50;
  shpRecords.forEach((r, i) => {
    const contentWords = r.body.length / 2;
    shp.push(i32be(i + 1)); // record number, 1-based
    shp.push(i32be(contentWords));
    shp.push(r.body.toUint8Array());
    shx.push(i32be(offsetWords));
    shx.push(i32be(contentWords));
    offsetWords += 4 + contentWords;
  });

  return { shp: shp.toUint8Array(), shx: shx.toUint8Array() };
}
function shpHeader(shapeType, xmin, ymin, xmax, ymax, zmin, zmax, fileWordsFn) {
  const h = new ByteWriter();
  h.push(i32be(9994)); // file code
  for (let i = 0; i < 5; i++) h.push(i32be(0)); // unused
  h.push(i32be(fileWordsFn()));
  h.push(i32le(1000)); // version
  h.push(i32le(shapeType));
  h.push(f64le(xmin)); h.push(f64le(ymin)); h.push(f64le(xmax)); h.push(f64le(ymax));
  h.push(f64le(zmin)); h.push(f64le(zmax));
  h.push(f64le(0)); h.push(f64le(0)); // Mmin, Mmax unused
  return h.toUint8Array();
}

// ---------- DBF ----------
// Field type inferred per-column from the first non-null value seen across all features — 'N'umeric
// (with 6 decimal places, wide enough for coordinates/grades without truncating) or 'C'haracter.
function buildDbf(features, columns) {
  const fieldDefs = columns.map((col) => {
    let numeric = true;
    for (const f of features) {
      const v = f.attributes[col];
      if (v == null || v === "") continue;
      if (typeof v !== "number" || !Number.isFinite(v)) { numeric = false; break; }
    }
    const name = col.slice(0, 10).toUpperCase().replace(/[^A-Z0-9_]/g, "_") || "FIELD";
    return numeric ? { name, type: "N", len: 19, dec: 6 } : { name, type: "C", len: 60, dec: 0 };
  });
  // DBF field names must be unique within the 10-char limit — dedupe collisions (e.g. two source
  // columns both truncating to the same 10 chars) by appending a numeric suffix.
  const seen = new Map();
  fieldDefs.forEach((fd) => {
    const count = seen.get(fd.name) || 0;
    if (count > 0) fd.name = (fd.name.slice(0, 8) + "_" + count).slice(0, 10);
    seen.set(fd.name, count + 1);
  });

  const recordLen = 1 + fieldDefs.reduce((s, f) => s + f.len, 0); // +1 for the deletion flag byte
  const headerLen = 32 + fieldDefs.length * 32 + 1;
  const w = new ByteWriter();
  const header = new DataView(new ArrayBuffer(32));
  header.setUint8(0, 0x03); // version: dBASE III, no memo
  const now = new Date();
  header.setUint8(1, Math.max(0, now.getFullYear() - 1900));
  header.setUint8(2, now.getMonth() + 1);
  header.setUint8(3, now.getDate());
  header.setUint32(4, features.length, true);
  header.setUint16(8, headerLen, true);
  header.setUint16(10, recordLen, true);
  w.push(header.buffer);

  fieldDefs.forEach((fd) => {
    const fb = new Uint8Array(32);
    for (let i = 0; i < Math.min(10, fd.name.length); i++) fb[i] = fd.name.charCodeAt(i);
    fb[11] = fd.type.charCodeAt(0);
    fb[16] = fd.len;
    fb[17] = fd.dec;
    w.push(fb.buffer);
  });
  w.push(new Uint8Array([0x0d]).buffer); // header terminator

  features.forEach((f) => {
    const rec = new Uint8Array(recordLen);
    rec[0] = 0x20; // not deleted
    let off = 1;
    fieldDefs.forEach((fd, i) => {
      const col = columns[i];
      const raw = f.attributes[col];
      let text;
      if (fd.type === "N") {
        text = raw == null || raw === "" || !Number.isFinite(raw) ? "" : Number(raw).toFixed(fd.dec);
        text = text.slice(0, fd.len).padStart(fd.len, " ");
      } else {
        text = raw == null ? "" : String(raw);
        text = text.slice(0, fd.len).padEnd(fd.len, " ");
      }
      for (let c = 0; c < fd.len; c++) rec[off + c] = text.charCodeAt(c) || 0x20;
      off += fd.len;
    });
    w.push(rec.buffer);
  });
  w.push(new Uint8Array([0x1a]).buffer); // EOF marker

  return w.toUint8Array();
}

// ---------- .prj (WKT) — only for the small set of EPSG codes reproject.js already recognizes ----------
// Standard ESRI WKT templates for a UTM zone (Transverse Mercator, central meridian = -183 + 6*zone) —
// covers WGS84 UTM, NAD83 UTM, and (as a documented approximation — NAD83(CSRS) differs from plain
// NAD83 by a sub-metre, time-dependent correction, negligible for a shapefile handoff) this app's own
// NAD83(CSRS) BC zones. Geographic (lon/lat) gets a plain GEOGCS. An EPSG this app doesn't recognize
// gets no .prj at all (same "can't help, here's why" fallback shape as reproject.js) rather than a
// silently wrong one.
function utmWkt(name, zone, datumWkt) {
  const cm = -183 + 6 * zone;
  return `PROJCS["${name}",${datumWkt},PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",${cm}.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]`;
}
const WGS84_GEOGCS = `GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`;
const NAD83_GEOGCS = `GEOGCS["GCS_North_American_1983",DATUM["D_North_American_1983",SPHEROID["GRS_1980",6378137.0,298.257222101]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]`;
const NAD83_CSRS_UTM_ZONES = { 3154: 7, 3155: 8, 3156: 9, 3157: 10, 2955: 11 };
export function prjWktFor(epsg) {
  const code = Number(epsg);
  if (!Number.isFinite(code)) return null;
  if (code === 4326) return WGS84_GEOGCS;
  if (NAD83_CSRS_UTM_ZONES[code]) return utmWkt(`NAD83_CSRS_UTM_Zone_${NAD83_CSRS_UTM_ZONES[code]}N`, NAD83_CSRS_UTM_ZONES[code], NAD83_GEOGCS);
  if (code >= 32601 && code <= 32660) return utmWkt(`WGS_1984_UTM_Zone_${code - 32600}N`, code - 32600, WGS84_GEOGCS);
  if (code >= 26901 && code <= 26923) return utmWkt(`NAD83_UTM_Zone_${code - 26900}N`, code - 26900, NAD83_GEOGCS);
  return null;
}

// ---------- ZIP (STORED — no compression, valid per the ZIP spec and readable by every common tool) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function u16le(v) { const b = new DataView(new ArrayBuffer(2)); b.setUint16(0, v, true); return new Uint8Array(b.buffer); }
function u32le(v) { const b = new DataView(new ArrayBuffer(4)); b.setUint32(0, v >>> 0, true); return new Uint8Array(b.buffer); }
function strBytes(s) { return new TextEncoder().encode(s); }

function buildZip(files) {
  // files: [{ name, data: Uint8Array }]
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  files.forEach(({ name, data }) => {
    const nameBytes = strBytes(name);
    const crc = crc32(data);
    const local = concat([
      u32le(0x04034b50), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0),
      u32le(crc), u32le(data.length), u32le(data.length),
      u16le(nameBytes.length), u16le(0), nameBytes, data,
    ]);
    localParts.push(local);
    const central = concat([
      u32le(0x02014b50), u16le(20), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0),
      u32le(crc), u32le(data.length), u32le(data.length),
      u16le(nameBytes.length), u16le(0), u16le(0), u16le(0), u16le(0), u32le(0),
      u32le(offset), nameBytes,
    ]);
    centralParts.push(central);
    offset += local.length;
  });
  const centralStart = offset;
  const central = concat(centralParts);
  const eocd = concat([
    u32le(0x06054b50), u16le(0), u16le(0), u16le(files.length), u16le(files.length),
    u32le(central.length), u32le(centralStart), u16le(0),
  ]);
  return concat([...localParts, central, eocd]);
}
function concat(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  arrays.forEach((a) => { out.set(a, off); off += a.length; });
  return out;
}

// ---------- public entry point ----------
// { features: [{geometry, attributes}], geomType: 'point'|'polyline', epsg, baseName } -> Uint8Array
// (a .zip containing baseName.shp/.shx/.dbf[/.prj]), ready to hand to saveFile()/a download link.
export function buildShapefileZip({ features, geomType, epsg, baseName = "export" }) {
  if (!features || !features.length) throw new Error("Nothing to export — this layer has no rows with usable coordinates.");
  const columns = Array.from(features.reduce((set, f) => { Object.keys(f.attributes || {}).forEach((k) => set.add(k)); return set; }, new Set()));
  const { shp, shx } = buildShpShx(features, geomType);
  const dbf = buildDbf(features, columns);
  const name = (baseName || "export").replace(/[^a-z0-9_-]+/gi, "_").toLowerCase() || "export";
  const zipFiles = [
    { name: `${name}.shp`, data: shp },
    { name: `${name}.shx`, data: shx },
    { name: `${name}.dbf`, data: dbf },
  ];
  const wkt = prjWktFor(epsg);
  if (wkt) zipFiles.push({ name: `${name}.prj`, data: strBytes(wkt) });
  else zipFiles.push({ name: `${name}_READ_ME.txt`, data: strBytes(`No .prj was generated — EPSG:${epsg} isn't one of the codes GeoStrix has a built-in projection definition for (see reproject.js). This shapefile's coordinates are in EPSG:${epsg} — set that manually as the layer's CRS in your GIS software if it doesn't prompt you.`) });
  return buildZip(zipFiles);
}

// =====================================================================================
// READER — TASKS.csv #190 — "Shapefile (.shp) import" (previously only listed under
// GeophysicsModule's "Also planned" list). Reads a .zip bundle (the same shape this file's own
// writer produces, and what QGIS/ArcGIS "Export as Shapefile" also produces) back into the same
// { features: [{geometry, attributes}], geomType } shape buildVectorFeatures/buildShapefileZip
// already use, PLUS a flattened row-array form (shapefileFeaturesToRows) that plugs directly into
// the app's existing CSV-shaped import pipelines (ViewerModule's commitImportData/ImportMappingModal
// and GeophysicsModule's parseBlockModelCSV both already just want an array of plain {col: value}
// row objects — that's exactly what Papa.parse produces from a CSV, so a shapefile/GeoPackage import
// only has to produce the SAME shape, not a parallel import pipeline).
// =====================================================================================

// ---------- binary reader helpers ----------
class ByteReader {
  constructor(bytes) { this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.bytes = bytes; this.off = 0; }
  u8() { return this.dv.getUint8(this.off++); }
  i32be() { const v = this.dv.getInt32(this.off, false); this.off += 4; return v; }
  i32le() { const v = this.dv.getInt32(this.off, true); this.off += 4; return v; }
  f64le() { const v = this.dv.getFloat64(this.off, true); this.off += 8; return v; }
  skip(n) { this.off += n; }
}

// ---------- ZIP reader (STORED + DEFLATE) ----------
// Real-world shapefile .zip files (QGIS/ArcGIS exports) are almost always DEFLATE-compressed, unlike
// this file's own writer (which uses STORED for simplicity). Rather than hand-rolling an inflate
// algorithm — easy to get subtly wrong — this uses the browser/Electron-Chromium's own native
// DecompressionStream('deflate-raw'), available since Chromium 103 (this app ships Electron 28,
// Chromium ~120), so DEFLATE entries decompress correctly with zero new code and zero new dependency.
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// Reads the ZIP central directory (from the end, via the End-Of-Central-Directory record) rather
// than scanning local file headers sequentially — the standard, robust way to enumerate a ZIP's
// entries regardless of any padding/prepended data. Returns { name -> Uint8Array } of every entry's
// decompressed bytes.
export async function readZipEntries(zipBytes) {
  const bytes = zipBytes instanceof Uint8Array ? zipBytes : new Uint8Array(zipBytes);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Find EOCD signature (0x06054b50) scanning backward — comment field (if any) makes its offset
  // variable, so search the last 64KB+22 bytes (the max possible EOCD position) rather than assuming
  // it's the last 22 bytes exactly.
  let eocd = -1;
  const searchStart = Math.max(0, bytes.length - 65557);
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid .zip file (no end-of-central-directory record found).");
  const entryCount = dv.getUint16(eocd + 10, true);
  const centralStart = dv.getUint32(eocd + 16, true);

  const entries = {};
  let off = centralStart;
  for (let i = 0; i < entryCount; i++) {
    if (dv.getUint32(off, true) !== 0x02014b50) throw new Error("Corrupt .zip central directory.");
    const method = dv.getUint16(off + 10, true);
    const compSize = dv.getUint32(off + 20, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(off + 46, off + 46 + nameLen));
    // Jump to the local file header to find where the actual (possibly differently-ordered/sized)
    // compressed data starts — its own name/extra field lengths can differ from the central record's.
    const lMethod = dv.getUint16(localOff + 8, true);
    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);
    entries[name] = { method: lMethod ?? method, raw: new Uint8Array(raw) };
    off += 46 + nameLen + extraLen + commentLen;
  }
  const out = {};
  for (const [name, { method, raw }] of Object.entries(entries)) {
    out[name] = method === 8 ? await inflateRaw(raw) : raw; // 0 = STORED, 8 = DEFLATE
  }
  return out;
}

// ---------- SHP reader ----------
// Handles Point/PointZ (1/11) and PolyLine/PolyLineZ/Polygon/PolygonZ (3/13/5/15) — the shapes this
// app can actually use (a polygon's ring is read the same way a polyline's vertex list is; this app
// has no polygon-fill rendering, so a polygon import comes in as its outline, which is enough to see/
// snap to in the 3D view or re-derive attributes from). Any other shape type present in the file is
// SKIPPED with a returned count (surfaced as a notice by the caller) rather than silently dropped —
// matches the "no silent truncation" approach the rest of this app already follows (e.g. the surface-
// modeling sanitization pass in ViewerModule's runSurfaceStack).
const SUPPORTED_SHAPE_TYPES = new Set([1, 11, 3, 13, 5, 15]);
function parseShp(shpBytes) {
  const r = new ByteReader(shpBytes);
  r.off = 100; // skip the fixed 100-byte header (file code, 5 unused words, file length, version, shape type, bbox) — nothing in it is needed to read records
  const geoms = [];
  let skippedCount = 0;
  while (r.off < shpBytes.length) {
    if (r.off + 8 > shpBytes.length) break;
    r.i32be(); // record number (1-based) — unused, records are read in file order
    const contentWords = r.i32be();
    const recordEnd = r.off + contentWords * 2;
    const shapeType = r.i32le();
    if (shapeType === 0) { geoms.push(null); r.off = recordEnd; continue; } // null shape
    if (!SUPPORTED_SHAPE_TYPES.has(shapeType)) { skippedCount++; geoms.push(null); r.off = recordEnd; continue; }
    if (shapeType === 1 || shapeType === 11) {
      // PointZ record layout is ShapeType, X, Y, Z, M — read sequentially, Z only present for type 11.
      const x = r.f64le(), y = r.f64le();
      const zVal = shapeType === 11 ? r.f64le() : 0;
      geoms.push({ type: "point", pts: [[x, y, zVal]] });
    } else {
      // PolyLine/PolyLineZ/Polygon/PolygonZ share one binary layout: bbox, numParts, numPoints,
      // parts[], points[] (X,Y pairs) [, Zrange, Z[]] [, Mrange, M[]]. Multi-part features collapse
      // to their FIRST part only (this app's own writer never produces multi-part features, and
      // supporting every ring of a multi-ring polygon import isn't needed for "see it in 3D / recover
      // attributes" — noted here rather than silently mishandled).
      r.skip(32); // bbox (4 doubles)
      const numParts = r.i32le();
      const numPoints = r.i32le();
      const partsStart = r.off;
      r.skip(numParts * 4);
      const firstPartStart = numParts > 0 ? new DataView(shpBytes.buffer, shpBytes.byteOffset + partsStart, 4).getInt32(0, true) : 0;
      const firstPartEnd = numParts > 1 ? new DataView(shpBytes.buffer, shpBytes.byteOffset + partsStart + 4, 4).getInt32(0, true) : numPoints;
      const xy = [];
      for (let i = 0; i < numPoints; i++) { const x = r.f64le(); const y = r.f64le(); xy.push([x, y]); }
      let z = new Array(numPoints).fill(0);
      if (shapeType === 13 || shapeType === 15) {
        r.skip(16); // Zmin, Zmax
        for (let i = 0; i < numPoints; i++) z[i] = r.f64le();
      }
      const pts = xy.slice(firstPartStart, firstPartEnd).map(([x, y], i) => [x, y, z[firstPartStart + i] ?? 0]);
      geoms.push({ type: (shapeType === 5 || shapeType === 15) ? "polygon" : "polyline", pts });
    }
    r.off = recordEnd;
  }
  return { geoms, skippedCount };
}

// ---------- DBF reader ----------
function parseDbf(dbfBytes) {
  const dv = new DataView(dbfBytes.buffer, dbfBytes.byteOffset, dbfBytes.byteLength);
  const numRecords = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recordLen = dv.getUint16(10, true);
  const fields = [];
  let off = 32;
  while (dbfBytes[off] !== 0x0d && off < headerLen) {
    let name = "";
    for (let i = 0; i < 11; i++) { const c = dbfBytes[off + i]; if (c === 0) break; name += String.fromCharCode(c); }
    const type = String.fromCharCode(dbfBytes[off + 11]);
    const len = dbfBytes[off + 16];
    const dec = dbfBytes[off + 17];
    fields.push({ name: name.trim(), type, len, dec });
    off += 32;
  }
  const dec = new TextDecoder("latin1"); // DBF is single-byte-encoded (no BOM/UTF-8 guarantee) — latin1 is a safe superset for byte-for-byte ASCII/Windows-1252 text without mangling
  const rows = [];
  let recOff = headerLen;
  for (let i = 0; i < numRecords && recOff < dbfBytes.length; i++) {
    const deleted = dbfBytes[recOff] === 0x2a;
    let fieldOff = recOff + 1;
    const row = {};
    fields.forEach((f) => {
      const raw = dec.decode(dbfBytes.subarray(fieldOff, fieldOff + f.len)).trim();
      if (f.type === "N" || f.type === "F") row[f.name] = raw === "" ? null : Number(raw);
      else if (f.type === "L") row[f.name] = raw === "" ? null : /^[YyTt]/.test(raw);
      else row[f.name] = raw;
      fieldOff += f.len;
    });
    if (!deleted) rows.push(row);
    recOff += recordLen;
  }
  return rows;
}

// ---------- public entry points ----------
// Parses a .zip (or already-split .shp/.dbf bytes) into { features, geomType, skippedCount }, the
// same shape buildShapefileZip's own INPUT uses — a natural round-trip. geomType is inferred from
// whichever shape type the file's geometries actually are ('point'|'polyline'|'polygon'); a file
// containing more than one basename's worth of .shp (rare, but zips CAN bundle multiple layers) only
// reads the FIRST .shp/.dbf pair found — surfaced via `otherBaseNames` so the caller can tell the user
// if anything got left out rather than silently reading just one of several.
export async function parseShapefileZip(zipBytes) {
  const entries = await readZipEntries(zipBytes);
  const shpNames = Object.keys(entries).filter((n) => /\.shp$/i.test(n));
  if (!shpNames.length) throw new Error("No .shp file found inside this .zip.");
  const baseNames = Array.from(new Set(shpNames.map((n) => n.replace(/\.shp$/i, ""))));
  const base = baseNames[0];
  return parseShapefileParts({ shp: entries[`${base}.shp`], dbf: entries[`${base}.dbf`] }, baseNames.length - 1);
}
// Parses raw .shp (+ optional .dbf) bytes directly — used when the user drops loose .shp/.dbf/.shx
// files together (grouped by basename) rather than a zip, matching how a lot of real-world shapefiles
// actually arrive (unzipped, straight off a USB drive or an old FTP archive).
export function parseShapefileParts({ shp, dbf }, otherBaseNames = 0) {
  if (!shp) throw new Error("No .shp data found.");
  const { geoms, skippedCount } = parseShp(shp);
  const attrRows = dbf ? parseDbf(dbf) : [];
  const features = geoms.map((g, i) => (g ? { geometry: g.pts, attributes: attrRows[i] || {} } : null)).filter(Boolean);
  if (!features.length) throw new Error("No usable Point/PolyLine/Polygon features found in this shapefile (or every feature's shape type isn't one GeoStrix reads).");
  const geomType = geoms.find((g) => g)?.type || "point";
  return { features, geomType, skippedCount, otherBaseNames, hasAttributes: !!dbf };
}

// Flattens { features, geomType } into plain row objects — x/y/z taken from the FIRST vertex of each
// feature's geometry (the natural choice for BOTH a point feature, where that's the only vertex, and
// a polyline/polygon feature being imported as a collar/block-centroid-style point layer) — plus
// every DBF attribute column, so the result plugs directly into the exact same CSV-row-shaped import
// pipelines (ViewerModule's ImportMappingModal/commitImportData, GeophysicsModule's
// parseBlockModelCSV) a Papa.parse CSV result already produces, with zero separate import code path.
export function shapefileFeaturesToRows({ features, geomType }) {
  const rows = features.map((f) => {
    const [x, y, z] = f.geometry[0] || [];
    const row = { ...f.attributes, x, y, z };
    if (geomType !== "point" && f.geometry.length > 1) {
      const [x2, y2, z2] = f.geometry[f.geometry.length - 1];
      row.x2 = x2; row.y2 = y2; row.z2 = z2; // end vertex, kept alongside so a trace/interval's far end isn't discarded
    }
    return row;
  });
  const headers = Array.from(rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set()));
  return { rows, headers };
}
