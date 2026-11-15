// TASKS.csv #3590 (startup trim) — the .prj matching, the raster resampling and reprojection, and the UTM-neighbour list moved out of reproject.js verbatim: the startup chunk carries every export a lazily-loaded
// module imports from a module it also loads, so what only lazy code uses lives in its own file. reproject.js is unchanged otherwise.
import { NAD83_CSRS_UTM, REGISTRY, converter, crsName, getProj4DefSync, listSupportedCrs } from "./reproject.js";

// TASKS.csv #223 (QGIS-specialist audit finding: shapefile import ignores the .prj sidecar entirely,
// so an incorrectly-assumed CRS silently propagates) — a best-effort .prj (WKT) sniffer, not a real WKT
// parser. Scoped to exactly the same set of CRSes getProj4DefSync above already recognizes, matching
// this whole module's deliberate "narrow, verified coverage over the full registry" approach: this
// pattern-matches on the well-known human-readable names common GIS tools (ArcGIS, QGIS) actually write
// into a .prj's PROJCS/GEOGCS/DATUM names (e.g. "NAD_1983_UTM_Zone_10N", "GCS_WGS_1984",
// "British_Columbia_Albers") rather than fully parsing the WKT grammar. Returns null (not a guess) if
// nothing recognizable matches — same "can't help, here's why" fallback as everything else here; a
// wrong auto-detected EPSG would be worse than the status quo of asking the user to enter it manually.
// TASKS.csv #727 — a NAME match is only accepted when the .prj's own projection, parameters and linear unit agree
// with the matched code's definition (what QGIS / PROJ match on): a "NAD_1983_UTM_Zone_10N" carrying zone 9's
// central meridian, or a UTM name in US feet, is refused (null: the user picks the CRS) rather than read as zone 10
// metres. Only parameters both sides state are compared. An explicit EPSG authority code (#419) is still trusted.
const PRJ_PARAM_KEYS = { CENTRALMERIDIAN: "lon0", LONGITUDEOFCENTER: "lon0", LONGITUDEOFORIGIN: "lon0", FALSEEASTING: "x0", FALSENORTHING: "y0", SCALEFACTOR: "k", LATITUDEOFORIGIN: "lat0", LATITUDEOFCENTER: "lat0", STANDARDPARALLEL1: "lat1", STANDARDPARALLEL2: "lat2" };
const PRJ_FAMILY = [[/TRANSVERSE_MERCATOR|GAUSS_KRUGER/, ["utm", "tmerc"]], [/ALBERS/, ["aea"]], [/LAMBERT_CONFORMAL_CONIC/, ["lcc"]], [/MERCATOR/, ["merc"]]];
export function prjParamsMismatch(wkt, code) {
  const def = getProj4DefSync(code);
  const w = String(wkt || "").toUpperCase();
  if (!def || !w.includes("PROJCS")) return null; // geographic: the datum name decided, nothing to cross-check
  const proj = /\+proj=(\w+)/.exec(def)?.[1];
  const num = (k) => { const m = new RegExp(`\\+${k}=(-?[\\d.eE+-]+)`).exec(def); return m ? Number(m[1]) : null; };
  const zone = num("zone");
  const exp = proj === "utm" ? { lon0: -183 + 6 * zone, x0: 500000, y0: /\+south/.test(def) ? 10000000 : 0, k: 0.9996, lat0: 0 }
    : { lon0: num("lon_0"), x0: num("x_0"), y0: num("y_0"), k: num("k") ?? num("k_0"), lat0: num("lat_0"), lat1: num("lat_1"), lat2: num("lat_2") };
  const expUnit = /\+units=us-ft/.test(def) ? 0.3048006096012192 : /\+units=ft/.test(def) ? 0.3048 : num("to_meter") ?? 1;
  const projName = /PROJECTION\[\s*"([^"]+)"/.exec(w)?.[1];
  if (projName) {
    const fam = PRJ_FAMILY.find(([re]) => re.test(projName));
    if (fam && !fam[1].includes(proj)) return `projection ${projName} is not ${proj}`;
  }
  const lastParam = w.lastIndexOf("PARAMETER[");
  const unitM = lastParam >= 0 ? /UNIT\[\s*"[^"]*"\s*,\s*([\d.eE+-]+)/.exec(w.slice(lastParam)) : null;
  const unit = unitM ? Number(unitM[1]) : 1;
  if (Math.abs(unit / expUnit - 1) > 1e-6) return `linear unit ${unit} m, not ${expUnit}`;
  for (const m of w.matchAll(/PARAMETER\[\s*"([^"]+)"\s*,\s*(-?[\d.eE+-]+)\s*\]/g)) {
    const key = PRJ_PARAM_KEYS[m[1].replace(/[^A-Z0-9]/g, "")];
    if (!key || exp[key] == null) continue;
    let v = Number(m[2]);
    if (key === "x0" || key === "y0") v *= unit; // false easting / northing are in the file's linear unit
    const tol = key === "x0" || key === "y0" ? 0.01 : key === "k" ? 1e-7 : 1e-6;
    if (!(Math.abs(v - exp[key]) <= tol)) return `${m[1]} ${v} vs ${exp[key]}`;
  }
  return null;
}
export function guessEpsgFromPrjWkt(wkt) {
  const auth = /(?:AUTHORITY|ID)\[\s*"EPSG"/i.test(String(wkt || ""));
  const code = guessEpsgFromPrjName(wkt);
  if (!code) return null;
  if (auth && code === guessEpsgFromAuthority(wkt)) return code; // #419: the file says its code
  return prjParamsMismatch(wkt, code) ? null : code;
}
// TASKS.csv #1243 — a .prj that was read and refused is not "no CRS in file". -> "NAD_1983_UTM_Zone_10N: Central_Meridian -129 vs -123", or null with no .prj or an accepted one
export function prjRefusal(wkt) {
  if (!wkt || guessEpsgFromPrjWkt(wkt)) return null;
  const name = /(?:PROJCS|GEOGCS|PROJCRS|GEOGCRS)\[\s*"([^"]+)"/i.exec(wkt)?.[1] || "unnamed";
  const code = guessEpsgFromPrjName(wkt), why = code ? prjParamsMismatch(wkt, code) : null;
  return why ? `${name}: ${why}` : name;
}
function guessEpsgFromAuthority(wkt) {
  const auth = [...String(wkt).toUpperCase().matchAll(/(?:AUTHORITY|ID)\[\s*"EPSG"\s*,\s*"?(\d{4,5})"?\s*\]/g)].map((m) => Number(m[1]));
  return auth.length && getProj4DefSync(auth[auth.length - 1]) ? auth[auth.length - 1] : null;
}
function guessEpsgFromPrjName(wkt) {
  if (!wkt || typeof wkt !== "string") return null;
  const w = wkt.toUpperCase();
  // TASKS.csv #419 — an explicit EPSG code wins over name-sniffing. In WKT1 the outermost CRS's
  // AUTHORITY is the LAST one in the string (inner ones belong to the datum, ellipsoid, units...), and
  // WKT2 writes ID["EPSG",n]. Only a code this module can actually use is returned.
  const auth = [...w.matchAll(/(?:AUTHORITY|ID)\[\s*"EPSG"\s*,\s*"?(\d{4,5})"?\s*\]/g)].map((m) => Number(m[1]));
  if (auth.length && getProj4DefSync(auth[auth.length - 1])) return auth[auth.length - 1];
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
      // #489 — national frames first: their WKT often also carries a TOWGS84[...] clause, which the
      // WGS 84 test below would otherwise match.
      const fromRegistry = (prefix, suffix) => {
        for (const [code, e] of REGISTRY) if (e.name.startsWith(`${prefix} / UTM zone ${zone}${suffix}`)) return code;
        return null;
      };
      if (w.includes("SIRGAS")) return fromRegistry("SIRGAS 2000", south ? "S" : "N");
      if (w.includes("SAD_1969") || w.includes("SAD69") || w.includes("SOUTH_AMERICAN_1969")) return fromRegistry("SAD69", south ? "S" : "N");
      if (w.includes("ETRS")) return south ? null : fromRegistry("ETRS89", "N");
      if (w.includes("CSRS")) {
        // CSRS codes are an irregular series (see NAD83_CSRS_UTM above) — an unlisted zone is null, not a guess.
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
  // #489 — Australian MGA and New Zealand TM names carry no "UTM_Zone"
  const mga = w.match(/MGA[_ ]ZONE[_ ]?(\d{2})/);
  if (mga) {
    const zone = Number(mga[1]);
    const prefix = w.includes("2020") ? "GDA2020" : w.includes("GDA_1994") || w.includes("GDA94") ? "GDA94" : null;
    for (const [code, e] of REGISTRY) if (prefix && e.name === `${prefix} / MGA zone ${zone}`) return code;
    return null;
  }
  // TASKS.csv #2155 — the Australian Map Grid on AGD84 / AGD66 (AGD_1984_AMG_Zone_51)
  const amg = w.match(/AMG[_ ]ZONE[_ ]?(\d{2})/);
  if (amg) {
    const zone = Number(amg[1]);
    const prefix = /AGD_?1984|AGD84|AUSTRALIAN_1984/.test(w) ? "AGD84" : /AGD_?1966|AGD66|AUSTRALIAN_1966/.test(w) ? "AGD66" : null;
    for (const [code, e] of REGISTRY) if (prefix && e.name === `${prefix} / AMG zone ${zone}`) return code;
    return null;
  }
  if (w.includes("CANADA_ATLAS_LAMBERT") && w.includes("CSRS")) return 3979; // #415
  if (w.includes("MERCATOR_AUXILIARY_SPHERE") || w.includes("PSEUDO-MERCATOR") || w.includes("PSEUDO_MERCATOR") || w.includes("WEB_MERCATOR")) return 3857; // #415
  if (w.includes("NEW_ZEALAND_TRANSVERSE_MERCATOR") || w.includes("NZGD_2000_NEW_ZEALAND_TRANSVERSE") || w.includes("NZTM")) return 2193;
  // TASKS.csv #3128 — Finland's and Sweden's national grids as ESRI / QGIS name them ("ETRS89_TM35FIN_E_N", "ETRS_1989_TM35FIN_E_N",
  // "SWEREF99_TM"), with no EPSG code in the file; the parameters are still checked against the definition (prjParamsMismatch)
  if (/TM35FIN/.test(w)) return 3067;
  if (/SWEREF_?99[_ ]TM\b/.test(w)) return 3006;
  // Geographic-only (GEOGCS with no PROJCS) — the datum name alone decides.
  if (!w.includes("PROJCS")) {
    // #489 — national frames before WGS 84 (their WKT may carry a TOWGS84[...] clause)
    if (w.includes("SIRGAS")) return 4674;
    if (w.includes("SAD_1969") || w.includes("SAD69") || w.includes("SOUTH_AMERICAN_1969")) return 4618;
    if (/AUSTRALIAN_1984|AGD_?1984|AGD84/.test(w)) return 4203; // #2155
    if (/AUSTRALIAN_1966|AGD_?1966|AGD66/.test(w)) return 4202;
    if (w.includes("GDA2020")) return 7844;
    if (w.includes("GDA_1994") || w.includes("GDA94")) return 4283;
    if (w.includes("ETRS")) return 4258;
    if (w.includes("CSRS")) return 4617; // #415 — NAD83(CSRS) lon/lat (NRCan CDEM), before plain NAD83
    if (w.includes("WGS_1984") || w.includes("WGS84")) return 4326;
    // GEOGCS datum names spell it out in full ("D_North_American_1983"/"GCS_North_American_1983"),
    // unlike a PROJCS's UTM-zone name which abbreviates to "NAD_1983" — check both spellings.
    if (w.includes("NAD_1983") || w.includes("NAD83") || w.includes("NORTH_AMERICAN_1983")) return 4269;
    if (w.includes("NAD_1927") || w.includes("NAD27") || w.includes("NORTH_AMERICAN_1927")) return 4267;
  }
  return null;
}

// Bilinear-sample a regular row-major grid (row 0 = the NORTH/ymax edge, same convention raster.js
// and ViewerModule's sampleTerrainElevation already use) at a real-world (x, y) point. Returns null
// if (x, y) is outside the grid's bbox (caller decides the fallback — e.g. try the next tile).
// TASKS.csv #487 — a point a rounding error outside the grid (an edge node after a there-and-back
// transform lands ~1e-10 outside) is clamped onto the edge, not dropped as nodata.
const edgeTol = (a, b) => 1e-9 * Math.max(1, Math.abs(b - a));
export function bilinearSample(band, w, h, xmin, ymin, xmax, ymax, x, y) {
  const ex = edgeTol(xmin, xmax), ey = edgeTol(ymin, ymax);
  if (x < xmin - ex || x > xmax + ex || y < ymin - ey || y > ymax + ey || w < 2 || h < 2) return null;
  x = Math.min(xmax, Math.max(xmin, x)); y = Math.min(ymax, Math.max(ymin, y));
  const fx = ((x - xmin) / (xmax - xmin)) * (w - 1);
  const fyTop = ((ymax - y) / (ymax - ymin)) * (h - 1); // row 0 = north
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx))), x1 = x0 + 1;
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(fyTop))), y1 = y0 + 1;
  const tx = fx - x0, ty = fyTop - y0;
  const v00 = band[y0 * w + x0], v10 = band[y0 * w + x1], v01 = band[y1 * w + x0], v11 = band[y1 * w + x1];
  const top = v00 + (v10 - v00) * tx, bot = v01 + (v11 - v01) * tx;
  return top + (bot - top) * ty;
}

// TASKS.csv #2983 (WA iron review) — bilinearSample is NaN as soon as ONE of its four corners is NaN, so every reprojection of a grid with
// no-data cells ate one node off each no-data edge: GDA94 -> GDA2020 -> GDA94 (the same definition, an identity) left a soil grid with
// 12,455 of its 17,479 cells and the terrain without 22 % of its ground. Here the finite corners are averaged with their bilinear weights,
// as long as the NEAREST corner is finite (so a no-data edge stays where it was, half a cell either way, instead of growing or shrinking).
export function bilinearSampleNaN(band, w, h, xmin, ymin, xmax, ymax, x, y) {
  const ex = edgeTol(xmin, xmax), ey = edgeTol(ymin, ymax);
  if (x < xmin - ex || x > xmax + ex || y < ymin - ey || y > ymax + ey || w < 2 || h < 2) return null;
  x = Math.min(xmax, Math.max(xmin, x)); y = Math.min(ymax, Math.max(ymin, y));
  const fx = ((x - xmin) / (xmax - xmin)) * (w - 1);
  const fyTop = ((ymax - y) / (ymax - ymin)) * (h - 1);
  const x0 = Math.max(0, Math.min(w - 2, Math.floor(fx))), x1 = x0 + 1;
  const y0 = Math.max(0, Math.min(h - 2, Math.floor(fyTop))), y1 = y0 + 1;
  const tx = fx - x0, ty = fyTop - y0;
  const v = [band[y0 * w + x0], band[y0 * w + x1], band[y1 * w + x0], band[y1 * w + x1]];
  const wt = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
  let nearest = 0;
  for (let k = 1; k < 4; k++) if (wt[k] > wt[nearest]) nearest = k;
  if (!Number.isFinite(v[nearest])) return NaN;
  let s = 0, sw = 0;
  for (let k = 0; k < 4; k++) if (Number.isFinite(v[k])) { s += v[k] * wt[k]; sw += wt[k]; }
  return sw > 0 ? s / sw : NaN;
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
// TASKS.csv #450 — GDAL-style approximate transformer for the per-pixel inverse projection. Along each
// output row the source coordinates are projected exactly every APPROX_STEP pixels and linearly
// interpolated in between; each span is checked at its midpoint against an exact projection, and a span
// whose error exceeds the tolerance (source units; callers pass 1/8 of a source pixel), or that touches a
// non-finite result, is projected exactly pixel by pixel instead. Over the few-km to one-degree extents
// this app warps, UTM <-> geographic is smooth enough that nearly every span passes, which cuts the proj4
// calls per row by ~8x. Returns a function(ty) that fills and returns that row's { sx, sy }.
const APPROX_STEP = 16;
function rowInverse(inv, txmin, txmax, outW, tolX, tolY) {
  const sx = new Float64Array(outW), sy = new Float64Array(outW);
  const txAt = (col) => txmin + (col / Math.max(1, outW - 1)) * (txmax - txmin);
  const exact = (col, ty) => { const p = inv.forward([txAt(col), ty]); sx[col] = p[0]; sy[col] = p[1]; };
  return (ty) => {
    if (outW <= APPROX_STEP * 2) { for (let c = 0; c < outW; c++) exact(c, ty); return { sx, sy }; }
    exact(0, ty);
    for (let c0 = 0; c0 < outW - 1;) {
      const c1 = Math.min(outW - 1, c0 + APPROX_STEP);
      exact(c1, ty);
      const n = c1 - c0;
      if (n > 1) {
        const cm = (c0 + c1) >> 1, f = (cm - c0) / n;
        const [mx, my] = inv.forward([txAt(cm), ty]);
        const ok = Number.isFinite(sx[c0]) && Number.isFinite(sx[c1]) && Number.isFinite(mx) && Number.isFinite(my) &&
          Math.abs(sx[c0] + (sx[c1] - sx[c0]) * f - mx) <= tolX && Math.abs(sy[c0] + (sy[c1] - sy[c0]) * f - my) <= tolY;
        if (ok) {
          const dx = (sx[c1] - sx[c0]) / n, dy = (sy[c1] - sy[c0]) / n;
          for (let k = 1; k < n; k++) { sx[c0 + k] = sx[c0] + dx * k; sy[c0 + k] = sy[c0] + dy * k; }
        } else {
          for (let k = c0 + 1; k < c1; k++) exact(k, ty);
        }
      }
      c0 = c1;
    }
    return { sx, sy };
  };
}

// `band` (one array -> `elevations`) or `bands` (several same-shaped channels -> `bandsOut`; TASKS.csv
// #450: imagery warps R, G, B and A in ONE pass instead of four).
// TASKS.csv #487 — opts.nearest: nearest-node sampling instead of bilinear (class grids and imagery, where a
// blend of two values invents one that isn't in the data).
function nearestSample(band, w, h, xmin, ymin, xmax, ymax, x, y) {
  const ex = edgeTol(xmin, xmax), ey = edgeTol(ymin, ymax);
  if (x < xmin - ex || x > xmax + ex || y < ymin - ey || y > ymax + ey || w < 2 || h < 2) return null;
  x = Math.min(xmax, Math.max(xmin, x)); y = Math.min(ymax, Math.max(ymin, y));
  const c = Math.round(((x - xmin) / (xmax - xmin)) * (w - 1)), r = Math.round(((ymax - y) / (ymax - ymin)) * (h - 1));
  return band[r * w + c];
}
// TASKS.csv #559 — the target-CRS extent of a source rectangle, from points ALONG its edges, not just its 4 corners. In
// Transverse Mercator a parallel bows away from the corners' line, so a geographic tile straddling the central meridian
// has its true southern edge below the corners' lowest y: a corner-only box cropped it (4326 -> UTM 9N at 56-57 N:
// 113 m for a 1-degree tile, 451 m for 2 degrees, 1.8 km for 4). Same edge sampling gdalwarp does.
export function projectedBounds(fromDef, toDef, xmin, ymin, xmax, ymax, perEdge = 32) {
  const fwd = converter(fromDef, toDef);
  let txmin = Infinity, tymin = Infinity, txmax = -Infinity, tymax = -Infinity;
  const add = (x, y) => {
    const [tx, ty] = fwd.forward([x, y]);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
    if (tx < txmin) txmin = tx; if (tx > txmax) txmax = tx; if (ty < tymin) tymin = ty; if (ty > tymax) tymax = ty;
  };
  for (let i = 0; i <= perEdge; i++) {
    const f = i / perEdge, x = xmin + f * (xmax - xmin), y = ymin + f * (ymax - ymin);
    add(x, ymin); add(x, ymax); add(xmin, y); add(xmax, y);
  }
  return [txmin, tymin, txmax, tymax];
}

export function reprojectGrid({ xmin, ymin, xmax, ymax, gridW, gridH, band, bands }, fromDef, toDef, outW, outH, opts = {}) {
  const sample = opts.nearest ? nearestSample : opts.nanAware ? bilinearSampleNaN : bilinearSample; // nanAware: #2983
  const [txmin, tymin, txmax, tymax] = projectedBounds(fromDef, toDef, xmin, ymin, xmax, ymax); // #559 — edges, not corners

  const srcBands = bands || [band];
  const outs = srcBands.map(() => new Float32Array(outW * outH));
  const inv = converter(toDef, fromDef); // #416 — once, not per pixel
  const row2src = rowInverse(inv, txmin, txmax, outW, (xmax - xmin) / Math.max(1, gridW - 1) / 8, (ymax - ymin) / Math.max(1, gridH - 1) / 8); // #450
  for (let row = 0; row < outH; row++) {
    const ty = tymax - (row / Math.max(1, outH - 1)) * (tymax - tymin); // row 0 = north
    const { sx, sy } = row2src(ty);
    for (let col = 0; col < outW; col++) {
      for (let b = 0; b < srcBands.length; b++) {
        const v = sample(srcBands[b], gridW, gridH, xmin, ymin, xmax, ymax, sx[col], sy[col]);
        outs[b][row * outW + col] = v === null ? NaN : v;
      }
    }
  }
  const res = { bbox: [txmin, tymin, txmax, tymax], gridW: outW, gridH: outH };
  return bands ? { ...res, bandsOut: outs } : { ...res, elevations: outs[0] };
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
  const [txmin, tymin, txmax, tymax] = projectedBounds(fromDef, toDef, xmin, ymin, xmax, ymax); // #559 — edges, not corners

  const out = new Uint8ClampedArray(outW * outH * 4);
  const inv = converter(toDef, fromDef); // #416 — once, not per pixel
  const row2src = rowInverse(inv, txmin, txmax, outW, (xmax - xmin) / Math.max(1, width - 1) / 8, (ymax - ymin) / Math.max(1, height - 1) / 8); // #450
  for (let row = 0; row < outH; row++) {
    const ty = tymax - (row / Math.max(1, outH - 1)) * (tymax - tymin); // row 0 = north, same top-down convention as raster.js
    const rowSrc = row2src(ty);
    for (let col = 0; col < outW; col++) {
      const sx = rowSrc.sx[col], sy = rowSrc.sy[col];
      if (sx < xmin || sx > xmax || sy < ymin || sy > ymax) continue; // leaves alpha 0
      const px = Math.min(width - 1, Math.max(0, Math.round(((sx - xmin) / (xmax - xmin)) * (width - 1))));
      const py = Math.min(height - 1, Math.max(0, Math.round(((ymax - sy) / (ymax - ymin)) * (height - 1))));
      const si = (py * width + px) * 4, di = (row * outW + col) * 4;
      out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2]; out[di + 3] = data[si + 3];
    }
  }
  return { bbox: [txmin, tymin, txmax, tymax], width: outW, height: outH, data: out };
}
// TASKS.csv #614 — the same CRS family one or two UTM zones east/west of epsg (same datum, same hemisphere):
// the codes whose proj4 definition differs from epsg's only in +zone=. [] for anything that isn't UTM.
export function neighbourUtmZones(epsg, reach = 1) {
  const def = getProj4DefSync(epsg);
  const m = def && /\+proj=utm\b.*?\+zone=(\d+)/.exec(def);
  if (!m) return [];
  const zone = Number(m[1]);
  const out = [];
  for (let d = 1; d <= reach; d++) {
    for (const z of [zone - d, zone + d]) {
      if (z < 1 || z > 60) continue;
      const want = def.replace(/\+zone=\d+/, `+zone=${z}`);
      // several families can share a definition (NAD83 and SIRGAS 2000 are both GRS80 with no shift): keep the same name
      const same = listSupportedCrs().filter((c) => getProj4DefSync(c.code) === want);
      const family = (crsName(epsg) || "").split(" / ")[0];
      const hit = same.find((c) => c.name.split(" / ")[0] === family) || same[0];
      if (hit) out.push({ code: hit.code, name: hit.name, zone: z });
    }
  }
  return out;
}
