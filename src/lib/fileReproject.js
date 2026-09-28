// TASKS.csv #487 — Cartography > Reproject a file, for files that are not tables: a zipped shapefile (every
// layer in the zip) is read, every vertex moved from one CRS to another, and written back as a new zip with
// a .prj for the new CRS. Nothing is imported into the project. Heights (z) are unchanged, as everywhere in
// GeoStrix (no vertical datum model). Pure apart from the zip / DBF work in shapefile.js.
import { parseShapefileZip, shapefileZipFiles, buildZip } from "./shapefile.js";
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

// fromEpsg: null = each layer's own .prj. Returns { bytes (the new zip), report: [{ name, from, features, vertices, failed }] }.
export async function reprojectShapefileZip(zipBytes, fromEpsg, toEpsg) {
  const { layers } = await readShapefileLayers(zipBytes);
  const files = [], report = [];
  for (const layer of layers) {
    const from = fromEpsg ? Number(fromEpsg) : layer.epsg;
    if (!from) throw new Error(`"${layer.name}" has ${layer.hasPrj ? "a .prj GeoStrix doesn't recognise" : "no .prj"} — choose its CRS under "From".`);
    const T = pointTransform(from, toEpsg);
    if (!T) throw new Error(`Can't convert from EPSG:${from} to EPSG:${toEpsg}.`);
    let vertices = 0, failed = 0;
    const move = (pt) => {
      const [x, y, z] = pt;
      if (!Number.isFinite(x) || !Number.isFinite(y)) { failed++; return pt; }
      const [nx, ny] = T(x, y);
      if (!Number.isFinite(nx) || !Number.isFinite(ny)) { failed++; return pt; }
      vertices++;
      return [nx, ny, z];
    };
    const features = layer.features.map((f) => {
      const parts = (f.parts?.length ? f.parts : [f.geometry]).map((part) => part.map(move));
      return { geometry: parts[0], parts, attributes: f.attributes };
    });
    files.push(...shapefileZipFiles({ features, geomType: layer.geomType, epsg: toEpsg, baseName: layer.name, keepFieldCase: true }));
    report.push({ name: layer.name, from, features: features.length, vertices, failed, skipped: layer.skipped });
  }
  return { bytes: buildZip(files), report };
}

export function reportShapefileText(report, toEpsg) {
  const lines = report.map((r) => `${r.name}: ${r.features.toLocaleString()} feature(s), ${r.vertices.toLocaleString()} vertices from ${crsName(r.from) || `EPSG:${r.from}`}`
    + (r.failed ? `; ${r.failed} vertices could not be converted and were kept as they were` : "")
    + (r.skipped ? `; ${r.skipped} feature(s) of a shape type GeoStrix doesn't read were left out` : ""));
  return `Saved ${report.length} layer(s) in ${crsName(toEpsg) || `EPSG:${toEpsg}`}, each with a new .prj and a UTF-8 .dbf. ${lines.join(". ")}.`;
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
  try { nodes = demNodeBbox(image); } catch { throw new Error("This GeoTIFF has no georeferencing (bounding box)."); }
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
