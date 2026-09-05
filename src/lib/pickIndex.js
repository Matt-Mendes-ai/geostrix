// TASKS.csv #304 — object-level BVH for the 3D viewer's hover/click picking.
//
// WHY THIS EXISTS (measured, not assumed). The hover raycast cost ~6.7 ms per pointermove on the
// real 37-hole harry_property project (see #304's notes for the original measurement). Instrumenting
// the live scene showed exactly where that goes: ViewerModule hands three.js a FLAT list of 12,429
// individual objects (37 holes x 5 interval layers, one small mesh per interval, ~950k triangles in
// total) and three.js's Raycaster.intersectObjects is a plain linear scan — it does a
// bounding-sphere transform + ray/sphere test for EVERY one of those 12,429 objects on every single
// ray. Measured on that scene: the pure bounding-sphere pass alone costs 1.68 ms of the 1.74 ms that
// one intersectObjects() call takes, and an average of only 0.9 objects out of 12,429 survive it.
// So the cost is ~100% "linear scan over objects that obviously cannot be hit" and ~0% triangle
// intersection.
//
// That is why this is an OBJECT-level BVH and not a triangle-level one. three-mesh-bvh (the usual
// off-the-shelf choice, and the one #304's notes named) accelerates triangle tests INSIDE one large
// geometry — it would optimise the part of this workload that is already free, add a dependency to a
// bundle #301 just cut 193 KB out of, and leave the actual 12,429-object scan untouched.
// src/lib/meshQuery.js's hand-rolled BVH (#146) is likewise a triangle-level structure over a single
// mesh, for closest-point queries, so it is the wrong shape too. What is needed is a tree over the
// OBJECTS, which is what this file is.
//
// CORRECTNESS CONTRACT — this is the part that matters most, because a wrong pick fails silently.
// This structure never decides what was hit. It only produces a CANDIDATE SUBSET, which the caller
// then hands to the ordinary THREE.Raycaster.intersectObjects() exactly as before. So every hit is
// still computed by three.js's own unmodified code. The only way this can change a result is by
// wrongly EXCLUDING an object, so every exclusion is conservative:
//   - Node boxes are world-space AABBs enclosing all of their children's world-space AABBs, and an
//     object's world AABB is built from the 8 transformed corners of its geometry.boundingBox, so it
//     provably contains every triangle of that object. A ray that misses the AABB cannot hit the
//     object.
//   - Anything whose geometry.boundingBox does NOT bound what three.js actually raycasts goes into a
//     `rest` list that is ALWAYS returned as a candidate, never culled: THREE.Line and THREE.Points
//     (their raycast inflates by raycaster.params.*.threshold in world units, so they can be "hit"
//     outside their own bounds), InstancedMesh/BatchedMesh (geometry.boundingBox covers one instance,
//     not the placed instances), SkinnedMesh and morph-target meshes (vertices move on the GPU/at
//     raycast time), Sprites, and anything without a usable geometry.
//   - near/far and raycaster.layers are deliberately NOT considered here. Ignoring them can only ever
//     return MORE candidates, and three.js still applies them itself.
//   - Candidates are returned in their original list order (see `slot` below), so intersectObjects'
//     stable sort breaks exact-distance ties exactly the way it did before this existed.
//
// The index is a pure function of the object list it was built from; it holds no scene state and
// nothing invalidates it from the inside. Cache invalidation is the caller's job — see
// ViewerModule's pickTargetsSignature().

import * as THREE from "three";

const LEAF_SIZE = 8; // objects per leaf; below this a linear scan is cheaper than more traversal

const _corner = new THREE.Vector3();

// True only for objects whose geometry.boundingBox is a sound conservative bound on everything
// three.js's own raycast() for that object could report a hit on. Everything else is handled
// linearly instead of culled — see the correctness contract above.
function isBoxBounded(obj) {
  if (!obj || obj.isInstancedMesh || obj.isBatchedMesh || obj.isSkinnedMesh) return false;
  if (!obj.isMesh) return false; // Line/Points/Sprite/plain Object3D all have their own rules
  const g = obj.geometry;
  if (!g || !g.attributes || !g.attributes.position) return false;
  if (g.morphAttributes && g.morphAttributes.position) return false;
  return true;
}

/**
 * Build an object-level BVH over `objects` (a flat list, exactly as it would have been passed to
 * THREE.Raycaster.intersectObjects). Uses each object's CURRENT matrixWorld — the caller must
 * rebuild if objects move; see ViewerModule's signature check.
 */
export function buildPickIndex(objects) {
  const boxed = [];
  const rest = [];
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (!o) continue;
    if (isBoxBounded(o)) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      // computeBoundingBox can still yield NaN for a degenerate/empty geometry — treat that as
      // "cannot be bounded" rather than trusting a NaN box that would swallow or drop hits.
      const bb = o.geometry.boundingBox;
      if (!bb || Number.isNaN(bb.min.x) || Number.isNaN(bb.max.x)) { rest.push({ obj: o, slot: i }); continue; }
      boxed.push({ obj: o, slot: i });
    } else {
      rest.push({ obj: o, slot: i });
    }
  }

  const n = boxed.length;
  const objArr = new Array(n);
  const slotArr = new Int32Array(n);
  const bounds = new Float64Array(n * 6); // minx,miny,minz,maxx,maxy,maxz per object
  const cent = new Float64Array(n * 3);

  for (let i = 0; i < n; i++) {
    const { obj, slot } = boxed[i];
    objArr[i] = obj;
    slotArr[i] = slot;
    const bb = obj.geometry.boundingBox;
    const m = obj.matrixWorld;
    let nx = Infinity, ny = Infinity, nz = Infinity, xx = -Infinity, xy = -Infinity, xz = -Infinity;
    // 8 transformed corners — correct (and conservative) under rotation, unlike transforming
    // min/max alone.
    for (let c = 0; c < 8; c++) {
      _corner.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z);
      _corner.applyMatrix4(m);
      if (_corner.x < nx) nx = _corner.x; if (_corner.x > xx) xx = _corner.x;
      if (_corner.y < ny) ny = _corner.y; if (_corner.y > xy) xy = _corner.y;
      if (_corner.z < nz) nz = _corner.z; if (_corner.z > xz) xz = _corner.z;
    }
    const b = i * 6;
    bounds[b] = nx; bounds[b + 1] = ny; bounds[b + 2] = nz;
    bounds[b + 3] = xx; bounds[b + 4] = xy; bounds[b + 5] = xz;
    cent[i * 3] = (nx + xx) * 0.5; cent[i * 3 + 1] = (ny + xy) * 0.5; cent[i * 3 + 2] = (nz + xz) * 0.5;
  }

  // order[] is permuted in place by the build; leaves address contiguous ranges of it.
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;

  // Flat node arrays. A node is a leaf when childA < 0, in which case (start,count) is its range.
  const nodeBounds = [];
  const nodeA = [];
  const nodeB = [];
  const nodeStart = [];
  const nodeCount = [];

  const pushNode = () => { nodeBounds.push(0, 0, 0, 0, 0, 0); nodeA.push(-1); nodeB.push(-1); nodeStart.push(0); nodeCount.push(0); return nodeA.length - 1; };

  const buildRange = (start, count) => {
    const node = pushNode();
    let nx = Infinity, ny = Infinity, nz = Infinity, xx = -Infinity, xy = -Infinity, xz = -Infinity;
    let cnx = Infinity, cny = Infinity, cnz = Infinity, cxx = -Infinity, cxy = -Infinity, cxz = -Infinity;
    for (let i = start; i < start + count; i++) {
      const b = order[i] * 6, cb = order[i] * 3;
      if (bounds[b] < nx) nx = bounds[b]; if (bounds[b + 3] > xx) xx = bounds[b + 3];
      if (bounds[b + 1] < ny) ny = bounds[b + 1]; if (bounds[b + 4] > xy) xy = bounds[b + 4];
      if (bounds[b + 2] < nz) nz = bounds[b + 2]; if (bounds[b + 5] > xz) xz = bounds[b + 5];
      if (cent[cb] < cnx) cnx = cent[cb]; if (cent[cb] > cxx) cxx = cent[cb];
      if (cent[cb + 1] < cny) cny = cent[cb + 1]; if (cent[cb + 1] > cxy) cxy = cent[cb + 1];
      if (cent[cb + 2] < cnz) cnz = cent[cb + 2]; if (cent[cb + 2] > cxz) cxz = cent[cb + 2];
    }
    const nb = node * 6;
    nodeBounds[nb] = nx; nodeBounds[nb + 1] = ny; nodeBounds[nb + 2] = nz;
    nodeBounds[nb + 3] = xx; nodeBounds[nb + 4] = xy; nodeBounds[nb + 5] = xz;

    if (count <= LEAF_SIZE) { nodeStart[node] = start; nodeCount[node] = count; return node; }

    // Split at the spatial median of the centroid bounds along the widest centroid axis — O(count)
    // per level (a full sort per level would make rebuilds noticeably slower on big scenes, and this
    // tree only needs to be good, not optimal). Falls back to a middle-index split when the split
    // plane fails to separate anything (all centroids coincident, or a pathological distribution).
    const ex = cxx - cnx, ey = cxy - cny, ez = cxz - cnz;
    const axis = ex > ey ? (ex > ez ? 0 : 2) : (ey > ez ? 1 : 2);
    const mid = (axis === 0 ? (cnx + cxx) : axis === 1 ? (cny + cxy) : (cnz + cxz)) * 0.5;
    let lo = start, hi = start + count - 1;
    while (lo <= hi) {
      if (cent[order[lo] * 3 + axis] < mid) lo++;
      else { const t = order[lo]; order[lo] = order[hi]; order[hi] = t; hi--; }
    }
    let leftCount = lo - start;
    if (leftCount === 0 || leftCount === count) leftCount = count >> 1;

    nodeA[node] = buildRange(start, leftCount);
    nodeB[node] = buildRange(start + leftCount, count - leftCount);
    return node;
  };

  const root = n > 0 ? buildRange(0, n) : -1;

  return {
    root,
    order,
    objects: objArr,
    slots: slotArr,
    bounds: new Float64Array(nodeBounds),
    nodeA: new Int32Array(nodeA),
    nodeB: new Int32Array(nodeB),
    nodeStart: new Int32Array(nodeStart),
    nodeCount: new Int32Array(nodeCount),
    rest,
    total: objects.length,
    boxedCount: n,
  };
}

// Ray/AABB slab test. Zero direction components are handled with an explicit in-range check rather
// than 1/0 = Infinity, which would produce a NaN (and a silently missed hit) whenever the ray origin
// sits exactly on a slab plane.
function hitsBox(idx, nb, ox, oy, oz, dx, dy, dz) {
  const b = idx.bounds;
  let tmin = -Infinity, tmax = Infinity;
  if (dx !== 0) {
    const i = 1 / dx;
    let t1 = (b[nb] - ox) * i, t2 = (b[nb + 3] - ox) * i;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
  } else if (ox < b[nb] || ox > b[nb + 3]) return false;
  if (dy !== 0) {
    const i = 1 / dy;
    let t1 = (b[nb + 1] - oy) * i, t2 = (b[nb + 4] - oy) * i;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
  } else if (oy < b[nb + 1] || oy > b[nb + 4]) return false;
  if (dz !== 0) {
    const i = 1 / dz;
    let t1 = (b[nb + 2] - oz) * i, t2 = (b[nb + 5] - oz) * i;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
  } else if (oz < b[nb + 2] || oz > b[nb + 5]) return false;
  return tmax >= Math.max(tmin, 0);
}

const _stack = new Int32Array(128);

/**
 * Return the candidate objects a ray could possibly hit, in their ORIGINAL list order (so that
 * intersectObjects' stable distance sort resolves exact ties identically to a full linear scan).
 * Always a superset of what could actually be hit — see the correctness contract at the top.
 */
export function queryPickIndex(idx, raycaster) {
  if (!idx) return [];
  const ray = raycaster.ray;
  const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
  const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
  const picked = [];
  if (idx.root >= 0) {
    let sp = 0;
    _stack[sp++] = idx.root;
    while (sp > 0) {
      const node = _stack[--sp];
      if (!hitsBox(idx, node * 6, ox, oy, oz, dx, dy, dz)) continue;
      const a = idx.nodeA[node];
      if (a < 0) {
        const start = idx.nodeStart[node], count = idx.nodeCount[node];
        for (let i = start; i < start + count; i++) {
          const oi = idx.order[i];
          picked.push({ obj: idx.objects[oi], slot: idx.slots[oi] });
        }
      } else {
        // Depth is ~log2(n/LEAF_SIZE); the guard keeps a pathological tree from writing past the
        // stack rather than corrupting memory silently.
        if (sp + 2 <= _stack.length) { _stack[sp++] = a; _stack[sp++] = idx.nodeB[node]; }
      }
    }
  }
  for (let i = 0; i < idx.rest.length; i++) picked.push(idx.rest[i]);
  picked.sort((p, q) => p.slot - q.slot);
  const out = new Array(picked.length);
  for (let i = 0; i < picked.length; i++) out[i] = picked[i].obj;
  return out;
}
