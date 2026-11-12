// TASKS.csv #2971 (WA iron review) — 'Zoom to the data' on the stereonet: flat-lying beds (dips of 2-8°) put every pole within a dozen
// pixels of the centre. The net is scaled so the farthest pole sits at about 80 % of its radius, with rings of equal dip to read it by.
// Pure.

// the net radius (0..1) of the pole of a plane dipping `dip` degrees
export function poleRadiusForDip(dip, projection = "equalArea") {
  const h = (dip * Math.PI) / 360; // half the pole's angle from the centre
  return projection === "equalAngle" ? Math.tan(h) : Math.SQRT2 * Math.sin(h);
}
// the dip whose pole sits at net radius r
export function dipAtRadius(r, projection = "equalArea") {
  return projection === "equalAngle" ? (360 / Math.PI) * Math.atan(r) : (360 / Math.PI) * Math.asin(Math.min(1, r / Math.SQRT2));
}

// projected poles [{ x, y }] -> null (no zoom worth having: less than 1.25 times, i.e. a pole already beyond 64 % of the radius; or no pole) or { k (scale), edgeDip (the dip at
// the zoomed edge, rounded), rings: [{ dip, r }] (2-5 rings at a round step) }
export function netZoom(points, projection = "equalArea", { maxK = 20 } = {}) {
  let maxR = 0;
  for (const p of points || []) if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) maxR = Math.max(maxR, Math.hypot(p.x, p.y));
  if (!(maxR >= 0) || !(points || []).length) return null;
  const k = Math.min(maxK, 1 / Math.max(maxR / 0.8, 1 / maxK));
  if (k < 1.25) return null;
  const edgeDip = Math.round(dipAtRadius(1 / k, projection) * 10) / 10;
  const step = [1, 2, 5, 10, 15, 30].find((st) => edgeDip / st <= 5) || 30;
  const rings = [];
  for (let d = step; d < edgeDip - 1e-9; d += step) rings.push({ dip: d, r: poleRadiusForDip(d, projection) });
  return { k, edgeDip, rings };
}
