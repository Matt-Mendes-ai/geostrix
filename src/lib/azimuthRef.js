// TASKS.csv #396 — azimuth reference (grid / true / magnetic north) for imported azimuths.
//
// GeoStrix draws every azimuth against the PROJECT GRID's north. Survey and structure azimuths are often
// recorded against magnetic north (compass, some downhole tools) or true north (gyro), and nothing used to
// correct them: at Harry the declination is about +17 deg (IGRF-14, 2026), which puts the toe of a 632 m
// hole at -65 deg roughly 80 m off, and outcrop measurements and the alpha/beta calibration inherited the
// same error. The user now says which north the file's azimuths use; this converts them to grid north.
//
//   grid azimuth = true azimuth + c            (c = bearing of true north measured in the grid, "convergence")
//   grid azimuth = magnetic azimuth + D + c    (D = magnetic declination, east positive, IGRF-14 at the date)
//
// Pure: reprojection + IGRF only, no UI. Returns null when the location can't be converted (no project
// CRS, or a CRS proj4 doesn't know) so the caller can say so instead of guessing.
import { reprojectXY } from "./reproject.js";
// TASKS.csv #552 — IGRF (20 kB of coefficients) is needed only for MAGNETIC azimuths, so it isn't a static import:
// loadIgrf() fetches it (the import pipeline awaits it before converting magnetic azimuths), and a lazily-loaded
// module that imports igrf.js itself can hand it over with setIgrfModule(). Without it, a magnetic conversion throws
// rather than silently returning a grid-only answer.
let igrf = null;
export const setIgrfModule = (mod) => { igrf = mod; };
export const loadIgrf = () => (igrf ? Promise.resolve(igrf) : import("./igrf.js").then((m) => (igrf = m)));
import { trueNorthBearingInGridDeg } from "./inversion.js";

export const AZIMUTH_REFS = {
  grid: "Grid north (the project's grid, or the grid of the CRS given here)",
  true: "True north (e.g. gyro surveys)",
  magnetic: "Magnetic north (compass / magnetic tools) — needs the survey date",
};

// Degrees to ADD to an azimuth measured from `ref` at project coordinates (x, y) to get a grid azimuth.
// { offset, declination?, convergence? } or null.
export function azimuthToGridOffset(ref, x, y, epsg, isoDate) {
  if (!ref || ref === "grid") return { offset: 0 };
  if (!Number.isFinite(x) || !Number.isFinite(y) || !epsg) return null;
  const convergence = trueNorthBearingInGridDeg(x, y, epsg);
  if (convergence == null || !Number.isFinite(convergence)) return null;
  if (ref === "true") return { offset: convergence, convergence };
  if (ref === "magnetic") {
    if (!igrf) throw new Error("azimuthToGridOffset: magnetic north needs loadIgrf() first");
    const year = igrf.decimalYear(String(isoDate || ""));
    if (!Number.isFinite(year)) return null;
    const ll = reprojectXY(x, y, epsg, 4326);
    if (!ll) return null;
    let f;
    try { f = igrf.igrfField(ll.x, ll.y, 0, year); } catch { return null; } // outside IGRF's 1900-2030 range
    return { offset: f.declination + convergence, declination: f.declination, convergence };
  }
  return null;
}

export const wrap360 = (a) => ((a % 360) + 360) % 360;

// TASKS.csv #547 — outcrop measurements (dip direction + strike, with their own project-CRS x / y) converted from
// true or magnetic north to grid north, per location (100 m cells share an offset, < 0.01° apart). Mutates nothing:
// returns { rows, converted, failed, example } where example = the first location's { offset, declination?, convergence }.
// Magnetic needs loadIgrf() first (azimuthToGridOffset throws otherwise).
export function bearingsToGrid(rows, ref, epsg, isoDate) {
  if (!ref || ref === "grid") return { rows, converted: 0, failed: 0, example: null };
  const cache = new Map();
  let converted = 0, failed = 0, example = null;
  const out = rows.map((r) => {
    if (!Number.isFinite(r.dipDir) && !Number.isFinite(r.strike)) return r;
    const key = `${Math.round(r.x / 100)},${Math.round(r.y / 100)}`;
    let o = cache.get(key);
    if (o === undefined) { o = azimuthToGridOffset(ref, r.x, r.y, epsg, isoDate); cache.set(key, o); }
    if (!o) { failed++; return r; }
    converted++; if (!example) example = o;
    const turn = (a) => (Number.isFinite(a) ? Math.round(wrap360(a + o.offset) * 100) / 100 : a);
    return { ...r, dipDir: turn(r.dipDir), strike: turn(r.strike) };
  });
  return { rows: out, converted, failed, example };
}

// "magnetic north (IGRF-14 at 2021-06-19: declination +16.9°, grid convergence -1.2°)" for notices
export function northRefText(ref, isoDate, example) {
  const s = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}°`;
  if (ref === "magnetic") return `magnetic north (IGRF-14 at ${isoDate}${example ? `: declination ${s(example.declination)}, grid convergence ${s(example.convergence)}` : ""})`;
  if (ref === "true") return `true north${example ? ` (grid convergence ${s(example.convergence)})` : ""}`;
  return "grid north";
}
