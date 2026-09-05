// TASKS.csv #146 — DISTANCE-TO-SURFACE / POINT-IN-DOMAIN GEOMETRY.
//
// Pure geometry kernel behind the "how far is this hole from surface X" and "how many metres of hole Y
// sit inside domain Z" reporting tool. Deliberately three.js-free and DOM-free: it takes a plain
// triangle soup (a Float32Array/array of vertex positions + an index array, exactly what
// `mesh.geometry.attributes.position.array` / `mesh.geometry.index.array` already hold for every
// surface built by the implicit-modelling tools) and plain {x,y,z} points, so it can be unit-verified
// in Node against analytic ground truth with no renderer in the loop. That verification is the whole
// reason it lives here rather than inline in ViewerModule.jsx — see the TASKS.csv #146 notes for the
// sphere/box numbers it was checked against.
//
// WHAT THIS ANSWERS, and how:
//   * closestPointOnMesh(q, p)  — EXACT point-to-triangle-mesh distance (Ericson's closest-point-on-
//     triangle, i.e. the true distance to the nearest face/edge/vertex, not the distance to the nearest
//     VERTEX, which is the usual shortcut and can be badly wrong on a coarse mesh: on a 36^3 marching-
//     cubes surface the triangles are metres across, so nearest-vertex over-reports by up to half an
//     edge length).
//   * isPointInsideMesh(q, p)   — ray-cast parity (odd number of crossings = inside). Voted over three
//     non-axis-aligned directions because a single ray that happens to graze an edge or hit a shared
//     edge exactly is the classic failure mode of parity testing; three independent directions and a
//     majority make that essentially impossible on real data while staying cheap.
//   * segmentIntersections / intervalsInsideMesh — the "metres of hole inside" answer. Finds the exact
//     MDs where the hole's desurveyed polyline crosses the mesh, then classifies each resulting
//     sub-interval by a single inside-test at its midpoint. That is exact up to the polyline's own
//     discretisation, and crucially it does NOT depend on a sampling step: a 0.4 m sliver of hole
//     inside a shell is reported at its true length, not rounded to a sample interval.
//
// PERFORMANCE (memory: performance is priority #1 for this app, on modest hardware). Every query goes
// through a median-split BVH built once per surface and cached by the caller. Brute force would be
// O(triangles) per query, and the real workload here is 37 holes x ~100 trace vertices x several
// surfaces — tens of thousands of queries against meshes of tens of thousands of triangles, i.e.
// hundreds of millions of triangle tests. With the BVH each distance query prunes to a handful of
// nodes (log T), which is what makes the whole-project report finish in well under a second instead of
// locking the UI. classifyPointAgainstFault in ViewerModule.jsx (TASKS.csv #89) is intentionally left
// alone: it answers a different question (which SIDE of an open fault surface) and runs once per
// control point, not per trace vertex.

const LEAF_SIZE = 8;

function boxOf(positions, indices, triIndices, from, to) {
  let minx = Infinity, miny = Infinity, minz = Infinity;
  let maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (let k = from; k < to; k++) {
    const t = triIndices[k] * 3;
    for (let c = 0; c < 3; c++) {
      const v = indices[t + c] * 3;
      const x = positions[v], y = positions[v + 1], z = positions[v + 2];
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (z < minz) minz = z; if (z > maxz) maxz = z;
    }
  }
  return { minx, miny, minz, maxx, maxy, maxz };
}

/**
 * Build a reusable query object for one triangle mesh.
 * @param {ArrayLike<number>} positions flat [x,y,z, x,y,z, ...] vertex coordinates
 * @param {ArrayLike<number>} indices flat [i0,i1,i2, ...] triangle vertex indices
 * @returns {{positions, indices, triCount, bounds, root}|null} null for an empty/degenerate mesh
 */
export function buildMeshQuery(positions, indices) {
  if (!positions || !indices || indices.length < 3) return null;
  const triCount = Math.floor(indices.length / 3);
  if (!triCount) return null;

  // Centroids drive the split; computed once up front rather than per recursion level.
  const cx = new Float64Array(triCount), cy = new Float64Array(triCount), cz = new Float64Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    cx[t] = (positions[a] + positions[b] + positions[c]) / 3;
    cy[t] = (positions[a + 1] + positions[b + 1] + positions[c + 1]) / 3;
    cz[t] = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
  }
  const triIndices = new Uint32Array(triCount);
  for (let t = 0; t < triCount; t++) triIndices[t] = t;

  const build = (from, to, depth) => {
    const box = boxOf(positions, indices, triIndices, from, to);
    const node = { ...box, from, to, left: null, right: null };
    const n = to - from;
    if (n <= LEAF_SIZE || depth > 40) return node;
    // Split on the longest axis of the node's own bounding box, at the median centroid. Median (not
    // midpoint) keeps the tree balanced on the very non-uniform triangle distributions marching cubes
    // produces, where a midpoint split routinely puts everything on one side.
    const ex = box.maxx - box.minx, ey = box.maxy - box.miny, ez = box.maxz - box.minz;
    const axis = ex >= ey && ex >= ez ? cx : ey >= ez ? cy : cz;
    const slice = Array.prototype.slice.call(triIndices, from, to);
    slice.sort((p, q) => axis[p] - axis[q]);
    for (let k = 0; k < slice.length; k++) triIndices[from + k] = slice[k];
    const mid = from + (n >> 1);
    if (mid === from || mid === to) return node; // all centroids coincident — keep as a leaf
    node.left = build(from, mid, depth + 1);
    node.right = build(mid, to, depth + 1);
    return node;
  };

  const root = build(0, triCount, 0);
  return {
    positions, indices, triIndices, triCount,
    bounds: { min: { x: root.minx, y: root.miny, z: root.minz }, max: { x: root.maxx, y: root.maxy, z: root.maxz } },
    root,
  };
}

// Squared distance from a point to an axis-aligned box (0 when inside) — the BVH pruning test.
function distSqToBox(node, px, py, pz) {
  const dx = px < node.minx ? node.minx - px : px > node.maxx ? px - node.maxx : 0;
  const dy = py < node.miny ? node.miny - py : py > node.maxy ? py - node.maxy : 0;
  const dz = pz < node.minz ? node.minz - pz : pz > node.maxz ? pz - node.maxz : 0;
  return dx * dx + dy * dy + dz * dz;
}

// Closest point on triangle ABC to P — Ericson, "Real-Time Collision Detection" §5.1.5. Handles all
// seven Voronoi regions (three vertices, three edges, the face interior) so the result is the true
// closest point, including for very obtuse/sliver triangles, which marching cubes produces plenty of.
function closestOnTri(px, py, pz, ax, ay, az, bx, by, bz, cx0, cy0, cz0, out) {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx0 - ax, acy = cy0 - ay, acz = cz0 - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; return; }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; return; }
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    out[0] = ax + abx * v; out[1] = ay + aby * v; out[2] = az + abz * v; return;
  }
  const cpx = px - cx0, cpy = py - cy0, cpz = pz - cz0;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) { out[0] = cx0; out[1] = cy0; out[2] = cz0; return; }
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    out[0] = ax + acx * w; out[1] = ay + acy * w; out[2] = az + acz * w; return;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    out[0] = bx + (cx0 - bx) * w; out[1] = by + (cy0 - by) * w; out[2] = bz + (cz0 - bz) * w; return;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  out[0] = ax + abx * v + acx * w;
  out[1] = ay + aby * v + acy * w;
  out[2] = az + abz * v + acz * w;
}

const _cp = [0, 0, 0];

/**
 * Exact minimum distance from a point to the mesh surface.
 * @returns {{distance:number, point:{x,y,z}, triangle:number}|null}
 */
export function closestPointOnMesh(q, p) {
  if (!q || !q.root) return null;
  const { positions, indices, triIndices } = q;
  const px = p.x, py = p.y, pz = p.z;
  let bestD2 = Infinity, bx = 0, by = 0, bz = 0, bestTri = -1;

  const visit = (node) => {
    if (distSqToBox(node, px, py, pz) >= bestD2) return; // whole subtree can't beat the current best
    if (!node.left) {
      for (let k = node.from; k < node.to; k++) {
        const t = triIndices[k];
        const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
        closestOnTri(px, py, pz,
          positions[ia], positions[ia + 1], positions[ia + 2],
          positions[ib], positions[ib + 1], positions[ib + 2],
          positions[ic], positions[ic + 1], positions[ic + 2], _cp);
        const dx = _cp[0] - px, dy = _cp[1] - py, dz = _cp[2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bestD2) { bestD2 = d2; bx = _cp[0]; by = _cp[1]; bz = _cp[2]; bestTri = t; }
      }
      return;
    }
    // Descend into the nearer child first so the far child is usually pruned outright.
    const dl = distSqToBox(node.left, px, py, pz), dr = distSqToBox(node.right, px, py, pz);
    if (dl <= dr) { visit(node.left); visit(node.right); } else { visit(node.right); visit(node.left); }
  };
  visit(q.root);
  if (bestTri < 0) return null;
  return { distance: Math.sqrt(bestD2), point: { x: bx, y: by, z: bz }, triangle: bestTri };
}

const RAY_EPS = 1e-9;
// Barycentric slack that counts a hit as landing ON a triangle's boundary rather than in its interior.
// A hit inside this band is exactly the degenerate case that breaks parity counting (see EDGE-HIT
// DEGENERACY below), so it is reported to the caller instead of being silently trusted.
const EDGE_EPS = 1e-9;

// Möller–Trumbore. Returns the ray parameter t (> tMin) or -1. Two-sided: a surface's facing is not
// trustworthy on meshes assembled from several sources, and parity counting doesn't need it.
//
// `state` (optional) is flagged `degenerate` when the hit lands on a triangle EDGE or VERTEX. That
// matters because an interior edge is shared by two triangles, so a ray through it is counted TWICE
// (or, with a tighter tolerance, zero times) — either way the parity flips to the wrong answer. The
// caller's job is to notice and re-shoot; see isPointInsideMesh.
function rayTri(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, cx0, cy0, cz0, tMin, state) {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx0 - ax, e2y = cy0 - ay, e2z = cz0 - az;
  const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -RAY_EPS && det < RAY_EPS) return -1; // ray parallel to the triangle plane
  const inv = 1 / det;
  const tx = ox - ax, ty = oy - ay, tz = oz - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < -1e-10 || u > 1 + 1e-10) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * inv;
  if (v < -1e-10 || u + v > 1 + 1e-10) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  if (!(t > tMin)) return -1;
  if (state && (u < EDGE_EPS || v < EDGE_EPS || u + v > 1 - EDGE_EPS)) state.degenerate = true;
  return t;
}

// Slab test — does the (infinite) ray hit this node's box at all?
function rayHitsBox(node, ox, oy, oz, idx, idy, idz) {
  let tmin = -Infinity, tmax = Infinity;
  let t1 = (node.minx - ox) * idx, t2 = (node.maxx - ox) * idx;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (node.miny - oy) * idy; t2 = (node.maxy - oy) * idy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (node.minz - oz) * idz; t2 = (node.maxz - oz) * idz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  return tmax >= Math.max(tmin, 0);
}

// Every ray parameter t > tMin at which the ray from `p` in direction `d` crosses the mesh.
function rayHits(q, p, d, out, tMin, state) {
  const { positions, indices, triIndices } = q;
  const idx = 1 / (d.x || 1e-30), idy = 1 / (d.y || 1e-30), idz = 1 / (d.z || 1e-30);
  const lo = tMin != null ? tMin : RAY_EPS;
  const visit = (node) => {
    if (!rayHitsBox(node, p.x, p.y, p.z, idx, idy, idz)) return;
    if (!node.left) {
      for (let k = node.from; k < node.to; k++) {
        const t = triIndices[k];
        const ia = indices[t * 3] * 3, ib = indices[t * 3 + 1] * 3, ic = indices[t * 3 + 2] * 3;
        const hit = rayTri(p.x, p.y, p.z, d.x, d.y, d.z,
          positions[ia], positions[ia + 1], positions[ia + 2],
          positions[ib], positions[ib + 1], positions[ib + 2],
          positions[ic], positions[ic + 1], positions[ic + 2], lo, state);
        if (hit !== -1) out.push(hit);
      }
      return;
    }
    visit(node.left); visit(node.right);
  };
  visit(q.root);
  return out;
}

// EDGE-HIT DEGENERACY — the classic way a ray-parity inside/outside test gets a confidently wrong
// answer, and the reason this is not simply "shoot one ray and count".
//
// An interior edge of a closed mesh is shared by exactly two triangles. A ray that passes EXACTLY
// through such an edge is reported as a hit by BOTH of them, so one true crossing is counted twice and
// the parity flips: an interior point is declared outside. Tightening the barycentric tolerance does
// not help — then the edge is hit by NEITHER triangle and the count is 0, which is even too.
//
// The original implementation here tried to dodge this with a majority vote over three fixed
// directions. VERIFIED NOT SUFFICIENT (TASKS.csv #146): for the point (8,16,2.5) inside the box
// 0..10 x 0..20 x 0..5, the ray along (1,1,1) exits exactly along the shared diagonal edge of the
// x=10 face — and so does the second vote direction, because those two directions happen to share the
// ratio rz - ry/4 = 3/4 that this particular edge slope needs. Two of three votes wrong = wrong answer.
// Fixed directions can always be defeated this way; the mesh's edges are not known in advance.
//
// The fix is to detect the degeneracy rather than out-vote it. rayTri flags any hit that lands on a
// triangle boundary, and this routine simply re-shoots along a different direction until it gets a ray
// whose every hit is strictly interior to its triangle — such a ray's parity is exact, so ONE of them
// settles the question (cheaper than the old three-ray vote in the common case, as well as correct).
// Only if every direction is degenerate — which in practice means the point lies ON the surface, where
// "inside" has no answer — does it fall back to a majority of what it saw.
const VOTE_DIRS = [
  { x: 0.5773502691896258, y: 0.5773502691896258, z: 0.5773502691896258 },
  { x: 0.8017837257372732, y: -0.2672612419124244, z: 0.5345224838248488 },
  { x: -0.3244428422615251, y: 0.4866642633922877, z: 0.8111071056538128 },
];
const MAX_RAY_TRIES = 12;

// Deterministic (so a report is reproducible run to run) spread of extra directions over the sphere,
// via the golden-angle spiral — successive directions are maximally unlike each other and unlike the
// three fixed ones, which is exactly what "try again somewhere else" needs.
function voteDir(i) {
  if (i < VOTE_DIRS.length) return VOTE_DIRS[i];
  const k = i - VOTE_DIRS.length;
  const phi = 2.399963229728653 * (k + 1); // golden angle in radians
  const cz = 1 - 2 * ((k + 0.5) / (MAX_RAY_TRIES - VOTE_DIRS.length));
  const s = Math.sqrt(Math.max(0, 1 - cz * cz));
  return { x: s * Math.cos(phi), y: s * Math.sin(phi), z: cz };
}

/**
 * Is the point inside the (closed) mesh? Ray-parity along the first direction that produces no
 * boundary (edge/vertex) hit — see EDGE-HIT DEGENERACY above.
 * An unclosed surface (a draped stratigraphic contact, say) has no well-defined inside — the caller is
 * responsible for only asking this of closed bodies; see isMeshClosed().
 */
export function isPointInsideMesh(q, p) {
  if (!q || !q.root) return false;
  const b = q.bounds;
  // Cheap reject: outside the bounding box is unambiguously outside, and this is the common case when
  // sweeping a whole project's holes past a small shell.
  if (p.x < b.min.x || p.x > b.max.x || p.y < b.min.y || p.y > b.max.y || p.z < b.min.z || p.z > b.max.z) return false;
  const hits = [];
  let odd = 0, tried = 0;
  for (let i = 0; i < MAX_RAY_TRIES; i++) {
    hits.length = 0;
    const state = { degenerate: false };
    rayHits(q, p, voteDir(i), hits, RAY_EPS, state);
    const parity = hits.length % 2 === 1;
    if (!state.degenerate) return parity; // clean ray — exact, no vote needed
    tried++;
    if (parity) odd++;
  }
  // Every direction grazed a boundary. Almost certainly the point is ON the surface, where the question
  // has no true answer; return the majority rather than pretending to more precision than exists.
  return odd * 2 > tried;
}

/**
 * Signed distance: positive outside, negative inside. `closed` false (an open surface) returns the
 * unsigned distance with sign 0, because "inside" is meaningless there and inventing a sign would be
 * the more dangerous answer.
 */
export function signedDistanceToMesh(q, p, closed) {
  const near = closestPointOnMesh(q, p);
  if (!near) return null;
  if (!closed) return { ...near, signed: null, inside: null };
  const inside = isPointInsideMesh(q, p);
  return { ...near, signed: inside ? -near.distance : near.distance, inside };
}

/**
 * Does this triangle soup form a closed (watertight) shell? Counts how many undirected edges are not
 * shared by exactly two triangles. A grade shell / alteration envelope built by marching cubes is
 * closed except where it is clipped by the grid boundary; a draped GemPy contact is wide open. The
 * caller uses this to decide whether "inside" is even a question worth asking, and to warn honestly
 * when a shell is only nearly closed.
 * @returns {{closed:boolean, boundaryEdges:number, edges:number}}
 */
export function isMeshClosed(positions, indices) {
  const counts = new Map();
  const triCount = Math.floor((indices?.length || 0) / 3);
  for (let t = 0; t < triCount; t++) {
    const i0 = indices[t * 3], i1 = indices[t * 3 + 1], i2 = indices[t * 3 + 2];
    const pairs = [[i0, i1], [i1, i2], [i2, i0]];
    for (const [a, b] of pairs) {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let boundary = 0;
  counts.forEach((c) => { if (c !== 2) boundary++; });
  return { closed: boundary === 0, boundaryEdges: boundary, edges: counts.size };
}

// Half-open [0, 1): a crossing that lands exactly on the SHARED vertex between two consecutive
// polyline segments belongs to the second one, so it is found exactly once.
//
// This convention is not cosmetic. VERIFIED BUG (TASKS.csv #146): the previous (0, 1) form excluded
// t=0 AND t=1, so a crossing sitting exactly on a trace vertex was found by NEITHER segment and
// vanished. A vertical hole with 2 m trace vertices dropped straight through a cube whose faces sit at
// z=10 and z=0 (both exactly on trace vertices) reported 0.0 m inside instead of 10.0 m — not a small
// error, a total miss. Exact coincidences like that are not exotic on real data: a marching-cubes
// surface's faces sit on round grid coordinates and a desurveyed trace is sampled at round MDs, so
// they line up constantly.
const T_EPS = 1e-12;

/**
 * All parameters t in [0,1) at which segment A->B crosses the mesh, sorted ascending.
 */
export function segmentIntersections(q, a, b) {
  if (!q || !q.root) return [];
  const d = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len2 = d.x * d.x + d.y * d.y + d.z * d.z;
  if (len2 <= 0) return [];
  // t is already in segment-parameter units because d is not normalized. tMin is just below 0 so a
  // crossing exactly AT the segment start (t === 0) is kept.
  const hits = rayHits(q, a, d, [], -T_EPS, null);
  return hits.filter((t) => t >= -T_EPS && t < 1 - T_EPS).sort((x, y) => x - y);
}

/**
 * THE "how many metres of hole Y sit inside domain Z" ANSWER.
 *
 * @param q         mesh query object (buildMeshQuery)
 * @param trace     [{md, x, y, z}, ...] — a desurveyed hole polyline, in the SAME coordinate frame as
 *                  the mesh
 * @param opts.fromMd / opts.toMd  optional MD window (defaults to the whole trace)
 * @returns {{intervals:[{from,to,length,inside}], insideLength:number, totalLength:number,
 *           crossings:[{md, point}]}}
 *
 * Method: find the exact MDs where the polyline crosses the mesh (segment/triangle intersections,
 * linear in MD within each polyline segment), split the hole at those MDs, and classify each resulting
 * piece with ONE inside-test at its midpoint. Length is then exact along the polyline rather than
 * quantised to a sampling step — a 0.4 m intercept reports as 0.4 m. Cost is one ray-parity test per
 * piece, and a real hole crosses a real shell a handful of times, so this is cheap as well as exact.
 */
export function intervalsInsideMesh(q, trace, opts = {}) {
  const empty = { intervals: [], insideLength: 0, totalLength: 0, crossings: [] };
  if (!q || !q.root || !trace || trace.length < 2) return empty;
  const fromMd = opts.fromMd != null ? opts.fromMd : trace[0].md;
  const toMd = opts.toMd != null ? opts.toMd : trace[trace.length - 1].md;
  if (!(toMd > fromMd)) return empty;

  // Crossing MDs, plus the window ends.
  const cuts = [fromMd, toMd];
  const crossings = [];
  for (let i = 0; i < trace.length - 1; i++) {
    const a = trace[i], b = trace[i + 1];
    if (b.md <= fromMd || a.md >= toMd) continue;
    const ts = segmentIntersections(q, a, b);
    for (const t of ts) {
      const md = a.md + (b.md - a.md) * t;
      if (md > fromMd && md < toMd) {
        cuts.push(md);
        crossings.push({ md, point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t } });
      }
    }
  }
  cuts.sort((x, y) => x - y);
  crossings.sort((x, y) => x.md - y.md);
  // Collapse duplicate crossings at (effectively) the same MD. A ray through an edge shared by two
  // triangles legitimately reports two hits at the same t; that is harmless for the length arithmetic
  // below (the zero-length piece between them is skipped) but would show up as two entry depths 0.000 m
  // apart in the report, so it is squashed here rather than presented as a real pair of intercepts.
  const dedup = [];
  for (const c of crossings) if (!dedup.length || c.md - dedup[dedup.length - 1].md > 1e-6) dedup.push(c);
  crossings.length = 0;
  crossings.push(...dedup);

  const intervals = [];
  let insideLength = 0, totalLength = 0;
  for (let i = 0; i < cuts.length - 1; i++) {
    const f = cuts[i], t = cuts[i + 1];
    if (!(t - f > 1e-6)) continue;
    const mid = pointAtMd(trace, (f + t) / 2);
    if (!mid) continue;
    // Length measured along the polyline itself, not collar-to-toe straight-line — a curved hole's
    // downhole metres are what a geologist reports, and they are simply the MD difference.
    const len = t - f;
    const inside = isPointInsideMesh(q, mid);
    totalLength += len;
    if (inside) insideLength += len;
    // Merge with the previous piece when the classification is unchanged (happens when a crossing was
    // a grazing double-hit) so the report doesn't show two abutting "inside" rows.
    const prev = intervals[intervals.length - 1];
    if (prev && prev.inside === inside && Math.abs(prev.to - f) < 1e-6) { prev.to = t; prev.length += len; }
    else intervals.push({ from: f, to: t, length: len, inside });
  }
  return { intervals, insideLength, totalLength, crossings };
}

/**
 * Position on a desurveyed trace at an arbitrary MD (linear between polyline vertices) — the same
 * interpolation desurvey.js's pointOnTrace uses, duplicated here only so this module stays importable
 * with no dependencies at all for Node-side verification.
 */
export function pointAtMd(trace, md) {
  if (!trace || !trace.length) return null;
  for (let i = 0; i < trace.length - 1; i++) {
    if (md >= trace[i].md - 1e-9 && md <= trace[i + 1].md + 1e-9) {
      const span = trace[i + 1].md - trace[i].md, t = span <= 0 ? 0 : (md - trace[i].md) / span;
      return {
        x: trace[i].x + (trace[i + 1].x - trace[i].x) * t,
        y: trace[i].y + (trace[i + 1].y - trace[i].y) * t,
        z: trace[i].z + (trace[i + 1].z - trace[i].z) * t,
      };
    }
  }
  const e = md <= trace[0].md ? trace[0] : trace[trace.length - 1];
  return { x: e.x, y: e.y, z: e.z };
}

/**
 * Closest approach of a whole hole to a surface, and where the hole actually pierces it.
 * Distance is evaluated at every trace vertex AND at every crossing (where it is 0 by construction) —
 * evaluating only at vertices would miss a near-miss that happens between two 3 m-spaced vertices by up
 * to ~1.5 m, which is enough to matter for a QC number. To bound that, the trace is resampled to
 * `opts.step` (default 1 m) before the sweep.
 * @returns {{minDistance, atMd, atPoint, nearestOnSurface, intercepts:[{md, point}]}|null}
 */
export function holeDistanceToMesh(q, trace, opts = {}) {
  if (!q || !q.root || !trace || trace.length < 2) return null;
  const step = opts.step > 0 ? opts.step : 1;
  const first = trace[0].md, last = trace[trace.length - 1].md;
  let best = null, bestMd = first;
  for (let md = first; md <= last + 1e-9; md += step) {
    const p = pointAtMd(trace, Math.min(md, last));
    const near = closestPointOnMesh(q, p);
    if (near && (!best || near.distance < best.distance)) { best = { ...near, at: p }; bestMd = Math.min(md, last); }
  }
  const { crossings } = intervalsInsideMesh(q, trace);
  if (crossings.length) { best = { distance: 0, point: crossings[0].point, at: crossings[0].point, triangle: -1 }; bestMd = crossings[0].md; }
  if (!best) return null;
  return {
    minDistance: best.distance,
    atMd: bestMd,
    atPoint: best.at,
    nearestOnSurface: best.point,
    intercepts: crossings,
  };
}
