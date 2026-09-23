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
import { igrfField, decimalYear } from "./igrf.js";
import { trueNorthBearingInGridDeg } from "./inversion.js";

export const AZIMUTH_REFS = {
  grid: "Grid north (the project's coordinate grid) — no change",
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
    const year = decimalYear(String(isoDate || ""));
    if (!Number.isFinite(year)) return null;
    const ll = reprojectXY(x, y, epsg, 4326);
    if (!ll) return null;
    let f;
    try { f = igrfField(ll.x, ll.y, 0, year); } catch { return null; } // outside IGRF's 1900-2030 range
    return { offset: f.declination + convergence, declination: f.declination, convergence };
  }
  return null;
}

export const wrap360 = (a) => ((a % 360) + 360) % 360;
