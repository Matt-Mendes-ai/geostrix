// SRTM auto-fetch — TASKS.csv, user request: "import SRTM directly" instead of manually navigating
// USGS EarthExplorer, downloading a tile, and running it through the manual GeoTIFF importer above
// in raster.js. Produces the exact same result shape parseDEMFiles() does (bbox/gridW/gridH/elevations
// plus the same reprojection metadata fields), so GeophysicsModule's existing addTerrain() call site
// can treat an auto-fetch identically to a manual import — no separate UI/store path needed.
//
// Data source: AWS's public "Terrain Tiles" Open Data bucket (registry.opendata.aws/terrain-tiles) —
// Terrarium-encoded elevation PNGs (elevation = R*256 + G + B/256 - 32768) that blend SRTM with other
// open DEMs for full global/polar coverage. Chosen over hitting USGS's own EarthExplorer/M2M endpoints
// directly because those require a personal USGS account + API credentials: there's no server for this
// app to hold a secret on, so any key baked into the client-side bundle would be trivially extractable,
// and asking every user to register their own account just to load a DEM is a lot of friction for what
// should be a one-click "load the ground under my drillholes" action. This bucket needs neither — it's
// the standard way open-source/client-only tools get SRTM-heritage elevation with zero setup. If a
// specific USGS-original file is ever needed instead, manual GeoTIFF import via parseDEMFiles still
// covers that case exactly as before.
//
// Actual tile bytes are fetched via desktop.js's fetchSRTMTile (proxied through Electron's main
// process when available, direct fetch as a browser/dev fallback) — see that file's header comment.
import { fetchSRTMTile } from "./desktop.js";
import { getProj4Def, reprojectGrid, bilinearSample } from "./reproject.js";

const MAX_TILES = 36; // 6x6 budget — keeps a single fetch to a few dozen requests/~1-2MB, not runaway
const MIN_ZOOM = 4;
const MAX_ZOOM = 14; // Terrarium tiles top out around here in most regions — see mosaic() fallback note
const GRID_MAX = 200; // same mesh-resolution budget raster.js's DEM_MAX_GRID uses for manual imports

function lonLatToTileXY(lon, lat, zoom) {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

// Returns the (lon, lat) of a tile corner's NW pixel — i.e. tileXYToLonLat(x, y) is tile (x,y)'s own
// NW corner, and tileXYToLonLat(x+1, y+1) is its SE corner (standard slippy-map tile convention: x
// grows east, y grows south).
function tileXYToLonLat(x, y, zoom) {
  const n = 2 ** zoom;
  const lon = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lon, lat: (latRad * 180) / Math.PI };
}

// Highest zoom (most detail) whose tile coverage of the bbox still fits the MAX_TILES budget.
function pickZoom(lonMin, latMin, lonMax, latMax) {
  for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
    const nw = lonLatToTileXY(lonMin, latMax, z);
    const se = lonLatToTileXY(lonMax, latMin, z);
    const count = (se.x - nw.x + 1) * (se.y - nw.y + 1);
    if (count <= MAX_TILES) return z;
  }
  return MIN_ZOOM;
}

async function decodeTerrariumTile(z, x, y) {
  const bytes = await fetchSRTMTile(z, x, y);
  const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const elevations = new Float32Array(bitmap.width * bitmap.height);
  for (let i = 0; i < elevations.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    elevations[i] = r * 256 + g + b / 256 - 32768; // Terrarium encoding
  }
  return { data: elevations, width: bitmap.width, height: bitmap.height };
}

// Fetches and mosaics elevation tiles covering [lonMin, latMin, lonMax, latMax] (WGS84 degrees),
// reprojects into targetEpsg the same way parseDEMFiles does for a geographic source, and returns the
// same shape: { name, bbox, gridW, gridH, elevations, reprojectedTo, reprojectNote, tileCount, zoom }.
// onProgress(done, total) is called after each tile finishes downloading, for a progress indicator.
export async function fetchSRTMTerrain({ lonMin, latMin, lonMax, latMax, targetEpsg, onProgress }) {
  if (!(Number.isFinite(lonMin) && Number.isFinite(latMin) && Number.isFinite(lonMax) && Number.isFinite(latMax))) {
    throw new Error("Invalid area — couldn't determine a bounding box to fetch.");
  }
  if (!(lonMax > lonMin) || !(latMax > latMin)) throw new Error("Invalid area — check the coordinates.");

  const zoom = pickZoom(lonMin, latMin, lonMax, latMax);
  const nw = lonLatToTileXY(lonMin, latMax, zoom);
  const se = lonLatToTileXY(lonMax, latMin, zoom);
  const tilesX = se.x - nw.x + 1, tilesY = se.y - nw.y + 1;
  const total = tilesX * tilesY;

  const tiles = [];
  let done = 0;
  const failed = [];
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x = nw.x + tx, y = nw.y + ty;
      try {
        const tile = await decodeTerrariumTile(zoom, x, y);
        const nwLL = tileXYToLonLat(x, y, zoom), seLL = tileXYToLonLat(x + 1, y + 1, zoom);
        tiles.push({ ...tile, bbox: [nwLL.lon, seLL.lat, seLL.lon, nwLL.lat] }); // [xmin, ymin, xmax, ymax], ymin=south
      } catch (err) {
        failed.push(err.message);
      }
      done++;
      onProgress?.(done, total);
    }
  }
  if (!tiles.length) {
    throw new Error(`Couldn't fetch any elevation tiles (${failed[0] || "unknown error"}). Check your internet connection — this needs to reach a public AWS-hosted elevation service.`);
  }

  // Mosaic onto a regular lon/lat grid — same approach parseDEMFiles uses for multiple GeoTIFF tiles,
  // just sampling decoded tile pixel grids instead of GeoTIFF bands.
  const aspect = (lonMax - lonMin) / Math.max(1e-12, latMax - latMin);
  const gridW = aspect >= 1 ? GRID_MAX : Math.max(2, Math.round(GRID_MAX * aspect));
  const gridH = aspect >= 1 ? Math.max(2, Math.round(GRID_MAX / aspect)) : GRID_MAX;
  const raw = new Float32Array(gridW * gridH).fill(NaN);
  for (let row = 0; row < gridH; row++) {
    const lat = latMax - (row / Math.max(1, gridH - 1)) * (latMax - latMin);
    for (let col = 0; col < gridW; col++) {
      const lon = lonMin + (col / Math.max(1, gridW - 1)) * (lonMax - lonMin);
      for (const t of tiles) {
        const [txmin, tymin, txmax, tymax] = t.bbox;
        if (lon < txmin || lon > txmax || lat < tymin || lat > tymax) continue;
        const v = bilinearSample(t.data, t.width, t.height, txmin, tymin, txmax, tymax, lon, lat);
        if (Number.isFinite(v)) { raw[row * gridW + col] = v; break; }
      }
    }
  }

  let outBbox = [lonMin, latMin, lonMax, latMax];
  let outGridW = gridW, outGridH = gridH, outElevations = raw;
  let reprojectedTo = null, reprojectNote = null;
  if (targetEpsg && Number(targetEpsg) !== 4326) {
    const [fromDef, toDef] = await Promise.all([getProj4Def(4326), getProj4Def(targetEpsg)]);
    if (fromDef && toDef) {
      const r = reprojectGrid({ xmin: lonMin, ymin: latMin, xmax: lonMax, ymax: latMax, gridW, gridH, band: raw }, fromDef, toDef, gridW, gridH);
      outBbox = r.bbox; outGridW = r.gridW; outGridH = r.gridH; outElevations = r.elevations;
      reprojectedTo = Number(targetEpsg);
    } else {
      reprojectNote = `Fetched in WGS84 (lon/lat) — automatic reprojection to the project's EPSG:${targetEpsg} wasn't available (unrecognized EPSG code), so it's landing at raw lon/lat coordinates. Double-check it lines up with the rest of the project.`;
    }
  }

  // Fill any no-coverage cells (edges near a fetch failure, or a genuine data gap) with the mean of
  // valid cells — same "flat patch reads better than a hole" reasoning parseDEMFiles uses.
  let sum = 0, count = 0;
  for (let i = 0; i < outElevations.length; i++) if (Number.isFinite(outElevations[i])) { sum += outElevations[i]; count++; }
  const fallback = count ? sum / count : 0;
  const elevations = new Array(outGridW * outGridH);
  for (let i = 0; i < outElevations.length; i++) elevations[i] = Number.isFinite(outElevations[i]) ? outElevations[i] : fallback;

  return {
    name: `SRTM (auto-fetched, ${tiles.length} tile${tiles.length > 1 ? "s" : ""} @ z${zoom})`,
    bbox: outBbox, gridW: outGridW, gridH: outGridH, elevations,
    reprojectedTo, reprojectNote, tileCount: tiles.length, zoom,
    failedTiles: failed.length,
  };
}
