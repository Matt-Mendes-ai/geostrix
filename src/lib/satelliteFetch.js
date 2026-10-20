// Satellite imagery auto-fetch — TASKS.csv #204, user request (verbatim): "Any freely available sat
// image we can import from the raster module? If so, we should also have an option to match the SRTM
// boundary." Same "no manual download, no account" reasoning as srtmFetch.js's elevation auto-fetch,
// just producing an RGB raster drape instead of an elevation surface.
//
// Data source: EOX's "Sentinel-2 cloudless" WMTS mosaic (maps.eox.at) — already wired up as this app's
// selectable "Satellite" basemap layer (see baseLayers.js's header comment for how that source was
// picked: no API key, no account, CC BY 4.0, verified live via its own WMTS GetCapabilities). This
// reuses that exact same tile URL (getBaseLayer("satellite").tileUrl) rather than hard-coding a second
// copy of it, so the two stay in sync if the mosaic year/endpoint ever changes. Its tile response
// headers were checked directly (`curl -I` against a live tile) and confirmed `access-control-allow-
// origin: *` — a plain browser `fetch()` can read the pixel bytes back out via canvas without hitting
// a CORS wall, so unlike srtmFetch.js's tile fetch this needs no Electron main-process proxy: works
// identically in Electron and in a plain-browser dev/vite session.
import { getBaseLayer } from "./baseLayers.js";
import { getProj4Def, reprojectGrid } from "./reproject.js";

const TILE = 256;
const MIN_ZOOM = 2;
const MAX_ZOOM = 14; // the s2cloudless mosaic's own practical max useful zoom — beyond this it's just the same pixels upsampled, per EOX's own docs
const NATIVE_M = 10; // Sentinel-2's own ground pixel: no zoom level shows detail finer than this
const KB_PER_TILE = 20; // typical s2cloudless JPG tile (~15-25 KB), for the size estimate shown before fetching
const PARALLEL = 6; // tiles downloaded at once (was one after another)

// TASKS.csv #781 — resolution levels. maxTiles bounds the download (and picks the zoom: the finest level whose
// tiles over the area fit); gridMax is the longest side of the image kept. The first version kept a 512 px image
// from up to 64 tiles (up to 2,048 px of source), throwing most of the download away: Standard now keeps 1,024 px.
// Very high stops at 625 tiles (a 6,400 px mosaic, ~165 MB) / 3,072 px so the whole fetch stays under ~0.5 GB of
// memory on a modest machine; at 400 tiles it used the same zoom as High over a 60 km area.
export const SAT_LEVELS = {
  standard: { label: "Standard", maxTiles: 64, gridMax: 1024 },
  high: { label: "High", maxTiles: 196, gridMax: 2048 },
  veryhigh: { label: "Very high", maxTiles: 625, gridMax: 3072 },
};

function lonLatToTileXY(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}
function tileXYToLonLat(x, y, zoom) {
  const n = 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: (latRad * 180) / Math.PI };
}
function pickZoom(lonMin, latMin, lonMax, latMax, maxTiles) {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const nw = lonLatToTileXY(lonMin, latMax, z);
    const se = lonLatToTileXY(lonMax, latMin, z);
    const count = (se.x - nw.x + 1) * (se.y - nw.y + 1);
    if (count <= maxTiles) return z;
  }
  return MIN_ZOOM;
}

// TASKS.csv #781 — what a level would fetch for an area, before fetching: zoom, tiles, estimated download, the
// image kept and its ground pixel. `nativeLimited` = the zoom is the imagery's finest, so a higher level adds nothing.
export function planSatelliteFetch([lonMin, latMin, lonMax, latMax], level = "standard") {
  const L = SAT_LEVELS[level] || SAT_LEVELS.standard;
  const zoom = pickZoom(lonMin, latMin, lonMax, latMax, L.maxTiles);
  const nw = lonLatToTileXY(lonMin, latMax, zoom), se = lonLatToTileXY(lonMax, latMin, zoom);
  const tilesX = se.x - nw.x + 1, tilesY = se.y - nw.y + 1;
  const latMid = ((latMin + latMax) / 2) * (Math.PI / 180);
  const sourceM = (40075016.686 * Math.cos(latMid)) / (TILE * 2 ** zoom); // ground size of one tile pixel
  const widthM = (lonMax - lonMin) * 111320 * Math.cos(latMid), heightM = (latMax - latMin) * 110574;
  const aspect = widthM / Math.max(1e-9, heightM); // in metres: square pixels on the ground (in degrees they came out 20 x 36 m)
  // the image kept: no larger than gridMax, and no finer than the source pixels covering the area
  const srcW = Math.max(2, Math.round(widthM / sourceM)), srcH = Math.max(2, Math.round(heightM / sourceM));
  const longest = Math.min(L.gridMax, Math.max(srcW, srcH));
  const gridW = aspect >= 1 ? longest : Math.max(2, Math.round(longest * aspect));
  const gridH = aspect >= 1 ? Math.max(2, Math.round(longest / aspect)) : longest;
  return {
    level, zoom, tilesX, tilesY, tiles: tilesX * tilesY, downloadMB: (tilesX * tilesY * KB_PER_TILE) / 1024,
    gridW, gridH, sourceM, pixelM: Math.max(widthM / gridW, heightM / gridH, NATIVE_M), nativeM: NATIVE_M,
    nativeLimited: zoom === MAX_ZOOM,
  };
}

async function fetchTileBitmap(z, x, y) {
  const url = getBaseLayer("satellite").tileUrl(z, x, y);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tile fetch failed (HTTP ${res.status}) for z${z}/${x}/${y}.`);
  const blob = await res.blob();
  return createImageBitmap(blob);
}

// TASKS.csv #781 — the mosaic as ONE byte array, each tile decoded through a single 256 px canvas and copied in:
// no canvas the size of the whole mosaic (a 20 x 20 tile mosaic is 5,120 px square; a canvas plus its getImageData
// copy would be ~210 MB; 25 x 25 tiles ~330 MB) and no browser canvas-size limit.
async function buildMosaic(zoom, nw, tilesX, tilesY, onProgress) {
  const mw = tilesX * TILE, mh = tilesY * TILE;
  const rgba = new Uint8ClampedArray(mw * mh * 4);
  const tc = document.createElement("canvas");
  tc.width = TILE; tc.height = TILE;
  const tctx = tc.getContext("2d", { willReadFrequently: true });
  const jobs = [];
  for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) jobs.push([tx, ty]);
  const failed = [];
  let next = 0, done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [tx, ty] = jobs[next++];
      try {
        const bitmap = await fetchTileBitmap(zoom, nw.x + tx, nw.y + ty);
        tctx.clearRect(0, 0, TILE, TILE);
        tctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const px = tctx.getImageData(0, 0, TILE, TILE).data;
        for (let row = 0; row < TILE; row++) rgba.set(px.subarray(row * TILE * 4, (row + 1) * TILE * 4), ((ty * TILE + row) * mw + tx * TILE) * 4);
      } catch (err) {
        failed.push(err.message);
      }
      done++;
      onProgress?.(done, jobs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
  return { rgba, mw, mh, failed };
}

// Fetches and mosaics Sentinel-2 cloudless imagery tiles covering [lonMin, latMin, lonMax, latMax]
// (WGS84 degrees), reprojects into targetEpsg the same way srtmFetch.js/parseDEMFiles do for a
// geographic source (per-channel, reusing the exact same reprojectGrid/bilinearSample helpers — R/G/B
// treated as three independent numeric "elevation-like" bands through that identical pipeline, plus a
// 4th alpha band so any sliver of the output grid outside the actually-fetched tile coverage comes out
// transparent instead of a bogus solid color), and returns a raster-import-shaped result: { name, bbox,
// dataUrl, reprojectedTo, reprojectNote, tileCount, zoom, failedTiles } — the same shape
// buildRasterImport() produces, so RasterModule's existing addRaster() call site needs no new handling.
// onProgress(done, total) is called after each tile finishes downloading, for a progress indicator.
// Web Mercator northing (unitless: radians of the Mercator y axis). Tile pixel ROWS are evenly spaced in this,
// not in latitude.
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// TASKS.csv #423 — resample a tile mosaic (RGBA bytes, `mw` x `mh`, covering `tiles` = tile-grid extent in
// lon/lat) onto a gridW x gridH lon/lat grid over `bbox`. Returns Float32 R/G/B/A bands (0-255).
//  * Rows are sampled in Mercator Y. Interpolating linearly in latitude across a multi-tile mosaic put
//    features up to 3.5 m (z14), ~14 m (z13), 55 m (z12), 222 m (z11) off north-south.
//  * Pixel CENTRES: the mosaic's outer edges are tile corners, so its first/last pixel centres sit half a
//    pixel inside them.
//  * Alpha comes from the mosaic: a tile that failed to download is transparent, not opaque black.
//  * R/G/B come back PREMULTIPLIED by alpha (r * a / 255) so every later interpolation (the reprojection
//    below) weights colour by coverage; unpremultiply() divides it back out once, at the end. Interpolating
//    straight colour against a missing tile's zeros fades its neighbours toward black.
export function resampleMosaic(rgba, mw, mh, tiles, bbox, gridW, gridH) {
  const halfX = (tiles.lonMax - tiles.lonMin) / mw / 2;
  const yTop = mercY(tiles.latMax), yBot = mercY(tiles.latMin), halfY = (yTop - yBot) / mh / 2;
  const x0 = tiles.lonMin + halfX, x1 = tiles.lonMax - halfX, y0 = yBot + halfY, y1 = yTop - halfY;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r = new Float32Array(gridW * gridH), g = new Float32Array(gridW * gridH), b = new Float32Array(gridW * gridH), a = new Float32Array(gridW * gridH);
  // TASKS.csv #781 — bilinear on the premultiplied mosaic, read straight from the bytes (the first version made four
  // Float32 copies of the whole mosaic first: 16 bytes a source pixel, ~420 MB for a 20 x 20 tile mosaic)
  const cols = Math.max(2, mw), rows = Math.max(2, mh);
  for (let row = 0; row < gridH; row++) {
    const lat = bbox.latMax - (row / Math.max(1, gridH - 1)) * (bbox.latMax - bbox.latMin);
    const y = clamp(mercY(lat), y0, y1);
    const fy = ((y1 - y) / (y1 - y0 || 1)) * (rows - 1); // row 0 = north
    const r0 = Math.max(0, Math.min(rows - 2, Math.floor(fy))), ty = fy - r0;
    for (let col = 0; col < gridW; col++) {
      const lon = bbox.lonMin + (col / Math.max(1, gridW - 1)) * (bbox.lonMax - bbox.lonMin);
      const x = clamp(lon, x0, x1);
      const fx = ((x - x0) / (x1 - x0 || 1)) * (cols - 1);
      const c0 = Math.max(0, Math.min(cols - 2, Math.floor(fx))), tx = fx - c0;
      const k00 = (r0 * mw + c0) * 4, k10 = k00 + 4, k01 = k00 + mw * 4, k11 = k01 + 4;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      const a00 = rgba[k00 + 3], a10 = rgba[k10 + 3], a01 = rgba[k01 + 3], a11 = rgba[k11 + 3];
      const alpha = a00 * w00 + a10 * w10 + a01 * w01 + a11 * w11;
      if (!(alpha > 0.5)) continue; // no imagery here (a failed tile): transparent
      const idx = row * gridW + col;
      const p00 = (a00 / 255) * w00, p10 = (a10 / 255) * w10, p01 = (a01 / 255) * w01, p11 = (a11 / 255) * w11;
      r[idx] = rgba[k00] * p00 + rgba[k10] * p10 + rgba[k01] * p01 + rgba[k11] * p11;
      g[idx] = rgba[k00 + 1] * p00 + rgba[k10 + 1] * p10 + rgba[k01 + 1] * p01 + rgba[k11 + 1] * p11;
      b[idx] = rgba[k00 + 2] * p00 + rgba[k10 + 2] * p10 + rgba[k01 + 2] * p01 + rgba[k11 + 2] * p11;
      a[idx] = alpha;
    }
  }
  return { r, g, b, a };
}

// Premultiplied R/G/B/A bands (NaN = no data) -> straight RGBA bytes for an ImageData.
export function unpremultiply(r, g, b, a, out) {
  for (let i = 0; i < a.length; i++) {
    const al = Number.isFinite(a[i]) ? Math.min(255, a[i]) : 0;
    const k = al > 0.5 ? 255 / al : 0;
    out[i * 4] = Number.isFinite(r[i]) ? r[i] * k : 0;
    out[i * 4 + 1] = Number.isFinite(g[i]) ? g[i] * k : 0;
    out[i * 4 + 2] = Number.isFinite(b[i]) ? b[i] * k : 0;
    out[i * 4 + 3] = al > 0.5 ? al : 0;
  }
  return out;
}

export async function fetchSatelliteImagery({ lonMin, latMin, lonMax, latMax, targetEpsg, onProgress, level = "standard" }) {
  if (!(Number.isFinite(lonMin) && Number.isFinite(latMin) && Number.isFinite(lonMax) && Number.isFinite(latMax))) {
    throw new Error("Invalid area — couldn't determine a bounding box to fetch.");
  }
  if (!(lonMax > lonMin) || !(latMax > latMin)) throw new Error("Invalid area — check the coordinates.");

  const plan = planSatelliteFetch([lonMin, latMin, lonMax, latMax], level); // #781
  const { zoom, tilesX, tilesY } = plan;
  const nw = lonLatToTileXY(lonMin, latMax, zoom);
  const se = lonLatToTileXY(lonMax, latMin, zoom);
  const total = tilesX * tilesY;
  const { rgba: mdata, mw, mh, failed } = await buildMosaic(zoom, nw, tilesX, tilesY, onProgress);
  if (failed.length === total) {
    throw new Error(`Couldn't fetch any satellite imagery tiles (${failed[0]}). Check your internet connection — this needs to reach a public EOX-hosted imagery service.`);
  }

  const nwLL = tileXYToLonLat(nw.x, nw.y, zoom), seLL = tileXYToLonLat(se.x + 1, se.y + 1, zoom);
  const [mxmin, mymin, mxmax, mymax] = [nwLL.lon, seLL.lat, seLL.lon, nwLL.lat]; // full tile-grid extent (may be slightly wider than the requested bbox)

  // Resample from the (possibly wider) tile-grid mosaic onto a regular grid over exactly the
  // requested bbox — same aspect-based sizing srtmFetch.js uses for its elevation grid.
  const { gridW, gridH } = plan; // #781 — sized by the level, never finer than the source pixels
  const { r: outR, g: outG, b: outB, a: outA } = resampleMosaic(mdata, mw, mh,
    { lonMin: mxmin, latMin: mymin, lonMax: mxmax, latMax: mymax }, { lonMin, latMin, lonMax, latMax }, gridW, gridH);

  let outBbox = [lonMin, latMin, lonMax, latMax];
  let outGridW = gridW, outGridH = gridH;
  let finalR = outR, finalG = outG, finalB = outB, finalA = outA;
  let reprojectedTo = null, reprojectNote = null;
  if (targetEpsg && Number(targetEpsg) !== 4326) {
    const [fromDef, toDef] = await Promise.all([getProj4Def(4326), getProj4Def(targetEpsg)]);
    if (fromDef && toDef) {
      const src = { xmin: lonMin, ymin: latMin, xmax: lonMax, ymax: latMax, gridW, gridH };
      // TASKS.csv #450 — one pass for all four channels (was four full reprojections, one per channel).
      const rp = reprojectGrid({ ...src, bands: [outR, outG, outB, outA] }, fromDef, toDef, gridW, gridH);
      outBbox = rp.bbox; outGridW = rp.gridW; outGridH = rp.gridH;
      [finalR, finalG, finalB, finalA] = rp.bandsOut;
      reprojectedTo = Number(targetEpsg);
    } else {
      reprojectNote = `Fetched in WGS84 (lon/lat) — automatic reprojection to the project's EPSG:${targetEpsg} wasn't available (unrecognized EPSG code), so it's landing at raw lon/lat coordinates. Double-check it lines up with the rest of the project.`;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = outGridW; canvas.height = outGridH;
  const ctx = canvas.getContext("2d");
  const imgData = ctx.createImageData(outGridW, outGridH);
  unpremultiply(finalR, finalG, finalB, finalA, imgData.data); // #423
  ctx.putImageData(imgData, 0, 0);

  return {
    name: `Satellite imagery (Sentinel-2 cloudless, ~${Math.round(plan.pixelM)} m pixels)`, // the pixel says it; a level name would claim "High" for an area already at 10 m
    bbox: outBbox,
    // TASKS.csv #781 — WebP keeps the transparent edges a reprojection leaves, at a fraction of PNG's size (it is stored
    // in the project file); every consumer decodes it as an image. PNG where WebP encoding is unavailable.
    dataUrl: (() => { const w = canvas.toDataURL("image/webp", 0.9); return w.startsWith("data:image/webp") ? w : canvas.toDataURL("image/png"); })(),
    reprojectedTo, reprojectNote,
    tileCount: tilesX * tilesY, zoom, pixelM: plan.pixelM, gridW: outGridW, gridH: outGridH, level: plan.level,
    failedTiles: failed.length,
  };
}
