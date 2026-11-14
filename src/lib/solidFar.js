// TASKS.csv #3428 (side session 3's note) — a solid imported millions of metres from the project (coordinates in another system, a local grid
// read as UTM) froze the 3D View for about a minute: the view was fitted to it, with a scene origin that far from the geometry. Told before it is
// imported, from the distance between the solid and the holes. Pure.
export const FAR_SOLID_M = 100000; // 100 km
// bounds: solidBounds(parts) ({ min, max } in world metres) | null; collars: [{ x, y }] -> null (nothing to compare) | { far, distM, solid: [E, N], holes: [E, N] }
export function solidFarFromHoles(bounds, collars, limitM = FAR_SOLID_M) {
  if (!bounds) return null;
  let sx = 0, sy = 0, n = 0;
  for (const c of collars || []) if (Number.isFinite(c?.x) && Number.isFinite(c?.y)) { sx += c.x; sy += c.y; n++; }
  if (!n) return null;
  const hx = sx / n, hy = sy / n;
  // the nearest point of the solid's box to the holes' centre: a long solid that reaches the holes is not far
  const nx = Math.min(Math.max(hx, bounds.min.x), bounds.max.x), ny = Math.min(Math.max(hy, bounds.min.y), bounds.max.y);
  const distM = Math.hypot(nx - hx, ny - hy);
  return { far: distM > limitM, distM, solid: [(bounds.min.x + bounds.max.x) / 2, (bounds.min.y + bounds.max.y) / 2], holes: [hx, hy] };
}
