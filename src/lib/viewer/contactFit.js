// TASKS.csv #1170 — which structure picks steer a surface. All picks of the chosen types used to orient every surface: on Woodjam the
// same 38 bedding picks, 4.7 km apart and up to 800 m deep, oriented the top of the overburden, a monzonite and a one-point dyke
// alike. A pick now counts only within `reach` of that unit's own contact points.
// TASKS.csv #1171 — how far the drawn mesh misses those contact points. GemPy's octree cells follow the model box (extent / 2^level:
// about 360 m at Standard on a 5.8 km box), so a mesh can pass 45 m from the point it was fitted through, and the model check,
// measured on the scalar field, cannot see it. Pure: no three.js, no React.
import { pointsToMeshDistance } from "../surfaceSpread.js";
import { median } from "../arrayStats.js";

export const REACH_MIN_M = 100;
export const REACH_MAX_M = 1500;
const MAX_FIT_POINTS = 2000; // the fit runs on the main thread after every surface: a thinned sample says the same thing

// Twice the median collar spacing, 100 m to 1.5 km; 300 m with no spacing to go on (one hole). Collars, not contact points: a
// deviated hole's own contacts sit tens of metres apart in plan, which read as "hole spacing" pinned Woodjam's reach to the floor.
export function autoReachM(collarSpacingM) {
  if (!(collarSpacingM > 0)) return 300;
  return Math.round(Math.max(REACH_MIN_M, Math.min(REACH_MAX_M, 2 * collarSpacingM)));
}

// orientations and points in one frame ({ x, y, z }): those within reachM (3D) of a contact point
export function orientationsNearContacts(orientations, points, reachM) {
  const r2 = reachM * reachM;
  const kept = (orientations || []).filter((o) => (points || []).some((p) => (o.x - p.x) ** 2 + (o.y - p.y) ** 2 + (o.z - p.z) ** 2 <= r2));
  return { kept, total: (orientations || []).length };
}

// The typical length of a mesh edge: the mesh's cell size, in the mesh's units
export function meshCellSize(verts, faces) {
  if (!faces?.length) return NaN;
  const edges = [];
  for (let i = 0; i < faces.length; i += Math.max(1, Math.floor(faces.length / 500))) {
    const a = verts[faces[i][0]], b = verts[faces[i][1]];
    edges.push(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  return median(edges);
}

// points: [[x, y, z]], verts: [[x, y, z]], faces: [[a, b, c]] in one frame -> { n, typical, worst, cell } in metres (typical: the
// median miss), or null with nothing to measure
export function contactFit(points, verts, faces) {
  if (!points?.length || !faces?.length) return null;
  const step = Math.ceil(points.length / MAX_FIT_POINTS);
  const d = pointsToMeshDistance(step > 1 ? points.filter((_, i) => i % step === 0) : points, verts, faces).filter(Number.isFinite);
  if (!d.length) return null;
  return { n: points.length, typical: median(d), worst: Math.max(...d), cell: meshCellSize(verts, faces) };
}

// The octree's cell for a model box: extent = [xmin, xmax, ymin, ymax, zmin, zmax], level 4 Standard, 5 Fine, 6 Very fine
export const octreeCellM = (extent, level) => Math.max(extent[1] - extent[0], extent[3] - extent[2], extent[5] - extent[4]) / 2 ** level;
