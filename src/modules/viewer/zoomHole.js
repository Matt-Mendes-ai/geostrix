// TASKS.csv #2375 (review #2325, WA uranium) — 'Zoom to <hole>' kept the viewing direction: from the Top view a vertical hole showed end-on
// as one dark disc. When the camera looks along the hole (within `withinDeg`), the view tilts first, keeping its azimuth: to 45 degrees from
// the vertical, or (for an inclined hole that this still looks along) the first of 70 / 20 degrees that is at least `clearDeg` off the hole's
// axis. Pure. pts: the trace in scene coordinates ([{ x, y, z }], y up); phi / theta: the camera's spherical angles (the 3D View's camState:
// the camera sits at target + r (sin phi sin theta, cos phi, sin phi cos theta)). -> the new phi, or null to keep the view.
const rad = (d) => (d * Math.PI) / 180;

function axisCos(pts, phi, theta) {
  const a = pts[0], b = pts[pts.length - 1];
  const hx = b.x - a.x, hy = b.y - a.y, hz = b.z - a.z, L = Math.hypot(hx, hy, hz);
  if (!(L > 0)) return null;
  const vx = Math.sin(phi) * Math.sin(theta), vy = Math.cos(phi), vz = Math.sin(phi) * Math.cos(theta);
  return Math.abs((hx * vx + hy * vy + hz * vz) / L);
}

export function holeZoomPhi(pts, phi, theta, { withinDeg = 15, clearDeg = 30 } = {}) {
  if (!pts || pts.length < 2) return null;
  const c = axisCos(pts, phi, theta);
  if (c == null || c < Math.cos(rad(withinDeg))) return null;
  const below = phi > Math.PI / 2; // looking up from below: tilt on that side
  for (const d of [45, 70, 20]) {
    const p = below ? Math.PI - rad(d) : rad(d);
    if (axisCos(pts, p, theta) <= Math.cos(rad(clearDeg))) return p;
  }
  return below ? Math.PI - rad(45) : rad(45);
}
