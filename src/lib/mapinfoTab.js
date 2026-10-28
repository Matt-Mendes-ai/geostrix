// TASKS.csv #818 — native reader for MapInfo TAB vector layers (.TAB + .MAP + .ID + .DAT), so the geology maps and
// structure points in ARIS assessment-report folders open without GDAL. Pure: bytes in, features out (no DOM, no fs).
//
// Binary format per GDAL's mitab driver (MIT licence: ogr/ogrsf_frmts/mitab/mitab_mapheaderblock.cpp,
// mitab_mapobjectblock.cpp, mitab_mapcoordblock.cpp, mitab_feature.cpp, mitab_datfile.cpp, mitab_tabfile.cpp and
// ogr/ogrmitabspatialref.cpp). This is an independent JavaScript implementation of that layout, validated feature by
// feature against GDAL 3.6 (ogr2ogr) on every native .TAB in Matt's sample ARIS folders.
//
//   .TAB  text header: charset, table type, field list (names + types), optionally a CoordSys line.
//   .DAT  dBase-III-like attribute table; in NATIVE tables Integer/SmallInt/Float/Date/Time fields are stored as
//         little-endian binary inside 'C' columns, Decimal as text, Logical as one 0/1 byte. First byte of a record:
//         ' ' live, '*' deleted.
//   .ID   one int32 per row: byte offset of that row's object in the .MAP (0 = row has no geometry).
//   .MAP  header block (projection, integer->coordinate scale/offset, origin quadrant), object blocks (type 2; a
//         20-byte header holding the block centre that "compressed" objects store int16 offsets from) and coordinate
//         blocks (type 3; 8-byte header + chained data) that hold polyline/region vertices and text strings.
//
// Output matches src/lib/shapefile.js parseShapefileParts: features { geometry, parts, attributes } with geomType
// "point" | "polyline" | "polygon" (the names the map-layer code in mapLayers.js uses). A file that mixes object types
// is split into one layer per family. Object types:
//   points        symbol, font symbol, custom symbol, multipoint (each point its own feature, as #415 does for shp)
//   polylines     line, polyline, multi-polyline (V300/V450/V800), arc (densified exactly as GDAL: 2-degree steps)
//   polygons      region (V300/V450/V800; every section is a ring, kept in file order: exterior then its holes),
//                 rectangle, rounded rectangle (45 points per corner) and ellipse (180 points), generated as GDAL does
//   text          a separate "<base> (text)" point layer with the label string in `_text` (old ARIS maps often carry
//                 dips as text labels); the point is GDAL's text anchor (rotated box corner + height).
//   skipped       collections (MapInfo 7.5+ "collection" objects: region + pline + multipoint in one record — never
//                 seen in the sample data, counted in skipped.unsupported), unknown object types, rows without
//                 geometry, rows deleted in the .DAT.

import { t as tr } from "./i18n.js";

// ---------- small helpers ----------
const INT32_MAX = 2147483647, INT32_MIN = -2147483648;
const satAdd = (a, b) => { const s = a + b; return s > INT32_MAX ? INT32_MAX : s < INT32_MIN ? INT32_MIN : s; }; // TABSaturatedAdd
const roundC = (v) => (v < 0 ? -Math.round(-v) : Math.round(v)); // C round(): halves away from zero
const toBytes = (b) => (b == null ? null : b instanceof Uint8Array ? b : new Uint8Array(b));

// MapInfo charset names -> TextDecoder labels (GDAL mitab_imapinfofile.cpp apszCharsets). "Neutral" means "no
// conversion" in GDAL; Windows-1252 is the practical reading of such bytes (a superset of ASCII).
const CHARSETS = {
  neutral: "windows-1252", iso8859_1: "iso-8859-1", iso8859_2: "iso-8859-2", iso8859_3: "iso-8859-3", iso8859_4: "iso-8859-4",
  iso8859_5: "iso-8859-5", iso8859_6: "iso-8859-6", iso8859_7: "iso-8859-7", iso8859_8: "iso-8859-8", iso8859_9: "iso-8859-9",
  packedeucjapaese: "euc-jp", windowslatin1: "windows-1252", windowslatin2: "windows-1250", windowsarabic: "windows-1256",
  windowscyrillic: "windows-1251", windowsbalticrim: "windows-1257", windowsgreek: "windows-1253", windowshebrew: "windows-1255",
  windowsturkish: "windows-1254", windowstradchinese: "big5", windowssimpchinese: "gbk", windowsjapanese: "shift_jis",
  windowskorean: "euc-kr", codepage437: "ibm866", codepage850: "windows-1252", codepage852: "iso-8859-2", codepage855: "ibm866",
  codepage857: "windows-1254", codepage860: "windows-1252", codepage861: "windows-1252", codepage863: "windows-1252",
  codepage864: "windows-1256", codepage865: "windows-1252", codepage869: "windows-1253", "utf-8": "utf-8", utf8: "utf-8",
};
export function makeDecoder(charset) { // exported for the MIF reader (#945)
  const label = CHARSETS[String(charset || "neutral").toLowerCase()] || "windows-1252";
  try { return new TextDecoder(label); } catch { return new TextDecoder("windows-1252"); }
}

// GDAL's CSLTokenizeStringComplex(line, " \t(),;", honour "quotes"): splits on those characters, keeps quoted runs whole.
function tokenize(line) {
  const out = [];
  let cur = "", inQ = false, had = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; had = true; continue; }
    if (!inQ && " \t(),;".includes(ch)) { if (cur || had) out.push(cur); cur = ""; had = false; continue; }
    cur += ch;
  }
  if (cur || had) out.push(cur);
  return out;
}

// ---------- .TAB header ----------
// Mirrors TABFile::ParseTABFileFirstPass + ParseTABFileFields: "!charset", "Definition Table", "Type NATIVE|LINKED|DBF",
// "Fields N" followed by exactly N field lines ("Name Type [(width[,decimals])] [Index n] ;"), plus any CoordSys line.
// `tab` may be a string or the raw bytes; bytes are decoded with the file's own "!charset" (accented field names).
function tabToText(tab) {
  if (tab == null || typeof tab === "string") return tab || "";
  const b = toBytes(tab);
  const cs = /^\s*!charset\s+(\S+)/im.exec(new TextDecoder("windows-1252").decode(b));
  return makeDecoder(cs && cs[1]).decode(b);
}
export function parseTabHeader(tab) {
  const lines = tabToText(tab).split(/\r?\n/);
  let charset = null, tableType = null, version = 0, inDef = false, coordSys = null;
  const fields = [];
  for (let i = 0; i < lines.length; i++) {
    const tok = tokenize(lines[i]);
    if (/^\s*coordsys\b/i.test(lines[i]) && !coordSys) coordSys = lines[i].trim();
    if (tok.length < 2) continue;
    const k = tok[0].toLowerCase();
    if (k === "!version") { version = parseInt(tok[1], 10) || 0; if (version === 100) { inDef = true; tableType = "NATIVE"; } }
    else if (k === "!charset") charset = tok[1];
    else if (k === "definition" && tok[1].toLowerCase() === "table") inDef = true;
    else if (inDef && !fields.length && (k === "type" || k === "format:")) tableType = tok[1].toUpperCase();
    else if (inDef && !fields.length && (k === "fields" || k === "fields:")) {
      const n = parseInt(tok[1], 10) || 0;
      for (let f = 0; f < n && i + 1 < lines.length; f++) {
        const ft = tokenize(lines[++i]);
        if (!ft.length) continue;
        const type = (ft[1] || "char").toLowerCase();
        fields.push({ name: ft[0], tabType: type, width: parseInt(ft[2], 10) || 0, decimals: parseInt(ft[3], 10) || 0 });
      }
      inDef = false;
    }
  }
  return { charset: charset || "Neutral", tableType: tableType || "NATIVE", version, fields, coordSys };
}

// ---------- CRS ----------
// MapInfo datum ids (GDAL asDatumInfoList) for the datums that matter in Canadian exploration data, with the ellipsoid
// id and datum shift GDAL uses to recognize them in pre-v500 .MAP headers (which leave the datum id at 0). The order
// follows GDAL's table: the first match wins (ellipsoid 0 + no shift = NAD83 before "GRS 80").
const DATUMS = [
  { id: 104, ell: 28, shift: [0, 0, 0], name: "WGS84" },
  { id: 74, ell: 0, shift: [0, 0, 0], name: "NAD83" },
  { id: 62, ell: 7, shift: [-8, 160, 176], name: "NAD27" },
  { id: 63, ell: 7, shift: [-5, 135, 172], name: "NAD27 (Alaska)" },
  { id: 66, ell: 7, shift: [-10, 158, 187], name: "NAD27 (Canada)" },
  { id: 33, ell: 0, shift: [0, 0, 0], name: "GRS80" },
  // MapInfo datum 0 on ellipsoid 29 ("WGS 84 (MAPINFO Datum 0)", no shift): GDAL calls it "MIF 0"; it is WGS84 in all
  // but name (seen in old BC base-map tables such as bc_LAKES.TAB), so it maps like datum 104.
  { id: 0, ell: 29, shift: [0, 0, 0], name: "WGS84 (MapInfo datum 0)", as: 104 },
];
const GEOG_EPSG = { 104: 4326, 74: 4269, 33: 4269, 62: 4267, 63: 4267, 66: 4267 };
const UNIT_NAMES = { 0: "mi", 1: "km", 2: "in", 3: "ft", 4: "yd", 5: "mm", 6: "cm", 7: "m", 8: "survey ft", 9: "nmi", 13: "degree", 30: "li", 31: "ch", 32: "rd" };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

function findDatum(datumId, ellipsoidId, shift, datumParams) {
  if (datumId > 0) return DATUMS.find((d) => d.id === datumId) || { id: datumId, name: `MapInfo datum ${datumId}` };
  if (datumParams && datumParams.some((v) => Math.abs(v) > 1e-10)) return null;
  return DATUMS.find((d) => d.ell === ellipsoidId && d.shift.every((v, i) => near(v, shift[i] || 0, 1e-10))) || null;
}

// { projId, datum, unitsId, params[] } -> { epsg, crsNote }. Covers geographic lon/lat, UTM (Transverse Mercator with
// k 0.9996, FE 500000, lat0 0, central meridian on a zone) and BC Albers; anything else returns epsg null + a note.
function epsgFor({ projId, datum: d, unitsId, params }) {
  const datum = d && d.as ? { ...d, id: d.as } : d;
  const dName = datum ? datum.name : "an unrecognized datum";
  if (projId === 0) return { epsg: null, crsNote: "Non-earth (local) coordinates; no EPSG code applies." };
  if (!datum) return { epsg: null, crsNote: `MapInfo projection ${projId} on an unrecognized datum; set the CRS by hand.` };
  if (projId === 1) {
    const e = GEOG_EPSG[datum.id];
    return e ? { epsg: e, crsNote: `Longitude/latitude, ${dName}.` } : { epsg: null, crsNote: `Longitude/latitude on ${dName}; no EPSG mapping.` };
  }
  if (unitsId !== 7) return { epsg: null, crsNote: `Projected coordinates in ${UNIT_NAMES[unitsId] || `unit ${unitsId}`} on ${dName}; only metre grids are mapped to EPSG.` };
  const p = params;
  if ((projId === 8 || projId === 34) && near(p[1], 0) && near(p[2], 0.9996) && near(p[3], 500000) && (near(p[4], 0) || near(p[4], 10000000))) {
    const zone = (p[0] + 183) / 6;
    if (Number.isInteger(Math.round(zone * 1e6) / 1e6) && zone >= 1 && zone <= 60) {
      const z = Math.round(zone), south = near(p[4], 10000000);
      let epsg = null;
      if (datum.id === 104) epsg = (south ? 32700 : 32600) + z;
      else if ((datum.id === 74 || datum.id === 33) && !south && z <= 23) epsg = 26900 + z;
      else if ((datum.id === 62 || datum.id === 63 || datum.id === 66) && !south && z <= 22) epsg = 26700 + z;
      const note = `UTM zone ${z}${south ? "S" : "N"}, ${dName}` + (datum.id === 66 || datum.id === 63 ? " (mapped to the generic NAD27 UTM code)." : ".");
      return epsg ? { epsg, crsNote: note } : { epsg: null, crsNote: `${note} No EPSG mapping.` };
    }
  }
  if (projId === 9 && (datum.id === 74 || datum.id === 33) && near(p[0], -126) && near(p[1], 45) && near(Math.min(p[2], p[3]), 50) && near(Math.max(p[2], p[3]), 58.5) && near(p[4], 1000000) && near(p[5], 0)) {
    return { epsg: 3005, crsNote: "BC Albers, NAD83." };
  }
  return { epsg: null, crsNote: `MapInfo projection ${projId} on ${dName} (parameters ${p.slice(0, 6).map((v) => +v.toFixed(6)).join(", ")}); no EPSG mapping.` };
}

// A .TAB / .MIF CoordSys clause, e.g. `CoordSys Earth Projection 8, 74, "m", -123, 0, 0.9996, 500000, 0` (UTM 10N
// NAD83 -> 26910) or `CoordSys Earth Projection 1, 104` (WGS84 lon/lat -> 4326). Datum 999 / 9999 carry an explicit
// ellipsoid + shift (+ rotation/scale), matched against the datum table the same way a pre-v500 .MAP header is.
export function mapinfoCoordSysToEpsg(coordSys) {
  const s = String(coordSys || "").trim();
  if (/^coordsys\s+nonearth/i.test(s)) return { epsg: null, crsNote: "Non-earth (local) coordinates; no EPSG code applies." };
  const m = /^coordsys\s+earth\s+projection\s+(.*)$/i.exec(s);
  if (!m) return { epsg: null, crsNote: s ? `Unrecognized CoordSys clause: ${s}` : "No CoordSys clause." };
  const body = m[1].replace(/\b(bounds|affine)\b[\s\S]*$/i, "");
  const tok = body.split(",").map((x) => x.trim()).filter((x) => x !== "");
  let projId = parseInt(tok[0], 10);
  if (projId >= 1000) projId %= 1000; // +1000 affine, +2000 bounds flags
  let i = 1, datumId = parseInt(tok[i++], 10), datum;
  if (datumId === 999 || datumId === 9999) {
    const ell = parseInt(tok[i++], 10), shift = [+tok[i++], +tok[i++], +tok[i++]];
    const extra = datumId === 9999 ? [+tok[i++], +tok[i++], +tok[i++], +tok[i++], +tok[i++]] : [];
    datum = findDatum(0, ell, shift, extra);
  } else datum = findDatum(datumId, -1, [0, 0, 0], null);
  let unitsId = 13;
  if (projId !== 1 && tok[i] != null) {
    const u = tok[i++].replace(/"/g, "").toLowerCase();
    const hit = Object.entries(UNIT_NAMES).find(([, v]) => v === u);
    unitsId = hit ? +hit[0] : u === "survey foot" ? 8 : -1;
  }
  const params = tok.slice(i).map(Number);
  while (params.length < 7) params.push(0);
  return epsgFor({ projId, datum, unitsId, params });
}

// ---------- .MAP header ----------
const HDR_MAGIC = 42424242;
function readMapHeader(dv, len) {
  if (len < 512 || dv.getInt32(0x100, true) !== HDR_MAGIC) throw new Error(tr("Not a valid MapInfo .MAP file."));
  const version = dv.getInt16(0x104, true);
  const blockSize = dv.getInt16(0x106, true);
  if (blockSize < 512) throw new Error(tr("Not a valid MapInfo .MAP file."));
  const quadrant = dv.getUint8(0x161);
  const datumId = version >= 500 ? dv.getInt16(0x16a, true) : 0;
  const projId = dv.getUint8(0x16d), ellipsoidId = dv.getUint8(0x16e), unitsId = dv.getUint8(0x16f);
  let xScale = dv.getFloat64(0x170, true), yScale = dv.getFloat64(0x178, true);
  let xDispl = dv.getFloat64(0x180, true), yDispl = dv.getFloat64(0x188, true);
  if (version <= 100) { xScale = yScale = Math.pow(10, dv.getUint8(0x160)); xDispl = yDispl = 0; }
  if (!xScale || !yScale) throw new Error(tr("Not a valid MapInfo .MAP file."));
  const params = []; for (let k = 0; k < 6; k++) params.push(dv.getFloat64(0x190 + 8 * k, true));
  params.push(0);
  const shift = [dv.getFloat64(0x1c0, true), dv.getFloat64(0x1c8, true), dv.getFloat64(0x1d0, true)];
  const datumParams = []; for (let k = 0; k < 5; k++) datumParams.push(version <= 200 ? 0 : dv.getFloat64(0x1d8 + 8 * k, true));
  // TABMAPHeaderBlock::UpdatePrecision — Int2Coordsys rounds to the decimal precision the scale implies.
  const xPrec = Math.pow(10, roundC(Math.log10(xScale))), yPrec = Math.pow(10, roundC(Math.log10(yScale)));
  return { version, blockSize, quadrant, datumId, projId, ellipsoidId, unitsId, xScale, yScale, xDispl, yDispl, params, shift, datumParams, xPrec, yPrec };
}

// ---------- the reader ----------
const FAMILY = {};
[0x01, 0x02, 0x28, 0x29, 0x2b, 0x2c].forEach((t) => (FAMILY[t] = "point"));
[0x34, 0x35, 0x43, 0x44].forEach((t) => (FAMILY[t] = "multipoint"));
[0x04, 0x05, 0x07, 0x08, 0x25, 0x26, 0x31, 0x32, 0x40, 0x41, 0x0a, 0x0b].forEach((t) => (FAMILY[t] = "polyline"));
[0x0d, 0x0e, 0x2e, 0x2f, 0x3d, 0x3e, 0x13, 0x14, 0x16, 0x17, 0x19, 0x1a].forEach((t) => (FAMILY[t] = "polygon"));
[0x10, 0x11].forEach((t) => (FAMILY[t] = "text"));

// TABGenerateArc: numPoints evenly spaced angles from start to end (counter-clockwise), then the last point repeated.
export function generateArc(out, n, cx, cy, rx, ry, a0, a1) { // also the MIF reader's (#945)
  if (a1 < a0) a1 += 2 * Math.PI;
  const step = (a1 - a0) / (n - 1);
  let a = 0;
  for (let i = 0; i < n; i++) { a = a0 + i * step; out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
}
export const closeRing = (r) => { if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push([r[0][0], r[0][1]]); };

function makeMapReader(mapBytes, decoder) {
  const dv = new DataView(mapBytes.buffer, mapBytes.byteOffset, mapBytes.byteLength);
  const len = mapBytes.byteLength;
  const H = readMapHeader(dv, len);
  const bs = H.blockSize;
  const q = H.quadrant;
  const flipX = q === 2 || q === 3 || q === 0, flipY = q === 3 || q === 4 || q === 0;
  // TABMAPHeaderBlock::Int2Coordsys
  const toX = (n) => { const v = flipX ? -(n + H.xDispl) / H.xScale : (n - H.xDispl) / H.xScale; return H.xPrec > 0 && H.yPrec > 0 ? roundC(v * H.xPrec) / H.xPrec : v; };
  const toY = (n) => { const v = flipY ? -(n + H.yDispl) / H.yScale : (n - H.yDispl) / H.yScale; return H.xPrec > 0 && H.yPrec > 0 ? roundC(v * H.yPrec) / H.yPrec : v; };
  const pt = (nx, ny) => [toX(nx), toY(ny)];
  const need = (off, n) => { if (off < 0 || off + n > len) throw new Error("MAP read out of range"); };

  // A cursor over chained coordinate blocks (TABMAPCoordBlock::ReadBytes): data in each block ends at 8 + bytesUsed;
  // reading past it continues at the next block's data, even mid-value (text strings may straddle blocks).
  // TASKS.csv #1078 (review #1016, security) — every object could claim up to len / 4 vertices and every chain could link
  // back to itself, so a crafted 37 KB table decoded into 9.6 million vertices (869 MB). A chain may not revisit a block,
  // and all the coordinate bytes read for the whole table may not exceed the file's own size (plus slack): each byte of
  // real coordinate data belongs to one object. Past that the import stops (TAB_TOO_BIG), it does not just skip one object.
  let coordBytesRead = 0;
  const coordBudget = len + 65536;
  function coordCursor(ptr) {
    let base = ptr - (ptr % bs), pos = ptr, end = 0, next = 0;
    const seen = new Set();
    const load = () => { need(base, 8); if (seen.has(base)) throw new Error("coordinate blocks loop"); seen.add(base); if (dv.getUint8(base) !== 3) throw new Error("not a coordinate block"); end = base + 8 + dv.getInt16(base + 2, true); next = dv.getInt32(base + 4, true); };
    load();
    if (ptr % bs === 0) pos = base + 8;
    const tmp = new DataView(new ArrayBuffer(8));
    const advance = () => { base = next; load(); pos = base + 8; };
    function bytesAt(n) { // returns [dataview, offset] holding n contiguous bytes
      coordBytesRead += n;
      if (coordBytesRead > coordBudget) { const e = new Error("too much coordinate data"); e.tooBig = true; throw e; }
      if (pos >= end && next > 0) advance();
      if (pos + n <= end || next <= 0) { need(pos, n); const o = pos; pos += n; return [dv, o]; }
      for (let k = 0; k < n; k++) { if (pos >= end && next > 0) advance(); need(pos, 1); tmp.setUint8(k, dv.getUint8(pos++)); }
      return [tmp, 0];
    }
    return {
      i16: () => { const [d, o] = bytesAt(2); return d.getInt16(o, true); },
      i32: () => { const [d, o] = bytesAt(4); return d.getInt32(o, true); },
      bytes: (n) => { const out = new Uint8Array(n); for (let k = 0; k < n; k++) { const [d, o] = bytesAt(1); out[k] = d.getUint8(o); } return out; },
    };
  }

  // Multi-section objects (regions, multi-polylines): section headers then all vertices (ReadCoordSecHdrs/ReadIntCoords).
  function readSections(ptr, numSections, compressed, version, orgX, orgY) {
    const c = coordCursor(ptr);
    const secSize = version >= 450 ? 28 : 24, totalHdr = secSize * numSections;
    const rc = compressed ? () => [satAdd(c.i16(), orgX), satAdd(c.i16(), orgY)] : () => [c.i32(), c.i32()];
    const secs = [];
    let total = 0;
    for (let s = 0; s < numSections; s++) {
      const nv = version >= 450 ? c.i32() : c.i16();
      if (version >= 800) c.i32(); else c.i16(); // numHoles: not needed, every ring is kept as a part in file order
      rc(); rc(); // section MBR
      const dataOff = c.i32();
      if (nv < 0 || dataOff < totalHdr) throw new Error("bad section header");
      secs.push({ nv, vo: (dataOff - totalHdr) / 8 });
      total += nv;
    }
    if (total * (compressed ? 4 : 8) > len) throw new Error("too many vertices");
    const xs = new Int32Array(total), ys = new Int32Array(total);
    for (let k = 0; k < total; k++) { const [x, y] = rc(); xs[k] = x; ys[k] = y; }
    return secs.map(({ nv, vo }) => {
      if (vo < 0 || vo + nv > total) throw new Error("section vertices out of range");
      const ring = new Array(nv);
      for (let k = 0; k < nv; k++) ring[k] = pt(xs[vo + k], ys[vo + k]);
      return ring;
    });
  }

  // Reads the object at file offset `off` for row `rowId`. Returns { family, parts, text? } or { skip: reason }.
  function readObject(off, rowId) {
    need(off, 5);
    const blockBase = off - (off % bs);
    need(blockBase, 20);
    if (dv.getUint8(blockBase) !== 2) return { skip: "corrupt" };
    const cx = dv.getInt32(blockBase + 4, true), cy = dv.getInt32(blockBase + 8, true);
    const type = dv.getUint8(off);
    const id = dv.getInt32(off + 1, true);
    if (id !== rowId) return { skip: (id & 0x40000000) ? "deleted" : "corrupt" };
    if (type === 0) return { skip: "noGeometry" };
    const fam = FAMILY[type];
    if (!fam) return { skip: "unsupported" };
    const compressed = type % 3 === 1;
    let p = off + 5;
    const i16 = () => { const v = dv.getInt16(p, true); p += 2; return v; };
    const i32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
    const ic = () => (compressed ? [satAdd(i16(), cx), satAdd(i16(), cy)] : [i32(), i32()]); // TABMAPObjectBlock::ReadIntCoord

    if (fam === "point") {
      if (type === 0x28 || type === 0x29) p += 12; // font symbol: symbol, size, style, colours, angle
      else if (type === 0x2b || type === 0x2c) p += 2; // custom symbol: unknown + style bytes
      const [x, y] = ic();
      return { family: "point", parts: [[pt(x, y)]] };
    }
    if (type === 0x04 || type === 0x05) { // two-point line
      const [x1, y1] = ic(), [x2, y2] = ic();
      return { family: "polyline", parts: [[pt(x1, y1), pt(x2, y2)]] };
    }
    if (fam === "polyline" && type !== 0x0a && type !== 0x0b || type === 0x0d || type === 0x0e || type === 0x2e || type === 0x2f || type === 0x3d || type === 0x3e) {
      // TABMAPObjPLine::ReadObj — polylines, multi-polylines, regions
      const coordPtr = i32();
      const dataSize = i32() & 0x7fffffff; // top bit = smoothed
      const isPline = type === 0x07 || type === 0x08;
      const v800 = type >= 0x3d;
      let numSections = 1;
      if (v800) { numSections = i32(); p += 33; } else if (!isPline) numSections = i16();
      if (numSections < 0) return { skip: "corrupt" };
      let orgX, orgY;
      if (compressed) { p += 4; orgX = i32(); orgY = i32(); }
      else { p += 8; const x0 = i32(), y0 = i32(), x1 = i32(), y1 = i32(); orgX = Math.trunc((x0 + x1) / 2); orgY = Math.trunc((y0 + y1) / 2); }
      const family = fam === "polygon" ? "polygon" : "polyline";
      if (isPline) {
        const n = Math.floor(dataSize / (compressed ? 4 : 8));
        if (n * (compressed ? 4 : 8) > len) return { skip: "corrupt" };
        const c = coordCursor(coordPtr);
        const line = new Array(n);
        for (let k = 0; k < n; k++) line[k] = compressed ? pt(satAdd(c.i16(), orgX), satAdd(c.i16(), orgY)) : pt(c.i32(), c.i32());
        return { family, parts: [line] };
      }
      const version = type < 0x2e ? 300 : type < 0x34 ? 450 : type < 0x3a ? 650 : 800; // TAB_GEOM_GET_VERSION
      const parts = readSections(coordPtr, numSections, compressed, version, orgX, orgY);
      return { family, parts };
    }
    if (type === 0x0a || type === 0x0b) { // arc (TABArc::ReadGeometryFromMAPFile)
      const sA = i16(), eA = i16();
      const [ex0, ey0] = ic(), [ex1, ey1] = ic();
      let a0, a1;
      if (q === 1 || q === 3 || q === 0) { a0 = sA / 10; a1 = eA / 10; } else { a0 = eA / 10; a1 = sA / 10; }
      if (q === 2 || q === 3 || q === 0) { a0 = a0 <= 180 ? 180 - a0 : 540 - a0; a1 = a1 <= 180 ? 180 - a1 : 540 - a1; }
      if (Math.abs(a1 - a0) >= 721) return { skip: "corrupt" };
      if (q === 3 || q === 4 || q === 0) { a0 = 360 - a0; a1 = 360 - a1; }
      const X0 = toX(ex0), Y0 = toY(ey0), X1 = toX(ex1), Y1 = toY(ey1);
      const n = Math.max(2, a1 < a0 ? Math.trunc(Math.abs((a1 + 360 - a0) / 2) + 1) : Math.trunc(Math.abs((a1 - a0) / 2) + 1));
      const line = [];
      generateArc(line, n, (X0 + X1) / 2, (Y0 + Y1) / 2, Math.abs((X1 - X0) / 2), Math.abs((Y1 - Y0) / 2), a0 * Math.PI / 180, a1 * Math.PI / 180);
      return { family: "polyline", parts: [line] };
    }
    if (type >= 0x13 && type <= 0x1a) { // rectangle, rounded rectangle, ellipse
      let cw = 0, ch = 0;
      if (type === 0x16 || type === 0x17) { if (compressed) { cw = i16(); ch = i16(); } else { cw = i32(); ch = i32(); } }
      const [nx0, ny0] = ic(), [nx1, ny1] = ic();
      const ax = toX(nx0), ay = toY(ny0), bx = toX(nx1), by = toY(ny1);
      const ring = [];
      if (type === 0x19 || type === 0x1a) {
        generateArc(ring, 180, (ax + bx) / 2, (ay + by) / 2, Math.abs((bx - ax) / 2), Math.abs((by - ay) / 2), 0, 2 * Math.PI);
        closeRing(ring);
        return { family: "polygon", parts: [ring] };
      }
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      const rx0 = cw / H.xScale / 2, ry0 = ch / H.yScale / 2; // Int2CoordsysDist, diameters -> radii
      if ((type === 0x16 || type === 0x17) && rx0 !== 0 && ry0 !== 0) {
        const rx = Math.min(rx0, (x1 - x0) / 2), ry = Math.min(ry0, (y1 - y0) / 2);
        generateArc(ring, 45, x0 + rx, y0 + ry, rx, ry, Math.PI, 3 * Math.PI / 2);
        generateArc(ring, 45, x1 - rx, y0 + ry, rx, ry, 3 * Math.PI / 2, 2 * Math.PI);
        generateArc(ring, 45, x1 - rx, y1 - ry, rx, ry, 0, Math.PI / 2);
        generateArc(ring, 45, x0 + rx, y1 - ry, rx, ry, Math.PI / 2, Math.PI);
        closeRing(ring);
      } else ring.push([x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]);
      return { family: "polygon", parts: [ring] };
    }
    if (fam === "text") { // TABMAPObjText::ReadObj + TABText::ReadGeometryFromMAPFile
      const strPtr = i32(), strLen = i16();
      p += 2; // justification / spacing / arrow
      const angle = i16() / 10;
      p += 8; // font style, fg + bg colours
      ic(); // label line end point
      const height = (compressed ? i16() : i32()) / H.yScale;
      p += 1; // font index
      const [mx0, my0] = ic(), [mx1, my1] = ic();
      const ax = toX(mx0), ay = toY(my0), bx = toX(mx1), by = toY(my1);
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      const sn = Math.sin(angle * Math.PI / 180), cs = Math.cos(angle * Math.PI / 180);
      let X, Y;
      if (sn > 0 && cs > 0) { X = x0 + height * sn; Y = y0; }
      else if (sn > 0 && cs < 0) { X = x1; Y = y0 - height * cs; }
      else if (sn < 0 && cs < 0) { X = x1 + height * sn; Y = y1; }
      else { X = x0; Y = y1 - height * cs; }
      let text = "";
      if (strLen > 0) text = decoder.decode(coordCursor(strPtr).bytes(strLen));
      return { family: "text", parts: [[[X, Y]]], text };
    }
    if (fam === "multipoint") { // TABMAPObjMultiPoint::ReadObj
      const coordPtr = i32(), n = i32();
      if (n < 0 || n * (compressed ? 4 : 8) > len) return { skip: "corrupt" };
      p += 15; if (type === 0x43 || type === 0x44) p += 33;
      p += 2; // symbol + unknown
      let orgX, orgY;
      if (compressed) { p += 4; orgX = i32(); orgY = i32(); }
      else { p += 8; const x0 = i32(), y0 = i32(), x1 = i32(), y1 = i32(); orgX = Math.trunc((x0 + x1) / 2); orgY = Math.trunc((y0 + y1) / 2); }
      const c = coordCursor(coordPtr);
      const parts = [];
      for (let k = 0; k < n; k++) parts.push([compressed ? pt(satAdd(c.i16(), orgX), satAdd(c.i16(), orgY)) : pt(c.i32(), c.i32())]);
      return { family: "multipoint", parts };
    }
    return { skip: "unsupported" };
  }
  return { header: H, readObject };
}

// ---------- .DAT ----------
function parseDatHeader(dat) {
  const dv = new DataView(dat.buffer, dat.byteOffset, dat.byteLength);
  if (dat.byteLength < 32) return null;
  const numRecords = dv.getInt32(4, true), firstRec = dv.getInt16(8, true), recSize = dv.getInt16(10, true);
  if (firstRec < 32 || recSize <= 0 || numRecords < 0) return null;
  const cols = [];
  for (let off = 32; off + 32 <= firstRec && off + 32 <= dat.byteLength; off += 32) {
    if (dat[off] === 0x0d) break;
    cols.push({ type: String.fromCharCode(dat[off + 11]), width: dat[off + 16], decimals: dat[off + 17] });
  }
  const maxRecs = Math.max(0, Math.floor((dat.byteLength - firstRec) / recSize));
  return { dv, numRecords: Math.min(numRecords, maxRecs), firstRec, recSize, cols };
}
const pad = (n, w) => String(n).padStart(w, "0");
const fmtTime = (ms) => `${pad(Math.floor(ms / 3600000), 2)}:${pad(Math.floor(ms / 60000) % 60, 2)}:${pad(Math.floor(ms / 1000) % 60, 2)}`;
const FIELD_KIND = { char: "string", integer: "integer", smallint: "integer", largeint: "integer", decimal: "number", float: "number", date: "date", time: "time", datetime: "datetime", logical: "boolean" };

function makeRowReader(dat, tabFields, decoder, dbfTable) {
  const H = parseDatHeader(dat);
  if (!H) return null;
  const { dv, firstRec, recSize, cols } = H;
  const n = Math.min(cols.length, tabFields.length || cols.length);
  const fields = [];
  for (let i = 0; i < n; i++) fields.push({ name: tabFields[i]?.name || `FIELD_${i + 1}`, tabType: tabFields[i]?.tabType || "char", width: cols[i].width });
  // Char values: up to the first NUL, trailing blanks dropped. Plain ASCII skips TextDecoder (its per-call cost
  // dominated wide geochem tables: 16k rows x 51 fields went from ~190 ms to well under half that).
  const text = (o, w) => {
    let e = o, ascii = true;
    const end = o + w;
    while (e < end && dat[e] !== 0) { if (dat[e] > 0x7e) ascii = false; e++; }
    while (e > o && dat[e - 1] <= 0x20) e--;
    if (e === o) return "";
    return ascii ? String.fromCharCode.apply(null, dat.subarray(o, e)) : decoder.decode(dat.subarray(o, e)).replace(/\s+$/, "");
  };
  function read(rowId) { // 1-based; null = deleted record
    const base = firstRec + (rowId - 1) * recSize;
    if (dat[base] !== 0x20) return null;
    const row = {};
    let o = base + 1;
    for (const f of fields) {
      const w = f.width;
      let v = null;
      if (dbfTable || f.tabType === "char" || f.tabType === "decimal") {
        const s = text(o, w);
        if (f.tabType === "char") v = s;
        else if (f.tabType === "logical") v = /^[1YyTt]/.test(s);
        else if (f.tabType === "date") v = /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
        else { const num = parseFloat(s); v = s.trim() === "" || !Number.isFinite(num) ? null : num; }
      } else if (f.tabType === "integer") v = dv.getInt32(o, true);
      else if (f.tabType === "smallint") v = dv.getInt16(o, true);
      else if (f.tabType === "largeint") v = Number(dv.getBigInt64(o, true));
      else if (f.tabType === "float") v = dv.getFloat64(o, true);
      else if (f.tabType === "logical") v = dat[o] !== 0;
      else if (f.tabType === "date" || f.tabType === "datetime") {
        const y = dv.getInt16(o, true), mo = dat[o + 2], d = dat[o + 3];
        if (y || mo || d) {
          v = `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}`;
          if (f.tabType === "datetime") { const ms = dv.getInt32(o + 4, true); v = ms >= 0 && ms <= 86400000 ? `${v}T${fmtTime(ms)}` : v; }
        }
      } else if (f.tabType === "time") { const ms = dv.getInt32(o, true); v = ms >= 0 && ms <= 86400000 ? fmtTime(ms) : null; }
      else v = text(o, w);
      row[f.name] = v;
      o += w;
    }
    return row;
  }
  return { numRecords: H.numRecords, fields: fields.map((f) => ({ name: f.name, type: FIELD_KIND[f.tabType] || "string" })), read };
}

// ---------- public API ----------
// parseMapInfoTab({ tab, map, id, dat, name }) — `tab` the .TAB text (or its bytes, decoded by its !charset), `map` / `id` / `dat` the other three files'
// bytes (Uint8Array or ArrayBuffer). `dat` may be null (no attributes); `name` is the layer base name (the .TAB
// basename). Returns { layers: [{ name, features, geomType, epsg, crsNote, fields, skippedCount }], skippedCount,
// skipped: { noGeometry, deleted, unsupported, corrupt } }. Each layer's skippedCount is the whole file's total (rows
// that ended up in no layer), as one table read is what the user imported.
export function parseMapInfoTab({ tab, map, id, dat = null, name = "MapInfo layer" }) {
  const hdr = parseTabHeader(tab);
  if (!["NATIVE", "LINKED", "DBF"].includes(hdr.tableType)) {
    throw new Error(tr("MapInfo \"{type}\" tables (rasters, views, linked spreadsheets) are not supported; only native vector tables are.", { type: hdr.tableType }));
  }
  const mapBytes = toBytes(map), idBytes = toBytes(id), datBytes = toBytes(dat);
  if (!mapBytes || !idBytes || !mapBytes.byteLength) throw new Error(tr("This MapInfo table has no map objects (its .MAP and .ID files are missing), so there is nothing to draw."));
  const decoder = makeDecoder(hdr.charset);
  const reader = makeMapReader(mapBytes, decoder);
  const rows = datBytes ? makeRowReader(datBytes, hdr.fields, decoder, hdr.tableType === "DBF") : null;
  const idDv = new DataView(idBytes.buffer, idBytes.byteOffset, idBytes.byteLength);
  const numIds = Math.floor(idBytes.byteLength / 4);
  const total = rows ? rows.numRecords : numIds;

  const H = reader.header;
  let crs = epsgFor({ projId: H.projId, datum: findDatum(H.datumId, H.ellipsoidId, H.shift, H.datumParams), unitsId: H.unitsId, params: H.params });
  if (crs.epsg == null && hdr.coordSys) { const c = mapinfoCoordSysToEpsg(hdr.coordSys); if (c.epsg != null) crs = c; }

  const skipped = { noGeometry: 0, deleted: 0, unsupported: 0, corrupt: 0 };
  const buckets = { point: [], polyline: [], polygon: [], text: [] };
  for (let r = 1; r <= total; r++) {
    const attributes = rows ? rows.read(r) : {};
    if (attributes === null) { skipped.deleted++; continue; }
    const off = r <= numIds ? idDv.getInt32((r - 1) * 4, true) : 0;
    if (off <= 0) { skipped.noGeometry++; continue; }
    let obj;
    try { obj = reader.readObject(off, r); } catch (e) {
      if (e?.tooBig) throw new Error(tr("This MapInfo table is corrupt: its objects claim far more coordinates than the .MAP file holds.")); // #1078
      obj = { skip: "corrupt" };
    }
    if (obj.skip) { skipped[obj.skip]++; continue; }
    if (obj.family === "multipoint") { for (const part of obj.parts) buckets.point.push({ geometry: part, parts: [part], attributes }); continue; }
    if (obj.family === "text") { const g = obj.parts[0]; buckets.text.push({ geometry: g, parts: [g], attributes: { ...attributes, _text: obj.text } }); continue; }
    const parts = obj.parts.filter((p) => p.length);
    if (!parts.length) { skipped.corrupt++; continue; }
    buckets[obj.family].push({ geometry: parts[0], parts, attributes });
  }
  const skippedCount = skipped.noGeometry + skipped.deleted + skipped.unsupported + skipped.corrupt;
  const fields = rows ? rows.fields : [];
  const families = ["point", "polyline", "polygon"].filter((f) => buckets[f].length);
  const suffix = { point: " (points)", polyline: " (lines)", polygon: " (polygons)" };
  const layers = families.map((f) => ({ name: families.length > 1 ? name + suffix[f] : name, features: buckets[f], geomType: f, epsg: crs.epsg, crsNote: crs.crsNote, fields, skippedCount }));
  if (buckets.text.length) layers.push({ name: `${name} (text)`, features: buckets.text, geomType: "point", isText: true, epsg: crs.epsg, crsNote: crs.crsNote, fields: [...fields, { name: "_text", type: "string" }], skippedCount });
  if (!layers.length) throw new Error(tr("No points, lines or polygons could be read from this MapInfo table."));
  return { layers, skippedCount, skipped };
}
