// TASKS.csv #445 step 1 — moved out of ViewerModule.jsx unchanged (pure maths, no three.js / DOM), so it
// can be tested on its own (test/core.test.mjs #445). The comments are the originals.
const toRad = (d) => (d * Math.PI) / 180;

// TASKS.csv #85 — geological architecture layer 4 (spatial-distribution-aware search, not just
// nearest-N). GemPy's implicit potential-field fit is a GLOBAL model, not per-query local kriging, so
// there's no honest way to give it a true "search ellipsoid used at every interpolation query" the way
// a classic kriging engine would use one — that would mean bypassing GemPy's own interpolator entirely,
// out of scope here. What this DOES give the user real control over: which control points are trusted
// enough to feed the run at all. A point with fewer than `minSamples` neighbors within an ellipsoid
// oriented along the structural trend (azimuth/dip of the ellipsoid's long axis) is isolated relative
// to that trend and gets excluded before the run, rather than silently averaged in alongside well-
// supported points — the ellipsoid's orientation is shared with #86's anisotropy input per this entry's
// own note ("usually the same structural trend, worth sharing one input").
// Builds an orthonormal (major, semi-major, minor) basis in (east, north, up) — the same axis order the
// sidecar's API already uses (see sceneToApi) — from a single azimuth/dip pair: major = the dip-
// direction vector itself, semi-major = the horizontal strike direction (perpendicular to major within
// the horizontal plane), minor = whatever's left (their cross product) — a full 3D orientation from
// just two angles, not three, matching how the rest of this app already only ever asks for dip/azimuth.
export function searchEllipsoidBasis(azimuth, dip) {
  const az = toRad(azimuth), dp = toRad(dip);
  const major = { x: Math.sin(az) * Math.cos(dp), y: Math.cos(az) * Math.cos(dp), z: -Math.sin(dp) };
  const semiMajor = { x: Math.cos(az), y: -Math.sin(az), z: 0 };
  const minor = {
    x: major.y * semiMajor.z - major.z * semiMajor.y,
    y: major.z * semiMajor.x - major.x * semiMajor.z,
    z: major.x * semiMajor.y - major.y * semiMajor.x,
  };
  return { major, semiMajor, minor };
}
// Squared normalized anisotropic distance — <= 1 means "inside the ellipsoid". `apiA`/`apiB` are both
// (east, north, up) points (the sidecar's coordinate convention, i.e. already sceneToApi'd).
export function searchEllipsoidDistSq(apiA, apiB, basis, ranges) {
  const de = apiB.x - apiA.x, dn = apiB.y - apiA.y, du = apiB.z - apiA.z;
  const p1 = de * basis.major.x + dn * basis.major.y + du * basis.major.z;
  const p2 = de * basis.semiMajor.x + dn * basis.semiMajor.y + du * basis.semiMajor.z;
  const p3 = de * basis.minor.x + dn * basis.minor.y + du * basis.minor.z;
  return (p1 / ranges.major) ** 2 + (p2 / ranges.semiMajor) ** 2 + (p3 / ranges.minor) ** 2;
}
// Filters a list of {x,y,z} api-space points down to only those with at least `minSamples` OTHER
// points inside their own search ellipsoid — O(n²) but n is a per-unit control-point count (tens to a
// few hundred), not the whole project, so this is cheap in practice.
export function filterBySearchSupport(apiPoints, ellipsoid) {
  // TASKS.csv #217 — must return a COPY here, not apiPoints itself: callers do
  // `points.length = 0; points.push(...supportedPoints)`, and when supportedPoints
  // was the same reference as points, that truncation emptied the array before the
  // spread ever read it, silently zeroing out every point whenever the ellipsoid was off.
  if (!ellipsoid?.enabled) return [...apiPoints];
  const basis = searchEllipsoidBasis(ellipsoid.azimuth, ellipsoid.dip);
  return apiPoints.filter((p, i) => {
    let count = 0;
    for (let j = 0; j < apiPoints.length; j++) {
      if (i === j) continue;
      if (searchEllipsoidDistSq(p, apiPoints[j], basis, ellipsoid) <= 1) count++;
      if (count >= ellipsoid.minSamples) break;
    }
    return count >= ellipsoid.minSamples;
  });
}

// TASKS.csv #86 — geological architecture layer 5 (per-domain anisotropy). GemPy's own interpolator
// (and the RBF/kriging kernels underneath it) assume ISOTROPIC distance — a point 100m away "costs" the
// same regardless of direction. The standard geostatistical trick for getting genuinely anisotropic
// behavior out of an isotropic kernel, used here rather than reimplementing GemPy's math: warp every
// coordinate (both interface points AND orientation positions) into a "normalized" space where the
// declared ellipsoid becomes a sphere BEFORE sending them to the sidecar, then warp the returned mesh
// vertices back afterward (see runSurfaceStack). In the warped space, "close along the short axis, far
// along the long axis" becomes simply "close" or "far" uniformly — which is exactly what makes the
// isotropic kernel behave anisotropically once un-warped.
// Builds a uniform-volume-preserving scale per axis: isoScale (the geometric mean of the three ranges)
// is the "size" an isotropic ellipsoid of the same volume would have along every axis, so a perfectly
// isotropic input (major=semiMajor=minor) produces scale=1 on every axis (the identity warp, i.e. zero
// behavior change) rather than arbitrarily shrinking/inflating the whole model.
export function anisoScales(ranges) {
  const isoScale = Math.cbrt(ranges.major * ranges.semiMajor * ranges.minor);
  return { major: isoScale / ranges.major, semiMajor: isoScale / ranges.semiMajor, minor: isoScale / ranges.minor };
}
// Affine warp of one (east,north,up) point: project the offset from `center` onto the ellipsoid's own
// orthonormal basis, scale each axis independently, then reconstruct in the original (east,north,up)
// frame using that same basis — a pure rotate-scale-rotate-back, no shear, so it's cleanly invertible by
// passing 1/scale for each axis (see unwarpFactor below).
export function anisoWarpPoint(apiPt, center, basis, scales) {
  const dx = apiPt.x - center.x, dy = apiPt.y - center.y, dz = apiPt.z - center.z;
  const p1 = (dx * basis.major.x + dy * basis.major.y + dz * basis.major.z) * scales.major;
  const p2 = (dx * basis.semiMajor.x + dy * basis.semiMajor.y + dz * basis.semiMajor.z) * scales.semiMajor;
  const p3 = (dx * basis.minor.x + dy * basis.minor.y + dz * basis.minor.z) * scales.minor;
  // Spreads `apiPt` first so any extra fields riding along with a point (e.g. #88's per-point `nugget`
  // for a soft constraint) survive the warp/unwarp round-trip untouched — only x/y/z actually move.
  return {
    ...apiPt,
    x: center.x + p1 * basis.major.x + p2 * basis.semiMajor.x + p3 * basis.minor.x,
    y: center.y + p1 * basis.major.y + p2 * basis.semiMajor.y + p3 * basis.minor.y,
    z: center.z + p1 * basis.major.z + p2 * basis.semiMajor.z + p3 * basis.minor.z,
  };
}
export const invScales = (scales) => ({ major: 1 / scales.major, semiMajor: 1 / scales.semiMajor, minor: 1 / scales.minor });
// Transforms an orientation's dip/azimuth by the SAME linear map (basis+scales, no translation) applied
// to the unit gradient direction, then renormalizes and converts back to dip/azimuth. This is the
// practical approximation used here rather than the mathematically exact inverse-transpose Jacobian a
// general (non-orthogonal-preserving) warp would need — exact for the common case this feature targets
// (a surface whose local tangent is close to the declared structural trend near its own control points,
// which is the entire premise of declaring one trend for the domain in the first place); worth a visual
// sanity-check against a known structure before trusting it on an unfamiliar one.
export function anisoWarpDirection(dip, azimuth, basis, scales) {
  const dr = toRad(dip), ar = toRad(azimuth);
  const g = { x: Math.sin(dr) * Math.sin(ar), y: Math.sin(dr) * Math.cos(ar), z: Math.cos(dr) };
  const p1 = (g.x * basis.major.x + g.y * basis.major.y + g.z * basis.major.z) * scales.major;
  const p2 = (g.x * basis.semiMajor.x + g.y * basis.semiMajor.y + g.z * basis.semiMajor.z) * scales.semiMajor;
  const p3 = (g.x * basis.minor.x + g.y * basis.minor.y + g.z * basis.minor.z) * scales.minor;
  const wx = p1 * basis.major.x + p2 * basis.semiMajor.x + p3 * basis.minor.x;
  const wy = p1 * basis.major.y + p2 * basis.semiMajor.y + p3 * basis.minor.y;
  const wz = p1 * basis.major.z + p2 * basis.semiMajor.z + p3 * basis.minor.z;
  const len = Math.sqrt(wx * wx + wy * wy + wz * wz) || 1;
  const nz = wz / len;
  const newDip = (Math.acos(Math.min(1, Math.max(-1, nz))) * 180) / Math.PI;
  let newAzimuth = (Math.atan2(wx / len, wy / len) * 180) / Math.PI;
  if (newAzimuth < 0) newAzimuth += 360;
  return { dip: newDip, azimuth: newAzimuth };
}

// TASKS.csv #272 — helpers for the alteration-halo tool's own (non-GemPy) construction.
//
// Why the halo needs its own construction at all: every other categorical tool in this module models a
// DIRECTED contact — a surface with a coherent "younger" side and an "older" side, fitted through the
// interval TOPS only. That's the right model for a stratigraphic top or a fault plane. An alteration
// halo is not that shape: it's a closed, roughly-equant envelope wrapped around a mineralising conduit,
// with no single "up" side anywhere on it, and its base is just as much part of the body as its top.
// Feeding halo tops through the directed-contact machinery produced *a* surface, but never a halo.
// The construction below instead treats "is this rock altered?" as a 0/1 indicator field sampled along
// every hole, interpolates it onto a grid, and takes the 0.5 iso-surface — the standard implicit way to
// get a closed envelope, and the same pipeline the numeric grade-shell tool already uses.

// Median nearest-neighbour horizontal distance between collars — the natural length scale of a
// drillhole property, used to auto-pick a halo search radius/cell size that suits the actual hole
// spacing instead of a hardcoded metre value that's wrong on all but one property size.
export function medianCollarSpacing(collarList) {
  if (!collarList || collarList.length < 2) return null;
  const nn = [];
  for (let i = 0; i < collarList.length; i++) {
    let best = Infinity;
    for (let j = 0; j < collarList.length; j++) {
      if (i === j) continue;
      const dx = collarList[i].x - collarList[j].x, dy = collarList[i].y - collarList[j].y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0 && d < best) best = d;
    }
    if (Number.isFinite(best)) nn.push(best);
  }
  if (!nn.length) return null;
  nn.sort((a, b) => a - b);
  return nn[Math.floor(nn.length / 2)];
}

// Auto search radius / cell size for the halo, from the hole spacing. Radius ~1.2x the median spacing
// so neighbouring holes actually inform each other's cells (below ~1x, holes interpolate in isolation
// and the halo breaks into one blob per hole); cell size ~1/8 of the radius, which resolves the
// envelope without exploding the grid. Both are clamped to sane absolute bounds for the degenerate
// cases (a single hole, or two collars a metre apart).
export function autoHaloParams(collarList) {
  const spacing = medianCollarSpacing(collarList);
  const radius = Math.min(1000, Math.max(15, (spacing || 60) * 1.2));
  const cell = Math.min(50, Math.max(1, radius / 8));
  return { radius, cell, spacing };
}

// Split a downhole interval into sub-intervals of at most `maxLen` so a thick logged interval
// contributes several sample points down its length rather than one midpoint. Without this a 60 m
// alteration run and a 1 m one carry identical weight and identical spatial footprint, which visibly
// pinches the halo in the holes that actually have the most alteration.
export function splitIntervalForSampling(from, to, maxLen) {
  const len = to - from;
  if (!(len > 0)) return [];
  const n = Math.max(1, Math.ceil(len / Math.max(0.25, maxLen)));
  const step = len / n;
  const out = [];
  for (let i = 0; i < n; i++) out.push({ from: from + i * step, to: from + (i + 1) * step });
  return out;
}

// TASKS.csv #275 — spatial-coherence check for lithology groups (#176). Grouping is purely label-based:
// any interval whose code is in the group's set feeds the group's surface. That's exactly what makes it
// useful ("a basalt logged as andesite in one hole"), and exactly what makes a mistaken merge invisible
// — two genuinely separate bodies grouped together get stitched into ONE surface spanning the gap
// between them, which looks like a real (if odd) result rather than an error. Single-linkage clustering
// over the group's own interface points answers "do these points actually form one body?": union-find,
// joining any two points closer than `threshold` apart. O(n^2) over a per-unit control-point count
// (tens to a few hundred), the same complexity filterBySearchSupport already accepts.
// Returns clusters sorted largest-first, each with its size, its own centroid, and the source codes that
// contributed to it — the codes are the actionable part, since "cluster A is all DACT, cluster B is all
// SED" is the signal that the merge was wrong, whereas both clusters containing both codes just means
// the unit itself outcrops in two places.
export function spatialClusters(points, threshold) {
  const n = points.length;
  const parent = new Array(n).fill(0).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const t2 = threshold * threshold;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (find(i) === find(j)) continue;
      const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y, dz = points[i].z - points[j].z;
      if (dx * dx + dy * dy + dz * dz <= t2) union(i, j);
    }
  }
  const byRoot = new Map();
  points.forEach((p, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, { size: 0, sx: 0, sy: 0, sz: 0, codes: new Set() });
    const c = byRoot.get(r);
    c.size++; c.sx += p.x; c.sy += p.y; c.sz += p.z;
    if (p.srcCode) c.codes.add(p.srcCode);
  });
  return [...byRoot.values()]
    .map((c) => ({ size: c.size, centroid: { x: c.sx / c.size, y: c.sy / c.size, z: c.sz / c.size }, codes: [...c.codes] }))
    .sort((a, b) => b.size - a.size);
}

// TASKS.csv #77/#81 — bilinear-sample a terrain heightfield ({bbox,gridW,gridH,elevations}) at a
// real-world (x,y) point. Used both to build the terrain mesh itself (trivially — every mesh vertex
// IS a grid sample) and to drape a raster onto it (#81 — a raster's own footprint/resolution rarely
// lines up with the terrain grid, so each raster-mesh vertex needs an interpolated height at an
// arbitrary point, not just a nearest grid cell). Row 0 of `elevations` is the bbox's north/ymax edge
// (matching parseDEM's own row order, which matches image row order for a north-up GeoTIFF).
// TASKS.csv #321 — a SimPEG inversion model carries each cell's normalised sensitivity ("support": how
// much the data can see that cell). Cells below the model's supportCutoff are hidden everywhere a voxel
// model is drawn or sampled, because their value reflects the regularisation, not the rock. Imported
// models have no `support` and are unaffected.
export function voxelCellSupported(model, c) {
  return !(model.supportCutoff > 0 && c.support != null && c.support < model.supportCutoff);
}

export function sampleTerrainElevation(terrain, x, y) {
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const { gridW, gridH, elevations } = terrain;
  const fx = gridW <= 1 ? 0 : ((x - xmin) / (xmax - xmin)) * (gridW - 1);
  const fy = gridH <= 1 ? 0 : ((ymax - y) / (ymax - ymin)) * (gridH - 1); // row 0 = north/ymax
  const cx = Math.min(gridW - 1, Math.max(0, fx));
  const cy = Math.min(gridH - 1, Math.max(0, fy));
  const x0 = Math.floor(cx), x1 = Math.min(gridW - 1, x0 + 1);
  const y0 = Math.floor(cy), y1 = Math.min(gridH - 1, y0 + 1);
  const tx = cx - x0, ty = cy - y0;
  const at = (xi, yi) => elevations[yi * gridW + xi];
  const top = at(x0, y0) * (1 - tx) + at(x1, y0) * tx;
  const bot = at(x0, y1) * (1 - tx) + at(x1, y1) * tx;
  return top * (1 - ty) + bot * ty;
}
