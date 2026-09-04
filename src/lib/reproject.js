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

// TASKS.csv #223 (QGIS-specialist audit finding: importing a real dataset declared as EPSG:3005 —
// NAD83 / BC Albers, the BC provincial government's own standard mapping CRS for open data — placed a
// collar ~700km off with only a soft warning, since it wasn't recognized at all). A single fixed code,
// not a zone series, so it's just its own verified proj4 string (parameters match the EPSG registry's
// own published definition for 3005 — a stable, ubiquitous one, the same string BC government open
// data portals, QGIS, and every other BC-focused GIS tool already ship).
const EPSG_3005_BC_ALBERS = "+proj=aea +lat_1=50 +lat_2=58.5 +lat_0=45 +lon_0=-126 +x_0=1000000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs";

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
  if (code === 3005) return EPSG_3005_BC_ALBERS;
  if (NAD83_CSRS_UTM[code]) {
    return utmProj4(NAD83_CSRS_UTM[code], false, "+ellps=GRS80 +towgs84=-0.991,1.9072,0.5129,-1.25033e-07,-4.6785e-08,-5.6529e-08,0");
  }
  if (code >= 32601 && code <= 32660) return utmProj4(code - 32600, false, "+datum=WGS84"); // WGS84 UTM N
  if (code >= 32701 && code <= 32760) return utmProj4(code - 32700, true, "+datum=WGS84"); // WGS84 UTM S
  if (code >= 26901 && code <= 26923) return utmProj4(code - 26900, false, "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0"); // NAD83 UTM N
  // NAD27 UTM North zones — TASKS.csv #223. Unlike NAD83(CSRS)'s irregular series, this IS a
  // standard, well-documented linear EPSG block (26701 = zone 1N ... 26722 = zone 22N), the same kind
  // of verified-safe-to-formula case the WGS84/NAD83 UTM ranges above already rely on.
  if (code >= 26701 && code <= 26722) return utmProj4(code - 26700, false, "+datum=NAD27"); // NAD27 UTM N
  return null;
}

// TASKS.csv #268 — is this project's CRS a PROJECTED, METRE-based one? Volume (m³) and tonnage are
// only meaningful if the scene's x/y/z are metres; a project left in geographic degrees (EPSG:4326 and
// friends) or never assigned a CRS at all still produced a confidently-labelled "m³" figure with no
// complaint. Returns true (projected, +units=m), false (definitely geographic/lat-long), or null
// (no EPSG set, or a code this app's narrow-but-verified table doesn't recognize) — the caller must
// treat null as "can't confirm", not as "fine", since an unrecognized code could be anything,
// including a US survey-feet state-plane system.
export function isMetricProjectedEpsg(epsg) {
  if (epsg == null || epsg === "") return null;
  const def = getProj4DefSync(epsg);
  if (!def) return null;
  if (/\+proj=longlat/.test(def)) return false;
  return /\+units=m(\s|$)/.test(def);
}

// Returns a proj4 definition string for an EPSG code, or null if it's not one of the codes this app
// recognizes (an unrecognized code isn't a bug — it just means automatic reprojection can't help for
// that particular target EPSG, and the caller falls back to its existing "no reprojection" warning).
export async function getProj4Def(epsg) {
  return getProj4DefSync(epsg);
}

// TASKS.csv #223 (QGIS-specialist audit finding: shapefile import ignores the .prj sidecar entirely,
// so an incorrectly-assumed CRS silently propagates) — a best-effort .prj (WKT) sniffer, not a real WKT
// parser. Scoped to exactly the same set of CRSes getProj4DefSync above already recognizes, matching
// this whole module's deliberate "narrow, verified coverage over the full registry" approach: this
// pattern-matches on the well-known human-readable names common GIS tools (ArcGIS, QGIS) actually write
// into a .prj's PROJCS/GEOGCS/DATUM names (e.g. "NAD_1983_UTM_Zone_10N", "GCS_WGS_1984",
// "British_Columbia_Albers") rather than fully parsing the WKT grammar. Returns null (not a guess) if
// nothing recognizable matches — same "can't help, here's why" fallback as everything else here; a
// wrong auto-detected EPSG would be worse than the status quo of asking the user to enter it manually.
export function guessEpsgFromPrjWkt(wkt) {
  if (!wkt || typeof wkt !== "string") return null;
  const w = wkt.toUpperCase();
  // BC Albers (EPSG:3005) — the ubiquitous BC provincial government open-data CRS this row's own
  // report was filed about. Checked before the more generic UTM/geographic patterns below since a
  // BC Albers .prj also mentions "NAD_1983"/"GRS_1980" incidentally.
  // "\b" alone doesn't help inside a WKT name — ArcGIS/QGIS write these as underscore-joined tokens
  // ("NAD_1983_BC_Environment_Albers"), and \w already treats "_" as a word character, so "_BC_" has
  // no real word boundary around "BC" for \b to find. Split on any non-alphanumeric run instead and
  // check for an exact "BC" token.
  const hasBcToken = w.split(/[^A-Z0-9]+/).includes("BC");
  if (w.includes("ALBERS") && (hasBcToken || w.includes("BRITISH_COLUMBIA") || w.includes("BRITISH COLUMBIA"))) return 3005;
  // UTM zone, any of the datums this app already has a verified series for.
  const utmMatch = w.match(/UTM[_ ]ZONE[_ ]?(\d{1,2})\s*([NS]?)/);
  if (utmMatch) {
    const zone = Number(utmMatch[1]);
    const south = utmMatch[2] === "S";
    if (zone >= 1 && zone <= 60) {
      if (w.includes("CSRS")) {
        // Only BC's own 7N–11N CSRS zones have a verified entry (see NAD83_CSRS_UTM above) — an
        // out-of-range CSRS zone falls through to null rather than guessing at an unverified series.
        const csrsCode = Object.entries(NAD83_CSRS_UTM).find(([, z]) => z === zone)?.[0];
        if (csrsCode) return Number(csrsCode);
      } else if (w.includes("NAD_1983") || w.includes("NAD83")) {
        if (!south && zone >= 1 && zone <= 23) return 26900 + zone; // NAD83 UTM N only has a verified EPSG series that far
      } else if (w.includes("NAD_1927") || w.includes("NAD27")) {
        if (!south && zone >= 1 && zone <= 22) return 26700 + zone;
      } else if (w.includes("WGS_1984") || w.includes("WGS84")) {
        return south ? 32700 + zone : 32600 + zone;
      }
    }
    return null; // recognized as SOME UTM zone but not a datum/zone combo this app has verified — don't guess
  }
  // Geographic-only (GEOGCS with no PROJCS) — the datum name alone decides.
  if (!w.includes("PROJCS")) {
    if (w.includes("WGS_1984") || w.includes("WGS84")) return 4326;
    // GEOGCS datum names spell it out in full ("D_North_American_1983"/"GCS_North_American_1983"),
    // unlike a PROJCS's UTM-zone name which abbreviates to "NAD_1983" — check both spellings.
    if (w.includes("NAD_1983") || w.includes("NAD83") || w.includes("NORTH_AMERICAN_1983")) return 4269;
    if (w.includes("NAD_1927") || w.includes("NAD27") || w.includes("NORTH_AMERICAN_1927")) return 4267;
  }
  return null;
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

// TASKS.csv #287 (QGIS-specialist review, headline finding) — the RGBA-image sibling of reprojectGrid
// above, for the flat raster drape path (raster.js's buildRasterImport). reprojectGrid only handles a
// single numeric band, which is exactly right for the DEM/terrain path it was written for, but a
// drape has already been colour-mapped into RGBA pixels by the time it reaches the importer. Running
// reprojectGrid once per channel would work, but would repeat the expensive inverse projection FOUR
// times per output pixel, so the identical corner-bbox + inverse-project-and-sample math is done once
// here with all four channels sampled together.
//
// Nearest-neighbour rather than bilinear, deliberately: a drape is frequently a categorical/classified
// image (an alteration map, a claim-boundary raster, a false-colour geology scan) where interpolating
// between two class colours invents a third colour that means nothing — and for a continuous grid the
// difference at typical drape resolutions is invisible. Nearest also keeps hard nodata edges hard
// instead of smearing a half-transparent fringe around every hole in the data.
//
// Pixels whose inverse-projected position falls outside the source image (the corner bbox is an
// axis-aligned cover of a footprint that is generally NOT rectangular after projection) are written as
// fully transparent, so the reprojected drape shows the true skewed footprint rather than stretched
// edge pixels.
export function reprojectImageRGBA({ xmin, ymin, xmax, ymax, width, height, data }, fromDef, toDef, outW, outH) {
  const corners = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]].map(([x, y]) => proj4(fromDef, toDef, [x, y]));
  const txs = corners.map((c) => c[0]), tys = corners.map((c) => c[1]);
  const txmin = Math.min(...txs), txmax = Math.max(...txs);
  const tymin = Math.min(...tys), tymax = Math.max(...tys);

  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let row = 0; row < outH; row++) {
    const ty = tymax - (row / Math.max(1, outH - 1)) * (tymax - tymin); // row 0 = north, same top-down convention as raster.js
    for (let col = 0; col < outW; col++) {
      const tx = txmin + (col / Math.max(1, outW - 1)) * (txmax - txmin);
      const [sx, sy] = proj4(toDef, fromDef, [tx, ty]);
      if (sx < xmin || sx > xmax || sy < ymin || sy > ymax) continue; // leaves alpha 0
      const px = Math.min(width - 1, Math.max(0, Math.round(((sx - xmin) / (xmax - xmin)) * (width - 1))));
      const py = Math.min(height - 1, Math.max(0, Math.round(((ymax - sy) / (ymax - ymin)) * (height - 1))));
      const si = (py * width + px) * 4, di = (row * outW + col) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  }
  return { bbox: [txmin, tymin, txmax, tymax], width: outW, height: outH, data: out };
}
