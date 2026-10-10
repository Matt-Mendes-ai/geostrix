// TASKS.csv #487 — Cartography > Reproject a file, for files that are not tables: a zipped shapefile (every
// layer in the zip) is read, every vertex moved from one CRS to another, and written back as a new zip with
// a .prj for the new CRS. Nothing is imported into the project. Heights (z) are unchanged, as everywhere in
// GeoStrix (no vertical datum model). Pure apart from the zip / DBF work in shapefile.js.
import { parseShapefileZip, buildZip, readZipEntries, prjWktFor } from "./shapefile.js";
import { guessEpsgFromPrjWkt, pointTransform, crsName, getProj4DefSync, reprojectGrid } from "./reproject.js";
import { fromArrayBuffer, writeArrayBuffer } from "geotiff";
import { demNodeBbox } from "./raster.js";

// zipBytes -> { layers: [{ name, epsg (from its .prj, or null), features, geomType }] }
export async function readShapefileLayers(zipBytes) {
  const first = await parseShapefileZip(zipBytes);
  const layers = [];
  for (const name of first.layerNames) {
    const p = name === first.layerName ? first : await parseShapefileZip(zipBytes, name);
    layers.push({ name, epsg: guessEpsgFromPrjWkt(p.prjWkt), hasPrj: !!p.prjWkt, features: p.features, geomType: p.geomType, skipped: p.skippedCount || 0 });
  }
  return { layers };
}

// TASKS.csv #549 — a reprojection changes the coordinates and NOTHING else. This used to read every layer into
// GeoStrix's feature model and write a new shapefile from it, which changed the schema: 2D shapes came back as Z
// (POINT -> POINTZ, z = 0), N(10,0) tenure numbers as N(19,6) reals, D dates and L booleans as text, MultiPoint
// records split into one feature per point, M values dropped. Now the .shp record bytes are copied and only the
// X / Y doubles (and the record / file bounding boxes) are rewritten; the .dbf, .cpg and .qml are copied byte for
// byte; the .shx gets the new file bounding box (its offsets don't change); the .prj is replaced. Spatial-index
// sidecars (.sbn / .sbx / .qix) are left out — they index the old coordinates and GIS software rebuilds them.
// Z, M, part structure, shape type, record order and null shapes are untouched.
//
// Returns { shp: Uint8Array, records, vertices, failed, unsupported } — `T(x, y)` -> [x, y].
export function reprojectShpBytes(shpBytes, T) {
  const shp = new Uint8Array(shpBytes); // a copy
  const dv = new DataView(shp.buffer, shp.byteOffset, shp.byteLength);
  if (shp.length < 100 || dv.getInt32(0, false) !== 9994) throw new Error("Not a shapefile .shp (bad file code).");
  let records = 0, vertices = 0, failed = 0, unsupported = 0;
  let fx0 = Infinity, fy0 = Infinity, fx1 = -Infinity, fy1 = -Infinity;
  // moves n points starting at byte `at`; returns the bbox of the (moved) points
  const movePoints = (at, n) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = at + i * 16;
      let x = dv.getFloat64(o, true), y = dv.getFloat64(o + 8, true);
      const q = Number.isFinite(x) && Number.isFinite(y) ? T(x, y) : null;
      if (q && Number.isFinite(q[0]) && Number.isFinite(q[1])) { x = q[0]; y = q[1]; dv.setFloat64(o, x, true); dv.setFloat64(o + 8, y, true); vertices++; }
      else failed++;
      if (Number.isFinite(x) && Number.isFinite(y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return [x0, y0, x1, y1];
  };
  const grow = (b) => { if (b[0] < fx0) fx0 = b[0]; if (b[1] < fy0) fy0 = b[1]; if (b[2] > fx1) fx1 = b[2]; if (b[3] > fy1) fy1 = b[3]; };
  const setBox = (at, b) => { if (Number.isFinite(b[0])) b.forEach((v, k) => dv.setFloat64(at + k * 8, v, true)); };
  let off = 100;
  while (off + 12 <= shp.length) {
    const words = dv.getInt32(off + 4, false), rec = off + 8, end = rec + words * 2;
    if (words < 2 || end > shp.length) break;
    records++;
    const type = dv.getInt32(rec, true);
    if (type === 1 || type === 11 || type === 21) grow(movePoints(rec + 4, 1));
    else if (type === 8 || type === 18 || type === 28) { const b = movePoints(rec + 40, dv.getInt32(rec + 36, true)); setBox(rec + 4, b); grow(b); }
    else if ([3, 5, 13, 15, 23, 25, 31].includes(type)) {
      const np = dv.getInt32(rec + 36, true), n = dv.getInt32(rec + 40, true);
      const b = movePoints(rec + 44 + np * (type === 31 ? 8 : 4), n); // a MultiPatch also has a part-type per part
      setBox(rec + 4, b); grow(b);
    } else if (type !== 0) unsupported++;
    off = end;
  }
  if (Number.isFinite(fx0)) setBox(36, [fx0, fy0, fx1, fy1]);
  return { shp, records, vertices, failed, unsupported };
}

// The .shx for a .shp: the original's records with the new file bbox, or rebuilt from the .shp when the zip had none.
function shxFor(shp, shxBytes) {
  const header = shp.subarray(0, 100);
  if (shxBytes && shxBytes.length >= 100) { const shx = new Uint8Array(shxBytes); shx.set(header.subarray(36, 100), 36); return shx; }
  const dv = new DataView(shp.buffer, shp.byteOffset, shp.byteLength), idx = [];
  for (let off = 100; off + 8 <= shp.length;) { const words = dv.getInt32(off + 4, false); idx.push([off / 2, words]); off += 8 + words * 2; }
  const shx = new Uint8Array(100 + idx.length * 8);
  shx.set(header);
  const sv = new DataView(shx.buffer);
  sv.setInt32(24, shx.length / 2, false);
  idx.forEach(([o, w], i) => { sv.setInt32(100 + i * 8, o, false); sv.setInt32(104 + i * 8, w, false); });
  return shx;
}

// fromEpsg: null = each layer's own .prj. Returns { bytes (the new zip), report: [{ name, from, features, vertices, failed, unsupported }] }.
export async function reprojectShapefileZip(zipBytes, fromEpsg, toEpsg) {
  const entries = await readZipEntries(zipBytes);
  const names = Object.keys(entries);
  const bases = [...new Set(names.filter((n) => /\.shp$/i.test(n)).map((n) => n.replace(/\.shp$/i, "")))];
  if (!bases.length) throw new Error("No .shp file found inside this .zip.");
  const entry = (base, ext) => { const k = names.find((n) => n.toLowerCase() === `${base}.${ext}`.toLowerCase()); return k && entries[k] ? { name: k, data: entries[k] } : null; };
  const wkt = prjWktFor(toEpsg);
  const files = [], report = [];
  for (const base of bases) {
    const prj = entry(base, "prj");
    const epsg = prj ? guessEpsgFromPrjWkt(new TextDecoder().decode(prj.data)) : null;
    const from = fromEpsg ? Number(fromEpsg) : epsg;
    if (!from) throw new Error(`"${base}" has ${prj ? "a .prj GeoStrix doesn't recognise" : "no .prj"} — choose its CRS under "From".`);
    const T = pointTransform(from, toEpsg);
    if (!T) throw new Error(`Can't convert from EPSG:${from} to EPSG:${toEpsg}.`);
    const r = reprojectShpBytes(entry(base, "shp").data, T);
    files.push({ name: `${base}.shp`, data: r.shp }, { name: `${base}.shx`, data: shxFor(r.shp, entry(base, "shx")?.data) });
    for (const ext of ["dbf", "cpg", "qml"]) { const e = entry(base, ext); if (e) files.push({ name: e.name, data: e.data }); }
    if (wkt) files.push({ name: `${base}.prj`, data: new TextEncoder().encode(wkt) });
    else files.push({ name: `${base}_READ_ME.txt`, data: new TextEncoder().encode(`No .prj was generated — EPSG:${toEpsg} isn't one of the codes GeoStrix has a built-in projection definition for. The coordinates are in EPSG:${toEpsg}; set that as the layer's CRS in your GIS software.`) });
    report.push({ name: base, from, features: r.records, vertices: r.vertices, failed: r.failed, unsupported: r.unsupported, noDbf: !entry(base, "dbf") });
  }
  return { bytes: buildZip(files), report };
}

export function reportShapefileText(report, toEpsg) {
  const lines = report.map((r) => `${r.name}: ${r.features.toLocaleString()} feature(s), ${r.vertices.toLocaleString()} vertices from ${crsName(r.from) || `EPSG:${r.from}`}`
    + (r.failed ? `; ${r.failed} vertices could not be converted and were kept as they were` : "")
    + (r.unsupported ? `; ${r.unsupported} record(s) of a shape type GeoStrix doesn't know were copied unchanged` : ""));
  return `Saved ${report.length} layer(s) in ${crsName(toEpsg) || `EPSG:${toEpsg}`}, each with a new .prj. Only the coordinates changed: shape types, Z / M, parts and the attribute table (.dbf, field types and encoding) are as they were. ${lines.join(". ")}.`;
}

// ---------------------------------------------------------------------------------------------
// TASKS.csv #487 — a GeoTIFF (any number of bands) warped from one CRS to another and written as a new
// GeoTIFF, like `gdalwarp -t_srs`. Grid nodes are pixel centres (PixelIsArea, the usual case; demNodeBbox
// handles PixelIsPoint). The output covers the projected corners' bounding box with about the same number
// of pixels as the input; pixels outside the source footprint are nodata (float) or 0 (integer data without
// a nodata value — gdalwarp's default). Integer bands (classes, RGB imagery) use nearest-node sampling so no
// value is invented; float bands (DEMs, geophysics grids) use bilinear. Everything is held in memory at once,
// so a cap keeps it within reach of modest hardware.
export const GEOTIFF_REPROJECT_MAX_SAMPLES = 25_000_000; // width x height x bands: ~200 MB of float64 while warping, plus input and output

export async function readGeoTiffInfo(buf) {
  const ab = buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tiff = await fromArrayBuffer(ab);
  const image = await tiff.getImage();
  let epsg = null;
  try { const k = image.getGeoKeys(); epsg = k?.ProjectedCSTypeGeoKey || k?.GeographicTypeGeoKey || null; } catch { /* no geokeys */ }
  if (epsg === 32767) epsg = null; // "user-defined": not an EPSG code
  let noData = null;
  try { const nd = image.getGDALNoData(); if (Number.isFinite(nd)) noData = nd; } catch { /* optional */ }
  return { image, epsg, noData, width: image.getWidth(), height: image.getHeight(), bands: image.getSamplesPerPixel() };
}

export async function reprojectGeoTiff(buf, fromEpsg, toEpsg) {
  const info = await readGeoTiffInfo(buf);
  const { image, width: w, height: h, bands: nb } = info;
  const from = fromEpsg ? Number(fromEpsg) : info.epsg;
  if (!from) throw new Error('This GeoTIFF has no EPSG code in its tags — choose its CRS under "From".');
  const fromDef = getProj4DefSync(from), toDef = getProj4DefSync(toEpsg);
  if (!fromDef || !toDef) throw new Error(`Can't convert from EPSG:${from} to EPSG:${toEpsg}.`);
  if (w * h * nb > GEOTIFF_REPROJECT_MAX_SAMPLES) throw new Error(`This GeoTIFF is ${w.toLocaleString()} × ${h.toLocaleString()} × ${nb} band(s) — over the ${(GEOTIFF_REPROJECT_MAX_SAMPLES / 1e6).toFixed(0)} million-value limit for reprojecting in GeoStrix. Use QGIS / gdalwarp for a file this size.`);
  let nodes;
  try { nodes = demNodeBbox(image); } catch (err) { if (/rotated or sheared/.test(err.message)) throw err; throw new Error("This GeoTIFF has no georeferencing (bounding box)."); } // #560
  const [xmin, ymin, xmax, ymax] = nodes;
  const src = await image.readRasters(); // one typed array per band
  const Ctor = src[0].constructor;
  const isFloat = Ctor === Float32Array || Ctor === Float64Array;
  const nearest = !isFloat;
  const bandsF = src.map((b) => {
    const f = new Float64Array(b.length);
    for (let i = 0; i < b.length; i++) { const v = b[i]; f[i] = info.noData !== null && v === info.noData ? NaN : v; }
    return f;
  });
  // size: the corner cover in the target CRS, with pixels as big as the source's there — the projected
  // footprint's own area (shoelace over the 4 corners) shared by the source's cells, not the larger cover's
  const probe = reprojectGrid({ xmin, ymin, xmax, ymax, gridW: 2, gridH: 2, band: new Float64Array(4) }, fromDef, toDef, 2, 2);
  const [txmin, tymin, txmax, tymax] = probe.bbox;
  const T = pointTransform(from, toEpsg);
  const q = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]].map(([x, y]) => T(x, y));
  const area = Math.abs(q.reduce((s, [x, y], i) => { const [x2, y2] = q[(i + 1) % 4]; return s + x * y2 - x2 * y; }, 0)) / 2;
  const px = Math.sqrt(area / Math.max(1, (w - 1) * (h - 1)));
  const outW = Math.max(2, Math.round((txmax - txmin) / px) + 1), outH = Math.max(2, Math.round((tymax - tymin) / px) + 1);
  const g = reprojectGrid({ xmin, ymin, xmax, ymax, gridW: w, gridH: h, bands: bandsF }, fromDef, toDef, outW, outH, { nearest });
  const fill = info.noData !== null ? info.noData : isFloat ? -9999 : 0;
  const OutCtor = isFloat ? Float32Array : Ctor;
  const out = new OutCtor(outW * outH * nb); // pixel-interleaved, as geotiff.js writes it
  let empty = 0;
  for (let i = 0; i < outW * outH; i++) {
    let allNaN = true;
    for (let b = 0; b < nb; b++) {
      const v = g.bandsOut[b][i];
      if (Number.isFinite(v)) { out[i * nb + b] = v; allNaN = false; } else out[i * nb + b] = fill;
    }
    if (allNaN) empty++;
  }
  const [bx0, by0, bx1, by1] = g.bbox;
  const pw = (bx1 - bx0) / (outW - 1), ph = (by1 - by0) / (outH - 1);
  const geographic = /\+proj=longlat/.test(toDef);
  const meta = {
    width: outW, height: outH,
    ModelPixelScale: [pw, ph, 0],
    ModelTiepoint: [0, 0, 0, bx0 - pw / 2, by1 + ph / 2, 0], // pixel (0,0)'s outer corner (PixelIsArea)
    GTModelTypeGeoKey: geographic ? 2 : 1,
    GTRasterTypeGeoKey: 1,
    ...(geographic ? { GeographicTypeGeoKey: Number(toEpsg) } : { ProjectedCSTypeGeoKey: Number(toEpsg) }),
    ...(nb === 3 && !isFloat ? { PhotometricInterpretation: 2 } : {}),
    ...(info.noData !== null || isFloat ? { GDAL_NODATA: String(fill) } : {}),
  };
  const bytes = new Uint8Array(writeArrayBuffer(out, meta));
  return { bytes, report: { from, width: w, height: h, bands: nb, outW, outH, pixel: pw, resampling: nearest ? "nearest" : "bilinear", emptyFraction: empty / (outW * outH), geographic } };
}

export function reportGeoTiffText(r, toEpsg) {
  const size = r.geographic ? `${(r.pixel * 3600).toFixed(2)} arc-second` : `${r.pixel.toFixed(2)} m`;
  return `Saved a ${r.outW.toLocaleString()} × ${r.outH.toLocaleString()} GeoTIFF (${r.bands} band${r.bands > 1 ? "s" : ""}, ${size} pixels, ${r.resampling} resampling) in ${crsName(toEpsg) || `EPSG:${toEpsg}`}, from ${crsName(r.from) || `EPSG:${r.from}`} (${r.width.toLocaleString()} × ${r.height.toLocaleString()}).`
    + (r.emptyFraction > 0.001 ? ` ${(r.emptyFraction * 100).toFixed(1)}% of it lies outside the original footprint (the corners of the new rectangle) and is nodata.` : "");
}
