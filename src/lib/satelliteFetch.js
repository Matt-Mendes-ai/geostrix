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
import { getProj4Def, reprojectGrid, bilinearSample } from "./reproject.js";

const TILE = 256;
const MAX_TILES = 64; // a bit more headroom than srtmFetch's 36 — JPG imagery tiles are small (~15KB each, see the CORS check above), not a bandwidth concern the same way
const MIN_ZOOM = 2;
const MAX_ZOOM = 14; // the s2cloudless mosaic's own practical max useful zoom — beyond this it's just the same pixels upsampled, per EOX's own docs
const GRID_MAX = 512; // higher than SRTM's 200-cell elevation mesh budget — this becomes a flat textured image, not a 3D mesh, so it can afford to look sharp

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
function pickZoom(lonMin, latMin, lonMax, latMax) {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const nw = lonLatToTileXY(lonMin, latMax, z);
    const se = lonLatToTileXY(lonMax, latMin, z);
    const count = (se.x - nw.x + 1) * (se.y - nw.y + 1);
    if (count <= MAX_TILES) return z;
  }
  return MIN_ZOOM;
}

async function fetchTileBitmap(z, x, y) {
  const url = getBaseLayer("satellite").tileUrl(z, x, y);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Tile fetch failed (HTTP ${res.status}) for z${z}/${x}/${y}.`);
  const blob = await res.blob();
  return createImageBitmap(blob);
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
  const n = mw * mh;
  const pr = new Float32Array(n), pg = new Float32Array(n), pb = new Float32Array(n), pa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = rgba[i * 4 + 3] / 255;
    pr[i] = rgba[i * 4] * a; pg[i] = rgba[i * 4 + 1] * a; pb[i] = rgba[i * 4 + 2] * a; pa[i] = rgba[i * 4 + 3];
  }
  const halfX = (tiles.lonMax - tiles.lonMin) / mw / 2;
  const yTop = mercY(tiles.latMax), yBot = mercY(tiles.latMin), halfY = (yTop - yBot) / mh / 2;
  const x0 = tiles.lonMin + halfX, x1 = tiles.lonMax - halfX, y0 = yBot + halfY, y1 = yTop - halfY;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const r = new Float32Array(gridW * gridH), g = new Float32Array(gridW * gridH), b = new Float32Array(gridW * gridH), a = new Float32Array(gridW * gridH);
  for (let row = 0; row < gridH; row++) {
    const lat = bbox.latMax - (row / Math.max(1, gridH - 1)) * (bbox.latMax - bbox.latMin);
    const y = clamp(mercY(lat), y0, y1);
    for (let col = 0; col < gridW; col++) {
      const lon = bbox.lonMin + (col / Math.max(1, gridW - 1)) * (bbox.lonMax - bbox.lonMin);
      const x = clamp(lon, x0, x1);
      const idx = row * gridW + col;
      const alpha = bilinearSample(pa, mw, mh, x0, y0, x1, y1, x, y);
      if (!(alpha > 0.5)) continue; // no imagery here (a failed tile): transparent
      r[idx] = bilinearSample(pr, mw, mh, x0, y0, x1, y1, x, y);
      g[idx] = bilinearSample(pg, mw, mh, x0, y0, x1, y1, x, y);
      b[idx] = bilinearSample(pb, mw, mh, x0, y0, x1, y1, x, y);
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

export async function fetchSatelliteImagery({ lonMin, latMin, lonMax, latMax, targetEpsg, onProgress }) {
  if (!(Number.isFinite(lonMin) && Number.isFinite(latMin) && Number.isFinite(lonMax) && Number.isFinite(latMax))) {
    throw new Error("Invalid area — couldn't determine a bounding box to fetch.");
  }
  if (!(lonMax > lonMin) || !(latMax > latMin)) throw new Error("Invalid area — check the coordinates.");

  const zoom = pickZoom(lonMin, latMin, lonMax, latMax);
  const nw = lonLatToTileXY(lonMin, latMax, zoom);
  const se = lonLatToTileXY(lonMax, latMin, zoom);
  const tilesX = se.x - nw.x + 1, tilesY = se.y - nw.y + 1;
  const total = tilesX * tilesY;

  const mosaic = document.createElement("canvas");
  mosaic.width = tilesX * TILE;
  mosaic.height = tilesY * TILE;
  const mctx = mosaic.getContext("2d");
  let done = 0;
  const failed = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      try {
        const bitmap = await fetchTileBitmap(zoom, nw.x + tx, nw.y + ty);
        mctx.drawImage(bitmap, tx * TILE, ty * TILE);
      } catch (err) {
        failed.push(err.message);
      }
      done++;
      onProgress?.(done, total);
    }
  }
  if (failed.length === total) {
    throw new Error(`Couldn't fetch any satellite imagery tiles (${failed[0]}). Check your internet connection — this needs to reach a public EOX-hosted imagery service.`);
  }

  const nwLL = tileXYToLonLat(nw.x, nw.y, zoom), seLL = tileXYToLonLat(se.x + 1, se.y + 1, zoom);
  const [mxmin, mymin, mxmax, mymax] = [nwLL.lon, seLL.lat, seLL.lon, nwLL.lat]; // full tile-grid extent (may be slightly wider than the requested bbox)

  const { data: mdata } = mctx.getImageData(0, 0, mosaic.width, mosaic.height);

  // Resample from the (possibly wider) tile-grid mosaic onto a regular grid over exactly the
  // requested bbox — same aspect-based sizing srtmFetch.js uses for its elevation grid.
  const aspect = (lonMax - lonMin) / Math.max(1e-12, latMax - latMin);
  const gridW = aspect >= 1 ? GRID_MAX : Math.max(2, Math.round(GRID_MAX * aspect));
  const gridH = aspect >= 1 ? Math.max(2, Math.round(GRID_MAX / aspect)) : GRID_MAX;
  const { r: outR, g: outG, b: outB, a: outA } = resampleMosaic(mdata, mosaic.width, mosaic.height,
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
    name: `Satellite imagery (Sentinel-2 cloudless, ${tilesX * tilesY} tile${tilesX * tilesY > 1 ? "s" : ""} @ z${zoom})`,
    bbox: outBbox,
    dataUrl: canvas.toDataURL("image/png"),
    reprojectedTo, reprojectNote,
    tileCount: tilesX * tilesY, zoom,
    failedTiles: failed.length,
  };
}
