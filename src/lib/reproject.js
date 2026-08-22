// Bug fix (user report, Aug 2026): SRTM/DEM GeoTIFFs are almost always distributed in geographic
// (lon/lat, EPSG:4326) coordinates, while GeoStrix projects work in a projected, metres-based EPSG
// (default 3156 = NAD83(CSRS) / UTM zone 9N, Golden Triangle BC). raster.js's parseDEM/parseGeoTIFF
// deliberately do NOT reproject — they trust the file's own coordinate tags — which is fine for
// data that's already in the project's CRS, but silently places an unreprojected lon/lat DEM at
// coordinates like x=-132, y=56 while the rest of the project sits at UTM eastings/northings in the
// hundreds of thousands to millions. The terrain mesh still gets built and added to the scene, so
// nothing errors — it's just sitting ~500,000 units away from everything else and outside whatever
// the camera fits to, which reads to the user as "it won't display".
//
// This module adds a narrow, well-scoped fix: reproject a geographic DEM grid into the project's
// target EPSG on import, using proj4 for the actual transform math and a verified table of proj4
// definition strings below for the target EPSG lookup.
//
// A first pass tried the npm `epsg-index` package (the real EPSG registry, one proj4 string per code,
// dynamically imported per-code so only the codes actually used would load) instead of a hardcoded
// table — abandoned after `npm run build:web` showed Vite doesn't statically resolve a template-
// literal dynamic import (`import(\`epsg-index/s/${code}.json\`)`) into its own chunk, so the looked-up
// JSON files never made it into dist/ at all; that would've worked in `npm run dev` (node_modules is
// reachable there) but silently failed in the packaged Electron app, which only ships dist/. A fixed
// table that's actually bundled is more reliable than a lookup that quietly doesn't work in production.
//
// Coverage is deliberately scoped to what this app's actual users need rather than the whole ~8000-
// code EPSG registry: WGS84 (source geographic datum GeoTIFFs almost always carry) plus NAD83 and
// WGS84 UTM zones (which follow a simple, well-documented, verified-correct linear EPSG numbering:
// 32600+zone for WGS84 N, 32700+zone for WGS84 S, 26900+zone for NAD83 N) covering the whole UTM grid,
// plus an explicit, individually-verified table for NAD83(CSRS) — the datum BC's own survey system
// (and this app's default EPSG:3156) uses — because THAT series is NOT sequential by zone (confirmed
// by checking real EPSG registry data: EPSG:3158 is UTM zone 14N, not 11N as a naive 3154+(zone-7)
// pattern would give, and zone 11N is EPSG:2955, nowhere near the 3154-3160 block) — guessing a
// formula there would silently mis-reproject exactly the way this bug already did once. Only BC-
// relevant CSRS zones (7N-11N, covering all of BC including the Golden Triangle) are included; an
// unrecognized target EPSG falls back to the existing "no reprojection, here's why" warning message.
import proj4 from "proj4";

const GEOGRAPHIC = {
  4326: "+proj=longlat +datum=WGS84 +no_defs",
  4269: "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs",
  4267: "+proj=longlat +datum=NAD27 +no_defs",
};

// NAD83(CSRS) UTM zones covering BC (7N–11N) — individually verified against the real EPSG registry
// (each zone's own definition record), not derived from a formula. See the header comment above.
const NAD83_CSRS_UTM = {
  3154: 7, 3155: 8, 3156: 9, 3157: 10, 2955: 11,
};

function utmProj4(zone, hemisphereSouth, datumParams) {
  return `+proj=utm +zone=${zone}${hemisphereSouth ? " +south" : ""} ${datumParams} +units=m +no_defs`;
}

// Synchronous core lookup — the actual logic has never needed to await anything (it's a pure table
// lookup + string template), but the original export was declared `async` to leave room for a future
// real-registry lookup. Kept as a real sync function so callers that need a def *right now* inside a
// synchronous code path (e.g. a React event handler building rows for setState, not an effect) don't
// have to thread async/await through call sites that were never going to do I/O anyway. `getProj4Def`
// below is kept as the async-looking wrapper so every existing `await getProj4Def(...)` call site
// keeps working unchanged.
export function getProj4DefSync(epsg) {
  const code = Number(epsg);
  if (!Number.isFinite(code)) return null;
  if (GEOGRAPHIC[code]) return GEOGRAPHIC[code];
  if (NAD83_CSRS_UTM[code]) {
    return utmProj4(NAD83_CSRS_UTM[code], false, "+ellps=GRS80 +towgs84=-0.991,1.9072,0.5129,-1.25033e-07,-4.6785e-08,-5.6529e-08,0");
  }
  if (code >= 32601 && code <= 32660) return utmProj4(code - 32600, false, "+datum=WGS84"); // WGS84 UTM N
  if (code >= 32701 && code <= 32760) return utmProj4(code - 32700, true, "+datum=WGS84"); // WGS84 UTM S
  if (code >= 26901 && code <= 26923) return utmProj4(code - 26900, false, "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0"); // NAD83 UTM N
  return null;
}

// Returns a proj4 definition string for an EPSG code, or null if it's not one of the codes this app
// recognizes (an unrecognized code isn't a bug — it just means automatic reprojection can't help for
// that particular target EPSG, and the caller falls back to its existing "no reprojection" warning).
export async function getProj4Def(epsg) {
  return getProj4DefSync(epsg);
}

// TASKS.csv #120 — QGIS-specialist audit: "no per-layer CRS awareness or 'reproject on the fly' the
// way QGIS reprojects every layer to the project CRS regardless of source." reproject.js already had
// grid reprojection (reprojectGrid, below) for DEM import; this is the equivalent for a single point
// (x, y) — collars, geophysics x/y/z points, and any other absolute-world-coordinate vector import.
// Reprojects at IMPORT time (the row's x/y are transformed once, before being stored), the same
// point-in-time-conversion approach parseDEMFiles already uses for rasters, rather than keeping a
// live per-layer CRS tag and re-transforming every render — simpler, and consistent with how every
// other reprojection path in this app already works. Returns null (not a throw) if either EPSG isn't
// one of the codes this app recognizes, so callers can fall back to "no reprojection, here's why"
// exactly like the raster path already does.
export function reprojectXY(x, y, fromEpsg, toEpsg) {
  const fromDef = getProj4DefSync(fromEpsg);
  const toDef = getProj4DefSync(toEpsg);
  if (!fromDef || !toDef) return null;
  const [tx, ty] = proj4(fromDef, toDef, [x, y]);
  return { x: tx, y: ty };
}

// Point-only inverse of the grid reprojection below — projects a single (x, y) in `epsg` into WGS84
// lon/lat. Used by the SRTM auto-fetch feature (needs a lon/lat bbox to know which elevation tiles to
// request) and the locator mini-map (needs to know where the project sits on a real-world map).
// Returns null if `epsg` isn't one of the codes this app recognizes (see getProj4Def above) — same
// "can't help, here's why" fallback shape the rest of this module uses.
export async function toLonLat(x, y, epsg) {
  const fromDef = await getProj4Def(epsg);
  const toDef = await getProj4Def(4326);
  if (!fromDef || !toDef) return null;
  const [lon, lat] = proj4(fromDef, toDef, [x, y]);
  return { lon, lat };
}

// Bilinear-sample a regular row-major grid (row 0 = the NORTH/ymax edge, same convention raster.js
// and ViewerModule's sampleTerrainElevation already use) at a real-world (x, y) point. Returns null
// if (x, y) is outside the grid's bbox (caller decides the fallback — e.g. try the next tile).
export function bilinearSample(band, w, h, xmin, ymin, xmax, ymax, x, y) {
  if (x < xmin || x > xmax || y < ymin || y > ymax || w < 2 || h < 2) return null;
  const fx = ((x - xmin) / (xmax - xmin)) * (w - 1);
  const fyTop = ((ymax - y) / (ymax - ymin)) * (h - 1); // row 0 = north
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx))), x1 = x0 + 1;
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(fyTop))), y1 = y0 + 1;
  const tx = fx - x0, ty = fyTop - y0;
  const v00 = band[y0 * w + x0], v10 = band[y0 * w + x1], v01 = band[y1 * w + x0], v11 = band[y1 * w + x1];
  const top = v00 + (v10 - v00) * tx, bot = v01 + (v11 - v01) * tx;
  return top + (bot - top) * ty;
}

// Reprojects a regular lon/lat (or other geographic) elevation grid into a target CRS. Because a
// forward projection of a rectangular geographic tile is generally NOT itself an axis-aligned
// rectangle (meridians converge toward the poles), this: (1) forward-projects the 4 corners to get
// an axis-aligned bounding box in the target CRS that fully covers the reprojected tile, then (2)
// builds a new regular grid over THAT bbox by inverse-projecting each output cell back to lon/lat and
// bilinearly sampling the original grid there. For a single SRTM-sized tile (~1°, well within one UTM
// zone) the corner-bbox is a close approximation of the true (slightly non-rectangular) footprint —
// same axis-aligned-grid tradeoff the rest of this app's raster/terrain model already makes (see
// parseGXF's #ROTATION handling for the same reasoning applied to a different format).
export function reprojectGrid({ xmin, ymin, xmax, ymax, gridW, gridH, band }, fromDef, toDef, outW, outH) {
  const corners = [
    [xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax],
  ].map(([x, y]) => proj4(fromDef, toDef, [x, y]));
  const txs = corners.map((c) => c[0]), tys = corners.map((c) => c[1]);
  const txmin = Math.min(...txs), txmax = Math.max(...txs);
  const tymin = Math.min(...tys), tymax = Math.max(...tys);

  const elevations = new Float32Array(outW * outH);
  for (let row = 0; row < outH; row++) {
    const ty = tymax - (row / Math.max(1, outH - 1)) * (tymax - tymin); // row 0 = north
    for (let col = 0; col < outW; col++) {
      const tx = txmin + (col / Math.max(1, outW - 1)) * (txmax - txmin);
      const [lon, lat] = proj4(toDef, fromDef, [tx, ty]);
      const v = bilinearSample(band, gridW, gridH, xmin, ymin, xmax, ymax, lon, lat);
      elevations[row * outW + col] = v === null ? NaN : v;
    }
  }
  return { bbox: [txmin, tymin, txmax, tymax], gridW: outW, gridH: outH, elevations };
}
