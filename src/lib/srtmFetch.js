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
import { getProj4Def, reprojectGrid, pointTransform, neighbourUtmZones } from "./reproject.js";
import { sampleTerrainElevation } from "./viewer/geomath.js"; // TASKS.csv #614
import { fillNoData, noDataNote } from "./demFill.js"; // TASKS.csv #421
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

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

// TASKS.csv #726 — the tile mosaic (Float32 elevations, `mw` x `mh`, NaN where a tile failed, covering `tiles` = the
// tile-grid extent in lon/lat) resampled onto a gridW x gridH lon/lat grid over `bbox`, the way satelliteFetch.js's
// resampleMosaic (#423) does it:
//  * PIXEL CENTRES: the mosaic's edges are tile corners, so its first / last pixel centres sit half a pixel inside.
//    The first version sampled each tile with node 0 on its west / north EDGE: a half-pixel shift, 2.9 m at z14
//    (an area up to ~6 km), 5.8 m at z13, 11.7 m at z12 (~25 km).
//  * Rows in Mercator Y (tile rows are evenly spaced in it, not in latitude).
//  * One mosaic, so cells between two tiles interpolate across the seam (per-tile sampling could not).
// A cell touching a failed tile is NaN (filled and reported later by demFill.js).
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

// TASKS.csv #799 — Matt: "some sections of the SRTM appears to be wrong, rendering a cone". Each of the ~200 nodes was
// a bilinear POINT sample of a mosaic 5-8x finer, so one odd source pixel (Terrain Tiles blend several DEMs) caught by
// a node became a cone two cells wide, and narrow real relief aliased (measured over 15 km at Harry: 660 of 37,000
// nodes more than 10 m off their cell's mean, worst 32 m). Two fixes:
//  * despikeMosaic: a pixel more than `minM` from the median of its 8 neighbours AND more than `ratio` x their own
//    spread is replaced by that median. A real summit fails the test (its neighbours vary too); none fired over the
//    Harry or Woodjam sample areas. Returns how many it replaced (reported on import).
//  * resampleElevationMosaic: when a node's cell spans more than ~1.5 mosaic pixels, the node is the MEAN of the
//    pixels whose centres fall in its cell (a summed-area table, O(1) per node) - what a node of that spacing stands
//    for; closer zooms keep the bilinear sample.
export function despikeMosaic(elev, w, h, { minM = 40, ratio = 3 } = {}) {
  const src = Float32Array.from(elev);
  const nb = new Float64Array(8);
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const v = src[y * w + x];
      if (!Number.isFinite(v)) continue;
      let k = 0, ok = true;
      for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const u = src[(y + dy) * w + x + dx];
        if (!Number.isFinite(u)) { ok = false; break; }
        nb[k++] = u;
      }
      if (!ok) continue;
      nb.sort();
      const med = (nb[3] + nb[4]) / 2, spread = nb[7] - nb[0], d = Math.abs(v - med);
      if (d > minM && d > ratio * spread) { elev[y * w + x] = med; n++; }
    }
  }
  return n;
}

export function resampleElevationMosaic(elev, mw, mh, tiles, bbox, gridW, gridH) {
  const halfX = (tiles.lonMax - tiles.lonMin) / mw / 2;
  const yTop = mercY(tiles.latMax), yBot = mercY(tiles.latMin), halfY = (yTop - yBot) / mh / 2;
  const x0 = tiles.lonMin + halfX, x1 = tiles.lonMax - halfX, y0 = yBot + halfY, y1 = yTop - halfY;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const cols = Math.max(2, mw), rows = Math.max(2, mh);
  const out = new Float32Array(gridW * gridH);
  // #799 — mosaic pixels per node: when a node's cell spans more than ~1.5 of them, average the cell
  const pxPerNodeX = (mw * (bbox.lonMax - bbox.lonMin)) / ((tiles.lonMax - tiles.lonMin) * Math.max(1, gridW - 1));
  const pxPerNodeY = (mh * (mercY(bbox.latMax) - mercY(bbox.latMin))) / ((yTop - yBot) * Math.max(1, gridH - 1));
  if (pxPerNodeX > 1.5 && pxPerNodeY > 1.5) {
    // summed-area tables of the values and of the finite-pixel count ((mw+1) x (mh+1), exclusive)
    const W = mw + 1, S = new Float64Array(W * (mh + 1)), C = new Uint32Array(W * (mh + 1));
    for (let y = 0; y < mh; y++) {
      let rs = 0, rc = 0;
      for (let x = 0; x < mw; x++) {
        const v = elev[y * mw + x];
        if (Number.isFinite(v)) { rs += v; rc++; }
        S[(y + 1) * W + x + 1] = S[y * W + x + 1] + rs;
        C[(y + 1) * W + x + 1] = C[y * W + x + 1] + rc;
      }
    }
    const pxX = (lon) => ((lon - tiles.lonMin) / (tiles.lonMax - tiles.lonMin)) * mw; // pixel-edge coordinates
    const pxY = (lat) => ((yTop - mercY(lat)) / (yTop - yBot)) * mh;
    const hx = (bbox.lonMax - bbox.lonMin) / Math.max(1, gridW - 1) / 2, hy = (bbox.latMax - bbox.latMin) / Math.max(1, gridH - 1) / 2;
    for (let row = 0; row < gridH; row++) {
      const lat = bbox.latMax - (row / Math.max(1, gridH - 1)) * (bbox.latMax - bbox.latMin);
      // pixels whose centres (i + 0.5) fall inside the node's cell, at least the nearest one
      let ya = Math.ceil(pxY(lat + hy) - 0.5), yb = Math.floor(pxY(lat - hy) - 0.5);
      ya = Math.max(0, Math.min(mh - 1, ya)); yb = Math.max(ya, Math.min(mh - 1, yb));
      for (let col = 0; col < gridW; col++) {
        const lon = bbox.lonMin + (col / Math.max(1, gridW - 1)) * (bbox.lonMax - bbox.lonMin);
        let xa = Math.ceil(pxX(lon - hx) - 0.5), xb = Math.floor(pxX(lon + hx) - 0.5);
        xa = Math.max(0, Math.min(mw - 1, xa)); xb = Math.max(xa, Math.min(mw - 1, xb));
        const i1 = (yb + 1) * W + xb + 1, i2 = ya * W + xb + 1, i3 = (yb + 1) * W + xa, i4 = ya * W + xa;
        const cnt = C[i1] - C[i2] - C[i3] + C[i4], all = (xb - xa + 1) * (yb - ya + 1);
        // a cell touching a failed tile stays NaN (filled and reported later by demFill.js), as before
        out[row * gridW + col] = cnt === all ? (S[i1] - S[i2] - S[i3] + S[i4]) / cnt : NaN;
      }
    }
    return out;
  }
  for (let row = 0; row < gridH; row++) {
    const lat = bbox.latMax - (row / Math.max(1, gridH - 1)) * (bbox.latMax - bbox.latMin);
    const fy = ((y1 - clamp(mercY(lat), y0, y1)) / (y1 - y0 || 1)) * (rows - 1); // row 0 = north
    const r0 = Math.max(0, Math.min(rows - 2, Math.floor(fy))), ty = fy - r0;
    for (let col = 0; col < gridW; col++) {
      const lon = bbox.lonMin + (col / Math.max(1, gridW - 1)) * (bbox.lonMax - bbox.lonMin);
      const fx = ((clamp(lon, x0, x1) - x0) / (x1 - x0 || 1)) * (cols - 1);
      const c0 = Math.max(0, Math.min(cols - 2, Math.floor(fx))), tx = fx - c0;
      const k = r0 * mw + c0;
      const top = elev[k] + (elev[k + 1] - elev[k]) * tx, bot = elev[k + mw] + (elev[k + mw + 1] - elev[k + mw]) * tx;
      out[row * gridW + col] = top + (bot - top) * ty;
    }
  }
  return out;
}

// TASKS.csv #614 — collars vs a freshly fetched terrain. GeoStrix fetches the terrain for wherever the project CRS
// says the data is, so a project in the wrong UTM zone (a collar CSV carries no CRS; new projects default to
// EPSG:3156, zone 9N) gets terrain from ~400 km away — Matt's Woodjam holes (zone 10N) floated ~950 m over coastal
// sea level. Median |collar Z − ground| of a few metres to tens is normal (GPS, SRTM); hundreds means the
// collars are not where the CRS puts them. Returns { n, medianDz } (null under 3 comparable collars).
export function collarGroundMisfit(collars, terrain) {
  const d = [];
  const [x0, y0, x1, y1] = terrain?.bbox || [];
  for (const c of collars || []) {
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) continue;
    if (!(c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1)) continue; // sampling clamps to the edge outside
    const g = sampleTerrainElevation(terrain, c.x, c.y);
    if (Number.isFinite(g)) d.push(Math.abs(c.z - g));
  }
  if (d.length < 3) return null;
  d.sort((a, b) => a - b);
  return { n: d.length, medianDz: d[Math.floor(d.length / 2)] };
}

// When the misfit is large: re-reads the SAME coordinates as each neighbouring UTM zone of the same datum, fetches
// a small terrain around the collars there, and returns the zone where they sit on the ground, or null. Only
// called after a misfit, so a normal project never pays for the extra downloads.
export async function findBetterUtmZone(collars, epsg, misfit) {
  const pts = (collars || []).filter((c) => Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.z));
  if (pts.length < 3) return null;
  const xs = pts.map((c) => c.x), ys = pts.map((c) => c.y), pad = 300;
  const box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
  let best = null;
  for (const cand of neighbourUtmZones(epsg, 2)) {
    const T = pointTransform(cand.code, 4326);
    if (!T) continue;
    const corners = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(([x, y]) => T(x, y));
    const lons = corners.map((p) => p[0]), lats = corners.map((p) => p[1]);
    let t;
    try { t = await fetchSRTMTerrain({ lonMin: Math.min(...lons), latMin: Math.min(...lats), lonMax: Math.max(...lons), latMax: Math.max(...lats), targetEpsg: cand.code }); } catch { continue; }
    const m = collarGroundMisfit(pts, t);
    if (m && m.medianDz < 40 && m.medianDz < misfit.medianDz / 4 && (!best || m.medianDz < best.medianDz)) best = { ...cand, medianDz: m.medianDz, n: m.n };
    if (best && best.medianDz < 15) break; // nearest zones first: a clear fit ends the search
  }
  return best;
}

// Fetches and mosaics elevation tiles covering [lonMin, latMin, lonMax, latMax] (WGS84 degrees),
// reprojects into targetEpsg the same way parseDEMFiles does for a geographic source, and returns the
// same shape: { name, bbox, gridW, gridH, elevations, reprojectedTo, reprojectNote, tileCount, zoom }.
// onProgress(done, total) is called after each tile finishes downloading, for a progress indicator.
export async function fetchSRTMTerrain({ lonMin, latMin, lonMax, latMax, targetEpsg, onProgress }) {
  if (!(Number.isFinite(lonMin) && Number.isFinite(latMin) && Number.isFinite(lonMax) && Number.isFinite(latMax))) {
    throw new Error(tr("Invalid area — couldn't determine a bounding box to fetch."));
  }
  if (!(lonMax > lonMin) || !(latMax > latMin)) throw new Error(tr("Invalid area — check the coordinates."));

  const zoom = pickZoom(lonMin, latMin, lonMax, latMax);
  const nw = lonLatToTileXY(lonMin, latMax, zoom);
  const se = lonLatToTileXY(lonMax, latMin, zoom);
  const tilesX = se.x - nw.x + 1, tilesY = se.y - nw.y + 1;
  const total = tilesX * tilesY;

  // TASKS.csv #726 — one Float32 mosaic of every tile (NaN where a tile failed), downloaded 6 at a time
  const TILE = 256;
  const mw = tilesX * TILE, mh = tilesY * TILE;
  const mosaic = new Float32Array(mw * mh).fill(NaN);
  const jobs = [];
  for (let ty = 0; ty < tilesY; ty++) for (let tx = 0; tx < tilesX; tx++) jobs.push([tx, ty]);
  let done = 0, next = 0, got = 0;
  const failed = [];
  const worker = async () => {
    while (next < jobs.length) {
      const [tx, ty] = jobs[next++];
      try {
        const tile = await decodeTerrariumTile(zoom, nw.x + tx, nw.y + ty);
        if (tile.width !== TILE || tile.height !== TILE) throw new Error(tr("unexpected tile size {width} x {height}", { width: tile.width, height: tile.height }));
        for (let row = 0; row < TILE; row++) mosaic.set(tile.data.subarray(row * TILE, (row + 1) * TILE), (ty * TILE + row) * mw + tx * TILE);
        got++;
      } catch (err) {
        failed.push(err.message);
      }
      done++;
      onProgress?.(done, total);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker));
  if (!got) {
    throw new Error(tr("Couldn't fetch any elevation tiles ({v}). Check your internet connection — this needs to reach a public AWS-hosted elevation service.", { v: failed[0] || tr("unknown error") }));
  }

  // Resample onto a regular lon/lat grid over exactly the requested area (#726: at pixel centres, in Mercator Y)
  const nwLL = tileXYToLonLat(nw.x, nw.y, zoom), seLL = tileXYToLonLat(se.x + 1, se.y + 1, zoom);
  const aspect = (lonMax - lonMin) / Math.max(1e-12, latMax - latMin);
  const gridW = aspect >= 1 ? GRID_MAX : Math.max(2, Math.round(GRID_MAX * aspect));
  const gridH = aspect >= 1 ? Math.max(2, Math.round(GRID_MAX / aspect)) : GRID_MAX;
  const spikes = despikeMosaic(mosaic, mw, mh); // #799 — isolated source spikes / pits, before averaging
  const raw = resampleElevationMosaic(mosaic, mw, mh, { lonMin: nwLL.lon, latMin: seLL.lat, lonMax: seLL.lon, latMax: nwLL.lat }, { lonMin, latMin, lonMax, latMax }, gridW, gridH);

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

  // TASKS.csv #421 — no-data cells are still filled (for sampling) but recorded and reported; see demFill.js.
  const fill = fillNoData(outElevations);
  const elevations = fill.elevations;

  // TASKS.csv #726 — say what the surface is: the source (AWS Terrain Tiles blend SRTM with national DEMs - CDEM in
  // Canada - so "SRTM" was probably the wrong name in BC), its own pixel and the node spacing GRID_MAX made
  const latMid = ((latMin + latMax) / 2) * (Math.PI / 180);
  const sourcePixelM = (40075016.686 * Math.cos(latMid)) / (TILE * 2 ** zoom);
  const nodeM = Math.max(((lonMax - lonMin) * 111320 * Math.cos(latMid)) / Math.max(1, gridW - 1), ((latMax - latMin) * 110574) / Math.max(1, gridH - 1));
  return {
    name: `Terrain (AWS Terrain Tiles, ~${Math.round(nodeM)} m grid)`,
    bbox: outBbox, gridW: outGridW, gridH: outGridH, elevations,
    reprojectedTo, reprojectNote, tileCount: got, zoom,
    source: { service: "AWS Terrain Tiles (Terrarium): SRTM blended with national DEMs (CDEM in Canada)", zoom, sourcePixelM, nodeM, fetched: new Date().toISOString().slice(0, 10) },
    noDataMask: fill.noDataMask, noDataNote: noDataNote(fill), // #421
    failedTiles: failed.length,
    spikesRemoved: spikes, // #799
  };
}
