// TASKS.csv #3004 (the shared rule) / #2896 (review #2876, WA bedded iron) — two collars with Elevation 0.0 on a 440 m plateau
// (RHRCMET_0154_A, RHRCMET_0155_A) were placed at sea level with no word at import or in Data QC, while the blank elevations beside them
// were filled and said (#2169). One rule for which collar elevations to trust, for every consumer (the import notice, Data QC, 3D
// Modelling, the Level plan range, Targeting, Maps, Layout): each collar's elevation is
//   "assumed" — filled by the import (#2169's zAssumed: terrain / median / zero),
//   "suspect" — in the file, but probably a missing value: exactly 0 m while the other collars sit 50 m or more away from 0, or a stray
//               beyond the widest gap of the elevations (side 6's strayCollars, #2936: over max(100 m, 5 x IQR), at most 1 % of the
//               holes and 20), and
//   "measured" — the rest.
// The import stores zSuspect: true on the suspect ones (the project keeps it); a consumer reads elevationTrust(c), or recomputes the ids
// with suspectElevationIds for collars saved before this rule. Pure: no UI. The elevation itself is never changed here.
import { strayCollars } from "./viewer/levelPlanRange.js";

const ZERO_FAR = 50; // m: a 0 m collar is suspect when the other collars' median is at least this far from 0

// -> Set of hole ids whose elevation is suspect (assumed ones are not judged: they are said as assumed)
export function suspectElevationIds(collars) {
  const meas = (collars || []).filter((c) => c && c.hole_id && Number.isFinite(c.z) && !c.zAssumed);
  const out = new Set();
  if (meas.length < 3) return out;
  const nonZero = meas.filter((c) => c.z !== 0).map((c) => c.z).sort((a, b) => a - b);
  const median = nonZero.length ? nonZero[nonZero.length >> 1] : null;
  if (median !== null && Math.abs(median) >= ZERO_FAR && nonZero.length >= 2) for (const c of meas) if (c.z === 0) out.add(c.hole_id);
  for (const i of strayCollars(meas.map((c) => c.z))) out.add(meas[i].hole_id);
  return out;
}

export const elevationTrust = (c, suspect = null) => (c?.zAssumed ? "assumed" : (suspect ? suspect.has(c?.hole_id) : c?.zSuspect) ? "suspect" : "measured");

// the project's collars with zSuspect set on the suspect ones and cleared on the rest (the same objects where nothing changes)
// -> { collars, ids: [hole ids], range: [lo, hi] of the trusted measured elevations, or null }
export function markSuspectElevations(collars) {
  const ids = suspectElevationIds(collars);
  const out = (collars || []).map((c) => {
    if (!c) return c;
    if (ids.has(c.hole_id)) return c.zSuspect ? c : { ...c, zSuspect: true };
    if (!c.zSuspect) return c;
    const rest = { ...c }; delete rest.zSuspect;
    return rest;
  });
  const zs = out.filter((c) => c && Number.isFinite(c.z) && !c.zAssumed && !c.zSuspect).map((c) => c.z);
  let lo = Infinity, hi = -Infinity; for (const z of zs) { if (z < lo) lo = z; if (z > hi) hi = z; } // no spread: 50,000 collars
  const range = zs.length ? [lo, hi] : null;
  return { collars: out, ids: [...ids], range };
}
