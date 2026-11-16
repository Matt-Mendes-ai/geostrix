// TASKS.csv #3766 (Scottie Gold review; moved out of ViewerModule.jsx) — the orientation the Implicit run gives GemPy when there are no structure picks,
// estimated from the unit's own contact points. It was a regression of elevation on easting and northing (z = a·x + b·y + c) whose comment said a contact
// 'is never anywhere near vertical': on a steep unit it flattens (138 contacts on a plane dipping 73.5° towards 84.3° came out 38.9° towards 76.9°, the run
// told GemPy 39° while its own trend said 79°). It is now the plane of least spread of the points (the smallest eigenvector of their covariance, the fit
// the Trends panel makes: lib/samplesTrend.js, lib/trend.js planeFromPoints), so a steep unit gets a steep orientation. Polarity as before: the upward
// normal, so the azimuth is the dip direction (the sidecar's gradient convention: gx = sin(dip)sin(az), gy = sin(dip)cos(az), gz = cos(dip)).
import { samplesTrend } from "../samplesTrend.js";
import { planeFromPoints } from "../trend.js";

// points: [{ x, y, z }] in the model's frame (east, north, up) -> { x, y, z (the centroid), dip, azimuth, fit }
// fit: "plane" (a least-spread plane), "flat" (under three points, or along one line: no plane to read, dip 0 at the centroid: the best 'we don't know')
export function estimateOrientationFromPoints(points) {
  const P = (points || []).filter((p) => [p?.x, p?.y, p?.z].every(Number.isFinite));
  const n = P.length;
  const c = n ? { x: P.reduce((s, p) => s + p.x, 0) / n, y: P.reduce((s, p) => s + p.y, 0) / n, z: P.reduce((s, p) => s + p.z, 0) / n } : { x: 0, y: 0, z: 0 };
  const flat = { ...c, dip: 0, azimuth: 0, fit: "flat" };
  if (n < 3) return flat;
  // four or more: samplesTrend (null along one line); three: the one plane through them (null when collinear)
  const pl = n >= 4 ? (() => { const t = samplesTrend(P); return t ? { dip: t.dip, dipAzimuth: t.dipAzimuth } : null; })() : planeFromPoints(P);
  if (!pl || !Number.isFinite(pl.dip)) return flat;
  return { ...c, dip: pl.dip, azimuth: pl.dipAzimuth, fit: "plane" };
}
