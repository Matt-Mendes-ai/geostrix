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
import { arrMin, arrMax } from "./arrayStats.js"; // TASKS.csv #371 — no Math.min/max(...spread)

// TASKS.csv #416 — proj4(fromDef, toDef, point) re-parses BOTH definition strings on every call: 31.5 us
// per point vs 1.76 us with a converter built once (18x). The image/grid warps below call it once per
// output pixel (a 1024x1024 reprojection took 30 s of frozen UI, ~2 min at the 2048 cap), and every
// per-point import path pays it per row. Converters are cached per (from, to) definition pair.
const converterCache = new Map();
function converter(fromDef, toDef) {
  const key = JSON.stringify([fromDef, toDef]);
  let c = converterCache.get(key);
  if (!c) { c = proj4(fromDef, toDef); converterCache.set(key, c); }
  return c;
}

// TASKS.csv #299 — NAD27 datum shift approximation.
//
// proj4js has no NADCON/NTv2 grid-shift support compiled in by default, so "+datum=NAD27" is parsed
// as datum_type 5 (PJD_NODATUM) and NO datum shift is applied at all: measured, a NAD27 lon/lat and
// an NAD83 lon/lat with the SAME numbers produced byte-identical UTM coordinates, where the real
// NAD27→NAD83 difference in BC is ~110 m. That is exactly the population of data these code paths
// exist for (pre-1990s BC assessment-report maps, old claim/survey plans), so a silently 110 m-wrong
// answer is the worst possible outcome.
//
// PARAMETERS AND SOURCE — do not change these without a citation. This is EPSG coordinate operation
// 1179, "NAD27 to WGS 84 (10)":
//   method  : Geocentric translations (geog2D domain), i.e. a 3-parameter Helmert with no rotation
//             or scale — dX = -7 m, dY = +162 m, dZ = +188 m, applied on the Clarke 1866 ellipsoid.
//   extent  : Canada — Alberta and British Columbia (48.25°N–60.01°N, 139.04°W–109.98°W). The Golden
//             Triangle (~56.5°N, 130.5°W) is inside it; this is the closest-fitting published set for
//             this app's actual users, NOT the continental-US one.
//   accuracy: EPSG lists 13 m operation accuracy ("derived at 25 stations; 8 m, 8 m and 6 m in X, Y
//             and Z"). So this is a ~10 m-class approximation, not survey grade.
//   source  : U.S. Defense Mapping Agency TR8350.2, September 1987, as published in the EPSG Geodetic
//             Parameter Dataset — https://epsg.io/1179 (transformation code 1179).
//
// WHY A SINGLE PARAMETER SET FOR THE WHOLE NAD27 SERIES. The real NAD27→NAD83 difference is spatially
// variable, which is why NTv2 grids exist; one Helmert set cannot reproduce it. But the alternative
// published sets for continental North America are close to each other: at 56.5°N 130°W this BC/Alberta
// set gives a 110.6 m shift, EPSG:1172 (Canada mean, -10/158/187) 111.1 m and EPSG:1173 (CONUS,
// -8/160/176) 111.6 m — a ~1 m spread. The outlier is EPSG:1176 (Alaska, -5/135/172) at 99.4 m, ~11 m
// away, so NAD27 data from Alaska (UTM zones 5N–8N reach into the panhandle right next to the Golden
// Triangle) is the one case where this set is meaningfully mis-tuned. Even there, ~11 m of parameter-
// choice error replaces ~110 m of no error correction at all. A per-zone table was rejected because a
// UTM zone does not determine which country/region a point is in (zone 10N is both BC and California),
// so it could not actually make the choice correctly — better one documented, cited assumption than a
// fake-precise lookup.
//
// WHAT THIS IS NOT: a grid shift. EPSG:9112 (NAD27 to NAD83(CSRS)v2, GeoBC's BC_27_98.GSB NTv2 grid)
// is the survey-grade answer at 1.5 m. That is fix option (c) in #299's notes and remains open — it
// needs a licensing/size decision. Every UI that accepts a NAD27 source EPSG must keep saying so.
const NAD27_TO_WGS84_BC = "+towgs84=-7,162,188";

const GEOGRAPHIC = {
  4326: "+proj=longlat +datum=WGS84 +no_defs",
  4269: "+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs",
  // TASKS.csv #299 fix option (b): "+datum=NAD27" is a NO-OP in proj4js — it resolves to
  // datum_type 5 (PJD_NODATUM) because proj4js ships no NADCON/NTv2 grids, so NAD27 input came out
  // byte-identical to NAD83 input, silently ~110 m off in BC. Replaced with an explicit Clarke 1866
  // ellipsoid plus the published geocentric-translation (3-parameter Helmert) approximation — see
  // NAD27_TO_WGS84_BC below for the source and the accuracy this does and does not buy.
  4267: `+proj=longlat +ellps=clrk66 ${NAD27_TO_WGS84_BC} +no_defs`,
};
// TASKS.csv #419 — NAD83(CSRS) codes beyond the UTM zones. They carry the SAME 7-parameter shift to WGS84
// as the NAD83(CSRS) UTM definitions below, so 4617 -> 3156 is a pure projection with no spurious datum
// offset. 4617 is how NRCan's CDEM / HRDEM ship; 3979 is the Canada-wide Atlas Lambert; 3857 is web
// Mercator (tile services, many web exports).
// TASKS.csv #489 fix: this is EPSG:1946 (NAD83(CSRS) to WGS 84 (2), 1 m). Its rotations were written in RADIANS
// with EPSG's coordinate-frame signs (-1.25033e-07, ...), but proj4 reads +towgs84 rotations as ARC-SECONDS in
// the position-vector convention, so they were effectively zero: every CSRS <-> WGS 84 / NAD83 conversion was
// ~0.9 m off. Now arc-seconds with the signs flipped; matches PROJ's EPSG:1946 to 0.0000 m across all 20 codes.
const CSRS_TOWGS84 = "+towgs84=-0.991,1.9072,0.5129,0.0257899075194932,0.0096500989602704,0.0116599432323421,0";
const EXTRA_DEFS = {
  4617: `+proj=longlat +ellps=GRS80 ${CSRS_TOWGS84} +no_defs`,
  3979: `+proj=lcc +lat_0=49 +lon_0=-95 +lat_1=49 +lat_2=77 +x_0=0 +y_0=0 +ellps=GRS80 ${CSRS_TOWGS84} +units=m +no_defs`,
  3857: "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs",
};

// NAD83(CSRS) UTM zones — individually verified against the real EPSG registry (each zone's own definition
// record), not derived from a formula: the codes are an irregular series. BC's 7N–11N first; TASKS.csv #489
// added the rest of Canada (12N–24N), checked against the EPSG database v12.029 (PROJ 9.8).
const NAD83_CSRS_UTM = {
  3154: 7, 3155: 8, 3156: 9, 3157: 10, 2955: 11,
  2956: 12, 2957: 13, 3158: 14, 3159: 15, 3160: 16, 2958: 17, 2959: 18, 2960: 19, 2961: 20, 2962: 21, 3761: 22, 9709: 23, 9713: 24,
};

// TASKS.csv #489 — national CRSs used for mineral exploration outside Canada. Every code, zone and name below
// was checked against the EPSG database (v12.029, via PROJ 9.8 / pyproj 3.8) — codes are NOT a linear series
// in most of these families (e.g. SIRGAS 2000 UTM 23N/24N are 6210/6211, MGA 46/47/59 for GDA94 are
// 6736/6737/6738), so each irregular code is listed explicitly. The same check compared this module's output
// with PROJ's at points across each zone (scripts in TASKS.csv #489's notes).
//   SIRGAS 2000, GDA94, GDA2020, ETRS89, NZGD2000: GRS80 and zero shift to WGS 84, as the EPSG registry's own
//     transformation for each (accuracy 1–3 m: these frames drift from WGS 84 by plate motion, not by datum).
//   SAD69: Brazil's IBGE shift (EPSG:1877, SAD69 to WGS 84 (14): -66.87, 4.37, -38.52; ~5 m in Brazil) on the
//     GRS 1967 Modified ellipsoid. The shift differs by country (EPSG lists 5–26 m ones for Peru, Chile, etc.),
//     so the CRS names say so and SourceCrsField warns (datumNote below).
const GRS80_ZERO = "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0";
const SAD69_BRAZIL = "+ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0";
const SAD69_TAG = "Brazil datum shift, ~5 m";
const REGISTRY = new Map(); // code -> { def, name }
{
  const reg = (code, def, name) => REGISTRY.set(code, { def, name });
  const utm = (zone, south, datum) => `+proj=utm +zone=${zone}${south ? " +south" : ""} ${datum} +units=m +no_defs`;
  const geog = (datum) => `+proj=longlat ${datum} +no_defs`;
  // SIRGAS 2000 (Brazil and Latin America's current frame)
  reg(4674, geog(GRS80_ZERO), "SIRGAS 2000 (longitude / latitude)");
  for (let z = 11; z <= 22; z++) reg(31954 + z, utm(z, false, GRS80_ZERO), `SIRGAS 2000 / UTM zone ${z}N`);
  reg(6210, utm(23, false, GRS80_ZERO), "SIRGAS 2000 / UTM zone 23N");
  reg(6211, utm(24, false, GRS80_ZERO), "SIRGAS 2000 / UTM zone 24N");
  for (let z = 17; z <= 25; z++) reg(31960 + z, utm(z, true, GRS80_ZERO), `SIRGAS 2000 / UTM zone ${z}S`);
  reg(5396, utm(26, true, GRS80_ZERO), "SIRGAS 2000 / UTM zone 26S");
  // SAD69 (older Brazilian / South American data)
  reg(4618, geog(SAD69_BRAZIL), `SAD69 (longitude / latitude) — ${SAD69_TAG}`);
  reg(5463, utm(17, false, SAD69_BRAZIL), `SAD69 / UTM zone 17N — ${SAD69_TAG}`);
  for (let z = 18; z <= 22; z++) reg(29150 + z, utm(z, false, SAD69_BRAZIL), `SAD69 / UTM zone ${z}N — ${SAD69_TAG}`);
  for (let z = 17; z <= 25; z++) reg(29170 + z, utm(z, true, SAD69_BRAZIL), `SAD69 / UTM zone ${z}S — ${SAD69_TAG}`);
  // Australia: MGA is UTM (south) on GDA94 / GDA2020
  reg(4283, geog(GRS80_ZERO), "GDA94 (longitude / latitude)");
  reg(6736, utm(46, true, GRS80_ZERO), "GDA94 / MGA zone 46");
  reg(6737, utm(47, true, GRS80_ZERO), "GDA94 / MGA zone 47");
  for (let z = 48; z <= 58; z++) reg(28300 + z, utm(z, true, GRS80_ZERO), `GDA94 / MGA zone ${z}`);
  reg(6738, utm(59, true, GRS80_ZERO), "GDA94 / MGA zone 59");
  reg(7844, geog(GRS80_ZERO), "GDA2020 (longitude / latitude)");
  for (let z = 46; z <= 59; z++) reg(7800 + z, utm(z, true, GRS80_ZERO), `GDA2020 / MGA zone ${z}`);
  // Europe
  reg(4258, geog(GRS80_ZERO), "ETRS89 (longitude / latitude)");
  for (let z = 28; z <= 37; z++) reg(25800 + z, utm(z, false, GRS80_ZERO), `ETRS89 / UTM zone ${z}N`);
  // New Zealand
  reg(2193, `+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 ${GRS80_ZERO} +units=m +no_defs`, "NZGD2000 / New Zealand Transverse Mercator 2000");
}

// TASKS.csv #489 — a warning for CRSs whose datum shift to WGS 84 is an approximation (null for the rest).
export function datumNote(epsg) {
  const c = Number(epsg);
  if (c === 4267 || (c >= 26701 && c <= 26722)) {
    // #489 sweep against PROJ: within ~12 m of PROJ's local choice in zones 9-12N, ~31 m in 7-8N, up to ~200 m
    // in zones far from western Canada (the shift is a fit for Alberta/BC only).
    return "NAD27 (TASKS.csv #299): an approximate NAD27→NAD83 datum shift is applied (EPSG:1179, a 3-parameter fit for Alberta/BC — typically within ~10 m there). Outside western Canada it can be 30–200 m out. Not survey-grade; that needs a grid-based (NTv2) transform, which GeoStrix doesn't ship yet.";
  }
  if (REGISTRY.get(c)?.def.includes(SAD69_BRAZIL)) {
    return "SAD69: Brazil's IBGE datum shift is applied (EPSG:1877, about 5 m in Brazil). Elsewhere in South America the right shift differs by country and this can be 10–25 m out. Not survey-grade.";
  }
  return null;
}

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
  if (EXTRA_DEFS[code]) return EXTRA_DEFS[code]; // #419
  if (code === 3005) return EPSG_3005_BC_ALBERS;
  const r = REGISTRY.get(code); // #489
  if (r) return r.def;
  if (NAD83_CSRS_UTM[code]) {
    return utmProj4(NAD83_CSRS_UTM[code], false, `+ellps=GRS80 ${CSRS_TOWGS84}`);
  }
  if (code >= 32601 && code <= 32660) return utmProj4(code - 32600, false, "+datum=WGS84"); // WGS84 UTM N
  if (code >= 32701 && code <= 32760) return utmProj4(code - 32700, true, "+datum=WGS84"); // WGS84 UTM S
  if (code >= 26901 && code <= 26923) return utmProj4(code - 26900, false, "+ellps=GRS80 +towgs84=0,0,0,0,0,0,0"); // NAD83 UTM N
  // NAD27 UTM North zones — TASKS.csv #223. Unlike NAD83(CSRS)'s irregular series, this IS a
  // standard, well-documented linear EPSG block (26701 = zone 1N ... 26722 = zone 22N), the same kind
  // of verified-safe-to-formula case the WGS84/NAD83 UTM ranges above already rely on.
  // TASKS.csv #299 — "+datum=NAD27" applied no shift at all here (see NAD27_TO_WGS84_BC above);
  // now carries the cited EPSG:1179 geocentric-translation approximation on the Clarke 1866 ellipsoid.
  if (code >= 26701 && code <= 26722) return utmProj4(code - 26700, false, `+ellps=clrk66 ${NAD27_TO_WGS84_BC}`); // NAD27 UTM N
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
  if (w.includes("CANADA_ATLAS_LAMBERT") && w.includes("CSRS")) return 3979; // #415
  if (w.includes("MERCATOR_AUXILIARY_SPHERE") || w.includes("PSEUDO-MERCATOR") || w.includes("PSEUDO_MERCATOR") || w.includes("WEB_MERCATOR")) return 3857; // #415
  if (w.includes("NEW_ZEALAND_TRANSVERSE_MERCATOR") || w.includes("NZGD_2000_NEW_ZEALAND_TRANSVERSE") || w.includes("NZTM")) return 2193;
  // Geographic-only (GEOGCS with no PROJCS) — the datum name alone decides.
  if (!w.includes("PROJCS")) {
    // #489 — national frames before WGS 84 (their WKT may carry a TOWGS84[...] clause)
    if (w.includes("SIRGAS")) return 4674;
    if (w.includes("SAD_1969") || w.includes("SAD69") || w.includes("SOUTH_AMERICAN_1969")) return 4618;
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
  const [tx, ty] = converter(fromDef, toDef).forward([x, y]);
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
  const [lon, lat] = converter(fromDef, toDef).forward([x, y]);
  return { lon, lat };
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
// #450: satelliteFetch.js warps R, G, B and A in ONE pass instead of four).
// TASKS.csv #487 — opts.nearest: nearest-node sampling instead of bilinear (class grids and imagery, where a
// blend of two values invents one that isn't in the data).
function nearestSample(band, w, h, xmin, ymin, xmax, ymax, x, y) {
  const ex = edgeTol(xmin, xmax), ey = edgeTol(ymin, ymax);
  if (x < xmin - ex || x > xmax + ex || y < ymin - ey || y > ymax + ey || w < 2 || h < 2) return null;
  x = Math.min(xmax, Math.max(xmin, x)); y = Math.min(ymax, Math.max(ymin, y));
  const c = Math.round(((x - xmin) / (xmax - xmin)) * (w - 1)), r = Math.round(((ymax - y) / (ymax - ymin)) * (h - 1));
  return band[r * w + c];
}
export function reprojectGrid({ xmin, ymin, xmax, ymax, gridW, gridH, band, bands }, fromDef, toDef, outW, outH, opts = {}) {
  const sample = opts.nearest ? nearestSample : bilinearSample;
  const corners = [
    [xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax],
  ].map(([x, y]) => converter(fromDef, toDef).forward([x, y]));
  const txs = corners.map((c) => c[0]), tys = corners.map((c) => c[1]);
  const txmin = arrMin(txs), txmax = arrMax(txs);
  const tymin = arrMin(tys), tymax = arrMax(tys);

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
  const corners = [[xmin, ymin], [xmax, ymin], [xmax, ymax], [xmin, ymax]].map(([x, y]) => converter(fromDef, toDef).forward([x, y]));
  const txs = corners.map((c) => c[0]), tys = corners.map((c) => c[1]);
  const txmin = arrMin(txs), txmax = arrMax(txs);
  const tymin = arrMin(tys), tymax = arrMax(tys);

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

// ---------------------------------------------------------------------------------------------
// TASKS.csv #485 — the CRSs this app can actually build (exactly the codes getProj4DefSync knows), by name,
// for the Cartography tab's project-CRS picker and the reprojection tools. Order: most-used first.
const CRS_NAMED = [
  [3156, "NAD83(CSRS) / UTM zone 9N"], [3155, "NAD83(CSRS) / UTM zone 8N"], [3157, "NAD83(CSRS) / UTM zone 10N"],
  [3154, "NAD83(CSRS) / UTM zone 7N"], [2955, "NAD83(CSRS) / UTM zone 11N"],
  [3005, "NAD83 / BC Albers"], [3979, "NAD83(CSRS) / Canada Atlas Lambert"], [3857, "WGS 84 / Pseudo-Mercator (web maps)"],
  [4326, "WGS 84 (longitude / latitude)"], [4269, "NAD83 (longitude / latitude)"], [4617, "NAD83(CSRS) (longitude / latitude)"],
  [4267, "NAD27 (longitude / latitude) — ~10 m datum approximation"],
];
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

export function listSupportedCrs() {
  const out = CRS_NAMED.map(([code, name]) => ({ code, name }));
  const listed = new Set(out.map((c) => c.code));
  // #489 — the rest of the NAD83(CSRS) zones, by zone number, then the national frames
  Object.entries(NAD83_CSRS_UTM).sort((a, b) => a[1] - b[1]).forEach(([code, z]) => { if (!listed.has(Number(code))) out.push({ code: Number(code), name: `NAD83(CSRS) / UTM zone ${z}N` }); });
  for (const [code, e] of REGISTRY) out.push({ code, name: e.name });
  for (let z = 1; z <= 23; z++) out.push({ code: 26900 + z, name: `NAD83 / UTM zone ${z}N` });
  for (let z = 1; z <= 22; z++) out.push({ code: 26700 + z, name: `NAD27 / UTM zone ${z}N — ~10 m datum approximation` });
  for (let z = 1; z <= 60; z++) out.push({ code: 32600 + z, name: `WGS 84 / UTM zone ${z}N` });
  for (let z = 1; z <= 60; z++) out.push({ code: 32700 + z, name: `WGS 84 / UTM zone ${z}S` });
  return out.map((c) => ({ ...c, geographic: /longitude/.test(c.name) }));
}
let crsNameCache = null;
export function crsName(epsg) {
  if (!crsNameCache) crsNameCache = new Map(listSupportedCrs().map((c) => [c.code, c.name]));
  return crsNameCache.get(Number(epsg)) || null;
}
// (x, y) in fromEpsg -> [x, y] in toEpsg, with one cached converter; null if either code is unknown.
export function pointTransform(fromEpsg, toEpsg) {
  const fromDef = getProj4DefSync(fromEpsg), toDef = getProj4DefSync(toEpsg);
  if (!fromDef || !toDef) return null;
  const c = converter(fromDef, toDef);
  return (x, y) => c.forward([x, y]);
}
// TASKS.csv #485 / #490 — a grid bearing (azimuth / dip direction, degrees from the SOURCE grid's north) at
// source point (x, y), re-expressed against the target grid's north: rebuilt from two transformed points 10 m
// apart, so it carries the full convergence difference (a few degrees between neighbouring UTM zones, ~0 for
// a datum change inside one zone). T is a pointTransform(). Rounded to 0.01°; non-finite input is returned.
export function turnGridBearing(T, x, y, a) {
  if (!T || !Number.isFinite(a) || !Number.isFinite(x) || !Number.isFinite(y)) return a;
  const r = a * Math.PI / 180, [x0, y0] = T(x, y), [x1, y1] = T(x + 10 * Math.sin(r), y + 10 * Math.cos(r));
  const out = ((Math.atan2(x1 - x0, y1 - y0) * 180 / Math.PI) % 360 + 360) % 360;
  return Math.round(out * 100) / 100 % 360;
}
// signed change (degrees, -180..180) from bearing a to bearing b
export const bearingTurn = (a, b) => ((b - a + 540) % 360) - 180;
