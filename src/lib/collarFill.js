// TASKS.csv #3335 (review #3195, Galore Creek) — a planned collar with no terrain took its Elev from the ground interpolated between the nearest
// collars, to a tenth of a metre, in the same words 190 m from a collar and 3.6 km from one ('1309.6' in ground with 1,140 m of relief).
// Now what it rests on is said (the nearest collar's distance, the elevations of the collars used); past one site spacing it is given to the
// metre only; past FAR_SPACINGS site spacings nothing is offered (type the Elev, or load a terrain). Only for the collar ground: a terrain
// (no .near) is read as before.
export const FAR_SPACINGS = 3;
// ground(x, y) -> z, with .near(x, y) for the collar ground; spacing: the drilled site spacing (m) or null
// -> null (no ground) | { z (null when too far), nearestM, zMin, zMax, spacing, far, coarse } (a terrain: { z } only)
export function collarFillAt(ground, spacing, x, y) {
  if (typeof ground !== "function" || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const z = ground(x, y);
  if (!Number.isFinite(z)) return null;
  const near = typeof ground.near === "function" ? ground.near(x, y) : null;
  if (!near || !Number.isFinite(near.nearestM)) return { z: Math.round(z * 10) / 10 };
  const s = Number(spacing) > 0 ? Number(spacing) : null;
  const far = s != null && near.nearestM > FAR_SPACINGS * s, coarse = s != null && near.nearestM > s;
  return { z: far ? null : coarse ? Math.round(z) : Math.round(z * 10) / 10, nearestM: near.nearestM, zMin: near.zMin, zMax: near.zMax, spacing: s, far, coarse };
}
// the ground as the pattern and the CSV import read it: z (rounded as above), or NaN where nothing is offered
export const collarFillGround = (ground, spacing) => (ground ? (x, y) => { const f = collarFillAt(ground, spacing, x, y); return f?.z ?? NaN; } : null);
// a distance as it is said: metres under a kilometre, else kilometres to one decimal
export const distanceText = (m) => (m < 1000 ? `${Math.round(m).toLocaleString()} m` : `${(m / 1000).toFixed(1)} km`);
// the z_source words (English: they travel in the project file and the rig sheet's CSV)
export function collarFillSource(f) {
  if (!f || f.nearestM == null) return "the ground interpolated between the nearest collars (no terrain)";
  return `the ground interpolated between the nearest collars (no terrain; nearest collar ${distanceText(f.nearestM)} away, collars used ${Math.round(f.zMin)} to ${Math.round(f.zMax)} m${f.coarse ? ", to the metre" : ""})`;
}
