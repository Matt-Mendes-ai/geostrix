// TASKS.csv #321 — offline IGRF-14 main-field evaluation, for the inversion panel's optional
// "Compute from IGRF" button.
//
// Why here and not in the sidecar: the geophysicist on the #321 panel suggested ppigrf (MIT), but it
// requires pandas, a ~40 MB dependency for one button in a sidecar the performance pillar is trying to
// keep small. Spherical-harmonic synthesis is ~60 lines, the coefficients are public data, and a pure
// function here is testable in Node — verified against ppigrf in a throwaway environment (TASKS.csv #321).
//
// The button FILLS the three field boxes; it never runs silently. The panel records "computed from
// IGRF-14 for <date> at <lat, lon, height>" as the field's source, and the user can overwrite any value.
import { IGRF14_EPOCHS, IGRF14_ROWS } from "./igrf14Coeffs.js";

const RE = 6371.2; // IGRF reference radius, km
const WGS84_A = 6378.137, WGS84_B = 6356.7523142; // km

// Coefficients (g, h) at a decimal year: linear between 5-year epochs; after the last epoch, the
// published secular variation, valid to 5 years past it (IGRF-14: 2025.0-2030.0).
function coeffsAt(year) {
  const first = IGRF14_EPOCHS[0], last = IGRF14_EPOCHS[IGRF14_EPOCHS.length - 1];
  if (!(year >= first && year <= last + 5)) throw new RangeError(`IGRF-14 covers ${first}-${last + 5}; got ${year}.`);
  const nmax = 13;
  const g = Array.from({ length: nmax + 1 }, () => new Float64Array(nmax + 1));
  const h = Array.from({ length: nmax + 1 }, () => new Float64Array(nmax + 1));
  let i, t;
  if (year >= last) { i = IGRF14_EPOCHS.length - 1; t = year - last; } else {
    i = IGRF14_EPOCHS.findIndex((e, k) => year >= e && year < IGRF14_EPOCHS[k + 1]);
    t = (year - IGRF14_EPOCHS[i]) / (IGRF14_EPOCHS[i + 1] - IGRF14_EPOCHS[i]);
  }
  for (const [gh, n, m, vals, sv] of IGRF14_ROWS) {
    const v = year >= last ? vals[i] + sv * t : vals[i] + (vals[i + 1] - vals[i]) * t;
    if (gh === "g") g[n][m] = v; else h[n][m] = v;
  }
  return { g, h, nmax };
}

// Geodetic (lat, height above WGS84 ellipsoid) -> geocentric radius and colatitude, plus the angle
// needed to rotate geocentric field components back to the geodetic frame.
function geodeticToGeocentric(latDeg, altKm) {
  const lat = (latDeg * Math.PI) / 180;
  const a2 = WGS84_A * WGS84_A, b2 = WGS84_B * WGS84_B;
  const sl = Math.sin(lat), cl = Math.cos(lat);
  const rho = Math.sqrt(a2 * cl * cl + b2 * sl * sl);
  const r = Math.sqrt(altKm * altKm + 2 * altKm * rho + (a2 * a2 * cl * cl + b2 * b2 * sl * sl) / (rho * rho));
  const cd = (altKm + rho) / r;
  const sd = ((a2 - b2) / rho) * cl * sl / r;
  // geocentric colatitude
  const cthc = sl * cd - cl * sd;
  const sthc = cl * cd + sl * sd;
  return { r, ct: cthc, st: sthc, cd, sd };
}

// Main field at a point. lonDeg/latDeg geodetic (WGS84), altKm above the ellipsoid, year decimal.
// Returns { north, east, down, horizontal, total, inclination, declination } in nT / degrees.
export function igrfField(lonDeg, latDeg, altKm, year) {
  const { g, h, nmax } = coeffsAt(year);
  const { r, ct, st, cd, sd } = geodeticToGeocentric(latDeg, altKm);
  const phi = (lonDeg * Math.PI) / 180;
  // Schmidt semi-normalised associated Legendre functions P[n][m] and their theta-derivatives dP.
  const P = Array.from({ length: nmax + 1 }, () => new Float64Array(nmax + 1));
  const dP = Array.from({ length: nmax + 1 }, () => new Float64Array(nmax + 1));
  P[0][0] = 1; dP[0][0] = 0;
  for (let n = 1; n <= nmax; n++) {
    for (let m = 0; m <= n; m++) {
      if (n === m) {
        const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        P[n][m] = k * st * P[n - 1][m - 1];
        dP[n][m] = k * (st * dP[n - 1][m - 1] + ct * P[n - 1][m - 1]);
      } else {
        const kn = Math.sqrt(n * n - m * m);
        const a = (2 * n - 1) / kn;
        const b = n - 1 >= m ? Math.sqrt((n - 1) * (n - 1) - m * m) / kn : 0;
        P[n][m] = a * ct * P[n - 1][m] - (n - 2 >= m ? b * P[n - 2][m] : 0);
        dP[n][m] = a * (ct * dP[n - 1][m] - st * P[n - 1][m]) - (n - 2 >= m ? b * dP[n - 2][m] : 0);
      }
    }
  }
  let Br = 0, Bt = 0, Bp = 0;
  for (let n = 1; n <= nmax; n++) {
    const f = Math.pow(RE / r, n + 2);
    for (let m = 0; m <= n; m++) {
      const cm = Math.cos(m * phi), sm = Math.sin(m * phi);
      const gh = g[n][m] * cm + h[n][m] * sm;
      Br += f * (n + 1) * gh * P[n][m];
      Bt -= f * gh * dP[n][m];
      Bp += st > 1e-10 ? f * m * (g[n][m] * sm - h[n][m] * cm) * P[n][m] / st : 0;
    }
  }
  // Geocentric (r, theta, phi) -> local geocentric north/east/down, then rotate to geodetic.
  const Xc = -Bt, Yc = Bp, Zc = -Br;
  const north = Xc * cd + Zc * sd;
  const down = Zc * cd - Xc * sd;
  const east = Yc;
  const horizontal = Math.hypot(north, east);
  return {
    north, east, down, horizontal,
    total: Math.hypot(horizontal, down),
    inclination: (Math.atan2(down, horizontal) * 180) / Math.PI,
    declination: (Math.atan2(east, north) * 180) / Math.PI,
  };
}

// Decimal year from a YYYY-MM-DD string (UTC).
export function decimalYear(isoDate) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return NaN;
  const y = d.getUTCFullYear();
  const start = Date.UTC(y, 0, 1), end = Date.UTC(y + 1, 0, 1);
  return y + (d.getTime() - start) / (end - start);
}
