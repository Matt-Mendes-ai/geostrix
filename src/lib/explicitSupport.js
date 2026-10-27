// TASKS.csv #977 — where an explicit surface is drawn from its inputs and where it is extrapolated. #870 added the figures
// ("58 % of the surface lies beyond the inputs") but the margin was drawn exactly like the supported part, and on a steep
// contact it is most of the mesh. The fit records the inputs' hull in its own frame (supportHull: { origin, e1, e2, uv });
// here each vertex gets a colour FACTOR (multiplied by the surface's colour, so a chosen colour still shows): 1 inside the
// hull, EXTRAPOLATED_SHADE outside. Kept apart from explicitSurface.js (d3-delaunay) so restoring a project, which also
// shades, does not pull the fitter into the startup bundle. Pure.
export const EXTRAPOLATED_SHADE = 0.5;

const inPoly = (x, y, uv) => {
  let inside = false;
  const n = uv.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = uv[2 * i], yi = uv[2 * i + 1], xj = uv[2 * j], yj = uv[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

// positions: world (E, N, Z) flat; hull: the fit's supportHull. -> Float32Array of r, g, b factors per vertex, or null
export function supportShadeFactors(positions, hull) {
  if (!hull?.uv?.length || hull.uv.length < 6 || !hull.origin || !hull.e1 || !hull.e2) return null;
  const { origin: c, e1, e2, uv } = hull, n = positions.length / 3, out = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const dx = positions[3 * k] - c[0], dy = positions[3 * k + 1] - c[1], dz = positions[3 * k + 2] - c[2];
    const s = inPoly(dx * e1[0] + dy * e1[1] + dz * e1[2], dx * e2[0] + dy * e2[1] + dz * e2[2], uv) ? 1 : EXTRAPOLATED_SHADE;
    out[3 * k] = s; out[3 * k + 1] = s; out[3 * k + 2] = s;
  }
  return out;
}

// the hull as saved with the surface's parameters (so a reopened project, which does not rebuild, shades it too):
// centimetre-rounded, a few hundred numbers at most
export function compactHull(hull) {
  if (!hull) return null;
  const r = (v) => Math.round(v * 100) / 100, r9 = (v) => Math.round(v * 1e9) / 1e9;
  return { origin: hull.origin.map(r), e1: hull.e1.map(r9), e2: hull.e2.map(r9), uv: Array.from(hull.uv, r) };
}
