// TASKS.csv #52 (d) — CROSS-CUTTING SUPPORT: truncating a host surface against a cross-cutting body.
//
// THE GAP THIS FILLS
// ------------------
// The stratigraphic stack tool (runSurfaceStack) refuses veins and dykes BY DESIGN — see #61: a stack
// is a set of ordered iso-surfaces of one shared scalar field, which is exactly what makes it
// non-crossing, and a cross-cutting body violates that premise by definition. #144's vein/dyke tool
// then modelled veins properly (a midplane plus a thickness field, src/lib/vein.js) but with NO
// relationship to the stratigraphy at all: a dyke and the contacts it cuts were two independent
// geometries that simply overlapped on screen. Nothing removed the stratigraphic contact from inside
// the dyke, and nothing said whether the dyke reached that contact in the first place.
//
// So cross-cutting is deliberately NOT solved by teaching the stack about veins (which would break the
// property that makes the stack trustworthy). It is solved AFTER the fact, as a geometric operation on
// the finished meshes: run the stack, run the vein/dyke, then truncate. That is also how the geology
// works — the pile existed first and the dyke cut it — and it is the same "purpose-built construction
// rather than forcing geometry through GemPy" precedent #272's alteration halo set.
//
// TWO OPERATIONS, ONE ENGINE
// --------------------------
//   truncateAgainstSolid(host, cutter)  — remove the part of `host` that lies INSIDE a closed cutter
//     (a dyke/vein solid from vein.js, a grade shell, any watertight body). The dyke-through-stack case.
//   splitAcrossSurface(host, cutter)    — cut `host` along an OPEN cutting surface (a fault) and label
//     the two fault blocks. The fault-network case.
// Both are the same triangle-clipping loop over two swappable primitives: a per-vertex classifier
// (inside/outside, or which side of the fault) and a per-edge crossing finder. Clipping happens at the
// EXACT mesh intersection, not at a vertex, so the truncation leaves a clean trace on the host rather
// than a ragged staircase of whole triangles.
//
// WHAT IS DELIBERATELY NOT DONE
// -----------------------------
// No fault DISPLACEMENT. Splitting a surface into two blocks is geometry the meshes already contain;
// offsetting one block by a slip vector is an interpretation with a number nobody has measured here,
// and inventing one would be exactly the kind of confident-looking fabrication this project keeps out
// of shipped copy. splitAcrossSurface reports the blocks; it does not move them.
// No re-meshing or hole-filling of the truncated host: a truncated contact is genuinely open along the
// cut (the rock is gone there, replaced by the dyke), and capping it would state a shape the model does
// not have.
//
// PERFORMANCE (priority #1 on this app's target hardware)
// ------------------------------------------------------
// Everything routes through meshQuery.js's BVH, built ONCE per cutter and reused for every host.
//  - Bounding boxes that do not overlap cost ONE box test and return the host untouched. This is the
//    common case (most surfaces in a project are nowhere near a given dyke), so a "cut everything by
//    everything" sweep is cheap in the cases where nothing happens.
//  - Then one inside-test per host VERTEX (ray parity through the BVH), not per triangle, so a shared
//    vertex is classified once. Only triangles with vertices on both sides do any edge work.
//  - Triangles wholly outside are copied by index, never re-tested.
// Measured cost is in this row's TASKS.csv notes.
//
// COORDINATE FRAME: whatever the caller passes. ViewerModule passes SCENE space (metres, +Y up), the
// same frame topology.js and the implicit meshes themselves already use, so no conversion happens here.

import { buildMeshQuery, isPointInsideMesh, segmentIntersections, closestPointOnMesh, isMeshClosed } from "./meshQuery.js";

// Bisection fallback depth when the ray test cannot find the crossing on an edge whose endpoints
// classify differently (a grazing hit right on the cutter's own surface). 40 halvings takes any edge
// this app will ever see below floating-point resolution.
const BISECT_STEPS = 40;

// How close to a cutting surface counts as ON it. Coordinates are metres, so a micrometre is far below
// anything geological and far above the float noise of an exact coincidence (~1e-12 x coordinate
// magnitude at BC UTM scale).
const ON_SURFACE_TOL = 1e-6;

function bounds(positions) {
  if (!positions || positions.length < 3) return null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i + c];
      if (v < min[c]) min[c] = v;
      if (v > max[c]) max[c] = v;
    }
  }
  return { min, max };
}

function boxesOverlap(a, b, pad = 0) {
  if (!a || !b) return false;
  for (let c = 0; c < 3; c++) {
    if (a.min[c] - pad > b.max[c] || b.min[c] - pad > a.max[c]) return false;
  }
  return true;
}

function vertexAt(positions, i) {
  return { x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] };
}

/**
 * Connected components of a triangle-indexed mesh (union-find over vertex indices) — the same
 * definition volumetrics.js's componentCount uses, restated here on plain arrays so this module can be
 * verified in Node without three.js. THE number that says whether a cut severed a surface.
 */
export function componentCount(indices) {
  const parent = new Map();
  const find = (a) => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(a) !== r) { const nxt = parent.get(a); parent.set(a, r); a = nxt; }
    return r;
  };
  const add = (a) => { if (!parent.has(a)) parent.set(a, a); };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const i0 = indices[t], i1 = indices[t + 1], i2 = indices[t + 2];
    add(i0); add(i1); add(i2);
    union(i0, i1); union(i1, i2);
  }
  const roots = new Set();
  parent.forEach((_, v) => roots.add(find(v)));
  return roots.size;
}

/**
 * THE CLIPPING ENGINE, shared by both public operations.
 *
 * @param host      {positions, indices}
 * @param classify  (point, vertexIndex) -> boolean   true = "on the side being REMOVED"
 * @param crossing  (pKeep, pDrop) -> {x,y,z}|null    the exact boundary point on that edge, walking
 *                                                    from the kept endpoint towards the dropped one
 * @returns {{positions:number[], indices:number[], stats}}
 *
 * Triangle cases, with winding preserved throughout (the host's own facing survives the cut):
 *   0 removed vertices -> triangle kept whole (its indices are reused, no new geometry)
 *   3 removed          -> triangle dropped
 *   1 removed          -> the remaining quad, as two triangles
 *   2 removed          -> one smaller triangle
 * New boundary points are keyed by the ORIGINAL EDGE (min,max vertex index), not by rounded position:
 * two triangles sharing an edge therefore share the identical new vertex INDEX, which is what keeps the
 * cut edge welded. That matters beyond tidiness — componentCount is a union-find over vertex indices,
 * so unwelded duplicates would report a single truncated sheet as dozens of "separate bodies".
 */
function clipMesh(host, classify, crossing) {
  const hp = host.positions, hi = host.indices;
  const vertCount = Math.floor(hp.length / 3);
  const removed = new Uint8Array(vertCount);
  for (let v = 0; v < vertCount; v++) removed[v] = classify(vertexAt(hp, v), v) ? 1 : 0;

  const outPos = [];
  const outIdx = [];
  const origMap = new Map();  // original vertex index -> new index
  const edgeMap = new Map();  // "a_b" (a<b) -> new index of the boundary point on that edge
  let unresolvedEdges = 0;

  const useOrig = (v) => {
    let n = origMap.get(v);
    if (n === undefined) {
      n = outPos.length / 3;
      outPos.push(hp[v * 3], hp[v * 3 + 1], hp[v * 3 + 2]);
      origMap.set(v, n);
    }
    return n;
  };
  // vKeep is the endpoint being kept, vDrop the one being removed. Direction matters: the crossing is
  // found by walking OUT of the kept region, so the first boundary hit is the right one even when a
  // wiggly cutter is pierced several times along one long edge.
  const useEdge = (vKeep, vDrop) => {
    const a = Math.min(vKeep, vDrop), b = Math.max(vKeep, vDrop);
    const key = `${a}_${b}`;
    let n = edgeMap.get(key);
    if (n === undefined) {
      const p = crossing(vertexAt(hp, vKeep), vertexAt(hp, vDrop));
      if (!p) { unresolvedEdges++; return -1; }
      n = outPos.length / 3;
      outPos.push(p.x, p.y, p.z);
      edgeMap.set(key, n);
    }
    return n;
  };

  let kept = 0, dropped = 0, clipped = 0, unresolvedTris = 0;
  const tri = [0, 0, 0];
  for (let t = 0; t + 2 < hi.length; t += 3) {
    tri[0] = hi[t]; tri[1] = hi[t + 1]; tri[2] = hi[t + 2];
    const r = removed[tri[0]] + removed[tri[1]] + removed[tri[2]];
    if (r === 0) {
      outIdx.push(useOrig(tri[0]), useOrig(tri[1]), useOrig(tri[2]));
      kept++;
      continue;
    }
    if (r === 3) { dropped++; continue; }
    // Rotate so the pattern is canonical, preserving cyclic order (and therefore winding).
    let s = 0;
    if (r === 1) { while (!removed[tri[s]]) s++; }            // tri[s] is the single removed vertex
    else { while (!(removed[tri[s]] && !removed[tri[(s + 2) % 3]])) s++; } // tri[s], tri[s+1] removed
    const v0 = tri[s], v1 = tri[(s + 1) % 3], v2 = tri[(s + 2) % 3];
    if (r === 1) {
      // v0 removed; v1, v2 kept. Quad (p01, v1, v2, p20) in the original cyclic order.
      const p01 = useEdge(v1, v0), p20 = useEdge(v2, v0);
      if (p01 < 0 || p20 < 0) { unresolvedTris++; outIdx.push(useOrig(tri[0]), useOrig(tri[1]), useOrig(tri[2])); kept++; continue; }
      const a = useOrig(v1), b = useOrig(v2);
      outIdx.push(p01, a, b, p01, b, p20);
      clipped++;
    } else {
      // v0, v1 removed; v2 kept. Triangle (p12, v2, p20).
      const p12 = useEdge(v2, v1), p20 = useEdge(v2, v0);
      if (p12 < 0 || p20 < 0) { unresolvedTris++; dropped++; continue; }
      outIdx.push(p12, useOrig(v2), p20);
      clipped++;
    }
  }
  return {
    positions: outPos,
    indices: outIdx,
    stats: { trianglesKept: kept, trianglesDropped: dropped, trianglesClipped: clipped, unresolvedEdges, unresolvedTriangles: unresolvedTris },
  };
}

// The exact point where the segment keep->drop leaves the kept region. Ray-parity first (exact, and the
// answer for every ordinary case); bisection only when the ray finds nothing, which happens when an
// endpoint sits within floating-point noise of the cutter itself.
function makeSolidCrossing(q, invert) {
  const isRemoved = (p) => (invert ? !isPointInsideMesh(q, p) : isPointInsideMesh(q, p));
  return (pKeep, pDrop) => {
    const hits = segmentIntersections(q, pKeep, pDrop);
    if (hits.length) {
      const t = hits[0];
      return { x: pKeep.x + (pDrop.x - pKeep.x) * t, y: pKeep.y + (pDrop.y - pKeep.y) * t, z: pKeep.z + (pDrop.z - pKeep.z) * t };
    }
    let lo = 0, hi = 1;
    for (let i = 0; i < BISECT_STEPS; i++) {
      const m = (lo + hi) / 2;
      const p = { x: pKeep.x + (pDrop.x - pKeep.x) * m, y: pKeep.y + (pDrop.y - pKeep.y) * m, z: pKeep.z + (pDrop.z - pKeep.z) * m };
      if (isRemoved(p)) hi = m; else lo = m;
    }
    if (hi >= 1) return null; // never left the kept region — classification disagreed with geometry
    return { x: pKeep.x + (pDrop.x - pKeep.x) * hi, y: pKeep.y + (pDrop.y - pKeep.y) * hi, z: pKeep.z + (pDrop.z - pKeep.z) * hi };
  };
}

/**
 * TRUNCATE a host surface against a closed cutting solid — the dyke-through-stack case.
 *
 * @param host   {positions, indices}  the stratigraphic contact (or any surface) being cut
 * @param cutter {positions, indices}  a CLOSED body (vein.js's `solid`, a grade shell, an imported
 *                                     wireframe). An open cutter has no inside, so the call refuses.
 * @param opts.keep  "outside" (default — remove the host where the dyke is) or "inside" (keep only the
 *                   part within the body; the same primitive, useful for clipping a surface to a domain
 *                   solid).
 * @returns {{ok, changed, reason, positions, indices, stats}}
 *   stats.componentsBefore / componentsAfter — a dyke that fully severs a contact turns 1 into 2.
 *   stats.boundaryLengthBeforeM / AfterM — the surface's open-edge length before and after. The
 *   DIFFERENCE is the truncation trace the cut introduced; reported as two numbers rather than one
 *   "cut length" because the host's own outer rim is in both and subtracting it silently would hide
 *   the case where the cut also removed part of that rim.
 *
 * NOT changed is a first-class answer: a dyke that stops short of a contact returns changed:false with
 * the host untouched and reason "no-overlap" or "no-intersection", which is the geologically correct
 * result and must not be reported as a truncation.
 */
export function truncateAgainstSolid(host, cutter, opts = {}) {
  const keepInside = opts.keep === "inside";
  const fail = (reason) => ({ ok: false, changed: false, reason, positions: host?.positions, indices: host?.indices, stats: null });
  if (!host?.positions?.length || !host?.indices?.length) return fail("empty-host");
  if (!cutter?.positions?.length || !cutter?.indices?.length) return fail("empty-cutter");

  const closure = isMeshClosed(cutter.positions, cutter.indices);
  if (!closure.closed) return { ...fail("cutter-not-closed"), closure };

  const hb = bounds(host.positions), cb = bounds(cutter.positions);
  if (!boxesOverlap(hb, cb)) {
    // ONE box test, and we are done — the cheap and common case, so nothing else is computed here.
    // componentsBefore/After are null rather than 1: counting components on an untouched mesh is a
    // union-find over every triangle (19 ms on a 39k-triangle surface, measured), which is pure waste
    // when the answer is "this cutter is nowhere near this surface". Callers report the counts only
    // when a cut actually happened.
    return { ok: true, changed: false, reason: "no-overlap", positions: host.positions, indices: host.indices,
      stats: { componentsBefore: null, componentsAfter: null, trianglesKept: Math.floor(host.indices.length / 3), trianglesDropped: 0, trianglesClipped: 0, unresolvedEdges: 0, unresolvedTriangles: 0 } };
  }

  const q = buildMeshQuery(cutter.positions, cutter.indices);
  if (!q) return fail("cutter-unqueryable");
  const inside = (p) => isPointInsideMesh(q, p);
  const classify = keepInside ? (p) => !inside(p) : (p) => inside(p);
  const res = clipMesh(host, classify, makeSolidCrossing(q, keepInside));

  if (!res.stats.trianglesDropped && !res.stats.trianglesClipped) {
    return { ok: true, changed: false, reason: keepInside ? "nothing-inside" : "no-intersection",
      positions: host.positions, indices: host.indices,
      stats: { ...res.stats, componentsBefore: null, componentsAfter: null } };
  }
  const before = componentCount(host.indices);
  return {
    ok: true, changed: true, reason: null,
    positions: res.positions, indices: res.indices,
    stats: {
      ...res.stats,
      componentsBefore: before,
      componentsAfter: componentCount(res.indices),
      boundaryLengthBeforeM: boundaryLength(host.positions, host.indices),
      boundaryLengthAfterM: boundaryLength(res.positions, res.indices),
      vertexCountBefore: Math.floor(host.positions.length / 3),
      vertexCountAfter: Math.floor(res.positions.length / 3),
    },
  };
}

/**
 * SPLIT a host surface across an OPEN cutting surface — the fault-network case.
 *
 * Sidedness comes from the closest point on the fault mesh and that triangle's own normal, which is the
 * same idea as #89's classifyPointAgainstFault but resolved against the nearest TRIANGLE rather than
 * the nearest VERTEX (a vertex normal on a coarse GemPy mesh points somewhere between its triangles;
 * the face it actually sits on does not).
 *
 * THE HONEST LIMIT, reported rather than papered over: an open fault has no side beyond its own extent.
 * Where the fault dies out, a host edge can change sign without ever crossing the fault mesh — there is
 * no cut point to place. Those edges are counted as `unresolvedEdges` and their triangles are LEFT
 * WHOLE (attached to the block they mostly belong to) instead of being cut at an invented location, so
 * the tip region stays continuous. A high unresolved count means the fault does not span the surface
 * and the "two blocks" reading is wrong — the caller must say so.
 *
 * @returns {{ok, changed, reason, negative:{positions,indices}, positive:{positions,indices}, stats}}
 *   where `positive` is the block on the +normal side of the fault.
 */
export function splitAcrossSurface(host, cutter, opts = {}) {
  const fail = (reason) => ({ ok: false, changed: false, reason, stats: null });
  if (!host?.positions?.length || !host?.indices?.length) return fail("empty-host");
  if (!cutter?.positions?.length || !cutter?.indices?.length) return fail("empty-cutter");
  const hb = bounds(host.positions), cb = bounds(cutter.positions);
  if (!boxesOverlap(hb, cb, opts.pad || 0)) return { ok: true, changed: false, reason: "no-overlap", stats: null };

  const q = buildMeshQuery(cutter.positions, cutter.indices);
  if (!q) return fail("cutter-unqueryable");
  const cp = cutter.positions, ci = cutter.indices;
  // Signed side of the fault: + on the side its triangle normals point to.
  const sideOf = (p) => {
    const near = closestPointOnMesh(q, p);
    if (!near) return 0;
    const t = near.triangle;
    const a = ci[t * 3] * 3, b = ci[t * 3 + 1] * 3, c = ci[t * 3 + 2] * 3;
    const e1 = [cp[b] - cp[a], cp[b + 1] - cp[a + 1], cp[b + 2] - cp[a + 2]];
    const e2 = [cp[c] - cp[a], cp[c + 1] - cp[a + 1], cp[c + 2] - cp[a + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const d = [p.x - near.point.x, p.y - near.point.y, p.z - near.point.z];
    const s = n[0] * d[0] + n[1] * d[1] + n[2] * d[2];
    // ZERO IS ASSIGNED TO THE POSITIVE BLOCK, deliberately and not cosmetically. A host vertex sitting
    // exactly ON the fault plane (routine: both meshes are built on round coordinates, so a contact's
    // grid line lands on a planar fault constantly) has no true side. Returning a third "0" state made
    // it "not removed" in BOTH passes, so a triangle whose only off-plane vertex was on one side was
    // kept WHOLE by both — the two blocks then overlapped instead of partitioning. Caught in the Node
    // harness: a fault dying out inside the surface returned 41,400 m2 of block area for a 40,000 m2
    // host. With every vertex forced to one side or the other, the two passes remove complementary
    // vertex sets, so every triangle is resolved by exactly one of them and the blocks partition the
    // host exactly. The choice of WHICH side is arbitrary; the consistency is not.
    return s >= 0 ? 1 : -1;
  };
  const cache = new Map();
  const cachedSide = (p, v) => {
    let s = cache.get(v);
    if (s === undefined) { s = sideOf(p); cache.set(v, s); }
    return s;
  };
  // Crossing on an edge that changes side: the exact intersection with the fault mesh. No bisection
  // fallback here — bisecting on a sign that the fault does not actually define would manufacture a cut
  // point beyond the fault's tip, which is precisely the answer this function refuses to give.
  const crossing = (pKeep, pDrop) => {
    const hits = segmentIntersections(q, pKeep, pDrop);
    if (hits.length) {
      const t = hits[0];
      return { x: pKeep.x + (pDrop.x - pKeep.x) * t, y: pKeep.y + (pDrop.y - pKeep.y) * t, z: pKeep.z + (pDrop.z - pKeep.z) * t };
    }
    // ENDPOINT-ON-THE-FAULT. segmentIntersections is half-open [0,1) — deliberately, see its own
    // comment — so a crossing that sits exactly ON the far endpoint is reported when the edge is walked
    // one way (t = 0) and NOT when it is walked the other (t = 1). The two block passes walk every cut
    // edge in opposite directions, so that asymmetry made one pass clip a triangle and the other drop it
    // as unresolved. Measured in the Node harness: a fault plane lying exactly on a contact's grid line
    // lost 1,000 m2 of a 40,000 m2 surface — the blocks summed to 39,000. Resolving it explicitly here
    // costs two closest-point queries, and only on edges the ray already missed.
    const dDrop = closestPointOnMesh(q, pDrop);
    if (dDrop && dDrop.distance <= ON_SURFACE_TOL) return { x: pDrop.x, y: pDrop.y, z: pDrop.z };
    const dKeep = closestPointOnMesh(q, pKeep);
    if (dKeep && dKeep.distance <= ON_SURFACE_TOL) return { x: pKeep.x, y: pKeep.y, z: pKeep.z };
    return null; // genuinely beyond the fault's tip — no cut point exists, and none is invented
  };

  const negative = clipMesh(host, (p, v) => cachedSide(p, v) > 0, crossing); // removes +side => keeps -
  const positive = clipMesh(host, (p, v) => cachedSide(p, v) < 0, crossing);
  const changed = positive.indices.length > 0 && negative.indices.length > 0;
  return {
    ok: true,
    changed,
    reason: changed ? null : "one-sided",
    negative: { positions: negative.positions, indices: negative.indices },
    positive: { positions: positive.positions, indices: positive.indices },
    stats: {
      componentsBefore: componentCount(host.indices),
      negativeTriangles: Math.floor(negative.indices.length / 3),
      positiveTriangles: Math.floor(positive.indices.length / 3),
      negativeComponents: componentCount(negative.indices),
      positiveComponents: componentCount(positive.indices),
      // Both passes see the same ambiguous edges, so report one pass's count rather than double it.
      unresolvedEdges: Math.max(negative.stats.unresolvedEdges, positive.stats.unresolvedEdges),
      unresolvedTriangles: Math.max(negative.stats.unresolvedTriangles, positive.stats.unresolvedTriangles),
    },
  };
}

/**
 * Total length of the mesh's boundary (edges belonging to exactly one triangle). Used to report how
 * long a truncation trace is — a real, checkable number for "how much of this contact the dyke cut".
 * Note it includes the surface's ORIGINAL outer edge too, so callers compare before vs after.
 */
export function boundaryLength(positions, indices) {
  const counts = new Map();
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const v = [indices[t], indices[t + 1], indices[t + 2]];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const e = counts.get(key);
      if (e) e.n++; else counts.set(key, { n: 1, a, b });
    }
  }
  let len = 0;
  counts.forEach((e) => {
    if (e.n !== 1) return;
    const a = e.a * 3, b = e.b * 3;
    len += Math.hypot(positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]);
  });
  return len;
}

/**
 * Sweep: truncate one host against SEVERAL cutters in turn (a dyke swarm, or a vein plus a later
 * dyke). Applied in order, each cut operating on the result of the last, which is how a real
 * cross-cutting sequence composes. Cutters that miss cost one box test each and leave the host
 * untouched, so passing "every cross-cutting body in the project" is a reasonable thing to do.
 */
export function truncateAgainstSolids(host, cutters, opts = {}) {
  let cur = { positions: host.positions, indices: host.indices };
  const applied = [];
  let changed = false;
  for (const c of cutters || []) {
    const r = truncateAgainstSolid(cur, c, opts);
    applied.push({ id: c.id ?? null, name: c.name ?? null, ok: r.ok, changed: r.changed, reason: r.reason, stats: r.stats });
    if (r.ok && r.changed) { cur = { positions: r.positions, indices: r.indices }; changed = true; }
  }
  return { ...cur, changed, applied };
}
