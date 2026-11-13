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
import { inflateCapped, MB } from "./inflate.js"; // TASKS.csv #1347
import { decodeGrd } from "./grdFormats.js"; // TASKS.csv #1347
import GeoTIFF, { fromArrayBuffer } from "geotiff"; // GeoTIFF.fromSource: #1351
import { writeGeoTiff } from "./geotiffWrite.js"; // TASKS.csv #1038 — geotiff.js header, one loop for the pixels
import { f32ToB64, b64ToF32 } from "./inversion.js"; // TASKS.csv #326 — compact grid values
import { getProj4Def, getProj4DefSync, reprojectGrid, reprojectImageRGBA, bilinearSample, reprojectXY, guessEpsgFromPrjWkt, isGeographicCrs, isMetricProjectedEpsg } from "./reproject.js"; // isGeographicCrs: #1862; isMetricProjectedEpsg: #2127
import { arrMin, arrMax, percentileSorted } from "./arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread); #740 percentileSorted
import { fillNoData, noDataNote } from "./demFill.js"; // TASKS.csv #421
import { VIRIDIS_ANCHORS } from "./layers.js"; // TASKS.csv #740
import { makeStretch } from "./idw.js"; // TASKS.csv #708 — the same 2-98 % stretch as IDW grids
import { rasterStops, DEFAULT_RASTER_STYLE } from "./rasterColour.js"; // TASKS.csv #1236
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language
import { b64ToBytes } from "./base64.js"; // TASKS.csv #1114
import { gridPicture } from "./gridPicture.js"; // TASKS.csv #3033 — the picture of a value grid, shared with the filter worker
import { borderKeyColour, colourFraction, hexRgb } from "./rasterKey.js"; // TASKS.csv #1623
import { tieReaches, tieImageToLocal, tieGridToLocal, mineReaches, mineImageToProject, mineGridToProject, mineBoxOf } from "./rasterTie.js"; // TASKS.csv #2587 / #2322; mine*: #2684
import { isMineSource, mineSourceSentence } from "./mineGrid.js"; // TASKS.csv #2684
import { tieDemGridToLocal, tieWorldBox } from "./terrainTie.js"; // TASKS.csv #2648

// TASKS.csv #707 — a GeoTIFF's CRS as an EPSG code. 32767 means "user-defined" (what ArcGIS and Oasis montaj write for a
// CRS they have no code for, the BC NAD83(CSRS) UTM zones being the usual case); the CRS is then named in a citation
// key, which the .prj sniffer can resolve (NAD_1983_CSRS_UTM_Zone_10N -> 3157). It used to be reported as
// "EPSG:32767 isn't one GeoStrix can reproject". Returns null when nothing names a CRS GeoStrix knows.
export function epsgFromGeoKeys(k) {
  if (!k) return null;
  const code = k.ProjectedCSTypeGeoKey || k.GeographicTypeGeoKey || null;
  if (code && code !== 32767) return code;
  for (const c of [k.PCSCitationGeoKey, k.GTCitationGeoKey, k.GeogCitationGeoKey]) {
    if (typeof c !== "string" || !c.trim()) continue;
    const g = guessEpsgFromPrjWkt(c);
    if (g) return g;
  }
  return null;
}

// Cap so a huge source grid still makes a fast-to-render texture rather than bloating every project
// save. Raised from 1024 -> 2048 (TASKS.csv, user report of "imported in a really bad quality") —
// 1024 was visibly softening real-world GeoTIFFs wider than ~1024px on their longest side. Note this
// only helps grids that actually HAVE more native resolution than the cap: a genuinely coarse source
// grid (e.g. a hand-digitized or low-station-density survey) will still look blocky at any cap, since
// there's no more real data to show — that's the source data's resolution, not this constant.
const MAX_TEXTURE_SIZE = 2048;
// TASKS.csv #838 — the opt-in for a drone or contractor orthophoto: 64 MB of graphics memory at most, against 16 MB, and small enough for any GPU
const FULL_DETAIL_SIZE = 4096;
export const reducedImportNote = (w, h, keepDetail) => (Math.max(w, h) <= (keepDetail ? FULL_DETAIL_SIZE : MAX_TEXTURE_SIZE) ? "" : keepDetail
  ? tr(" Reduced from {w} × {h} px to 4096 px on its long side, the most GeoStrix keeps.", { w, h })
  : tr(" Reduced from {w} × {h} px to 2048 px on its long side. Tick Keep full detail and import it again to keep up to 4096 px.", { w, h }));
const imageDataUrl = (canvas) => { const u = canvas.toDataURL("image/webp", 0.92); return u.startsWith("data:image/webp") ? u : canvas.toDataURL("image/png"); };

// TASKS.csv #326 — single-band grids keep their VALUES (not just the colour-mapped picture), so they can
// feed an inversion as survey points and the potential-field filters (#373). Stored node-based, row 0 =
// north: value (i, j) sits at x0 + i*dx, yTop - j*dy. Block-averaged down to at most GRID_MAX nodes on the
// longest side (every autosave writes the project file; a full-resolution airborne grid would add tens of
// MB to each one). No-data nodes are NaN.
export const GRID_MAX = 512;
// TASKS.csv #1242 — "10.7 m" for a grid whose cells are 10.7 x 18.3 m
export const gridCellText = (g) => (Math.abs(g.dx - g.dy) <= 0.005 * Math.max(g.dx, g.dy) ? `${+g.dx.toFixed(2)} m` : `${+g.dx.toFixed(2)} × ${+g.dy.toFixed(2)} m`);
export function makeValueGrid(values, nx, ny, x0, yTop, dx, dy, isNoData) {
  const f = Math.max(1, Math.ceil(Math.max(nx, ny) / GRID_MAX));
  const gx = Math.ceil(nx / f), gy = Math.ceil(ny / f);
  const out = new Float32Array(gx * gy);
  // TASKS.csv #2831 — averaged, each block's highest and lowest value are kept beside its mean, and the range of the values averaged
  const mx = f > 1 ? new Float32Array(gx * gy) : null, mn = f > 1 ? new Float32Array(gx * gy) : null;
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    let s = 0, n = 0, bmx = -Infinity, bmn = Infinity;
    for (let b = 0; b < f; b++) for (let a = 0; a < f; a++) {
      const ii = i * f + a, jj = j * f + b;
      if (ii >= nx || jj >= ny) continue;
      const v = values[jj * nx + ii];
      if (!isNoData(v)) { s += v; n++; if (v > bmx) bmx = v; if (v < bmn) bmn = v; }
    }
    out[j * gx + i] = n ? s / n : NaN;
    if (mx) { mx[j * gx + i] = n ? bmx : NaN; mn[j * gx + i] = n ? bmn : NaN; }
    if (n) { if (bmx > hi) hi = bmx; if (bmn < lo) lo = bmn; }
  }
  // a block's centre: the mean of the node positions it averages
  const cx = (i) => x0 + dx * (i * f + (Math.min(f, nx - i * f) - 1) / 2);
  const cy = (j) => yTop - dy * (j * f + (Math.min(f, ny - j * f) - 1) / 2);
  return { nx: gx, ny: gy, x0: cx(0), yTop: cy(0), dx: dx * f, dy: dy * f, values: out, averagedBy: f, sourceSize: [nx, ny], ...(mx ? { maxValues: mx, minValues: mn, sourceRange: Number.isFinite(lo) ? [lo, hi] : null } : {}) }; // #2831
}


// TASKS.csv #382 — default single-band ramp for draped grids. The previous blue -> teal -> yellow -> red
// ramp was described here as "perceptually reasonable" but measured L* 15 up to 81 and back down to 57, so
// the highest values were DARKER than mid values. Now viridis (monotonic lightness), the same default as
// the 3D point/voxel colouring (layers.js magColorRGB).
const RAMP = VIRIDIS_ANCHORS; // TASKS.csv #740 — one table (it was typed twice; #382 had to edit both)
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
// TASKS.csv #561 (security) — geotiff.js decodes a read window at its NATIVE size before resampling to the
// requested width/height, so the 2048 px texture cap and the 800 px DEM cap limited only the output: a 49 KB
// tiled TIFF whose tiles all point at one deflated 256 x 256 tile claimed 20,000 x 20,000 px and took 22.6 s
// and ~800 MB to decode (enough at ~40k px to crash the renderer and lose unsaved work). Every read now goes
// through this: above MAX_DECODE_SAMPLES (window pixels x bands) it reads the largest reduced-resolution
// overview that fits, else refuses within milliseconds. A real 1 m LiDAR tile is 400 M samples: crop it, or
// give it overviews (gdaladdo) / thin it (gdalwarp -tr), as the message says.
export const MAX_DECODE_SAMPLES = 64_000_000;
const MAX_EXPANSION = 200; // TASKS.csv #1351 — decoded bytes (4 per value) per byte of file a streamed read may expand to
export async function readRastersCapped(tiff, image, opts = {}, label = "This GeoTIFF") {
  const fullW = image.getWidth(), fullH = image.getHeight(), bands = opts.samples?.length || image.getSamplesPerPixel() || 1; // samples: #807
  const [c0, r0, c1, r1] = opts.window || [0, 0, fullW, fullH];
  const need = (c1 - c0) * (r1 - r0) * bands;
  if (need <= MAX_DECODE_SAMPLES) return image.readRasters(opts);
  let best = null;
  const count = tiff ? await tiff.getImageCount() : 1;
  for (let i = 1; i < count; i++) {
    let ov;
    try { ov = await tiff.getImage(i); } catch { continue; }
    const fd = ov.fileDirectory || {};
    const nst = tiffTag(ov, "NewSubfileType") ?? fd.NewSubfileType; // #560 — geotiff.js 3: tags behind getValue
    if (nst != null && !(nst & 1)) continue; // a page, not a reduced-resolution copy
    if (nst & 4) continue; // transparency mask
    const f = ov.getWidth() / fullW;
    if (!(f > 0 && f < 1) || Math.abs(ov.getHeight() / fullH - f) > 0.05) continue;
    const win = [Math.floor(c0 * f), Math.floor(r0 * f), Math.max(Math.floor(c0 * f) + 1, Math.ceil(c1 * f)), Math.max(Math.floor(r0 * f) + 1, Math.ceil(r1 * f))];
    const n = (win[2] - win[0]) * (win[3] - win[1]) * (ov.getSamplesPerPixel() || 1);
    if (n <= MAX_DECODE_SAMPLES && (!best || n > best.n)) best = { ov, win, n };
  }
  if (best) return best.ov.readRasters({ ...opts, window: best.win });
  // TASKS.csv #1351 — no overview: a reduced read (width / height given, the OUTPUT under the limit) streams the tiles instead
  // ...unless the file is far too small for what it claims: real images decode to ~1-10x their size (the 249 MB DTM to 3.7x), the #561
  // bomb (49 KB claiming 20,000 x 20,000 px, every tile pointing at one deflated tile) to ~30,000x; that is refused below, undecoded
  const fileSize = image.source?.fileSize ?? image.source?.arrayBuffer?.byteLength ?? tiff?.source?.fileSize ?? null;
  const plausible = !(fileSize > 0) || need * 4 <= MAX_EXPANSION * fileSize;
  if (plausible && opts.width > 0 && opts.height > 0 && opts.width * opts.height * bands <= MAX_DECODE_SAMPLES) return readTiledReduced(image, opts, label);
  throw new Error(tr("{label} is {v} × {v2} px{v3} — over the {v4} million-value limit GeoStrix decodes at once, with no smaller overview inside. Crop it to your area, or add overviews (gdaladdo) / thin it (gdalwarp -tr) in QGIS or GDAL first.", { label, v: (c1 - c0).toLocaleString(), v2: (r1 - r0).toLocaleString(), v3: bands > 1 ? tr(" × {bands} bands", { bands }) : "", v4: (MAX_DECODE_SAMPLES / 1e6).toFixed(0) }));
}

// ---------------- TASKS.csv #1351 — big GeoTIFFs: read by byte range, decoded a tile at a time ----------------
// A 249 MB drone DTM (13,966 x 16,178 float32, 256 px deflate tiles, no overviews; 42290Z Eagle Lake) was refused by the decode
// limit above, and every path first read the WHOLE file into memory (file.arrayBuffer()), so a 2.5 GB orthomosaic could not be
// opened at all. Now the file is read by byte ranges (only the header and the tiles a read needs), and a reduced read of an image
// with no overview walks its tiles one at a time, folding each into the output grid, so memory is the output plus one tile.
// file: a Blob / File, or { name, size, readRange(offset, length) -> Promise<ArrayBuffer> } (the Browser panel's big files)
// TASKS.csv #2861 (review GSC geophysics) — a 0.8 MB picture TIFF in 144 strips took 3.4-5.6 s: one file.slice().arrayBuffer() per strip, each a
// round trip. A file up to WHOLE_READ_MAX is read once and sliced in memory; the ranged reads stay for the big ones (#1351)
export const WHOLE_READ_MAX = 64 * 1024 * 1024;
export function rangedTiffSource(file) {
  let whole = null; // a stand-in with only arrayBuffer() (bundled-sample loaders, tests): read once, then sliced
  const small = Number(file.size) > 0 && Number(file.size) <= WHOLE_READ_MAX && typeof file.arrayBuffer === "function"; // #2861
  let wholeP = null; // one read shared by the strips fetched in parallel
  const read = small ? async (o, l) => { wholeP = wholeP || file.arrayBuffer(); return (await wholeP).slice(o, o + l); }
    : typeof file.readRange === "function" ? (o, l) => file.readRange(o, l)
    : typeof file.slice === "function" ? (o, l) => file.slice(o, o + l).arrayBuffer()
      : async (o, l) => { whole = whole || await file.arrayBuffer(); return whole.slice(o, o + l); };
  const size = Number(file.size) || Infinity;
  return {
    fetch: (slices) => Promise.all(slices.map((s) => read(s.offset, Math.max(0, Math.min(s.length, size - s.offset))))),
    get fileSize() { return Number.isFinite(size) ? size : null; },
    close: async () => {},
  };
}
export const openTiff = (file) => GeoTIFF.fromSource(rangedTiffSource(file));

// The decode budget of a streamed read: every tile the window touches is decompressed whole (all its bands when they are
// interleaved). ~6 ms per 256 x 256 float tile here, so 600 million values is about a minute; a bigger read is refused at once
// with the way out, before anything is decoded.
export const MAX_STREAM_SAMPLES = 600_000_000;
export function streamPlan(image, { window = null, samples = null } = {}) {
  const W = image.getWidth(), H = image.getHeight(), spp = image.getSamplesPerPixel() || 1;
  const tw = image.getTileWidth(), th = image.getTileHeight();
  const [c0, r0, c1, r1] = window || [0, 0, W, H];
  const tx0 = Math.floor(c0 / tw), tx1 = Math.floor((c1 - 1) / tw), ty0 = Math.floor(r0 / th), ty1 = Math.floor((r1 - 1) / th);
  const tiles = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  const planar = image.planarConfiguration === 2;
  const perTile = tw * th * (planar ? (samples ? samples.length : spp) : spp);
  return { tiles, tw, th, tx0, tx1, ty0, ty1, c0, r0, c1, r1, decode: tiles * perTile };
}
// opts as readRasters: window, width, height, samples, resampleMethod ("bilinear" -> the mean of the valid source pixels in each
// output cell; anything else -> the pixel nearest the cell's centre, geotiff.js's own default). Returns one Float32Array per band
// (with .width / .height), an empty cell set to the file's no-data value, else NaN.
export async function readTiledReduced(image, opts = {}, label = "This GeoTIFF") {
  const W = image.getWidth(), H = image.getHeight(), spp = image.getSamplesPerPixel() || 1;
  const bandIdx = opts.samples || Array.from({ length: spp }, (_, i) => i);
  const plan = streamPlan(image, opts);
  const { c0, r0, c1, r1, tw, th } = plan;
  if (plan.decode > MAX_STREAM_SAMPLES) {
    throw new Error(tr("{label} is {w} × {h} px with no smaller overview: reading it would decode {n} million values, about {min} minutes, over the {limit} million GeoStrix reads at once. Crop it to your area (gdal_translate -projwin) or add overviews (gdaladdo) in QGIS or GDAL first.", { label, w: W.toLocaleString(), h: H.toLocaleString(), n: Math.round(plan.decode / 1e6).toLocaleString(), min: Math.max(1, Math.round((plan.tiles * 7) / 60000)), limit: MAX_STREAM_SAMPLES / 1e6 }));
  }
  const ow = Math.max(1, Math.round(opts.width || c1 - c0)), oh = Math.max(1, Math.round(opts.height || r1 - r0));
  const bx = (c1 - c0) / ow, by = (r1 - r0) / oh, nb = bandIdx.length, n = ow * oh;
  let noData = null;
  try { const nd = image.getGDALNoData(); if (Number.isFinite(nd)) noData = nd; } catch (_) { /* optional */ }
  const valid = (v) => Number.isFinite(v) && (noData === null || v !== noData);
  const avg = opts.resampleMethod === "bilinear" || opts.resampleMethod === "average";
  const out = bandIdx.map(() => new Float32Array(n).fill(noData ?? NaN));
  // float32 sums (a cell averages tens of values; float32 keeps ~7 digits) and 16-bit counts when a cell cannot reach 65,535: ~half the memory
  const sum = avg ? bandIdx.map(() => new Float32Array(n)) : null, CountArray = Math.ceil(bx) * Math.ceil(by) < 65535 ? Uint16Array : Uint32Array, cnt = avg ? bandIdx.map(() => new CountArray(n)) : null;
  // nearest: the source column / row each output column / row samples
  const colOf = avg ? null : Int32Array.from({ length: ow }, (_, o) => Math.min(c1 - 1, c0 + Math.floor((o + 0.5) * bx)));
  const rowOf = avg ? null : Int32Array.from({ length: oh }, (_, o) => Math.min(r1 - 1, r0 + Math.floor((o + 0.5) * by)));
  for (let ty = plan.ty0; ty <= plan.ty1; ty++) {
    const y0 = Math.max(r0, ty * th), y1 = Math.min(r1, (ty + 1) * th);
    // nearest: skip a tile row no output row samples
    const oy0 = avg ? 0 : Math.max(0, Math.ceil((y0 - r0) / by - 0.5)), oy1 = avg ? -1 : Math.min(oh - 1, Math.floor((y1 - r0) / by - 0.5 - 1e-9));
    if (!avg && !(rowOf[Math.min(oh - 1, oy0)] >= y0 && rowOf[Math.min(oh - 1, oy0)] < y1)) continue;
    for (let tx = plan.tx0; tx <= plan.tx1; tx++) {
      const x0 = Math.max(c0, tx * tw), x1 = Math.min(c1, (tx + 1) * tw);
      const ox0 = avg ? 0 : Math.max(0, Math.ceil((x0 - c0) / bx - 0.5));
      if (!avg && !(ox0 < ow && colOf[ox0] >= x0 && colOf[ox0] < x1)) continue;
      const tile = await image.readRasters({ window: [x0, y0, x1, y1], samples: bandIdx });
      const w = x1 - x0;
      if (avg) {
        for (let y = y0; y < y1; y++) {
          const oy = Math.min(oh - 1, Math.floor((y - r0) / by)), rowBase = oy * ow, tRow = (y - y0) * w;
          for (let x = x0; x < x1; x++) {
            const o = rowBase + Math.min(ow - 1, Math.floor((x - c0) / bx)), t = tRow + (x - x0);
            for (let b = 0; b < nb; b++) { const v = tile[b][t]; if (valid(v)) { sum[b][o] += v; cnt[b][o]++; } }
          }
        }
      } else {
        for (let oy = oy0; oy <= oy1; oy++) {
          const ty_ = rowOf[oy]; if (ty_ < y0 || ty_ >= y1) continue;
          const tRow = (ty_ - y0) * w, rowBase = oy * ow;
          for (let ox = ox0; ox < ow && colOf[ox] < x1; ox++) {
            const t = tRow + (colOf[ox] - x0);
            for (let b = 0; b < nb; b++) out[b][rowBase + ox] = tile[b][t];
          }
        }
      }
    }
  }
  if (avg) for (let b = 0; b < nb; b++) for (let o = 0; o < n; o++) if (cnt[b][o]) out[b][o] = sum[b][o] / cnt[b][o];
  for (const a of out) { a.width = ow; a.height = oh; }
  out.width = ow; out.height = oh;
  return out;
}
// a band (row 0 north) shrunk to w x h by the mean of its valid values per cell (the texture from a streamed grid read)
export function shrinkBand(band, bw, bh, w, h, isNoData = (v) => !Number.isFinite(v)) {
  const out = new Float32Array(w * h).fill(NaN), sum = new Float64Array(w * h), cnt = new Uint32Array(w * h);
  for (let y = 0; y < bh; y++) {
    const oy = Math.min(h - 1, Math.floor((y * h) / bh));
    for (let x = 0; x < bw; x++) { const v = band[y * bw + x]; if (isNoData(v)) continue; const o = oy * w + Math.min(w - 1, Math.floor((x * w) / bw)); sum[o] += v; cnt[o]++; }
  }
  for (let o = 0; o < out.length; o++) if (cnt[o]) out[o] = sum[o] / cnt[o];
  return out;
}

// TASKS.csv #783 — `bandFn(bands, isNoData)` turns a multiband file into ONE band (a spectral index) before the
// single-band path below: the same stretch, ramp, kept values and reprojection as any value grid.
// TASKS.csv #807 — `samples` (0-based band indices): decode only those bands (a 285-band hyperspectral cube needs ~18)
// TASKS.csv #1855 — a world file (.tfw / .tifw / .wld): six numbers, one per line — pixel width (A), two rotation terms (D, B),
// pixel height (E, negative for north-up), and the CENTRE of the top-left pixel (C, F). -> { a, d, b, e, c, f, name }
export function parseWorldFile(text, name = "world file") {
  const v = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 6).map(Number);
  if (v.length < 6 || v.some((x) => !Number.isFinite(x)) || v[0] === 0 || v[3] === 0) throw new Error(tr("\"{name}\" is not a world file: it needs six numbers, one per line.", { name }));
  const [a, d, b, e, c, f] = v;
  return { a, d, b, e, c, f, name };
}
// the pixel-area extent [xmin, ymin, xmax, ymax] of a width x height image placed by a world file; a rotated one is refused
export function worldFileBbox(w, width, height) {
  if (Math.abs(w.d) > 1e-9 * Math.abs(w.a) || Math.abs(w.b) > 1e-9 * Math.abs(w.e)) throw new Error(tr("The world file \"{name}\" rotates the image (its rotation terms are not 0). GeoStrix places north-up images only: place it with Maps > Georeference instead.", { name: w.name }));
  const x0 = w.c - w.a / 2, y0 = w.f - w.e / 2, x1 = x0 + w.a * width, y1 = y0 + w.e * height;
  return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
}
// TASKS.csv #1855 — any TIFF geotiff.js reads (RGB, palette, grey, YCbCr...) as an RGBA canvas for the Georeferencer, which
// had refused TIFFs ("browsers can't decode plain TIFF") the GeoTIFF import decodes. Kept to maxSide on the long side.
export async function decodeTiffImage(file, maxSide = FULL_DETAIL_SIZE) {
  let image;
  try { image = await (await fromArrayBuffer(await file.arrayBuffer())).getImage(); } catch (err) { throw new Error(tr("Not a readable GeoTIFF ({message}).", { message: err.message })); }
  const W = image.getWidth(), H = image.getHeight(), s = Math.min(1, maxSide / Math.max(W, H));
  const width = Math.max(1, Math.round(W * s)), height = Math.max(1, Math.round(H * s));
  const rgb = await image.readRGB({ width, height, interleave: true });
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d"), out = ctx.createImageData(width, height);
  const max = rgb.BYTES_PER_ELEMENT === 2 ? 257 : 1; // 16-bit RGB to 8 bit
  for (let i = 0, n = width * height; i < n; i++) {
    out.data[i * 4] = rgb[i * 3] / max; out.data[i * 4 + 1] = rgb[i * 3 + 1] / max; out.data[i * 4 + 2] = rgb[i * 3 + 2] / max; out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return { canvas, width, height, sourceWidth: W, sourceHeight: H };
}

// TASKS.csv #2131 (review #2013, Woodjam) — a CSV fed to the raster import said 'Not a readable GeoTIFF (Invalid byte order value.)', with no
// file name. The first bytes of a TIFF are 'II*\0' / 'MM\0*' (BigTIFF: 'II+\0' / 'MM\0+'): anything else is said to be no TIFF, by name.
export function isTiffHeader(b) {
  if (!b || b.length < 4) return false;
  return (b[0] === 0x49 && b[1] === 0x49 && (b[2] === 0x2a || b[2] === 0x2b) && b[3] === 0) || (b[0] === 0x4d && b[1] === 0x4d && b[2] === 0 && (b[3] === 0x2a || b[3] === 0x2b));
}
export async function parseGeoTIFF(file, { bandFn = null, samples = null, maxSide = MAX_TEXTURE_SIZE, worldFile = null } = {}) { // maxSide: #838; worldFile: #1855
  let tiff, image;
  if (typeof file?.slice === "function" && !isTiffHeader(new Uint8Array(await file.slice(0, 4).arrayBuffer()))) {
    throw new Error(/\.(csv|txt|xlsx?|tsv)$/i.test(file.name || "")
      ? tr("\"{name}\" is not a TIFF, .gxf or .grd: a table goes to Geochem (surface samples) or the 3D View (collars and logs).", { name: file.name })
      : tr("\"{name}\" is not a TIFF, .gxf or .grd file (its first bytes are not a TIFF header).", { name: file.name }));
  }
  try {
    tiff = await openTiff(file); // #1351 — by byte range, not the whole file in memory
    image = await tiff.getImage();
  } catch (err) {
    throw new Error(tr("Not a readable GeoTIFF ({message}).", { message: err.message }));
  }

  assertNorthUp(image, `"${file.name}"`); // #560 — refuse rather than stretch a rotated GeoTIFF
  let bbox;
  try {
    bbox = rasterAreaBbox(image); // [xmin, ymin, xmax, ymax], pixel-area extent; #560: PixelIsPoint honoured
  } catch (err) {
    // geotiff.js throws rather than returning null/undefined when there's no affine transform at
    // all (a plain, non-georeferenced TIFF) — caught here so the message stays specific to what's
    // actually wrong instead of surfacing a raw library error.
    bbox = null;
  }
  let placedBy = null, worldUnused = null;
  if ((!bbox || bbox.some((v) => !Number.isFinite(v))) && worldFile) { bbox = worldFileBbox(worldFile, image.getWidth(), image.getHeight()); placedBy = worldFile.name; } // #1855
  else if (worldFile) { // TASKS.csv #2857 — the TIFF's own GeoKeys placed it: the world file selected with it is said, with how far it would have put it
    const wb = worldFileBbox(worldFile, image.getWidth(), image.getHeight());
    const off = wb && wb.every(Number.isFinite) ? Math.max(...wb.map((v, i) => Math.abs(v - bbox[i]))) : null;
    worldUnused = { name: worldFile.name, offM: off };
  }
  if (!bbox || bbox.some((v) => !Number.isFinite(v))) {
    throw new Error(tr("\"{name}\" has no georeferencing of its own (a plain TIFF). Select its world file (.tfw / .tifw / .wld, same name) together with it, or place it with Maps > Georeference.", { name: file.name })); // #1855 — says where to go
  }

  const srcW = image.getWidth(), srcH = image.getHeight();
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));

  let noData0 = null;
  try { const nd = image.getGDALNoData(); if (Number.isFinite(nd)) noData0 = nd; } catch (_) { /* not all files have it */ }
  const isNoData0 = (v) => noData0 !== null && v === noData0;
  const sel = samples ? { samples } : {}; // #807
  // TASKS.csv #1351 — a single-band file too big to decode whole is read ONCE, at the value grid's size (the mean per cell), and the
  // texture shrunk from that: two streamed passes over a 226-million-value DTM would cost twice the ~20 s
  const oneBand = !bandFn && !samples && (image.getSamplesPerPixel() || 1) === 1;
  const streamOnce = oneBand && srcW * srcH > MAX_DECODE_SAMPLES;
  const pre = srcW * srcH <= 16_000_000 ? 1 : Math.max(srcW, srcH) / 4096;
  const rw = Math.max(1, Math.round(srcW / pre)), rh = Math.max(1, Math.round(srcH / pre));
  const gridRead = streamOnce ? await readRastersCapped(tiff, image, { width: rw, height: rh, resampleMethod: "bilinear" }, `"${file.name}"`) : null;
  const read0 = gridRead ? [shrinkBand(gridRead[0], rw, rh, outW, outH, (v) => !Number.isFinite(v) || (noData0 !== null && v === noData0))] : await readRastersCapped(tiff, image, { width: outW, height: outH, ...sel }, `"${file.name}"`); // #561
  const sourceBands = read0.length;
  const rasters = bandFn ? [bandFn(read0, isNoData0)] : read0; // #783
  const bandCount = rasters.length;

  const canvas = document.createElement("canvas");
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(outW, outH);

  let noData = null;
  try { const nd = image.getGDALNoData(); if (Number.isFinite(nd)) noData = nd; } catch (_) { /* not all files have it */ }

  let singleBandStretch = null; // #708
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
    const valid = [];
    for (let i = 0; i < band.length; i++) {
      const v = band[i];
      if (!Number.isFinite(v) || (noData !== null && v === noData)) continue;
      if (v < min) min = v; if (v > max) max = v;
      valid.push(v);
    }
    const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
    // TASKS.csv #708 — the 2-98 % stretch IDW grids got in #372: a plain min-max let one pipeline spike or a bad
    // electrode squash every other pixel into the bottom of the ramp (one 100,000 among 0-99 put 99 at t < 0.001).
    singleBandStretch = makeStretch(valid, "p2-98");
    for (let i = 0; i < outW * outH; i++) {
      const v = band[i];
      const isNodata = !Number.isFinite(v) || (noData !== null && v === noData);
      if (isNodata) {
        imgData.data[i * 4 + 3] = 0; // transparent — lets holes/other layers show through instead of a false-color block
        continue;
      }
      const t = hasRange ? singleBandStretch.t(v) : 0.5; // #708
      const [cr, cg, cb] = rampColor(t);
      imgData.data[i * 4] = cr; imgData.data[i * 4 + 1] = cg; imgData.data[i * 4 + 2] = cb;
      imgData.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  // #326 — the single band's values at up to GRID_MAX (a separate read at that size, not the texture size)
  let grid = null;
  if (bandCount === 1) {
    // Full resolution when it fits in ~64 MB of float32 (then BLOCK-AVERAGED by makeValueGrid); a larger
    // file is first read at 4096 on its longest side by geotiff's own resampling (nearest), then averaged.
    const [band] = gridRead ? gridRead : rw === outW && rh === outH ? rasters : await (async () => { const r = await readRastersCapped(tiff, image, { width: rw, height: rh, ...sel }, `"${file.name}"`); return bandFn ? [bandFn(r, isNoData0)] : r; })(); // #561; bandFn: #783
    const pw = (bbox[2] - bbox[0]) / rw, ph = (bbox[3] - bbox[1]) / rh; // pixel-area file: values sit at pixel centres
    grid = makeValueGrid(band, rw, rh, bbox[0] + pw / 2, bbox[3] - ph / 2, pw, ph, (v) => !Number.isFinite(v) || (noData !== null && v === noData));
    grid.sourceSize = [srcW, srcH];
    grid.averagedBy = Math.round(grid.averagedBy * pre);
  }

  let epsgTag = null;
  try {
    const geoKeys = image.getGeoKeys();
    epsgTag = epsgFromGeoKeys(geoKeys); // #707
  } catch (_) { /* optional, best-effort */ }

  return {
    name: file.name,
    bbox, // [xmin, ymin, xmax, ymax]
    placedBy, // #1855 — the world file's name when it placed the image
    worldUnused, // #2857
    width: srcW,
    height: srcH,
    dataUrl: maxSide > MAX_TEXTURE_SIZE ? imageDataUrl(canvas) : canvas.toDataURL("image/png"), // #838 — a 16 megapixel PNG would bloat the project file
    bandCount,
    sourceBands, // #783
    epsgTag,
    // TASKS.csv #287 — the colour-mapped RGBA pixels are handed back alongside the PNG data URL so
    // buildRasterImport can reproject them directly (reprojectImageRGBA) without decoding the PNG it
    // just encoded. Only the importer reads this; nothing persists it to the project file.
    pixels: { width: outW, height: outH, data: imgData.data },
    grid, // #326
    ...(singleBandStretch ? { stretch: { mode: singleBandStretch.mode, lo: singleBandStretch.lo, hi: singleBandStretch.hi } } : {}), // #708 — what the colours mean
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

// TASKS.csv #422 — DEM tiles were decoded at full native resolution plus a Float32 copy (~52 MB x2 per
// 1-arc-second tile, ~400 MB for a 4-tile mosaic) only to be resampled to a 200 x 200 grid, and a whole
// 1-degree tile then ended with ~300 m cells, useless at drillhole scale. Now only the part of the tile
// inside `crop` (a bbox in the TILE's CRS; null = whole tile) is decoded, and at most DEM_READ_MAX pixels
// a side (resampled by geotiff.js), which is still 4x the final grid. Node registration (#420) is kept:
// when the window is resampled, the new nodes are the centres of the resampled pixels over the window's
// area.
const DEM_READ_MAX = 800;
async function readDemTile(file, crop = null, readMax = DEM_READ_MAX) {
  let tiff, image;
  try {
    tiff = await openTiff(file); // #1351 — by byte range
    image = await tiff.getImage();
  } catch (err) {
    throw new Error(tr("\"{name}\" is not a readable GeoTIFF ({message}).", { name: file.name, message: err.message }));
  }
  // TASKS.csv #1620 (review #1497, Lawyers) — a colour picture is not elevations: an 8-bit RGB depth-slice image became a 0-255 m terrain
  // (its white background 255 m) about 1,500 m under the collars. 3+ bands of 8 bits, or a Photometric RGB / palette image, is refused.
  { const fd = image.fileDirectory || {}, bands = image.getSamplesPerPixel?.() || 1, bits = Array.isArray(fd.BitsPerSample) ? fd.BitsPerSample[0] : fd.BitsPerSample ?? image.getBitsPerSample?.(0), pi = fd.PhotometricInterpretation;
    if (pi === 2 || pi === 3 || (bands >= 3 && bits <= 8)) throw new Error(tr("\"{name}\" is a colour picture ({bands} band(s) of {bits} bits), not elevations: a terrain needs a single-band elevation grid. Import it under Maps > GeoTIFF / GXF to drape it as a map.", { name: file.name, bands, bits: bits ?? "?" })); }
  let bbox;
  try { bbox = demNodeBbox(image); } catch (err) { if (err.code === "rotated") throw err; bbox = null; } // #560
  if (!bbox || bbox.some((v) => !Number.isFinite(v))) {
    throw new Error(tr("\"{name}\" has no readable georeferencing (bounding box): it may be a plain, non-georeferenced TIFF. Select its world file (.tfw / .tifw / .wld) together with it, or place it with Maps > Georeference.", { name: file.name })); // #1861 — says where to go, as #1855's refusal does
  }
  const fullW = image.getWidth(), fullH = image.getHeight();
  const rx = (bbox[2] - bbox[0]) / Math.max(1, fullW - 1), ry = (bbox[3] - bbox[1]) / Math.max(1, fullH - 1); // node spacing
  let c0 = 0, c1 = fullW - 1, r0 = 0, r1 = fullH - 1;
  if (crop) {
    c0 = Math.max(0, Math.floor((crop[0] - bbox[0]) / rx)); c1 = Math.min(fullW - 1, Math.ceil((crop[2] - bbox[0]) / rx));
    r0 = Math.max(0, Math.floor((bbox[3] - crop[3]) / ry)); r1 = Math.min(fullH - 1, Math.ceil((bbox[3] - crop[1]) / ry));
    if (c1 <= c0 || r1 <= r0) return null; // this tile doesn't reach the crop area
  }
  const winW = c1 - c0 + 1, winH = r1 - r0 + 1;
  const scale = Math.min(1, readMax / Math.max(winW, winH));
  const srcW = Math.max(2, Math.round(winW * scale)), srcH = Math.max(2, Math.round(winH * scale));
  const resampled = srcW !== winW || srcH !== winH;
  const rasters = await readRastersCapped(tiff, image, { window: [c0, r0, c1 + 1, r1 + 1], ...(resampled ? { width: srcW, height: srcH, resampleMethod: "bilinear" } : {}) }, `"${file.name}"`); // #561
  if (!rasters.length) throw new Error(tr("\"{name}\" has no readable elevation band.", { name: file.name }));
  const rawBand = rasters[0]; // DEMs are single-band; if given a multi-band file, just take the first
  // Node bbox of what was read: the window's nodes, or — resampled — the centres of srcW x srcH pixels
  // spread over the window's pixel AREA (half a source pixel beyond its outer nodes).
  const ax0 = bbox[0] + c0 * rx - rx / 2, ax1 = bbox[0] + c1 * rx + rx / 2;
  const ay1 = bbox[3] - r0 * ry + ry / 2, ay0 = bbox[3] - r1 * ry - ry / 2;
  bbox = resampled
    ? [ax0 + (ax1 - ax0) / srcW / 2, ay0 + (ay1 - ay0) / srcH / 2, ax1 - (ax1 - ax0) / srcW / 2, ay1 - (ay1 - ay0) / srcH / 2]
    : [bbox[0] + c0 * rx, bbox[3] - r1 * ry, bbox[0] + c1 * rx, bbox[3] - r0 * ry];

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
    epsgTag = epsgFromGeoKeys(geoKeys); // #707
    geographic = isGeographicGeoKeys(geoKeys);
  } catch (_) { /* optional, best-effort */ }

  return { name: file.name, bbox, srcW, srcH, band, epsgTag, geographic, fullW, fullH, cropped: !!crop, resampled };
}
// Just the georeferencing + CRS of a tile, without decoding pixels (#422: needed to express the crop area
// in the tile's own CRS before reading).
async function peekDemTile(file) {
  const tiff = await openTiff(file); // #1351 — the header only
  const image = await tiff.getImage();
  let epsgTag = null;
  try { epsgTag = epsgFromGeoKeys(image.getGeoKeys()); /* #707 */ } catch (_) { /* optional */ }
  return { epsgTag, bbox: demNodeBbox(image) };
}

// files: one or more browser Files (GeoTIFFs) — pass several adjacent tiles (e.g. two neighboring
// SRTM tiles) to mosaic them into a single terrain surface. targetEpsg: the project's EPSG (e.g.
// project.epsg) — when given and the source is geographic, the merged grid is reprojected into it so
// it lines up with the rest of the project instead of landing at raw lon/lat coordinates. Returns
// { name, bbox:[xmin,ymin,xmax,ymax], gridW, gridH, elevations, srcWidth, srcHeight, epsgTag,
// reprojectedTo, reprojectNote, tileCount } or throws with a message meant to be shown directly.
// tie (TASKS.csv #2648): a local-grid project tied to a real CRS (lib/localGridTie.js tieOf), targetEpsg null: a DEM with a CRS tag is
// reprojected to the tie's CRS and resampled into the local grid (lib/terrainTie.js); cropTo is in the local grid then. An untagged DEM
// keeps its numbers (taken to be the grid's own).
// mineSource (TASKS.csv #2684): lib/mineGrid.js mineSourceOf(project), used when the Source CRS is "mine" ('Local mine grid (no CRS)'): on a
// CRS project the DEM is read on the mine grid (the crop box taken onto the grid) and its nodes resampled into the project CRS through the
// grid's tie, nearest node (lib/rasterTie.js mineGridToProject); on a project with no CRS its numbers are the project's own.
export async function parseDEMFiles(files, targetEpsg, sourceEpsgOverride = null, { cropTo = null, chooseProjectEpsg = null, gridMax = DEM_MAX_GRID, tie = null, mineSource = null } = {}) { // gridMax: TASKS.csv #796
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) throw new Error(tr("No file selected."));
  const tiles = [];
  const mineSrc = !!mineSource && isMineSource(sourceEpsgOverride); // #2684
  const mineTie = mineSrc && mineSource.kind === "tie" && targetEpsg && mineReaches(mineSource.mg, targetEpsg) ? mineSource.mg : null;
  if (mineSrc) { sourceEpsgOverride = null; tie = null; }
  const tieTo = tie && !targetEpsg ? Number(tie.epsg) : null; // #2648
  const tieCrop = tieTo && cropTo ? tieWorldBox(tie, cropTo) : null;
  // TASKS.csv #422 — cropTo: [xmin, ymin, xmax, ymax] in the PROJECT CRS. Converted into each tile's CRS
  // (corners + edge midpoints, then their bbox, padded 2%) before reading.
  for (const file of list) {
    let crop = null;
    if (cropTo && mineTie) { // #2684 — the crop box (project CRS) taken onto the mine grid, padded 2 %
      const b = mineBoxOf(mineTie, targetEpsg, cropTo);
      if (b) { const padX = (b[2] - b[0]) * 0.02, padY = (b[3] - b[1]) * 0.02; crop = [b[0] - padX, b[1] - padY, b[2] + padX, b[3] + padY]; }
    } else if (cropTo && mineSrc && mineSource.kind !== "tie") crop = cropTo; // a project with no CRS: the grid's own numbers
    else if (cropTo && !mineSrc) {
      const head = await peekDemTile(file);
      const tileEpsg = sourceEpsgOverride ? Number(sourceEpsgOverride) : head.epsgTag;
      const viaTie = !!(tieCrop && tileEpsg && tieReaches(tie, tileEpsg)); // #2648 — the local crop box, in the tie's CRS
      const cropFrom = viaTie ? tieTo : targetEpsg;
      const [x0, y0, x1, y1] = viaTie ? tieCrop : cropTo;
      const probe = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1], [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2]];
      const pts = tileEpsg && cropFrom && Number(tileEpsg) !== Number(cropFrom) ? probe.map(([x, y]) => reprojectXY(x, y, cropFrom, tileEpsg)) : probe.map(([x, y]) => ({ x, y }));
      if (pts.every(Boolean)) {
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const padX = (arrMax(xs) - arrMin(xs)) * 0.02, padY = (arrMax(ys) - arrMin(ys)) * 0.02;
        crop = [arrMin(xs) - padX, arrMin(ys) - padY, arrMax(xs) + padX, arrMax(ys) + padY];
      }
    }
    const t = await readDemTile(file, crop, Math.max(DEM_READ_MAX, Math.ceil(gridMax * 1.6))); // #796: read finer for a finer grid
    if (t) tiles.push(t);
  }
  if (!tiles.length) throw new Error(tr("None of these DEM tiles overlaps the drillhole area — untick 'Crop to the drillholes' to import them whole, or check the source CRS."));

  if (tiles.length > 1) {
    const first = tiles[0].epsgTag;
    const mismatched = tiles.find((t) => String(t.epsgTag) !== String(first));
    if (mismatched) {
      throw new Error(tr("These tiles don't share the same coordinate system tag (\"{name}\": EPSG:{v} vs \"{name2}\": EPSG:{v2}) — only merge tiles from the same source/CRS.", { name: tiles[0].name, v: first ?? "unknown", name2: mismatched.name, v2: mismatched.epsgTag ?? "unknown" }));
    }
  }

  const xmin = arrMin(tiles.map((t) => t.bbox[0]));
  const ymin = arrMin(tiles.map((t) => t.bbox[1]));
  const xmax = arrMax(tiles.map((t) => t.bbox[2]));
  const ymax = arrMax(tiles.map((t) => t.bbox[3]));

  // Grid resolution is capped at DEM_MAX_GRID on the longer world-space side (not source pixel count —
  // SRTM tiles at high latitude aren't square in pixels, e.g. 1801x3601 for a 1°x1° tile, since NASA
  // widens the longitude spacing near the poles, but the bbox itself is still ~1°x1°) regardless of
  // how many tiles are merged, same "keep it renderable" budget parseDEM always used.
  const aspect = (xmax - xmin) / Math.max(1e-12, ymax - ymin);
  const gridW = aspect >= 1 ? gridMax : Math.max(2, Math.round(gridMax * aspect));
  const gridH = aspect >= 1 ? Math.max(2, Math.round(gridMax / aspect)) : gridMax;

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

  // TASKS.csv #419 — a user-set source CRS overrides the file's own tag (untagged or wrongly tagged DEMs).
  const epsgTag = mineSrc ? null : sourceEpsgOverride ? Number(sourceEpsgOverride) : tiles[0].epsgTag; // mineSrc: #2684 — the tag set aside
  if (chooseProjectEpsg && epsgTag && !tieTo) targetEpsg = Number(chooseProjectEpsg(epsgTag, targetEpsg, [xmin, ymin, xmax, ymax])) || targetEpsg; // #607; the box: #2678
  // #2648 — on a tied grid the DEM goes to the tie's CRS first (below), then into the grid
  const viaTie = !!(tieTo && epsgTag && tieReaches(tie, epsgTag));
  let tiedNote = null;
  if (viaTie) targetEpsg = tieTo;
  else if (tieTo && epsgTag) tiedNote = tr("Its EPSG:{src} cannot be brought through the local grid's tie to EPSG:{tie} (GeoStrix has no definition for one of them), so it kept its own numbers: check where it lies.", { src: epsgTag, tie: tieTo });

  let outBbox = [xmin, ymin, xmax, ymax];
  let outGridW = gridW, outGridH = gridH;
  let outElevations = raw;
  let reprojectedTo = null;
  let reprojectNote = null;

  // TASKS.csv #419 — any recognised pair is reprojected, not only geographic sources: a UTM 10 or BC
  // Albers (TRIM) DEM used to get a note and land hundreds of km away in a UTM 9 project.
  if (epsgTag && targetEpsg && Number(epsgTag) !== Number(targetEpsg)) {
    const [fromDef, toDef] = await Promise.all([getProj4Def(epsgTag), getProj4Def(targetEpsg)]);
    if (fromDef && toDef) {
      const r = reprojectGrid({ xmin, ymin, xmax, ymax, gridW, gridH, band: raw }, fromDef, toDef, gridW, gridH);
      outBbox = r.bbox; outGridW = r.gridW; outGridH = r.gridH; outElevations = r.elevations;
      reprojectedTo = Number(targetEpsg);
    } else {
      reprojectNote = `this file's own CRS tag (EPSG:${epsgTag}) doesn't match the project's EPSG:${targetEpsg} — automatic reprojection wasn't available (couldn't resolve a proj4 definition for EPSG:${!fromDef ? epsgTag : targetEpsg}), so no reprojection happened on import. Double-check it lines up with the rest of the project.`;
    }
  }

  let srcCellM = null;
  if (viaTie && !reprojectNote) { // #2648 — the tie's CRS -> the local grid (nearest node)
    srcCellM = Math.sqrt(((outBbox[2] - outBbox[0]) * (outBbox[3] - outBbox[1])) / Math.max(1, tiles.reduce((s, x) => s + x.srcW * x.srcH, 0))) / (tie.scale || 1); // the read window's cell, in grid units
    const clip = cropTo ? (() => { const px = (cropTo[2] - cropTo[0]) * 0.02, py = (cropTo[3] - cropTo[1]) * 0.02; return [cropTo[0] - px, cropTo[1] - py, cropTo[2] + px, cropTo[3] + py]; })() : null; // the crop box asked for
    const g = tieDemGridToLocal({ bbox: outBbox, gridW: outGridW, gridH: outGridH, values: outElevations }, tie, tieTo, gridMax, clip);
    if (!g) throw new Error(tr("None of these DEM tiles overlaps the drillhole area — untick 'Crop to the drillholes' to import them whole, or check the source CRS."));
    outBbox = g.bbox; outGridW = g.gridW; outGridH = g.gridH; outElevations = g.values;
    const label = sourceEpsgOverride ? tr("the Source CRS you set") : tr("this file's own CRS tag");
    tiedNote = Number(epsgTag) === tieTo
      ? tr("Its EPSG:{src} ({label}) was brought into the local grid through the grid's tie, and resampled onto the grid's own north.", { src: epsgTag, label })
      : tr("Its EPSG:{src} ({label}) was reprojected to EPSG:{tie} and brought into the local grid through the grid's tie, and resampled onto the grid's own north.", { src: epsgTag, tie: tieTo, label });
    reprojectedTo = null;
  }

  if (mineSrc) { // #2684
    if (mineTie) {
      const src = { nx: gridW, ny: gridH, x0: xmin, yTop: ymax, dx: (xmax - xmin) / Math.max(1, gridW - 1), dy: (ymax - ymin) / Math.max(1, gridH - 1), values: raw };
      srcCellM = Math.sqrt(((xmax - xmin) * (ymax - ymin)) / Math.max(1, tiles.reduce((s, x) => s + x.srcW * x.srcH, 0))) * (mineTie.tie.scale || 1); // the read window's cell, in project units
      const clip = cropTo ? [cropTo[0] - (cropTo[2] - cropTo[0]) * 0.02, cropTo[1] - (cropTo[3] - cropTo[1]) * 0.02, cropTo[2] + (cropTo[2] - cropTo[0]) * 0.02, cropTo[3] + (cropTo[3] - cropTo[1]) * 0.02] : null;
      const g = mineGridToProject(src, mineTie, targetEpsg, gridMax, clip);
      if (!g || !g.valid) throw new Error(tr("None of these DEM tiles overlaps the drillhole area — untick 'Crop to the drillholes' to import them whole, or check the source CRS."));
      outBbox = [g.x0, g.yTop - g.dy * (g.ny - 1), g.x0 + g.dx * (g.nx - 1), g.yTop]; outGridW = g.nx; outGridH = g.ny; outElevations = g.values;
      tiedNote = mineSourceSentence(mineSource, targetEpsg).trim() + " " + tr("It was resampled onto the project's own north.");
    } else if (mineSource.kind === "tie") tiedNote = tr("It could not be brought through the mine grid's tie to EPSG:{dst} (GeoStrix has no definition for one of the CRSs), so it kept its own numbers: check where it lies.", { dst: targetEpsg || mineSource.mg.tie.epsg });
    else tiedNote = mineSourceSentence(mineSource, targetEpsg).trim();
  }

  // TASKS.csv #421 — no-data cells are still filled (for sampling) but recorded and reported; see demFill.js.
  const fill = fillNoData(outElevations);

  return {
    name: tiles.length > 1 ? `${tiles.length} tiles merged (${tiles[0].name}, …)` : tiles[0].name,
    bbox: outBbox,
    gridW: outGridW, gridH: outGridH,
    elevations: fill.elevations, // plain array — easier to JSON-persist in the project file than a typed array
    noDataMask: fill.noDataMask, noDataNote: noDataNote(fill), // #421
    srcWidth: tiles.reduce((s, t) => s + t.srcW, 0), srcHeight: arrMax(tiles.map((t) => t.srcH)),
    epsgTag, epsgOverridden: !!sourceEpsgOverride, cropped: !!cropTo, readPixels: tiles.reduce((t, x) => t + x.srcW * x.srcH, 0), fullPixels: tiles.reduce((t, x) => t + x.fullW * x.fullH, 0),
    reprojectedTo,
    reprojectNote,
    tiedNote, srcCellM, // #2648
    tileCount: tiles.length,
  };
}

// TASKS.csv #2648 — a fetched picture ({ bbox in srcEpsg, dataUrl }, e.g. lib/imageryFetch.js fetchLatestTrueColour) brought into a tied
// local grid: decoded, resampled through the tie (lib/rasterTie.js tieImageToLocal; outside the picture is transparent), re-encoded.
// -> the same object with the local bbox, dataUrl, gridW / gridH, or null when the tie cannot reach srcEpsg
// TASKS.csv #1860 — a raster's picture (its data URL) decoded to RGBA pixels: { width, height, data: Uint8ClampedArray }
export async function dataUrlPixels(dataUrl, failText = null) {
  const img = await new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(failText || tr("The fetched picture could not be read."))); i.src = dataUrl; });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, c.width, c.height);
  return { width: c.width, height: c.height, data: px.data };
}
export async function tieFetchedImage(r, tie, srcEpsg, maxSide = 4096) {
  if (!tieReaches(tie, srcEpsg)) return null;
  const px = await dataUrlPixels(r.dataUrl);
  const t = tieImageToLocal({ xmin: r.bbox[0], ymin: r.bbox[1], xmax: r.bbox[2], ymax: r.bbox[3], width: px.width, height: px.height, data: px.data }, tie, srcEpsg, maxSide);
  if (!t) return null;
  const o = document.createElement("canvas");
  o.width = t.width; o.height = t.height;
  o.getContext("2d").putImageData(new ImageData(t.data, t.width, t.height), 0, 0);
  return { ...r, bbox: t.bbox, dataUrl: imageDataUrl(o), gridW: t.width, gridH: t.height };
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
  if (gridStart < 0) throw new Error(tr("Not a readable GXF file — no #GRID section found."));

  const num = (key, fallback) => {
    const v = header[key]?.[0] !== undefined ? parseFloat(header[key][0]) : NaN;
    return Number.isFinite(v) ? v : fallback;
  };
  const ncols = num("POINTS", NaN), nrows = num("ROWS", NaN);
  if (!Number.isFinite(ncols) || !Number.isFinite(nrows) || ncols < 2 || nrows < 2) {
    throw new Error(tr("This GXF file is missing #POINTS/#ROWS (grid dimensions) or they're invalid."));
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
    throw new Error(tr("This GXF grid has a #ROTATION of {rotation}° — rotated grids aren't supported yet (the raster drape only handles axis-aligned grids). Re-export it unrotated if your software supports that, or open it in GIS software first to reproject/re-grid to north-up.", { rotation }));
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
        tr("This GXF's #GRID section doesn't look like plain-text numbers (only {v}% digit characters across {gridCharCount} characters read) — it's very likely using a proprietary/compressed Geosoft grid encoding this reader doesn't support, not a truncated file. If your workflow already exported this same grid as a GeoTIFF (.tif), import that instead — it carries the same data and is fully supported. Otherwise, re-export from Oasis montaj as an uncompressed/plain-text .gxf if that option is available.", { v: (digitRatio * 100).toFixed(1), gridCharCount: gridCharCount.toLocaleString() })
      );
    }
    throw new Error(tr("This GXF's #GRID section has fewer values ({filled}) than #POINTS×#ROWS ({total}) declares — the file may be truncated.", { filled, total }));
  }

  // SENSE controls how the flat value list maps onto rows/columns. GXF's most common cases: 1 = each
  // row read west->east, rows ordered south->north (the default almost every export uses); -1 = same
  // row order but each row mirrored east->west. The rarer transpose variants (±2) aren't handled —
  // falls back to SENSE=1 layout with a note in the returned message rather than misinterpreting the
  // data silently, since there's no public real-world sample of those variants to verify against.
  const mirrored = sense === -1;
  const senseNote = (sense !== 1 && sense !== -1) ? ` Note: #SENSE ${sense} (a transpose variant) isn't specifically handled — the grid was read as if SENSE were 1, so double-check its orientation looks right.` : "";

  return rasterFromRows({ name: file.name, values, ncols, nrows, x0, y0, dx, dy, isDummy: (v) => v === dummy || !Number.isFinite(v), mirrored, withGrid: sense === 1 || sense === -1, note: senseNote || null });
}

// TASKS.csv #1347 — Geosoft (Oasis montaj; compressed or not) and Surfer 6 / 7 binary grids (lib/grdFormats.js), as a raster drape
// with its values, like a GXF. A rotated grid is refused as the GXF reader refuses one.
export async function parseGRD(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const g = await decodeGrd(bytes, (u8) => inflateCapped(u8, "deflate", 512 * MB, file.name)); // zlib streams, with a ceiling (#351)
  if (Math.abs(g.rotation || 0) > 0.01) throw new Error(tr("This {kind} grid is rotated by {rotation}° — rotated grids aren't supported yet (the raster drape only handles axis-aligned grids). Re-export it unrotated, or as a GeoTIFF.", { kind: g.kind, rotation: g.rotation }));
  if (!(g.ncols >= 2 && g.nrows >= 2)) throw new Error(tr("This grid has fewer than 2 x 2 nodes."));
  const out = rasterFromRows({ name: file.name, values: g.values, ncols: g.ncols, nrows: g.nrows, x0: g.x0, y0: g.y0, dx: g.dx, dy: g.dy, isDummy: (v) => !Number.isFinite(v) });
  out.note = " " + tr("Read as a {kind} grid ({type}{v}), {nx} × {ny} nodes at {dx} m.", { kind: g.kind, type: g.elementType, v: g.compressed ? tr(", compressed") : "", nx: g.ncols, ny: g.nrows, dx: +g.dx.toPrecision(4) });
  return out;
}

// TASKS.csv #1347 — the drape image, the stretch and the value grid of a grid whose rows run south -> north (each west -> east, or
// east -> west when `mirrored`), shared by the GXF reader and the Geosoft / Surfer .grd reader. -> parseGeoTIFF's shape
// TASKS.csv #2828 (GSC geophysics review, 2026-11-12) — a grid of NODES (GXF, Geosoft / Surfer .grd: x0, y0 is the first node, the last one sits (n - 1)
// cells on) as the PIXEL-AREA extent the drape spans: half a cell beyond the end nodes on every side, so each of the picture's
// ncols x nrows pixels is centred on its node. The node extent used to be handed over as it was, so the picture was drawn one cell
// narrower and lower than the grid and its edges sat half a cell inside (200 m on a 400 m compilation grid): the error #560 removed
// for PixelIsPoint GeoTIFFs. The kept values (makeValueGrid, node-based) were never off.
export function nodeGridAreaBbox(x0, y0, dx, dy, ncols, nrows) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  return [x0 - ax / 2, y0 - ay / 2, x0 + dx * (ncols - 1) + ax / 2, y0 + dy * (nrows - 1) + ay / 2];
}

function rasterFromRows({ name, values, ncols, nrows, x0, y0, dx, dy, isDummy, mirrored = false, withGrid = true, note = null }) {
  const total = ncols * nrows;
  const scale = Math.min(1, MAX_TEXTURE_SIZE / Math.max(ncols, nrows));
  const outW = Math.max(1, Math.round(ncols * scale)), outH = Math.max(1, Math.round(nrows * scale));

  let min = Infinity, max = -Infinity;
  const valid = [];
  for (let i = 0; i < total; i++) { const v = values[i]; if (!isDummy(v)) { if (v < min) min = v; if (v > max) max = v; valid.push(v); } }
  const hasRange = Number.isFinite(min) && Number.isFinite(max) && max > min;
  const gxfStretch = makeStretch(valid, "p2-98"); // #708 — as single-band GeoTIFFs and IDW grids

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
      const isDum = isDummy(v);
      if (isDum) { imgData.data[idx + 3] = 0; continue; }
      const t = hasRange ? gxfStretch.t(v) : 0.5; // #708
      const [cr, cg, cb] = rampColor(t);
      imgData.data[idx] = cr; imgData.data[idx + 1] = cg; imgData.data[idx + 2] = cb; imgData.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const bbox = nodeGridAreaBbox(x0, y0, dx, dy, ncols, nrows);
  // #326 — the values, north row first (GXF SENSE=1 lists rows south->north, each west->east)
  let grid = null;
  if (withGrid) {
    const northFirst = new Float64Array(total);
    for (let r = 0; r < nrows; r++) for (let c = 0; c < ncols; c++) {
      const src = values[r * ncols + (mirrored ? ncols - 1 - c : c)];
      northFirst[(nrows - 1 - r) * ncols + c] = src;
    }
    grid = makeValueGrid(northFirst, ncols, nrows, x0, y0 + dy * (nrows - 1), dx, dy, isDummy);
  }
  return {
    grid, // #326
    name,
    bbox,
    width: ncols,
    height: nrows,
    dataUrl: canvas.toDataURL("image/png"),
    stretch: { mode: gxfStretch.mode, lo: gxfStretch.lo, hi: gxfStretch.hi }, // #708
    bandCount: 1,
    epsgTag: null, // GXF headers don't carry a standard CRS tag the way GeoTIFF's GeoKeys do
    note,
    pixels: { width: outW, height: outH, data: imgData.data }, // TASKS.csv #287 — see parseGeoTIFF's note
  };
}

// TASKS.csv — split the Raster import UI out of the Geophysics module into its own module (user
// request), but a .tif/.gxf dropped directly onto the Geophysics tab should still work exactly like
// before rather than forcing a tab-switch mid-drag. Shared here (parse + build a ready-to-addRaster
// payload + a human-readable import message) so both modules' drop handlers and import buttons call
// the SAME logic instead of two copies quietly drifting apart — each module still owns its own
// busy/error UI state and calls the store's addRaster() itself.
// TASKS.csv #287 (QGIS-specialist review, headline finding) — raster import used to have NO
// reprojection and NO source-CRS override at all: on an EPSG mismatch it appended a warning sentence
// and then imported the raster at its own raw tag coordinates anyway, treated as if it were already
// in project-EPSG space. A .gxf grid (Geosoft Oasis montaj's plain-text export, the normal delivery
// format for airborne mag/IP) carries no CRS tag at all, so there wasn't even a mismatch to warn
// about. Two real failure modes this caused, both measured against real proj4
// transforms: an airborne grid delivered in a neighbouring UTM zone (32610/UTM10N is extremely common
// for BC data against this app's 3156/UTM9N default) landed 368 km away; and a same-zone,
// different-datum source (raw WGS84 GPS orthophoto vs the NAD83(CSRS) project default) landed 2.2 m
// off — close enough to pass visual QC and quietly corrupt anything digitized or measured off it.
//
// Now: `sourceEpsg` is an explicit user override (the "Source CRS (EPSG, optional)" field the vector
// importers have had since #120/#205 — the raster side never got one), falling back to the file's own
// GeoTIFF CRS tag. When that resolves to something different from the project EPSG and both codes are
// ones reproject.js recognizes, the drape is ACTUALLY reprojected (reprojectImageRGBA) instead of
// merely warned about. Every other case still imports as before, but now says explicitly which
// assumption it fell back on rather than only mentioning it on a tag mismatch.
// TASKS.csv #1862 — a geographic CRS whose bounds cannot be longitude / latitude
// TASKS.csv #2127 (review #2013, Woodjam) — a distance in the notices: '409,481 m' on a metric projected CRS, 'world units' only when the CRS
// is not known to be one
export const sizeText = (d, epsg) => (isMetricProjectedEpsg(epsg) ? `${Math.round(d).toLocaleString()} m` : `${Math.round(d).toLocaleString()} world units`);
// TASKS.csv #2129 (review #2013, Woodjam) — a single-band float DEM imported as a raster became a flat value raster offered 'as survey
// points for an inversion', with no word that it is ground. It reads as an elevation model when its name says so (dem, dtm, dsm, srtm,
// elev, elevation, topo, lidar, height) or, with collars and a name that is no survey channel, when its 2-98 % values sit within 100 m of
// the collars' elevations and span 10 m or more.
const DEM_NAME = /(^|[^a-z])(dem|dtm|dsm|srtm|elev|elevation|topo|topography|lidar|height|heights)([^a-z]|$)/i;
const SURVEY_NAME = /(^|[^a-z])(mag|tmi|rtp|nt|grav|bouguer|chg|charg|ip|res|rho|cond|em|k|th|u|eu|eth|dose|rad|susc|cu|au|ag|zn|pb|ppm|ppb|pct)([^a-z0-9]|$)/i;
export function looksLikeDem(name, lo, hi, collarZ = null) {
  const n = String(name || "");
  if (DEM_NAME.test(n)) return true;
  if (SURVEY_NAME.test(n) || !collarZ || !Number.isFinite(lo) || !Number.isFinite(hi) || !(hi > lo)) return false;
  const [zmin, zmax] = collarZ;
  return Number.isFinite(zmin) && Number.isFinite(zmax) && lo >= zmin - 100 && hi <= zmax + 100 && hi - lo >= 10;
}
export const notDegrees = (epsg, bbox) => isGeographicCrs(epsg) && Array.isArray(bbox) && (Math.abs(bbox[0]) > 180.5 || Math.abs(bbox[2]) > 180.5 || Math.abs(bbox[1]) > 90.5 || Math.abs(bbox[3]) > 90.5);
// mineSource (TASKS.csv #2684): lib/mineGrid.js mineSourceOf(project), used when sourceEpsg is "mine" ('Local mine grid (no CRS)'): on a CRS
// project the picture and its values are read on the mine grid and resampled into the project CRS through the grid's tie (the inverse of
// #2587's tie resample, lib/rasterTie.js mineImageToProject); on a project with no CRS the file's numbers are the project's own.
export async function buildRasterImport(file, { epsg, defaultElevation, sourceEpsg, chooseProjectEpsg, bandFn = null, samples = null, name = null, keepDetail = false, worldFile = null, tie = null, collarZ = null, mineSource = null, sideCrs = null } = {}) { // samples: #807; keepDetail: #838; worldFile: #1855; tie: #2587; collarZ: #2129; sideCrs: #2830
  const isGxf = /\.gxf$/i.test(file.name), isGrd = /\.grd$/i.test(file.name); // isGrd: #1347
  const maxSide = keepDetail ? FULL_DETAIL_SIZE : MAX_TEXTURE_SIZE;
  const parsed = isGxf ? await parseGXF(file) : isGrd ? await parseGRD(file) : await parseGeoTIFF(file, { bandFn, samples, maxSide, worldFile }); // bandFn: #783; samples: #807
  if (name) parsed.name = name;
  let bbox = parsed.bbox;
  let dataUrl = parsed.dataUrl;
  let px = parsed.pixels || null; // #1623 - the pixels the drape shows, for the background check

  // An explicit override always wins over the file's own tag — that's the whole point of the field
  // (a wrong/absent embedded tag is exactly why the user is typing one in).
  const mineSrc = !!mineSource && isMineSource(sourceEpsg); // #2684 — read on the mine grid, the file's own tag set aside
  const overrideEpsg = sourceEpsg === "" || sourceEpsg == null || mineSrc ? null : Number(sourceEpsg);
  // TASKS.csv #2830 — a Geosoft grid's CRS from the .xml selected with it ({ epsg, from }), when the file has no tag of its own
  const sideUsed = !mineSrc && !parsed.epsgTag && !!sideCrs?.epsg;
  const tagEpsg = parsed.epsgTag && !mineSrc ? Number(parsed.epsgTag) : sideUsed ? Number(sideCrs.epsg) : null;
  const srcEpsg = Number.isFinite(overrideEpsg) ? overrideEpsg : tagEpsg;
  let projEpsg = epsg == null || epsg === "" ? null : Number(epsg);
  if (chooseProjectEpsg && srcEpsg) projEpsg = Number(chooseProjectEpsg(srcEpsg, projEpsg, parsed.bbox)) || projEpsg; // #607 — an empty project may take this CRS; the box: #2678
  const srcLabel = Number.isFinite(overrideEpsg) ? "the Source CRS you set" : sideUsed ? `the CRS in "${sideCrs.from}"` : "this file's own CRS tag"; // sideUsed: #2830
  const srcLabelTr = Number.isFinite(overrideEpsg) ? tr("the Source CRS you set") : sideUsed ? tr("the CRS in \"{file}\"", { file: sideCrs.from }) : tr("this file's own CRS tag");
  const SrcLabelTr = Number.isFinite(overrideEpsg) ? tr("The Source CRS you set") : sideUsed ? tr("The CRS in \"{file}\"", { file: sideCrs.from }) : tr("This file's own CRS tag");

  let crsNote = "", tiedGrid = null;
  const sideNote = sideUsed ? " " + tr("CRS EPSG:{epsg} from \"{file}\".", { epsg: sideCrs.epsg, file: sideCrs.from }) : ""; // #2830
  // TASKS.csv #2587 / #2322 — a local-grid project tied to a real CRS: a file with a CRS comes INTO the grid through the tie
  const tied = tie && srcEpsg && !projEpsg && parsed.pixels && tieReaches(tie, srcEpsg) ? tieImageToLocal({ xmin: parsed.bbox[0], ymin: parsed.bbox[1], xmax: parsed.bbox[2], ymax: parsed.bbox[3], ...parsed.pixels }, tie, srcEpsg, maxSide) : null;
  const mined = mineSrc && mineSource.kind === "tie" && projEpsg && parsed.pixels && mineReaches(mineSource.mg, projEpsg) ? mineImageToProject({ xmin: parsed.bbox[0], ymin: parsed.bbox[1], xmax: parsed.bbox[2], ymax: parsed.bbox[3], ...parsed.pixels }, mineSource.mg, projEpsg, maxSide) : null; // #2684
  if (mineSrc) {
    if (mined) {
      const canvas = document.createElement("canvas");
      canvas.width = mined.width; canvas.height = mined.height;
      canvas.getContext("2d").putImageData(new ImageData(mined.data, mined.width, mined.height), 0, 0);
      bbox = mined.bbox; px = mined;
      dataUrl = keepDetail ? imageDataUrl(canvas) : canvas.toDataURL("image/png");
      if (parsed.grid) tiedGrid = mineGridToProject(parsed.grid, mineSource.mg, projEpsg, GRID_MAX);
      crsNote = mineSourceSentence(mineSource, projEpsg) + " " + tr("It was resampled onto the project's own north.");
    } else if (mineSource.kind === "tie") {
      crsNote = " " + tr("It could not be brought through the mine grid's tie to EPSG:{dst} (GeoStrix has no definition for one of the CRSs), so it kept its own numbers: check where it lies.", { dst: projEpsg || mineSource.mg.tie.epsg });
    } else crsNote = mineSourceSentence(mineSource, projEpsg);
  } else if (tied) {
    const canvas = document.createElement("canvas");
    canvas.width = tied.width; canvas.height = tied.height;
    canvas.getContext("2d").putImageData(new ImageData(tied.data, tied.width, tied.height), 0, 0);
    bbox = tied.bbox; px = tied;
    dataUrl = keepDetail ? imageDataUrl(canvas) : canvas.toDataURL("image/png");
    if (parsed.grid) tiedGrid = tieGridToLocal(parsed.grid, tie, srcEpsg, GRID_MAX);
    crsNote = " " + (Number(srcEpsg) === Number(tie.epsg)
      ? tr("Its EPSG:{src} ({label}) was brought into the local grid through the grid's tie, and resampled onto the grid's own north.", { src: srcEpsg, label: srcLabelTr })
      : tr("Its EPSG:{src} ({label}) was reprojected to EPSG:{tie} and brought into the local grid through the grid's tie, and resampled onto the grid's own north.", { src: srcEpsg, tie: tie.epsg, label: srcLabelTr }));
  } else if (tie && srcEpsg && !projEpsg) {
    crsNote = " " + tr("Its EPSG:{src} cannot be brought through the local grid's tie to EPSG:{tie} (GeoStrix has no definition for one of them), so it kept its own numbers: check where it lies.", { src: srcEpsg, tie: tie.epsg });
  } else if (srcEpsg && projEpsg && srcEpsg !== projEpsg && notDegrees(srcEpsg, parsed.bbox)) {
    // TASKS.csv #1862 (review #1646, Kodiak) — a file tagged WGS 84 degrees whose bounds run lon -180..1900, lat -2290..90 was
    // 'reprojected' into a raster 15,500 x 38,600 km wide, unsaid: degrees outside +-180 / +-90 are not degrees
    crsNote = " " + tr("{label} says EPSG:{src}, longitude / latitude, but its bounds ({x0} to {x1}, {y0} to {y1}) are not degrees: it was NOT reprojected and kept its own numbers. Set the Source CRS to the CRS it is really in and import it again.", { label: SrcLabelTr, src: srcEpsg, x0: Math.round(parsed.bbox[0]).toLocaleString(), x1: Math.round(parsed.bbox[2]).toLocaleString(), y0: Math.round(parsed.bbox[1]).toLocaleString(), y1: Math.round(parsed.bbox[3]).toLocaleString() });
  } else if (srcEpsg && projEpsg && srcEpsg !== projEpsg) {
    const fromDef = getProj4DefSync(srcEpsg), toDef = getProj4DefSync(projEpsg);
    if (fromDef && toDef && parsed.pixels) {
      const [xmin, ymin, xmax, ymax] = parsed.bbox;
      const { width, height, data } = parsed.pixels;
      const rp = reprojectImageRGBA({ xmin, ymin, xmax, ymax, width, height, data }, fromDef, toDef, width, height);
      const canvas = document.createElement("canvas");
      canvas.width = rp.width; canvas.height = rp.height;
      const ctx = canvas.getContext("2d");
      ctx.putImageData(new ImageData(rp.data, rp.width, rp.height), 0, 0);
      bbox = rp.bbox; px = rp;
      dataUrl = keepDetail ? imageDataUrl(canvas) : canvas.toDataURL("image/png");
      crsNote = ` Reprojected from EPSG:${srcEpsg} (${srcLabel}) into the project's EPSG:${projEpsg} on import — the drape's footprint moved ${sizeText(Math.hypot(rp.bbox[0] - xmin, rp.bbox[1] - ymin), projEpsg)} as a result.`;
    } else {
      crsNote = ` Warning: ${srcLabel} says EPSG:${srcEpsg}, which doesn't match the project's EPSG:${projEpsg}, but ${!parsed.pixels ? "this raster's pixels couldn't be re-sampled" : `EPSG:${!fromDef ? srcEpsg : projEpsg} isn't one GeoStrix can reproject`} — it was imported at its own raw coordinates, so it will NOT line up with your drillholes.`;
    }
  } else if (srcEpsg && projEpsg) {
    crsNote = ` ${srcLabel[0].toUpperCase()}${srcLabel.slice(1)} matches the project's EPSG:${projEpsg} — no reprojection needed.`;
  } else if (srcEpsg && !projEpsg) {
    // A source CRS is known but there's nothing to check it against. Previously this produced no note
    // at all, which is the same silence #287 is about — say which assumption is being made.
    crsNote = ` ${srcLabel[0].toUpperCase()}${srcLabel.slice(1)} says EPSG:${srcEpsg}, but this project has no EPSG set, so nothing could be cross-checked or reprojected — the raster is assumed to already be in the project's EPSG. Set the project CRS and import it again if it doesn't line up.`;
  } else if (!srcEpsg) {
    crsNote = isGxf
      ? " No CRS was given and GXF headers carry no CRS tag, so the grid's own coordinates are assumed to already be in the project's EPSG — if they're not, set \"Source CRS\" and import it again."
      : " This file has no readable CRS tag and no Source CRS was set, so its own coordinates are assumed to already be in the project's EPSG — if they're not, set \"Source CRS\" and import it again.";
  }

  // #326 — keep the values only when the grid sits where the file says (no reprojection): reprojecting a
  // DATA grid needs a proper re-gridding step, which the colour drape above does not do for values.
  let grid = null, gridNote = "";
  if (parsed.grid) {
    if (bbox === parsed.bbox) {
      const g = parsed.grid;
      let n = 0; for (let i = 0; i < g.values.length; i++) if (Number.isFinite(g.values[i])) n++;
      grid = { nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, values: f32ToB64(g.values), valid: n, averagedBy: g.averagedBy, sourceSize: g.sourceSize,
        ...(g.maxValues && g.averagedBy > 1 ? { maxValues: f32ToB64(g.maxValues), minValues: f32ToB64(g.minValues), sourceRange: g.sourceRange } : {}) }; // #2831 — each block's extremes and the source range
      gridNote = ` Values kept for analysis (${g.nx}×${g.ny} nodes at ${gridCellText(g)}${g.averagedBy > 1 ? `, block-averaged ${g.averagedBy}×${g.averagedBy} from ${g.sourceSize[0]}×${g.sourceSize[1]}` : ""}) — the raster's menu can turn them into survey points for an inversion.`;
    } else if (tiedGrid && tiedGrid.valid) { // #2587 — the values resampled with the picture (nearest node: the readings themselves)
      const g = tiedGrid;
      grid = { nx: g.nx, ny: g.ny, x0: g.x0, yTop: g.yTop, dx: g.dx, dy: g.dy, values: f32ToB64(g.values), valid: g.valid, averagedBy: parsed.grid.averagedBy || 1, sourceSize: parsed.grid.sourceSize };
      gridNote = " " + tr("Values kept for analysis ({nx}×{ny} nodes at {cell}, each the nearest reading of the file's grid).", { nx: g.nx, ny: g.ny, cell: gridCellText(g) });
    } else gridNote = " The grid's values were NOT kept (it was reprojected, and values need re-gridding, not a picture resample) — re-grid it in the project CRS elsewhere to use it as data.";
  }

  const [bx0, by0, bx1, by1] = bbox;
  let msg = isMetricProjectedEpsg(projEpsg) // #2127 — metres on a metric project ('960×960 world units' beside 'RMSE 57.44 m')
    ? tr("Imported \"{name}\" ({width}×{height}px, {v} × {v2} m).", { name: parsed.name, width: parsed.width, height: parsed.height, v: Math.round(bx1 - bx0).toLocaleString(), v2: Math.round(by1 - by0).toLocaleString() })
    : tr("Imported \"{name}\" ({width}×{height}px, {v}×{v2} world units).", { name: parsed.name, width: parsed.width, height: parsed.height, v: (bx1 - bx0).toFixed(0), v2: (by1 - by0).toFixed(0) });
  msg += sideNote + crsNote; // sideNote: #2830
  if (parsed.placedBy) msg += tr(" Placed by its world file \"{w}\".", { w: parsed.placedBy }); // #1855
  if (parsed.worldUnused) msg += parsed.worldUnused.offM > 0.01 ? tr(" The world file \"{w}\" was not used: the TIFF's own georeferencing placed it ({m} m from where the world file would).", { w: parsed.worldUnused.name, m: Math.round(parsed.worldUnused.offM * 10) / 10 }) : tr(" The world file \"{w}\" agrees with the TIFF's own georeferencing, which was used.", { w: parsed.worldUnused.name }); // #2857
  if (parsed.note) msg += parsed.note;
  msg += gridNote;
  // #1236 — what the import above drew: 2-98 % of the values, viridis
  let colour = {};
  // TASKS.csv #2858 (review GSC geophysics) — the bar gives the stretch the picture was drawn with: the importer's own (over all the file's
  // values) where it kept one, not the 2-98 % of the block-averaged grid (-224.8 / 227.2 under a picture drawn over -225.7 / 232.8)
  if (grid && parsed.grid) { const own = parsed.stretch && Number.isFinite(parsed.stretch.lo) && Number.isFinite(parsed.stretch.hi) && parsed.stretch.hi > parsed.stretch.lo ? parsed.stretch : null; const st = own || makeStretch(parsed.grid.values, "p2-98"); if (st.lo != null) colour = { colourRange: [st.lo, st.hi], colourStops: rasterStops(DEFAULT_RASTER_STYLE, st.lo, st.hi) }; }
  if (grid && colour.colourRange && looksLikeDem(parsed.name, colour.colourRange[0], colour.colourRange[1], collarZ)) msg += " " + tr("It looks like an elevation model ({lo} to {hi}): to use it as the ground (draping, collar checks, sections), import it under Maps > Terrain > Import SRTM/DEM instead.", { lo: Math.round(colour.colourRange[0]).toLocaleString(), hi: Math.round(colour.colourRange[1]).toLocaleString() }); // #2129
  // TASKS.csv #1623 - a colour picture whose border is uniformly white or black: that colour is its background, shown transparent
  let key = {};
  if (!parsed.grid && px?.data && px.width && px.height) {
    const kc = borderKeyColour(px.data, px.width, px.height);
    if (kc) {
      key = { keyColour: kc };
      const pct = Math.round(colourFraction(px.data, hexRgb(kc)) * 100);
      msg += " " + (kc === "#ffffff" ? tr("{p} % of the picture is white background, shown transparent (the raster card can turn this off).", { p: pct }) : tr("{p} % of the picture is black background, shown transparent (the raster card can turn this off).", { p: pct }));
    }
  }
  return { raster: { name: parsed.name, bbox, dataUrl, elevation: defaultElevation, ...(grid ? { grid } : {}), ...colour, ...key }, msg: msg + (isGxf ? "" : reducedImportNote(parsed.width, parsed.height, keepDetail)) };
}

// TASKS.csv #203 — "We need options to export the generated SRTM, at least to geotiff." Once a
// project's one terrain surface (store.jsx's `terrain`: {bbox, gridW, gridH, elevations}, built by
// parseDEMFiles above — real per-vertex heights, not a flat colour drape) has been fetched/merged,
// there was previously no way to get that processed elevation data back out for another tool (Surfer,
// ArcGIS/QGIS) or for archiving what was actually used. Uses the `geotiff` package's own
// writeArrayBuffer (already a project dependency for READING GeoTIFFs above) rather than hand-rolling
// a binary writer — it accepts a flat TypedArray + a small metadata object and produces a real,
// spec-compliant single-band file, auto-inferring BitsPerSample/SampleFormat from the array's own
// type (Float32Array here -> 32-bit IEEE float, correctly, with no need to set those by hand).
// TASKS.csv #420 — the terrain grid is NODES: value k sits at xmin + k*(xmax-xmin)/(gridW-1), which is
// how the mesh, bilinearSample and reprojectGrid all read it. The export wrote pixel size W/gridW with
// the tiepoint on the bbox corner as PixelIsArea, i.e. pixel CENTRES at xmin + (k+0.5)*W/gridW — off by
// up to half a cell (about 156 m at the edge of a merged 1-degree tile in QGIS). Now: pixel size
// W/(gridW-1) and the tiepoint half a pixel outside the first node, so each pixel's centre is its node.
// demNodeBbox is the inverse on import (it was treating a GeoTIFF's pixel-area bounds as node positions,
// the same half-cell error the other way), so an export re-imports to exactly the same nodes.
// TASKS.csv #560 — geotiff.js 3 keeps TIFF tags behind fileDirectory.getValue(name); older code read fd[name] directly
// (always undefined there). One reader for both.
export function tiffTag(image, name) {
  const fd = image?.fileDirectory || {};
  try { if (typeof fd.getValue === "function") { const v = fd.getValue(name); if (v !== undefined) return v; } } catch { /* tag absent */ }
  return fd[name];
}
// TASKS.csv #560 — a rotated or sheared GeoTIFF (a ModelTransformation with rotation terms: a scan georeferenced with a
// rotation, a mine-grid export) has no north-up pixel grid: getBoundingBox returns the axis-aligned box of its rotated
// corners and every raster path would stretch the image into it without a word. Refused, with what to do instead.
export function assertNorthUp(image, label = "This GeoTIFF") {
  const t = tiffTag(image, "ModelTransformation");
  if (!t || t.length < 8) return;
  const size = Math.max(Math.abs(t[0]), Math.abs(t[5]), 1e-12);
  if (Math.abs(t[1]) > 1e-9 * size || Math.abs(t[4]) > 1e-9 * size) {
    throw Object.assign(new Error(tr("{label} is rotated or sheared (its ModelTransformation has rotation terms). GeoStrix places north-up rasters only, and this one would be stretched into the wrong place. Warp it north-up first — QGIS: Raster > Projections > Warp (Reproject), or gdalwarp.", { label })), { code: "rotated" }); // #786 — callers match the code: the message is translated
  }
}
// TASKS.csv #560 — the raster's PIXEL-AREA extent (what an image drape spans). geotiff.js's getBoundingBox treats the
// tie point as the corner of the first pixel, which is right for PixelIsArea (the default) but, for PixelIsPoint
// (common for gridded geophysics and some DEM exports), the tie point is the CENTRE of the first pixel: the whole
// grid then sat half a cell off (12.5 m on a 25 m mag grid).
// TASKS.csv #2828 (GSC geophysics review, 2026-11-12) — a ModelTiepoint is (I, J, K, X, Y, Z): raster position (I, J) lies at world (X, Y). geotiff.js
// 3.0.5 getOrigin / getBoundingBox read X, Y and take I, J as 0, 0, which is what most writers use. Geosoft's map export ties raster
// (0.5, 0.5) instead (the Geological Survey of Canada's Flin Flon GeoTIFFs: 375 m pixels), so the picture sat 187.5 m east and 187.5 m
// south of where QGIS / GDAL put it, and a file tied at its lower-left corner (J = height) would sit a whole image too low. The box
// is moved back by (I, J) pixels here; a file with a ModelTransformation, or with several tie points, is left to geotiff.js.
export function tiffBoundingBox(image) {
  const box = image.getBoundingBox();
  const tp = tiffTag(image, "ModelTiepoint");
  if (!tp || tp.length !== 6 || tiffTag(image, "ModelTransformation")) return box;
  const i = Number(tp[0]), j = Number(tp[1]);
  if (!Number.isFinite(i) || !Number.isFinite(j) || (i === 0 && j === 0)) return box;
  const [rx, ry] = image.getResolution();
  const sx = -i * Math.abs(rx), sy = j * Math.abs(ry); // north-up: x grows with I, y falls with J
  return [box[0] + sx, box[1] + sy, box[2] + sx, box[3] + sy];
}
export function rasterAreaBbox(image) {
  const [b0, b1, b2, b3] = tiffBoundingBox(image);
  if (image.getGeoKeys?.()?.GTRasterTypeGeoKey !== 2) return [b0, b1, b2, b3];
  const [rx, ry] = image.getResolution();
  const ax = Math.abs(rx), ay = Math.abs(ry);
  return [b0 - ax / 2, b1 + ay / 2, b2 - ax / 2, b3 + ay / 2];
}
export function demNodeBbox(image) {
  assertNorthUp(image); // #560
  const [b0, b1, b2, b3] = tiffBoundingBox(image);
  const [rx, ry] = image.getResolution();
  const ax = Math.abs(rx), ay = Math.abs(ry);
  if (image.getGeoKeys?.()?.GTRasterTypeGeoKey === 2) return [b0, b1 + ay, b2 - ax, b3]; // PixelIsPoint: the origin IS the first node
  return [b0 + ax / 2, b1 + ay / 2, b2 - ax / 2, b3 - ay / 2]; // PixelIsArea (the default): nodes are pixel centres
}
export function terrainToGeoTIFFArrayBuffer(terrain, projectEpsg) {
  const { bbox, gridW, gridH, elevations } = terrain;
  const [xmin, ymin, , ymax] = bbox;
  const pixelW = (bbox[2] - bbox[0]) / Math.max(1, gridW - 1);
  const pixelH = (ymax - ymin) / Math.max(1, gridH - 1); // positive — elevations is row-major with row 0 = north/ymax edge, the same top-down convention GeoTIFF's own ModelTiepoint anchor expects
  // A no-data sentinel is safer than a raw NaN here: NaN IS representable in an IEEE float32 band, but
  // not every GIS tool's no-data handling treats a NaN pixel consistently — GDAL_NODATA is the widely-
  // recognized tag (GDAL, QGIS, ArcGIS) for "this pixel has no data", so gaps in the merged terrain
  // (tile edges, missing coverage) round-trip as an explicit, tool-recognized no-data value instead.
  const NODATA = -9999;
  // TASKS.csv #1020 (review #1016) — a filled node (demFill.js #421: a DEM void, or everything outside a TIN built from
  // points / contours) holds the MEAN elevation; the app treats it as "no ground" (#927) but this wrote it as a real
  // elevation, so QGIS / an inversion code read an invented plateau. Masked nodes are now NODATA too.
  const m = terrain.noDataMask;
  let bits = null;
  if (m instanceof Uint8Array) bits = m;
  else if (m) bits = b64ToBytes(String(m)); // base64.js: #1114
  let masked = 0;
  const values = Float32Array.from(elevations, (v, i) => {
    if (bits && (bits[i >> 3] & (1 << (i & 7)))) { masked++; return NODATA; }
    return Number.isFinite(v) ? v : NODATA;
  });
  const metadata = {
    width: gridW, height: gridH,
    ModelPixelScale: [pixelW, pixelH, 0],
    ModelTiepoint: [0, 0, 0, xmin - pixelW / 2, ymax + pixelH / 2, 0], // #420: pixel (0,0)'s outer corner, so its centre is the first node
    GTModelTypeGeoKey: 1, // 1 = projected (every EPSG this app supports — reproject.js's own table — is a projected CRS, never bare geographic)
    GTRasterTypeGeoKey: 1, // 1 = PixelIsArea, the conventional default
    ProjectedCSTypeGeoKey: Number(projectEpsg),
    GDAL_NODATA: String(NODATA),
  };
  const buf = writeGeoTiff(values, metadata);
  terrainToGeoTIFFArrayBuffer.lastMasked = masked; // #1020 — for the export notice
  return buf;
}

// (exports go to saveFile as bytes since TASKS.csv #1040: the chunked base64 encoder that was here is gone)

// TASKS.csv #326 — a raster's kept values as survey points ({x, y, value, _src}) for the SimPEG panel.
// Every `stride`-th node each way; stride chosen so the count stays within the sidecar's station cap.
// No z: the points are grid NODES, not flight positions — the inversion drapes them at a stated sensor
// height above the terrain (and they are not drawn in 3D without an elevation, #365).
export function gridToSurveyRows(raster, maxPoints = 20000) {
  const g = raster.grid;
  if (!g) return { rows: [], stride: 0 };
  const vals = b64ToF32(g.values);
  const stride = Math.max(1, Math.ceil(Math.sqrt((g.valid || g.nx * g.ny) / maxPoints)));
  const rows = [];
  for (let j = 0; j < g.ny; j += stride) for (let i = 0; i < g.nx; i += stride) {
    const v = vals[j * g.nx + i];
    if (Number.isFinite(v)) rows.push({ x: +(g.x0 + i * g.dx).toFixed(3), y: +(g.yTop - j * g.dy).toFixed(3), value: v, _src: `${raster.name} (grid)` });
  }
  return { rows, stride, spacing: [g.dx * stride, g.dy * stride] };
}

// TASKS.csv #373 — a filtered grid (values north-first, NaN = no data) as a new raster: a drape image
// coloured between the 2nd and 98th percentiles (derivatives have long tails that would otherwise wash
// the ramp out) plus the grid itself, so it can be filtered again or used as survey points.
// averagedBy / sourceSize (#1095): carried from the grid a filter read, so a filtered raster still says it was averaged
export function rasterFromGrid(p) {
  const pic = gridPicture(p.values, p.nx, p.ny); // #3033 — shared with the filter worker (gridFilterClient rasterFromGridAsync)
  if (!pic.valid) throw new Error(tr("The filter produced no values."));
  const canvas = document.createElement("canvas");
  canvas.width = p.nx; canvas.height = p.ny;
  canvas.getContext("2d").putImageData(new ImageData(pic.rgba, p.nx, p.ny), 0, 0);
  return rasterRecord(p, pic, canvas.toDataURL("image/png"));
}
// the raster record from a grid's picture (gridPicture's lo / hi / valid / valuesB64) and its PNG data URL
export function rasterRecord({ name, nx, ny, x0, yTop, dx, dy, elevation, extra = {}, averagedBy = 1, sourceSize = null }, pic, dataUrl) {
  const { lo, hi } = pic;
  const bbox = [x0 - dx / 2, yTop - dy * (ny - 1) - dy / 2, x0 + dx * (nx - 1) + dx / 2, yTop + dy / 2];
  return {
    name, bbox, dataUrl, elevation,
    grid: { nx, ny, x0, yTop, dx, dy, values: pic.valuesB64, valid: pic.valid, averagedBy, sourceSize: sourceSize || [nx, ny] },
    colourRange: [lo, hi], colourStops: rasterStops(DEFAULT_RASTER_STYLE, lo, hi), ...extra,
  };
}

// TASKS.csv #375 — radiometric ternary image: K -> red, eTh -> green, eU -> blue, each linearly stretched
// between its own 2nd and 98th percentile (the standard presentation; white = high in all three, dark = low
// in all three). Built on the K grid's nodes; eTh / eU are sampled at the nearest node of their own grids,
// so the three need not share a grid, only overlap. A node missing any of the three is transparent.
export function ternaryValues(kG, thG, uG) {
  const sample = (g, vals, x, y) => {
    const fi = (x - g.x0) / g.dx, fj = (g.yTop - y) / g.dy; // inside the grid's cell footprint = up to half a cell past the end nodes
    if (fi < -0.5 || fj < -0.5 || fi > g.nx - 0.5 || fj > g.ny - 0.5) return NaN;
    return vals[Math.min(g.ny - 1, Math.max(0, Math.round(fj))) * g.nx + Math.min(g.nx - 1, Math.max(0, Math.round(fi)))];
  };
  const kv = b64ToF32(kG.values), tv = b64ToF32(thG.values), uv = b64ToF32(uG.values);
  const n = kG.nx * kG.ny, ch = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  for (let j = 0; j < kG.ny; j++) for (let i = 0; i < kG.nx; i++) {
    const k = j * kG.nx + i, x = kG.x0 + i * kG.dx, y = kG.yTop - j * kG.dy;
    ch[0][k] = kv[k]; ch[1][k] = sample(thG, tv, x, y); ch[2][k] = sample(uG, uv, x, y);
  }
  const stretch = (a) => {
    const f = Array.from(a).filter(Number.isFinite).sort((p, q) => p - q);
    if (!f.length) return null;
    const lo = percentileSorted(f, 0.02), hi = percentileSorted(f, 0.98); // #740
    return { lo, hi, t: (v) => (hi > lo ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0.5) };
  };
  const s = ch.map(stretch);
  if (s.some((x) => !x)) throw new Error(tr("One of the three grids has no values where the K grid is."));
  const rgba = new Uint8ClampedArray(n * 4);
  let covered = 0;
  for (let k = 0; k < n; k++) {
    if (!ch.every((c) => Number.isFinite(c[k]))) continue;
    covered++;
    for (let c = 0; c < 3; c++) rgba[k * 4 + c] = Math.round(255 * s[c].t(ch[c][k]));
    rgba[k * 4 + 3] = 255;
  }
  return { rgba, covered, ranges: s.map((x) => [x.lo, x.hi]) };
}
export function ternaryRaster({ kRaster, thRaster, uRaster, elevation }) {
  const g = kRaster.grid;
  const { rgba, covered, ranges } = ternaryValues(g, thRaster.grid, uRaster.grid);
  if (!covered) throw new Error(tr("The three grids do not overlap."));
  const canvas = document.createElement("canvas");
  canvas.width = g.nx; canvas.height = g.ny;
  canvas.getContext("2d").putImageData(new ImageData(rgba, g.nx, g.ny), 0, 0);
  const bbox = [g.x0 - g.dx / 2, g.yTop - g.dy * (g.ny - 1) - g.dy / 2, g.x0 + g.dx * (g.nx - 1) + g.dx / 2, g.yTop + g.dy / 2];
  return { raster: { name: `Ternary K-eTh-eU (${kRaster.name} / ${thRaster.name} / ${uRaster.name})`, bbox, dataUrl: canvas.toDataURL("image/png"), elevation,
    ternary: { red: kRaster.name, green: thRaster.name, blue: uRaster.name, stretch: "linear, 2nd-98th percentile per channel", ranges } }, covered, ranges };
}
