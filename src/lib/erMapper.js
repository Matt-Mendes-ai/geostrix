// TASKS.csv #4066 (side 2's #4061 inventory of the Queensland GSQ open-file reports) — ER Mapper rasters: the .ers text header and its
// headerless data file (the file of the same name with no extension), band-interleaved by line. 24 mag / RTP / 1VD / gravity grids in 4
// company reports were not read. Pure: text and bytes in, the rows rowsPicture takes out (rasterRows.js), so the import reads it as a
// Geosoft grid is read, off the UI thread, and the kept values feed the same filters and inversions.
//
// The header (ER Mapper's own text format, nested 'Name Begin' ... 'Name End' blocks of 'Key = value' lines):
//   DatasetHeader: ByteOrder (LSBFirst / MSBFirst), HeaderOffset (bytes before the first line, default 0), DataFile (rare: the data file's name)
//   CoordinateSpace: Datum ("GDA94"), Projection ("MGA54", "GEODETIC", "NUTM54"), CoordinateType (EN / LATLON / RAW), Rotation (d:m:s)
//   RasterInfo: CellType, NrOfLines, NrOfCellsPerLine, NrOfBands, NullCellValue, RegistrationCellX / Y (the cell the registration
//     coordinate belongs to; 0, 0 is the top-left cell), RegistrationCoord { Eastings, Northings | MetersX, MetersY | Latitude, Longitude },
//     CellInfo { Xdimension, Ydimension } (ground units, or degrees / d:m:s for LATLON)
// The data: line 0 is the NORTH line; each line holds band 1, then band 2 ... (band-interleaved by line), each band a row of
// NrOfCellsPerLine cells of CellType, in ByteOrder. As GDAL's ERS driver does, the registration coordinate is the TOP-LEFT CORNER of the
// registration cell (so a grid registered at cell 0, 0 starts at that coordinate). This reads band 1 and says when there are more.
import { t as tr } from "./i18n.js";
import { epsgFromGridName } from "./crsFromColumns.js";

export const isErsHeader = (text) => /^\s*DatasetHeader\s+Begin\b/i.test(String(text || "").slice(0, 400));

// the header -> { get(path), bands: [ids], text } ; paths are 'Block.Block.Key' (case-insensitive), a value without its quotes
export function parseErs(text) {
  const vals = new Map(), bands = [];
  const stack = [];
  for (const raw of String(text || "").split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m = /^(\w+)\s+Begin\b/i.exec(line);
    if (m) { stack.push(m[1]); continue; }
    m = /^(\w+)\s+End\b/i.exec(line);
    if (m) { const i = stack.map((s) => s.toLowerCase()).lastIndexOf(m[1].toLowerCase()); if (i >= 0) stack.length = i; continue; }
    m = /^(\w+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const val = m[2].trim().replace(/^"(.*)"$/, "$1");
    const path = [...stack.slice(1), m[1]].join(".").toLowerCase(); // the first block is DatasetHeader itself
    if (path === "rasterinfo.bandid.value") bands.push(val);
    if (!vals.has(path)) vals.set(path, val);
  }
  return { get: (p) => vals.get(String(p).toLowerCase()), bands };
}

// '-23:25:35.5' (degrees:minutes:seconds) or a plain number -> degrees / the number; NaN when it is neither
export function dmsOrNumber(s) {
  const t = String(s ?? "").trim();
  const m = /^([+-]?)(\d+):(\d+):(\d+(?:\.\d*)?)$/.exec(t);
  if (m) return (m[1] === "-" ? -1 : 1) * (Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 3600);
  return t === "" ? NaN : Number(t);
}

const TYPES = {
  unsigned8bitinteger: { size: 1, name: "uint8", read: (dv, o) => dv.getUint8(o) },
  signed8bitinteger: { size: 1, name: "int8", read: (dv, o) => dv.getInt8(o) },
  unsigned16bitinteger: { size: 2, name: "uint16", read: (dv, o, le) => dv.getUint16(o, le) },
  signed16bitinteger: { size: 2, name: "int16", read: (dv, o, le) => dv.getInt16(o, le) },
  unsigned32bitinteger: { size: 4, name: "uint32", read: (dv, o, le) => dv.getUint32(o, le) },
  signed32bitinteger: { size: 4, name: "int32", read: (dv, o, le) => dv.getInt32(o, le) },
  ieee4bytereal: { size: 4, name: "float32", real4: true, read: (dv, o, le) => dv.getFloat32(o, le) },
  ieee8bytereal: { size: 8, name: "float64", read: (dv, o, le) => dv.getFloat64(o, le) },
};

// datum + projection names of the header -> { epsg } | { unknown: true } | { raw: true } (no coordinates). MGA / AMG are the Australian
// UTM grids (GDA94 / GDA2020 and AGD84 / AGD66), NUTM / SUTM the northern and southern UTM zones (WGS84, NAD83 ...), GEODETIC degrees.
export function ersEpsg(datum, projection, coordinateType) {
  const d = String(datum || "").trim(), p = String(projection || "").trim().toUpperCase(), ct = String(coordinateType || "").trim().toUpperCase();
  if (/^RAW$/i.test(d) || /^RAW$/.test(p) || ct === "RAW") return { raw: true };
  let s;
  if (ct === "LATLON" || /^(GEODETIC|LATLON|LATLONG|GEOGRAPHIC)$/.test(p)) s = `${d} LL`;
  else {
    const u = /^([NS])UTM(\d{1,2})$/.exec(p);
    s = u ? `${d} UTM ${u[2]}${u[1]}` : `${d} ${p}`;
  }
  return epsgFromGridName(s) || { unknown: true };
}

// -> the data file's name: the header's DataFile when it has one, else the header's name without .ers
export function ersDataName(headerText, name) {
  const h = parseErs(headerText), df = h.get("DataFile");
  return df ? String(df).replace(/^.*[\\/]/, "") : String(name || "").replace(/\.ers$/i, "");
}

// headerText, bytes of the data file, the header's file name -> the rows rowsPicture takes ({ name, values (south line first, each west -> east),
// ncols, nrows, x0, y0 (the south-west node's centre), dx, dy, dummy, mirrored, withGrid, note, epsgTag })
export function ersRows(headerText, data, name) {
  if (!isErsHeader(headerText)) throw new Error(tr("\"{name}\" is not an ER Mapper header.", { name }));
  const h = parseErs(headerText);
  const num = (p) => Number(h.get(p));
  const need = (p, what) => { const v = num(p); if (!Number.isFinite(v)) throw new Error(tr("The header has no {what}.", { what })); return v; };
  const nrows = need("RasterInfo.NrOfLines", "NrOfLines"), ncols = need("RasterInfo.NrOfCellsPerLine", "NrOfCellsPerLine");
  if (!(nrows >= 2 && ncols >= 2)) throw new Error(tr("This grid is too small."));
  const nb = h.get("RasterInfo.NrOfBands") === undefined ? 1 : need("RasterInfo.NrOfBands", "NrOfBands");
  const type = TYPES[String(h.get("RasterInfo.CellType") || "").toLowerCase()];
  if (!type) throw new Error(tr("Cell type {type} isn't supported.", { type: h.get("RasterInfo.CellType") || "missing" }));
  const little = !/^MSB/i.test(String(h.get("ByteOrder") || "LSBFirst"));
  const offset = h.get("HeaderOffset") === undefined ? 0 : num("HeaderOffset");
  const datum = h.get("CoordinateSpace.Datum") || "", projection = h.get("CoordinateSpace.Projection") || "", ctype = h.get("CoordinateSpace.CoordinateType") || "EN";
  const crs = ersEpsg(datum, projection, ctype);
  if (crs.raw) throw new Error(tr("\"{name}\" has no map coordinates: export it as a GeoTIFF.", { name }));
  const rot = dmsOrNumber(h.get("CoordinateSpace.Rotation") ?? "0");
  if (Number.isFinite(rot) && Math.abs(rot) > 0.01) throw new Error(tr("This grid is rotated: export it unrotated."));
  const geographic = String(ctype).toUpperCase() === "LATLON" || (crs.epsg && [4283, 7844, 4203, 4202, 4326, 4269, 4267].includes(crs.epsg));
  const dx = Math.abs(dmsOrNumber(h.get("RasterInfo.CellInfo.Xdimension"))), dy = Math.abs(dmsOrNumber(h.get("RasterInfo.CellInfo.Ydimension")));
  if (!(dx > 0 && dy > 0)) throw new Error(tr("The header has no {what}.", { what: "Xdimension / Ydimension" }));
  const rx = h.get("RasterInfo.RegistrationCellX") === undefined ? 0 : num("RasterInfo.RegistrationCellX"), ry = h.get("RasterInfo.RegistrationCellY") === undefined ? 0 : num("RasterInfo.RegistrationCellY");
  const pick = (a, b) => { const v = dmsOrNumber(h.get(`RasterInfo.RegistrationCoord.${a}`) ?? h.get(`RasterInfo.RegistrationCoord.${b}`)); return v; };
  const east = geographic ? pick("Longitude", "Eastings") : pick("Eastings", "MetersX"), north = geographic ? pick("Latitude", "Northings") : pick("Northings", "MetersY");
  if (!Number.isFinite(east) || !Number.isFinite(north)) throw new Error(tr("The header has no {what}.", { what: "RegistrationCoord" }));
  // the registration coordinate is the top-left corner of cell (rx, ry): the grid's top-left corner, then the nodes at the cells' centres
  const left = east - rx * dx, top = north + ry * dy;
  const x0 = left + dx / 2, y0 = top - dy * (nrows - 1) - dy / 2;
  // the data
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const lineBytes = ncols * type.size, need_ = offset + nrows * nb * lineBytes;
  if (bytes.length < need_) throw new Error(tr("The data file is too short: is it the right one?"));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const values = new Float64Array(nrows * ncols);
  for (let line = 0; line < nrows; line++) {
    const base = offset + line * nb * lineBytes, out = (nrows - 1 - line) * ncols; // line 0 is the north line; the rows run south -> north
    for (let c = 0; c < ncols; c++) values[out + c] = type.read(dv, base + c * type.size, little);
  }
  const nd = h.get("RasterInfo.NullCellValue") === undefined ? NaN : num("RasterInfo.NullCellValue");
  const dummy = Number.isFinite(nd) ? (type.real4 ? Math.fround(nd) : nd) : null;
  const note = " " + (crs.epsg ? tr("ER Mapper grid, {nx} × {ny} cells, EPSG:{epsg}.", { nx: ncols, ny: nrows, epsg: crs.epsg }) : tr("ER Mapper grid, {nx} × {ny} cells: set the Source CRS.", { nx: ncols, ny: nrows }))
    + (nb > 1 ? " " + tr("Band 1 of {n} read.", { n: nb }) : ""); // #4066 — one short sentence; the datum and projection are in the header
  return { name, values, ncols, nrows, x0, y0, dx, dy, dummy, mirrored: false, withGrid: true, note, epsgTag: crs.epsg || null };
}
