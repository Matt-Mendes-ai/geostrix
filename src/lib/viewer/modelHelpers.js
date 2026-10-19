import { buildMeshQuery, closestPointOnMesh } from "../meshQuery.js"; // TASKS.csv #518
// TASKS.csv #445 step 2 — plain helpers the modelling runs (modules/viewer/useModelling.js) and ViewerModule.jsx
// both use, moved unchanged from the top of ViewerModule.jsx (comments included).

// interpolate a position on a desurveyed polyline at a given MD
// Same interpolation as findOnTrace below, but over a trace's ABSOLUTE world coordinate arrays
// (t.wx/t.wy/t.wz, parallel to t.pts) instead of scene-local ones — used by the new "Export
// Shapefile" vector export (TASKS.csv, user request), which needs real-world coordinates, not the
// origin-relative scene positions everything else in this file works in.
export function findOnTraceWorld(t, md) {
  const pts = t.pts;
  if (!pts.length) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (md >= pts[i].md - 0.01 && md <= pts[i + 1].md + 0.01) {
      const span = pts[i + 1].md - pts[i].md, frac = span <= 0 ? 0 : (md - pts[i].md) / span;
      return [
        t.wx[i] + (t.wx[i + 1] - t.wx[i]) * frac,
        t.wy[i] + (t.wy[i + 1] - t.wy[i]) * frac,
        t.wz[i] + (t.wz[i + 1] - t.wz[i]) * frac,
      ];
    }
  }
  const idx = md <= pts[0].md ? 0 : pts.length - 1;
  return [t.wx[idx], t.wy[idx], t.wz[idx]];
}

export function findOnTrace(pts, md) {
  if (!pts.length) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    if (md >= pts[i].md - 0.01 && md <= pts[i + 1].md + 0.01) {
      const span = pts[i + 1].md - pts[i].md, t = span <= 0 ? 0 : (md - pts[i].md) / span;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t, z: pts[i].z + (pts[i + 1].z - pts[i].z) * t };
    }
  }
  const edge = md <= pts[0].md ? pts[0] : pts[pts.length - 1];
  return { x: edge.x, y: edge.y, z: edge.z };
}

// TASKS.csv #84 — geological architecture layer 3. A "boundary intercept" is just an existing litho/alt
// interval's top (`from`), which is the same row #29/#55's implicit-modelling tools already read as an
// interface point — this doesn't introduce a separate stored table, it gives that same row a stable id
// so the user's decision to review/exclude it as a control point can be remembered (in
// store.jsx's excludedIntercepts) without duplicating the interval data itself. Deliberately keyed off
// from/value rather than an array index, since layers.litho/layers.alt can be re-filtered/re-ordered by
// import/removal without changing which physical intercept a row represents.
export function interceptId(layerKey, row) {
  return `${layerKey}:${row.hole_id}:${row.from}:${row.value}`;
}

// TASKS.csv #88 — nugget value sent for a point marked "soft" in the Boundary intercepts table. GemPy's
// own default is ~2e-5 (verified directly against the installed package — effectively "pass through
// exactly"); 0.5 is a deliberately loose starting tolerance so the difference is visually obvious on a
// first try rather than needing to be tuned before it does anything.
export const SOFT_NUGGET = 0.5;

// TASKS.csv — bug report: "surfaces wrapping around itself" on properties with a large hole-to-hole
// spread. Cause: the modelling extent used to pad 15% of the drillhole trace SPAN on every axis with
// no ceiling, so on a property where holes are spread over kilometers, GemPy was asked to extrapolate
// its implicit potential field hundreds of meters to kilometers past any real data — far enough that
// the field can fold back on itself and produce a spurious closed/self-wrapping surface, a known
// implicit-modelling artifact once you're extrapolating rather than interpolating (see #91's own note
// on that distinction, still Planned). Capping padding to a fixed ceiling bounds how far past the
// actual drillhole data any surface is asked to extend, regardless of how spread out the property is.
export const MODEL_EXTENT_PAD_M = 500;

// A rough starting guess at a new surface's type from the tool/name that created it — the user can
// always override it via the dropdown next to each surface in the Modelling tab's list. Structural
// picks are the ambiguous case (a "structure" layer covers contacts, faults, shear zones, foliation,
// veins all under one layer type — see sample_data's own structure.csv) — a fault/shear-sounding
// value guesses "fault", everything else falls back to "other" rather than guessing wrong.
export function guessSurfaceType(label, meshName) {
  const s = `${label} ${meshName}`.toUpperCase();
  if (s.startsWith("TOP OF") || s.includes("STRATIGRAPHIC")) return "stratigraphic_contact";
  if (s.includes("ALTERATION:")) return "alteration_envelope";
  if (s.includes("STRUCTURE:")) {
    if (/FLT|FAULT|SHR|SHEAR/.test(s)) return "fault";
    if (/DYKE|DIKE/.test(s)) return "dyke";
    if (/\bBX\b|BRECCIA/.test(s)) return "breccia_body";
    return "other";
  }
  return "other";
}

// TASKS.csv #89 — faults as first-class objects that PARTITION the modelling domain, so an
// interpolation run never averages control points from opposite sides of a fault into one
// unrealistic surface. A fault surface (any implicitSurfaces entry with type "fault" — #83) is
// treated as a real dividing surface, not just a plane: classifies a query point's side by finding
// the NEAREST vertex on the fault's already-built three.js mesh and taking the sign of the dot
// product between (point - nearestVertex) and that vertex's normal (computeVertexNormals() already
// runs when the mesh is built in runSurfaceStack, so normals are ready to use here). Brute-force
// nearest-vertex search, not a spatial index — fault meshes are a few thousand vertices at most
// (36^3 GemPy resolution) and this only runs once per control point when a domain-scoped modelling
// tool is actually invoked, not on every frame.
export function classifyPointAgainstFault(point, faultMesh) {
  const geo = faultMesh?.geometry;
  const pos = geo?.attributes?.position, norm = geo?.attributes?.normal;
  // Bug-hunt pass: this used to return 1 ("side A") here, which silently classified every point as
  // side A instead of "fail open" — a domain constraint checking for side B would then wrongly exclude
  // ALL data whenever a fault mesh happened to be missing normals, contradicting the documented
  // fail-open contract (matches pointInDomain's own handling of a missing mesh entirely). Returning
  // null and having pointInDomain treat null as "can't classify, don't exclude" makes the two
  // defensive branches actually agree.
  if (!pos || !norm) return null;
  // TASKS.csv #518 — the side comes from the nearest TRIANGLE and its face normal (as crosscut.js's splitter does),
  // not the nearest VERTEX's normal: GemPy meshes carry orphan vertices that no face uses, whose normal
  // computeVertexNormals leaves at (0,0,0) — a point near one got dot = 0 -> side +1 whatever its real side (a test
  // point 40 m on the -x side of a fault came out +1 because of an orphan 2 m from it). The triangle search uses a
  // BVH (meshQuery.js) built once per fault geometry instead of scanning every vertex per point. A consistently
  // wound mesh's face normals point the same way as its vertex normals, so saved domain sides keep their meaning.
  const q = faultQuery(geo);
  if (!q) return null;
  const near = closestPointOnMesh(q, point);
  if (!near) return null;
  const P = q.positions, I = q.indices, t = near.triangle;
  const ia = I[t * 3] * 3, ib = I[t * 3 + 1] * 3, ic = I[t * 3 + 2] * 3;
  const e1x = P[ib] - P[ia], e1y = P[ib + 1] - P[ia + 1], e1z = P[ib + 2] - P[ia + 2];
  const e2x = P[ic] - P[ia], e2y = P[ic + 1] - P[ia + 1], e2z = P[ic + 2] - P[ia + 2];
  const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
  const dot = (point.x - near.point.x) * nx + (point.y - near.point.y) * ny + (point.z - near.point.z) * nz;
  return dot >= 0 ? 1 : -1;
}
const faultQueries = new WeakMap(); // geometry -> meshQuery BVH (fault meshes are rebuilt, never edited in place)
function faultQuery(geo) {
  if (faultQueries.has(geo)) return faultQueries.get(geo);
  const pos = geo.attributes.position;
  const positions = pos.array instanceof Float32Array || pos.array instanceof Float64Array ? pos.array : Float32Array.from(pos.array);
  const indices = geo.index ? geo.index.array : Uint32Array.from({ length: pos.count }, (_, i) => i);
  const q = indices.length >= 3 ? buildMeshQuery(positions, indices) : null;
  faultQueries.set(geo, q);
  return q;
}

// A domain is an AND of fault-side constraints: [{faultId, side: 1 | -1}, ...] — a point belongs to
// the domain only if it's on the declared side of EVERY constraint (supports the "domain bounded by
// two faults" case the user's design doc mentions, not just a single fault splitting the property in
// two). `meshesRef` is implicitMeshesRef.current — passed explicitly rather than closed over so this
// stays a plain function usable from anywhere, not tied to component render scope.
export function pointInDomain(point, domain, meshesRef) {
  if (!domain || !domain.constraints?.length) return true; // no constraints = unconstrained ("whole property")
  return domain.constraints.every((c) => {
    const mesh = meshesRef[c.faultId];
    if (!mesh) return true; // referenced fault surface was removed — don't silently exclude everything
    const side = classifyPointAgainstFault(point, mesh);
    if (side == null) return true; // couldn't classify (e.g. mesh missing normals) — fail open, not side A
    return side === c.side;
  });
}
