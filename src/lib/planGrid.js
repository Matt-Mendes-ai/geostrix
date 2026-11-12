// TASKS.csv #2128 (review #2013, Woodjam) — the Maps plan had a scale bar and the cursor's E / N only: no grid lines to read a position
// against and no way to check a distance (the IP lines' 3 km spacing). A light coordinate grid at a round spacing (1, 2 or 5 x 10^n m,
// about `targetPx` apart on screen) with edge labels, and a two-point measure (distance and grid bearing). Pure.

// the grid spacing in metres for a view of mPerPx metres per pixel
export function planGridStep(mPerPx, targetPx = 120) {
  const want = mPerPx * targetPx;
  if (!(want > 0)) return null;
  const p = 10 ** Math.floor(Math.log10(want));
  return [1, 2, 5, 10].map((k) => k * p).find((s) => s >= want) || 10 * p;
}

// the grid lines inside a view (left / top: the world coordinates of the view's top-left corner; w / h in pixels). -> { xs, ys } in metres
export function planGridLines({ left, top, w, h, mPerPx }, step) {
  const xs = [], ys = [];
  if (!(step > 0) || !(mPerPx > 0)) return { xs, ys };
  const right = left + w * mPerPx, bottom = top - h * mPerPx;
  if ((right - left) / step > 400 || (top - bottom) / step > 400) return { xs, ys };
  for (let x = Math.ceil(left / step) * step; x <= right; x += step) xs.push(x);
  for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) ys.push(y);
  return { xs, ys };
}

// a grid line's label: whole metres with thousands separators ("640,000 E" in English)
export const gridLabel = (v, axis) => `${Math.round(v).toLocaleString()} ${axis}`;

// two points on the plan -> { distM, bearingDeg } (bearing clockwise from grid north, 0-360)
export function measureLine(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  return { distM: Math.hypot(dx, dy), bearingDeg: ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360 };
}
export const distanceText = (m) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 1 : 2)} km` : `${m.toFixed(m < 10 ? 1 : 0)} m`);
