// TASKS.csv #24 — GeoTIFF import for the Geophysics module's raster drape (magnetics/radiometrics
// grids, orthophotos, whatever comes out of a GIS as a georeferenced TIFF). geotiff.js does the
// actual decoding; this module turns that into exactly what the store/ViewerModule need: a real-
// world bounding box plus a small PNG data URL, pre-colour-mapped and pre-downsampled client-side
// so a multi-hundred-MB source file doesn't end up bloating every project save or blocking the
// render thread with a full-resolution canvas.
//
// Deliberately NO reprojection for the flat raster drape below (parseGeoTIFF/parseGXF) — the file's
// own coordinate tags are trusted as already being in the project's working CRS (matching how the
// rest of the app handles EPSG: collars/survey are assumed already in the project EPSG too). A
// mismatched CRS will drape in the wrong place; the caller surfaces the raster's own tag (if any) so
// the user can sanity-check it against the project's EPSG before trusting the result.
//
// The DEM/terrain path below (parseDEMFiles) is the one exception — see its own header comment: a
// geographic (lon/lat) DEM source not lining up with a projected project EPSG isn't just "in the
// wrong place", it silently builds a real terrain mesh many orders of magnitude away from the rest of
// the scene, so that path DOES reproject automatically when it can.
import { fromArrayBuffer } from "geotiff";
import { getProj4Def, reprojectGrid, bilinearSample } from "./reproject.js";

// Cap so a huge source grid still makes a fast-to-render texture rather than bloating every project
// save. Raised from 1024 -> 2048 (TASKS.csv, user report of "imported in a really bad quality") —
// 1024 was visibly softening real-world GeoTIFFs wider than ~1024px on their longest side. Note this
// only helps grids that actually HAVE more native resolution than the cap: a genuinely coarse source
// grid (e.g. a hand-digitized or low-station-density survey) will still look blocky at any cap, since
// there's no more real data to show — that's the source data's resolution, not this constant.
const MAX_TEXTURE_SIZE = 2048;

// A perceptually reasonable default single-band ramp (deep blue -> teal -> yellow -> red), similar
// spirit to magColor() in layers.js but with more stops since raster drapes usually want more visual
// range than a handful of point markers.
const RAMP = [
  [30, 30, 90], [40, 90, 160], [60, 160, 150], [140, 190, 90], [230, 200, 60], [220, 100, 40],
];
function rampColor(t) {
  const n = RAMP.length - 1;
  const seg = Math.min(n - 1, Math.max(0, Math.floor(t * n)));
  const localT = t * n - seg;
  const a = RAMP[seg], b = RAMP[seg + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * localT),
    Math.round(a[1] + (b[1] - a[1]) * localT),
    Math.round(a[2] + (b[2] - a[2]) * localT),
  ];
}

// file: a browser File (from an <input> or drag-drop). Returns { name, bbox:[xmin,ymin,xmax,ymax],
// width, height, dataUrl, bandCount, epsgTag } or throws with a message meant to be shown directly.
export async function parseGeoTIFF(file) {
  const buf = await file.arrayBuffer();
  let tiff, image;
  try {
    tiff = await fromArrayBuffer(buf);
    image = await tiff.getImage();
  } catch (err) {
    throw new Error(`Not a readable GeoTIFF (${err.message}).`);
  }

  let bbox;
  try {
    bbox = image.getBoundingBox(); // [xmin, ymin, xmax, ymax] in the file's own coordinate tags
  } catch (err) {
    // geotiff.js throws rather than returning null/undefined when there's no affine transform at
    // all (a plain, non-georeferenced TIFF) — caught here so the message stays specific to what's
    // actually wrong instead of surfacing a raw library error.
    bbox = null;
  }
  if (!bbox || bbox.some((v) => !Number.isFinite(v))) {
    throw new Error("This GeoTIFF has no readable georeferencing (bounding box) — it may be a plain, non-georeferenced TIFF.");
  }

  const srcW = image.getWidth(), srcH = image.getHeight();
  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  const rasters = await image.readRasters({ width: outW, height: outH });
  const bandCount = rasters.length;

  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(outW, outH);

  let noData = null;
  try { const nd = image.getGDALNoData(); if (Number.isFinite(nd)) noData = nd; } catch (_) { /* not all files have it */ }

  if (bandCount >= 3) {
    // Treat as RGB(A) — most orthophotos / basemap exports.
    const [r, g, b] = rasters;
    for (let i = 0; i < outW * outH; i++) {
      imgData.data[i * 4] = r[i]; imgData.data[i * 4 + 1] = g[i]; imgData.data[i * 4 + 2] = b[i];
      imgData.data[i * 4 + 3] = 255;
    }
  } else {
    // Single band — a value grid (mag, IP, radiometrics, elevation...). Colour-map it with a shared
    // min/max computed over valid (non-nodata, finite) pixels only, so a single bad/nodata cell can't
    // wash out the whole ramp.
    const band = rasters[0];
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < band.length; i++) {
      const v = band[i];
      if (!Number.isFinite(v) || (noData !== null && v === noData)) continue;
      if (v < min) min = v; if (v > max) max = v;
    }
    const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
    for (let i = 0; i < outW * outH; i++) {
      const v = band[i];
      const isNodata = !Number.isFinite(v) || (noData !== null && v === noData);
      if (isNodata) {
        imgData.data[i * 4 + 3] = 0; // transparent — lets holes/other layers show through instead of a false-color block
        continue;
      }
      const t = hasRange ? (v - min) / (max - min) : 0.5;
      const [cr, cg, cb] = rampColor(t);
      imgData.data[i * 4] = cr; imgData.data[i * 4 + 1] = cg; imgData.data[i * 4 + 2] = cb;
      imgData.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  let epsgTag = null;
  try {
    const geoKeys = image.getGeoKeys();
    epsgTag = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey || null;
  } catch (_) { /* optional, best-effort */ }

  return {
    name: file.name,
    bbox, // [xmin, ymin, xmax, ymax]
    width: srcW,
    height: srcH,
    dataUrl: canvas.toDataURL("image/png"),
    bandCount,
    epsgTag,
  };
}

// TASKS.csv #77 — SRTM/DEM import. Deliberately GeoTIFF-only for now (SRTM is commonly distributed
// this way today, e.g. the "SRTM Cloud"/OpenTopography GeoTIFF exports) — the older raw .hgt binary
// format isn't handled, that would need its own small parser since it's not a TIFF at all. Unlike
// parseGeoTIFF above (which colour-maps into a PNG texture for a flat drape), this keeps the raw
// elevation values themselves — ViewerModule turns them into actual terrain geometry (#77/#81), so a
// pre-baked image would be useless here.
//
// Downsampled hard to DEM_MAX_GRID on the longest side (much more aggressive than raster.js's own
// MAX_TEXTURE_SIZE) because every sample here becomes a real mesh vertex, not a texture pixel — a
// full-resolution SRTM tile (3600x3600 for 1-arcsecond, or worse for a mosaic) would be millions of
// triangles, unusable both for render performance and for project-file size (the whole grid gets
// persisted as plain JSON numbers, not a compressed image).
const DEM_MAX_GRID = 200;

// Bug fix (user report) + feature (user request), Aug 2026: real-world SRTM tiles come in geographic
// (lon/lat, EPSG:4326-ish) coordinates and are distributed as multiple adjacent tiles rather than one
// file covering a whole area of interest. parseDEM used to (a) trust the file's coordinates as-is —
// fine for a DEM already in the project's projected EPSG, but for a geographic SRTM tile it built a
// terrain mesh at coordinates like x=-132, y=56 while the rest of a UTM-metres project sits at
// eastings/northings in the hundreds of thousands, so the mesh WAS added to the scene, just far
// outside wherever the camera fits — reading to the user as "it won't display" — and (b) only ever
// accepted one file, so multiple SRTM tiles could only replace each other one at a time, never merge.
// parseDEMFiles (below) replaces it: takes one-or-more files, mosaics them in their shared native CRS
// if there's more than one, then reprojects the result into the project's own EPSG if the source is
// geographic and doesn't already match — using proj4 + the real EPSG registry (epsg-index) for the
// transform math and target-CRS lookup, not a guessed formula (BC's NAD83(CSRS)/UTM EPSG codes are
// NOT sequential by zone — e.g. EPSG:3158 is UTM zone 14N, not 11N as a naive 3154+zone-7 pattern
// would give — so this deliberately looks the real definition up in reproject.js's getProj4Def rather
// than hand-rolling a lookup table that would silently mis-place data exactly like this bug already
// did once). parseDEM is kept as a one-file convenience wrapper for the single-tile case.

// A tile's own coordinate tags are geographic (not already projected) when GeoTIFF's GeoKeys carry a
// GeographicTypeGeoKey but no ProjectedCSTypeGeoKey — the case that needs reprojecting before it'll
// line up with a projected (UTM-style) project EPSG.
function isGeographicGeoKeys(geoKeys) {
  return !!geoKeys && !!geoKeys.GeographicTypeGeoKey && !geoKeys.ProjectedCSTypeGeoKey;
}

async function readDemTile(file) {
  const buf = await file.arrayBuffer();
  let tiff, image;
  try {
    tiff = await fromArrayBuffer(buf);
    image = await tiff.getImage();
  } catch (err) {
    throw new Error(`"${file.name}" is not a readable GeoTIFF (${err.message}).`);
  }
  let bbox;
  try { bbox = image.getBoundingBox(); } catch (err) { bbox = null; }
  if (!bbox || bbox.some((v) => !Number.isFinite(v))) {
    throw new Error(`"${file.name}" has no readable georeferencing (bounding box) — it may be a plain, non-georeferenced TIFF.`);
  }
  const srcW = image.getWidth(), srcH = image.getHeight();
  // Full native resolution, not pre-downsampled here — needed so mosaicking/reprojection below (which
  // resample onto a fresh grid anyway) start from real data rather than an already-lossy pre-shrink.
  const rasters = await image.readRasters();
  if (!rasters.length) throw new Error(`"${file.name}" has no readable elevation band.`);
  const rawBand = rasters[0]; // DEMs are single-band; if given a multi-band file, just take the first

  let noData = null;
  try { const nd = image.getGDALNoData(); if (Number.isFinite(nd)) noData = nd; } catch (_) { /* not all files have it */ }
  // NaN out nodata cells up front so every downstream bilinear sample (mosaic + reprojection) can just
  // check Number.isFinite() rather than re-threading a noData sentinel through several call sites.
  const band = new Float32Array(rawBand.length);
  for (let i = 0; i < rawBand.length; i++) {
    const v = rawBand[i];
    band[i] = (Number.isFinite(v) && (noData === null || v !== noData)) ? v : NaN;
  }

  let epsgTag = null, geographic = false;
  try {
    const geoKeys = image.getGeoKeys();
    epsgTag = geoKeys?.ProjectedCSTypeGeoKey || geoKeys?.GeographicTypeGeoKey || null;
    geographic = isGeographicGeoKeys(geoKeys);
  } catch (_) { /* optional, best-effort */ }

  return { name: file.name, bbox, srcW, srcH, band, epsgTag, geographic };
}

// files: one or more browser Files (GeoTIFFs) — pass several adjacent tiles (e.g. two neighboring
// SRTM tiles) to mosaic them into a single terrain surface. targetEpsg: the project's EPSG (e.g.
// project.epsg) — when given and the source is geographic, the merged grid is reprojected into it so
// it lines up with the rest of the project instead of landing at raw lon/lat coordinates. Returns
// { name, bbox:[xmin,ymin,xmax,ymax], gridW, gridH, elevations, srcWidth, srcHeight, epsgTag,
// reprojectedTo, reprojectNote, tileCount } or throws with a message meant to be shown directly.
export async function parseDEMFiles(files, targetEpsg) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) throw new Error("No file selected.");
  const tiles = [];
  for (const file of list) tiles.push(await readDemTile(file));

  if (tiles.length > 1) {
    const first = tiles[0].epsgTag;
    const mismatched = tiles.find((t) => String(t.epsgTag) !== String(first));
    if (mismatched) {
      throw new Error(`These tiles don't share the same coordinate system tag ("${tiles[0].name}": EPSG:${first ?? "unknown"} vs "${mismatched.name}": EPSG:${mismatched.epsgTag ?? "unknown"}) — only merge tiles from the same source/CRS.`);
    }
  }

  const xmin = Math.min(...tiles.map((t) => t.bbox[0]));
  const ymin = Math.min(...tiles.map((t) => t.bbox[1]));
  const xmax = Math.max(...tiles.map((t) => t.bbox[2]));
  const ymax = Math.max(...tiles.map((t) => t.bbox[3]));

  // Grid resolution is capped at DEM_MAX_GRID on the longer world-space side (not source pixel count —
  // SRTM tiles at high latitude aren't square in pixels, e.g. 1801x3601 for a 1°x1° tile, since NASA
  // widens the longitude spacing near the poles, but the bbox itself is still ~1°x1°) regardless of
  // how many tiles are merged, same "keep it renderable" budget parseDEM always used.
  const aspect = (xmax - xmin) / Math.max(1e-12, ymax - ymin);
  const gridW = aspect >= 1 ? DEM_MAX_GRID : Math.max(2, Math.round(DEM_MAX_GRID * aspect));
  const gridH = aspect >= 1 ? Math.max(2, Math.round(DEM_MAX_GRID / aspect)) : DEM_MAX_GRID;

  // Mosaic: for each output cell, sample whichever tile's own bbox contains that world point (real
  // tile sets like SRTM are edge-matched, so there's no blending needed at the seam between tiles).
  const raw = new Float32Array(gridW * gridH).fill(NaN);
  for (let row = 0; row < gridH; row++) {
    const y = ymax - (row / Math.max(1, gridH - 1)) * (ymax - ymin); // row 0 = north
    for (let col = 0; col < gridW; col++) {
      const x = xmin + (col / Math.max(1, gridW - 1)) * (xmax - xmin);
      for (const t of tiles) {
        const [txmin, tymin, txmax, tymax] = t.bbox;
        if (x < txmin || x > txmax || y < tymin || y > tymax) continue;
        const v = bilinearSample(t.band, t.srcW, t.srcH, txmin, tymin, txmax, tymax, x, y);
        if (Number.isFinite(v)) { raw[row * gridW + col] = v; break; }
      }
    }
  }

  const epsgTag = tiles[0].epsgTag;
  const geographic = tiles[0].geographic;

  let outBbox = [xmin, ymin, xmax, ymax];
  let outGridW = gridW, outGridH = gridH;
  let outElevations = raw;
  let reprojectedTo = null;
  let reprojectNote = null;

  if (geographic && targetEpsg && Number(epsgTag) !== Number(targetEpsg)) {
    const [fromDef, toDef] = await Promise.all([getProj4Def(epsgTag), getProj4Def(targetEpsg)]);
    if (fromDef && toDef) {
      const r = reprojectGrid({ xmin, ymin, xmax, ymax, gridW, gridH, band: raw }, fromDef, toDef, gridW, gridH);
      outBbox = r.bbox; outGridW = r.gridW; outGridH = r.gridH; outElevations = r.elevations;
      reprojectedTo = Number(targetEpsg);
    } else {
      reprojectNote = `this file's own CRS tag (EPSG:${epsgTag}) doesn't match the project's EPSG:${targetEpsg} — automatic reprojection wasn't available (couldn't resolve a proj4 definition for EPSG:${!fromDef ? epsgTag : targetEpsg}), so no reprojection happened on import. Double-check it lines up with the rest of the project.`;
    }
  }

  // Fill any remaining nodata/no-coverage cells with the mean of valid cells (a flat "sea level"-ish
  // patch reads better in a 3D mesh than a NaN-driven hole or a 0-elevation cliff) — same reasoning
  // parseDEM always used, just applied after mosaicking/reprojection instead of before.
  let sum = 0, count = 0;
  for (let i = 0; i < outElevations.length; i++) if (Number.isFinite(outElevations[i])) { sum += outElevations[i]; count++; }
  const fallback = count ? sum / count : 0;
  const elevations = new Float32Array(outGridW * outGridH);
  for (let i = 0; i < outElevations.length; i++) elevations[i] = Number.isFinite(outElevations[i]) ? outElevations[i] : fallback;

  return {
    name: tiles.length > 1 ? `${tiles.length} tiles merged (${tiles[0].name}, …)` : tiles[0].name,
    bbox: outBbox,
    gridW: outGridW, gridH: outGridH,
    elevations: Array.from(elevations), // plain array — easier to JSON-persist in the project file than a typed array
    srcWidth: tiles.reduce((s, t) => s + t.srcW, 0), srcHeight: Math.max(...tiles.map((t) => t.srcH)),
    epsgTag,
    reprojectedTo,
    reprojectNote,
    tileCount: tiles.length,
  };
}

// Single-file convenience wrapper around parseDEMFiles — kept so any future one-file call site doesn't
// need to wrap its file in an array.
export async function parseDEM(file, targetEpsg) {
  return parseDEMFiles([file], targetEpsg);
}

// TASKS.csv #26 — Geosoft grid import. Only .gxf (Geosoft Gridded data eXchange Format) is handled,
// not the binary .grd — .gxf is a plain-text format with a genuinely public specification (it's
// Geosoft's own interchange format, meant to be read by tools that aren't Oasis montaj), while .grd
// is Geosoft's proprietary binary grid and there's no public spec to implement against reliably.
// A .gxf is a text header of "#KEYWORD" lines each followed by one or more value lines, then a
// "#GRID" section holding ncols*nrows whitespace-separated values in row-major order. Reused as a
// raster drape (addRaster), same as parseGeoTIFF above — GXF grids in practice are almost always
// geophysical value grids (mag/gravity/radiometrics), not elevation, so there's no DEM path for it.
export async function parseGXF(file) {
  const text = await file.text();
  const lines = text.split(/\r\n|\r|\n/);

  const header = {}; // KEYWORD -> array of value lines
  let gridStart = -1;
  let curKey = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      const key = trimmed.slice(1).trim().toUpperCase();
      if (key === "GRID") { gridStart = i + 1; break; }
      curKey = key;
      header[curKey] = [];
    } else if (curKey && trimmed !== "") {
      header[curKey].push(trimmed);
    }
  }
  if (gridStart < 0) throw new Error("Not a readable GXF file — no #GRID section found.");

  const num = (key, fallback) => {
    const v = header[key]?.[0] !== undefined ? parseFloat(header[key][0]) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };
  const ncols = num("POINTS", NaN), nrows = num("ROWS", NaN);
  if (!Number.isFinite(ncols) || !Number.isFinite(nrows) || ncols < 2 || nrows < 2) {
    throw new Error("This GXF file is missing #POINTS/#ROWS (grid dimensions) or they're invalid.");
  }
  const dx = num("PTSEPARATION", 1), dy = num("RWSEPARATION", dx);
  const x0 = num("XORIGIN", 0), y0 = num("YORIGIN", 0);
  const rotation = num("ROTATION", 0);
  const sense = num("SENSE", 1);
  const dummy = num("DUMMY", 1e32); // GXF's own documented default nodata sentinel when #DUMMY is absent

  // A rotated grid can't be represented as the axis-aligned bbox+image rectangle the rest of the app's
  // raster drape model assumes (same assumption parseGeoTIFF's bbox makes) — rather than silently
  // draping it in the wrong place, surface this as an explicit limitation.
  if (Math.abs(rotation) > 0.01) {
    throw new Error(`This GXF grid has a #ROTATION of ${rotation}° — rotated grids aren't supported yet (the raster drape only handles axis-aligned grids). Re-export it unrotated if your software supports that, or open it in GIS software first to reproject/re-grid to north-up.`);
  }

  const total = ncols * nrows;
  const values = new Float64Array(total);
  let filled = 0;
  let gridCharCount = 0, gridDigitCount = 0; // see the shortfall diagnostic below
  for (let i = gridStart; i < lines.length && filled < total; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    gridCharCount += trimmed.length;
    for (let c = 0; c < trimmed.length; c++) { const ch = trimmed.charCodeAt(c); if (ch >= 48 && ch <= 57) gridDigitCount++; }
    const toks = trimmed.split(/\s+/);
    for (const t of toks) {
      if (filled >= total) break;
      const v = parseFloat(t);
      values[filled++] = Number.isFinite(v) ? v : dummy;
    }
  }
  if (filled < total) {
    // A shortfall this parser can't explain by truncation alone (see #164's UBC streaming work for a
    // genuinely truncated-file case) shows a telltale sign: plain-ASCII GXF grids are >20% digit
    // characters by nature (numbers, decimal points, minus signs, whitespace); a #GRID section with
    // almost no digit characters at all despite a substantial byte count isn't a short/truncated read
    // — it's data this parser can't interpret as text in the first place. Confirmed against a real
    // Geosoft export (CRN_VPMg_MagSusc_700.gxf) whose #GRID section is dense printable-ASCII with ZERO
    // digit characters — almost certainly a proprietary/undocumented Geosoft "compressed" GXF grid
    // encoding this from-scratch parser was never built against (there's no public spec for it, and
    // guessing at the bit-packing risked silently corrupting real geophysics data, so this wasn't
    // reverse-engineered blindly this pass — see TASKS.csv #166).
    // Calibrated against a real plain-text GXF grid (space-separated signed decimals are comfortably
    // 60-90% digit characters) vs. the real compressed sample below (~12%) — 0.3 cleanly separates them
    // with margin on both sides.
    const digitRatio = gridCharCount > 0 ? gridDigitCount / gridCharCount : 0;
    if (gridCharCount > 1000 && digitRatio < 0.3) {
      throw new Error(
        `This GXF's #GRID section doesn't look like plain-text numbers (only ${(digitRatio * 100).toFixed(1)}% digit characters across ${gridCharCount.toLocaleString()} characters read) — it's very likely using a proprietary/compressed Geosoft grid encoding this reader doesn't support, not a truncated file. If your workflow already exported this same grid as a GeoTIFF (.tif), import that instead — it carries the same data and is fully supported. Otherwise, re-export from Oasis montaj as an uncompressed/plain-text .gxf if that option is available.`
      );
    }
    throw new Error(`This GXF's #GRID section has fewer values (${filled}) than #POINTS×#ROWS (${total}) declares — the file may be truncated.`);
  }

  // SENSE controls how the flat value list maps onto rows/columns. GXF's most common cases: 1 = each
  // row read west->east, rows ordered south->north (the default almost every export uses); -1 = same
  // row order but each row mirrored east->west. The rarer transpose variants (±2) aren't handled —
  // falls back to SENSE=1 layout with a note in the returned message rather than misinterpreting the
  // data silently, since there's no public real-world sample of those variants to verify against.
  const mirrored = sense === -1;
  const senseNote = (sense !== 1 && sense !== -1) ? ` Note: #SENSE ${sense} (a transpose variant) isn't specifically handled — the grid was read as if SENSE were 1, so double-check its orientation looks right.` : "";

  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(ncols, nrows));
  const outW = Math.max(1, Math.round(ncols * scale)), outH = Math.max(1, Math.round(nrows * scale));

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < total; i++) { const v = values[i]; if (v !== dummy && Number.isFinite(v)) { if (v < min) min = v; if (v > max) max = v; } }
  const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;

  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(outW, outH);

  // gxfRow 0 = south edge per SENSE=1 convention; canvas row 0 must be the north edge (top of image),
  // same top-down convention parseGeoTIFF/parseDEM already produce — so canvas row = (nrows-1-gxfRow),
  // then downsampled by nearest-neighbor onto the (possibly smaller) output grid.
  for (let oy = 0; oy < outH; oy++) {
    const gxfRow = Math.min(nrows - 1, Math.floor(((outH - 1 - oy) / Math.max(1, outH - 1)) * (nrows - 1)));
    for (let ox = 0; ox < outW; ox++) {
      let col = Math.min(ncols - 1, Math.floor((ox / Math.max(1, outW - 1)) * (ncols - 1)));
      if (mirrored) col = ncols - 1 - col;
      const v = values[gxfRow * ncols + col];
      const idx = (oy * outW + ox) * 4;
      const isDummy = v === dummy || !Number.isFinite(v);
      if (isDummy) { imgData.data[idx + 3] = 0; continue; }
      const t = hasRange ? (v - min) / (max - min) : 0.5;
      const [cr, cg, cb] = rampColor(t);
      imgData.data[idx] = cr; imgData.data[idx + 1] = cg; imgData.data[idx + 2] = cb; imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const bbox = [x0, y0, x0 + dx * (ncols - 1), y0 + dy * (nrows - 1)];
  return {
    name: file.name,
    bbox,
    width: ncols,
    height: nrows,
    dataUrl: canvas.toDataURL("image/png"),
    bandCount: 1,
    epsgTag: null, // GXF headers don't carry a standard CRS tag the way GeoTIFF's GeoKeys do
    note: senseNote || null,
  };
}

// TASKS.csv — split the Raster import UI out of the Geophysics module into its own module (user
// request), but a .tif/.gxf dropped directly onto the Geophysics tab should still work exactly like
// before rather than forcing a tab-switch mid-drag. Shared here (parse + build a ready-to-addRaster
// payload + a human-readable import message) so both modules' drop handlers and import buttons call
// the SAME logic instead of two copies quietly drifting apart — each module still owns its own
// busy/error UI state and calls the store's addRaster() itself.
export async function buildRasterImport(file, { epsg, defaultElevation } = {}) {
  const isGxf = /\.gxf$/i.test(file.name);
  const parsed = isGxf ? await parseGXF(file) : await parseGeoTIFF(file);
  const [xmin, ymin, xmax, ymax] = parsed.bbox;
  let msg = `Imported "${parsed.name}" (${parsed.width}×${parsed.height}px, ${(xmax - xmin).toFixed(0)}×${(ymax - ymin).toFixed(0)} world units).`;
  if (parsed.epsgTag && epsg && Number(parsed.epsgTag) !== Number(epsg)) {
    msg += ` Note: this file's own CRS tag (EPSG:${parsed.epsgTag}) doesn't match the project's EPSG:${epsg} — no reprojection happens on import, so double-check it lines up with your drillholes.`;
  }
  if (isGxf) msg += " Assumes the grid's own coordinates already match the project's EPSG — GXF headers don't carry a standard CRS tag to cross-check against.";
  if (parsed.note) msg += parsed.note;
  return { raster: { name: parsed.name, bbox: parsed.bbox, dataUrl: parsed.dataUrl, elevation: defaultElevation }, msg };
}
