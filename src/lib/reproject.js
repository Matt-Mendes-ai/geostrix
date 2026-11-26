// TASKS.csv #4084 — the coordinate maths (proj4): converters, point and bearing transforms. The definitions and lookups are in crsDefs.js, re-exported here so every importer of this module keeps its names.
// Only code that loads on use imports this file (lib/reprojectLazy.js is how the startup code reaches it), so proj4 and wkt-parser are not in the startup bundle (vendor-proj4 chunk).
import proj4 from "proj4";
import { getProj4DefSync, getProj4Def, GDA94, GDA2020 } from "./crsDefs.js";
export * from "./crsDefs.js";

// TASKS.csv #416 — proj4(fromDef, toDef, point) re-parses BOTH definition strings on every call: 31.5 us
// per point vs 1.76 us with a converter built once (18x). The image/grid warps below call it once per
// output pixel (a 1024x1024 reprojection took 30 s of frozen UI, ~2 min at the 2048 cap), and every
// per-point import path pays it per row. Converters are cached per (from, to) definition pair.
const converterCache = new Map();
export function converter(fromDef, toDef) {
  const key = JSON.stringify([fromDef, toDef]);
  let c = converterCache.get(key);
  if (!c) { c = gdaPair(fromDef, toDef) || proj4(fromDef, toDef); converterCache.set(key, c); } // gdaPair: #2458
  return c;
}

// TASKS.csv #2458 (review #2325, WA uranium) — GDA94 and GDA2020 were one datum here: both GRS80 with a zero shift, so 'Reproject all data to
// GDA2020 / MGA zone 51' moved nothing, while the two frames are 1.5-1.8 m apart across Australia. As PROJ does, each stays a null shift to
// WGS 84 (EPSG:1150 / 8450, ~1-3 m), and between the two the national 7-parameter transformation applies: GDA94 to GDA2020 (1), EPSG:8048,
// coordinate-frame rotation (ICSM GDA2020 Technical Manual). At 576,324 E 6,682,105 N (MGA 51) it moves +0.927 m E, +1.513 m N (1.774 m).
export const GDA94_TAG = "+title=GDA94", GDA2020_TAG = "+title=GDA2020";
const GDA_8048 = { tx: 0.06155, ty: -0.01087, tz: -0.04019, rx: -0.0394924, ry: -0.0327221, rz: -0.0328979, ds: -0.009994 }; // m, arc-seconds, ppm
const GRS80_A = 6378137, GRS80_E2 = (1 / 298.257222101) * (2 - 1 / 298.257222101), ARCSEC = Math.PI / 648000;
function geodToEcef(lon, lat) {
  const p = (lat * Math.PI) / 180, l = (lon * Math.PI) / 180, N = GRS80_A / Math.sqrt(1 - GRS80_E2 * Math.sin(p) ** 2);
  return [N * Math.cos(p) * Math.cos(l), N * Math.cos(p) * Math.sin(l), N * (1 - GRS80_E2) * Math.sin(p)];
}
function ecefToGeod([x, y, z]) {
  const l = Math.atan2(y, x), r = Math.hypot(x, y);
  let p = Math.atan2(z, r * (1 - GRS80_E2));
  for (let i = 0; i < 6; i++) { const N = GRS80_A / Math.sqrt(1 - GRS80_E2 * Math.sin(p) ** 2); p = Math.atan2(z + GRS80_E2 * N * Math.sin(p), r); }
  return [(l * 180) / Math.PI, (p * 180) / Math.PI];
}
// lon / lat on GDA94 -> on GDA2020 (dir 1), or back (dir -1: the parameters negated, exact to well under a millimetre at these magnitudes)
export function gda94To2020LonLat(lon, lat, dir = 1) {
  const P = GDA_8048, k = dir, rx = k * P.rx * ARCSEC, ry = k * P.ry * ARCSEC, rz = k * P.rz * ARCSEC, m = 1 + k * P.ds * 1e-6;
  const [x, y, z] = geodToEcef(lon, lat);
  return ecefToGeod([k * P.tx + m * (x + rz * y - ry * z), k * P.ty + m * (-rz * x + y + rx * z), k * P.tz + m * (ry * x - rx * y + z)]);
}
const gdaOf = (def) => (def.includes(GDA2020_TAG) ? 2020 : def.includes(GDA94_TAG) ? 94 : 0);
function gdaPair(fromDef, toDef) {
  const a = gdaOf(String(fromDef)), b = gdaOf(String(toDef));
  if (!a || !b || a === b) return null;
  const geo94 = `+proj=longlat ${GDA94} +no_defs`, geo20 = `+proj=longlat ${GDA2020} +no_defs`;
  const [srcGeo, dstGeo, dir] = a === 94 ? [geo94, geo20, 1] : [geo20, geo94, -1];
  const toGeo = proj4(fromDef, srcGeo), fromGeo = proj4(dstGeo, toDef);
  return {
    forward: (p) => { const [lon, lat] = toGeo.forward(p); return fromGeo.forward(gda94To2020LonLat(lon, lat, dir)); },
    inverse: (p) => { const [lon, lat] = fromGeo.inverse(p); return toGeo.inverse(gda94To2020LonLat(lon, lat, -dir)); },
  };
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
  // TASKS.csv #1470 (review #1352, Silvertip) — no rounding to 0.01 deg here (a NAD83 -> WGS 84 move turned 278.43353 into 278.43):
  // the bearing as given when grid north does not turn, else to 1e-6 deg (float noise of the 10 m step, far below any reading)
  if (Math.abs(bearingTurn(a, out)) < 1e-7) return a;
  return Math.round(out * 1e6) / 1e6 % 360;
}
// signed change (degrees, -180..180) from bearing a to bearing b
export const bearingTurn = (a, b) => ((b - a + 540) % 360) - 180;
