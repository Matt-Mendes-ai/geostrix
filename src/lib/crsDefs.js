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
// TASKS.csv #4084 — the definition tables and every lookup that needs no maths: the part of this module the first screen uses (the status bar's CRS name, 'is this project metric'). The transform maths, which carries proj4 (about 130 kB),
// is in reproject.js, which re-exports all of this: only code that loads on use imports it, so proj4 is no longer in the startup bundle.
import { t as tr } from "./i18n.js"; // TASKS.csv #786 — messages in the interface language

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
export const NAD83_CSRS_UTM = {
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
// #2458 — the same null shift to WGS 84, tagged so a GDA94 <-> GDA2020 pair takes EPSG:8048 (gdaPair above)
export const GDA94 = `${GRS80_ZERO} +title=GDA94`, GDA2020 = `${GRS80_ZERO} +title=GDA2020`;
const SAD69_BRAZIL = "+ellps=aust_SA +towgs84=-66.87,4.37,-38.52,0,0,0,0";
const SAD69_TAG = "Brazil datum shift, ~5 m";
const AGD84_SHIFT = "+ellps=aust_SA +towgs84=-117.763,-51.51,139.061,0.292,0.443,0.277,-0.191"; // #2155 — EPSG:1280 / 1669
const AGD66_SHIFT = "+ellps=aust_SA +towgs84=-117.808,-51.536,137.784,0.303,0.446,0.234,-0.29"; // #2155 — EPSG:15979
export const REGISTRY = new Map(); // code -> { def, name }
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
  reg(4283, geog(GDA94), "GDA94 (longitude / latitude)"); // GDA94 / GDA2020 tags: #2458
  reg(6736, utm(46, true, GDA94), "GDA94 / MGA zone 46");
  reg(6737, utm(47, true, GDA94), "GDA94 / MGA zone 47");
  for (let z = 48; z <= 58; z++) reg(28300 + z, utm(z, true, GDA94), `GDA94 / MGA zone ${z}`);
  reg(6738, utm(59, true, GDA94), "GDA94 / MGA zone 59");
  reg(7844, geog(GDA2020), "GDA2020 (longitude / latitude)");
  for (let z = 46; z <= 59; z++) reg(7800 + z, utm(z, true, GDA2020), `GDA2020 / MGA zone ${z}`);
  // TASKS.csv #2155 (WA drillhole review) — older Australian data on AGD84 / AGD66, the Australian Map Grid (AMG). The Australian National
  // Spheroid with EPSG's national datum shifts, read from PROJ's own database (QGIS 3.30 proj.db): AGD84 to GDA94 (2), EPSG:1280, 1 m (the
  // same parameters as AGD84 to WGS 84 (7), EPSG:1669); AGD66 to GDA94 (12), EPSG:15979, 3 m. EPSG gives them as coordinate-frame
  // rotations; +towgs84 takes position-vector signs, so the rotations are negated. Checked against PROJ 9.1 (cs2cs, its grid-based best
  // path): AGD84 AMG 51 (400000, 6800000) lands within 0.6 m of PROJ. Zones as EPSG keeps them current (AGD84 49-56, AGD66 49-58).
  reg(4203, geog(AGD84_SHIFT), "AGD84 (longitude / latitude)");
  for (let z = 49; z <= 56; z++) reg(20300 + z, utm(z, true, AGD84_SHIFT), `AGD84 / AMG zone ${z}`);
  reg(4202, geog(AGD66_SHIFT), "AGD66 (longitude / latitude)");
  for (let z = 49; z <= 58; z++) reg(20200 + z, utm(z, true, AGD66_SHIFT), `AGD66 / AMG zone ${z}`);
  // Europe
  reg(4258, geog(GRS80_ZERO), "ETRS89 (longitude / latitude)");
  for (let z = 28; z <= 37; z++) reg(25800 + z, utm(z, false, GRS80_ZERO), `ETRS89 / UTM zone ${z}N`);
  // TASKS.csv #3128 — the Nordic national grids are UTM on ETRS89 frames (EPSG v12.029 / PROJ 9.8.1, the same definitions as
  // epsgRegistry.json): Finland's TM35FIN is UTM zone 35 extended over the whole country, Sweden's SWEREF99 TM is UTM zone 33. Listed here
  // so they work before the full registry loads (a Finnish .prj or a sample opened at startup found no 3067).
  reg(3067, utm(35, false, GRS80_ZERO), "EUREF-FIN / TM35FIN(E,N)");
  reg(3006, utm(33, false, GRS80_ZERO), "SWEREF99 TM");
  // New Zealand
  reg(2193, `+proj=tmerc +lat_0=0 +lon_0=173 +k=0.9996 +x_0=1600000 +y_0=10000000 ${GRS80_ZERO} +units=m +no_defs`, "NZGD2000 / New Zealand Transverse Mercator 2000");
}

// TASKS.csv #489 — a warning for CRSs whose datum shift to WGS 84 is an approximation (null for the rest).
export function datumNote(epsg) {
  const c = Number(epsg);
  if (c === 4267 || (c >= 26701 && c <= 26722)) {
    // TASKS.csv #299 — the shift itself. #489 sweep against PROJ: within ~12 m of PROJ's local choice in zones 9-12N, ~31 m in 7-8N, up to ~200 m
    // in zones far from western Canada (the shift is a fit for Alberta/BC only).
    return tr("NAD27: an approximate NAD27→NAD83 datum shift is applied (EPSG:1179, a 3-parameter fit for Alberta/BC, typically within ~10 m there; EPSG's own fits for other regions differ from it by about 5-31 m). Not survey-grade: that needs a grid-based (NTv2) transform, which GeoStrix doesn't ship yet."); // #973 — figures from the EPSG parameter sets 1172 / 1173 / 1174 against 1179
  }
  // #834 — a code from the EPSG registry (not hand-verified): what EPSG says about its datum shift
  const f = !handDef(c) && fullEntry(c);
  if (f) {
    const [name, , acc, flags] = f, notes = [];
    if (acc === null) notes.push(tr("{name}: EPSG publishes no datum shift to WGS 84 for this datum, so GeoStrix treats it as WGS 84 when converting to another datum, which can be metres to hundreds of metres out. Data already in this CRS is unaffected.", { name }));
    else if (acc > 5) notes.push(tr("{name}: the datum shift to WGS 84 is accurate to about {acc} m (EPSG).", { name, acc }));
    if (flags & 2) notes.push(tr("The shift is published for part of this CRS's area only."));
    if (flags & 1) notes.push(tr("A more accurate grid-based shift exists, which GeoStrix doesn't include yet."));
    return notes.length ? notes.join(" ") : null;
  }
  // #2155 — AGD: a national 7-parameter fit, not the NTv2 grids PROJ prefers
  if (REGISTRY.get(c)?.def.includes(AGD84_SHIFT)) return tr("AGD84: EPSG's national datum shift is applied (EPSG:1280, about 1 m). The NTv2 grid is more accurate and is not included.");
  if (REGISTRY.get(c)?.def.includes(AGD66_SHIFT)) return tr("AGD66: EPSG's national datum shift is applied (EPSG:15979, about 3 m). The NTv2 grid and the state fits are more accurate and are not included.");
  if (REGISTRY.get(c)?.def.includes(SAD69_BRAZIL)) {
    return tr("SAD69: Brazil's IBGE datum shift is applied (EPSG:1877, about 5 m in Brazil); elsewhere in South America it can be 10–25 m out. Not survey-grade.");
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
// TASKS.csv #834 — Matt: "Do option 2, that way we can have a more complete registry". Beyond the hand-verified codes
// above and below (which keep priority and their own notes), the whole EPSG registry: every projected and geographic
// 2D CRS that proj4js reproduces PROJ for (src/lib/epsgRegistry.json, 5,810 codes, EPSG v12.029 via PROJ 9.8.1:
// scripts/epsg/gen-epsg-registry.py then verify-epsg-registry.mjs, which keeps a code only when proj4js matches PROJ
// within 5 cm for its projection and 10 cm with its datum shift at three points of its area of use). Each entry is
// [name, proj4, shift accuracy in m (0 none needed, -1 not stated, null no published shift), flags (1 a better
// grid-based shift exists, 2 the shift is published for part of the area), area of use [west, south, east, north]
// (#835; east < west crosses 180 degrees)]. ~1.2 MB, so it loads on demand (its own
// chunk, never at startup): loadEpsgRegistry(); the synchronous lookups see it once loaded.
let FULL = null, fullPromise = null;
const fullListeners = new Set();
export const epsgRegistryLoaded = () => !!FULL;
export function loadEpsgRegistry() {
  if (FULL) return Promise.resolve(FULL);
  if (!fullPromise) {
    fullPromise = import("./epsgRegistry.json").then((m) => installEpsgRegistry(m.default || m)).catch((e) => { fullPromise = null; throw e; });
  }
  return fullPromise;
}
// the loaded table goes in here (also used by the tests: Node imports JSON differently from the bundler)
export function installEpsgRegistry(reg) {
  FULL = reg;
  crsNameCache = null; listCache = null;
  fullListeners.forEach((fn) => { try { fn(); } catch { /* a listener's own problem */ } });
  return FULL;
}
export function onEpsgRegistry(fn) { fullListeners.add(fn); return () => fullListeners.delete(fn); }
const fullEntry = (code) => FULL?.codes?.[String(code)] || null;
// #835 — what the registry knows about a code it supplies (null for hand-verified codes and before it loads):
// { area: [w, s, e, n], acc, flags, geographic }
export function registryInfo(epsg) {
  const c = Number(epsg), f = !handDef(c) && fullEntry(c);
  return f ? { area: f[4] || null, acc: f[2], flags: f[3], geographic: f[1].startsWith("+proj=longlat") } : null;
}
// EPSG's area of use for any code the registry also holds, hand-verified ones included (#835)
export const crsAreaOf = (epsg) => fullEntry(Number(epsg))?.[4] || null;
// every registry code, for the location search (#835)
export const registryCodes = () => (FULL ? Object.keys(FULL.codes).map(Number) : []);

export function getProj4DefSync(epsg) {
  const code = Number(epsg);
  if (!Number.isFinite(code)) return null;
  return handDef(code) || fullEntry(code)?.[1] || null;
}

// TASKS.csv #1036 (review #1016) — geographic (degrees) from the definition, not the name: only the hand-verified
// codes say "longitude", so the 595 registry datums (NAD83(2011), ED50, TWD97 ...) were rounded like metres
export function isGeographicCrs(epsg) {
  return /\+proj=longlat(\s|$)/.test(getProj4DefSync(epsg) || "");
}

// the hand-verified definitions (#223 / #299 / #419 / #489)
function handDef(code) {
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
  const d = getProj4DefSync(epsg);
  if (d || !Number.isFinite(Number(epsg))) return d;
  try { await loadEpsgRegistry(); } catch { return null; } // #834
  return getProj4DefSync(epsg);
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

let listCache = null;
export function listSupportedCrs() {
  if (listCache) return listCache;
  const out = CRS_NAMED.map(([code, name]) => ({ code, name }));
  const listed = new Set(out.map((c) => c.code));
  // #489 — the rest of the NAD83(CSRS) zones, by zone number, then the national frames
  Object.entries(NAD83_CSRS_UTM).sort((a, b) => a[1] - b[1]).forEach(([code, z]) => { if (!listed.has(Number(code))) out.push({ code: Number(code), name: `NAD83(CSRS) / UTM zone ${z}N` }); });
  for (const [code, e] of REGISTRY) out.push({ code, name: e.name });
  for (let z = 1; z <= 23; z++) out.push({ code: 26900 + z, name: `NAD83 / UTM zone ${z}N` });
  for (let z = 1; z <= 22; z++) out.push({ code: 26700 + z, name: `NAD27 / UTM zone ${z}N — ~10 m datum approximation` });
  for (let z = 1; z <= 60; z++) out.push({ code: 32600 + z, name: `WGS 84 / UTM zone ${z}N` });
  for (let z = 1; z <= 60; z++) out.push({ code: 32700 + z, name: `WGS 84 / UTM zone ${z}S` });
  const res = out.map((c) => ({ ...c, geographic: /longitude/.test(c.name) }));
  // #834 — then the rest of the EPSG registry, once loaded (the hand-verified entries above keep their names)
  if (FULL) {
    const have = new Set(res.map((c) => c.code));
    for (const [code, e] of Object.entries(FULL.codes)) { const n = Number(code); if (!have.has(n)) res.push({ code: n, name: e[0], geographic: e[1].startsWith("+proj=longlat") }); }
  }
  if (FULL) listCache = res;
  return res;
}
let crsNameCache = null;
export function crsName(epsg) {
  if (!crsNameCache) crsNameCache = new Map(listSupportedCrs().map((c) => [c.code, c.name]));
  return crsNameCache.get(Number(epsg)) || null;
}
