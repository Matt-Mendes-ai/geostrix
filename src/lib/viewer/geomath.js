import { cellSupportEnvelope } from "../supportEnvelope.js"; // TASKS.csv #641
import { b64ToBytes } from "../base64.js"; // TASKS.csv #1114
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
// TASKS.csv #641 — a 2D DC/IP line (method "dc" / "ip") uses the column envelope: hidden only below its depth of
// investigation, never as holes through the shallow band.
// TASKS.csv #1161 — a cell the user sees: supported (#321) AND inside the model's cutoff band (threshold / rangeMax, #181 / #188).
// The 3D view, the sections and the level plan all draw exactly these; the sections used to draw every supported cell.
export function voxelCellShown(model, c) {
  const lo = Number.isFinite(model.threshold) ? model.threshold : -Infinity, hi = Number.isFinite(model.rangeMax) ? model.rangeMax : Infinity;
  return c.value >= lo && c.value <= hi && voxelCellSupported(model, c);
}
export function voxelCellSupported(model, c) {
  if (!(model.supportCutoff > 0 && c.support != null)) return true;
  const s = model.method === "dc" || model.method === "ip" ? cellSupportEnvelope(model.cells).get(c) ?? c.support : c.support;
  return !(s < model.supportCutoff);
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

// TASKS.csv #927 — a terrain's filled nodes (demFill.js #421: a DEM's voids, or everything outside a TIN built from
// points or contours, #894, often 90 % of the grid) hold the MEAN elevation. #421 masked them out of the drawn surface
// but kept them for sampling, and every "where is the ground here" closure (ground caps, explicit-surface cuts,
// intrusion tops, inversion meshes, draped samples) read that flat fill as real ground, up to 300 m off. The ground at
// (x, y) is now NaN when any node of its bilinear cell was filled, as it already was outside the terrain, so every
// caller's own "not covered" path (stations, collars, a flat ground) takes over.
const noDataBitsCache = new WeakMap();
function noDataBitsOf(terrain) {
  const m = terrain?.noDataMask;
  if (!m) return null;
  if (m instanceof Uint8Array) return m;
  const hit = noDataBitsCache.get(terrain);
  if (hit && hit.src === m) return hit.bits;
  const bits = b64ToBytes(String(m)); // base64.js: #1114
  noDataBitsCache.set(terrain, { src: m, bits });
  return bits;
}
// true when (x, y) inside the terrain reads any filled node
export function terrainFillAt(terrain, x, y) {
  const bits = noDataBitsOf(terrain);
  if (!bits) return false;
  const [xmin, ymin, xmax, ymax] = terrain.bbox;
  const { gridW, gridH } = terrain;
  const fx = gridW <= 1 ? 0 : Math.min(gridW - 1, Math.max(0, ((x - xmin) / (xmax - xmin)) * (gridW - 1)));
  const fy = gridH <= 1 ? 0 : Math.min(gridH - 1, Math.max(0, ((ymax - y) / (ymax - ymin)) * (gridH - 1)));
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = fx > x0 ? Math.min(gridW - 1, x0 + 1) : x0, y1 = fy > y0 ? Math.min(gridH - 1, y0 + 1) : y0; // a node with no weight does not count
  const off = (i) => (bits[i >> 3] & (1 << (i & 7))) !== 0;
  return off(y0 * gridW + x0) || off(y0 * gridW + x1) || off(y1 * gridW + x0) || off(y1 * gridW + x1);
}
export function terrainNodeIsFill(terrain, i) {
  const bits = noDataBitsOf(terrain);
  return !!bits && (bits[i >> 3] & (1 << (i & 7))) !== 0;
}
// the ground at (x, y): NaN outside the terrain or over filled nodes
export function terrainGroundAt(terrain, x, y) {
  const b = terrain?.bbox;
  if (!b || !(x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])) return NaN;
  return terrainFillAt(terrain, x, y) ? NaN : sampleTerrainElevation(terrain, x, y);
}

