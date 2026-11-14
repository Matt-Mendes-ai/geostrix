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
//   - TASKS.csv #3360, the one exception: a survey point (a compact batch tagged geophysSurvey) is hit on its symbol's bounding
//     sphere, decided here and by its view's raycast (layerBatches.js sphereHitDistance), and only the SPHERE_KEEP nearest shown
//     points of a survey on the ray are returned.
//
// The index is a pure function of the object list it was built from; it holds no scene state and
// nothing invalidates it from the inside. Cache invalidation is the caller's job — see
// ViewerModule's pickTargetsSignature().

import * as THREE from "three";
import { sphereHitDistance, instanceSphere } from "./viewer/layerBatches.js";

const LEAF_SIZE = 8; // objects per leaf; below this a linear scan is cheaper than more traversal

const _corner = new THREE.Vector3();
const _instM = new THREE.Matrix4(); // #1643

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

// the world AABB of a geometry's box under matrix m, from its 8 transformed corners (correct and conservative under rotation), into out at o
function boxInto(bb, m, out, o) {
  let nx = Infinity, ny = Infinity, nz = Infinity, xx = -Infinity, xy = -Infinity, xz = -Infinity;
  for (let c = 0; c < 8; c++) {
    _corner.set(c & 1 ? bb.max.x : bb.min.x, c & 2 ? bb.max.y : bb.min.y, c & 4 ? bb.max.z : bb.min.z);
    _corner.applyMatrix4(m);
    if (_corner.x < nx) nx = _corner.x; if (_corner.x > xx) xx = _corner.x;
    if (_corner.y < ny) ny = _corner.y; if (_corner.y > xy) xy = _corner.y;
    if (_corner.z < nz) nz = _corner.z; if (_corner.z > xz) xz = _corner.z;
  }
  out[o] = nx; out[o + 1] = ny; out[o + 2] = nz; out[o + 3] = xx; out[o + 4] = xy; out[o + 5] = xz;
}

// A BVH over n boxes (bounds: 6 per item) -> { root, order, bounds (6 per node), nodeA, nodeB, nodeStart, nodeCount }; a node is a leaf
// when nodeA < 0, addressing order[start .. start + count).
function buildTree(n, bounds) {
  const cent = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) { const b = i * 6; cent[i * 3] = (bounds[b] + bounds[b + 3]) * 0.5; cent[i * 3 + 1] = (bounds[b + 1] + bounds[b + 4]) * 0.5; cent[i * 3 + 2] = (bounds[b + 2] + bounds[b + 5]) * 0.5; }
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  // #3361: typed node arrays, grown by doubling (JS arrays pushed per node were most of a 543,820-instance build)
  let cap = Math.max(4, Math.ceil(n / 2)), used = 0;
  let nodeBounds = new Float64Array(cap * 6), nodeA = new Int32Array(cap), nodeB = new Int32Array(cap), nodeStart = new Int32Array(cap), nodeCount = new Int32Array(cap);
  const grow = (a, k) => { const b = new a.constructor(cap * k); b.set(a); return b; };
  const pushNode = () => {
    if (used === cap) { cap *= 2; nodeBounds = grow(nodeBounds, 6); nodeA = grow(nodeA, 1); nodeB = grow(nodeB, 1); nodeStart = grow(nodeStart, 1); nodeCount = grow(nodeCount, 1); }
    nodeA[used] = -1; nodeB[used] = -1;
    return used++;
  };
  // #3361: each node's centroid bounds come from its parent's partition (no scan of its items per level); the boxes are filled bottom-up
  // once the tree is built (refit). On 543,820 boxes the scans per level were ~0.9 s.
  const buildRange = (start, count, cnx, cny, cnz, cxx, cxy, cxz) => {
    const node = pushNode();
    if (count <= LEAF_SIZE) { nodeStart[node] = start; nodeCount[node] = count; return node; }
    // Split at the spatial median of the centroid bounds along the widest centroid axis — O(count) per level (a full sort per level would
    // make rebuilds slower on big scenes; the tree only needs to be good). Coincident centroids (no width) split at the middle index.
    const ex = cxx - cnx, ey = cxy - cny, ez = cxz - cnz;
    if (!(ex > 0 || ey > 0 || ez > 0)) {
      const h = count >> 1, ca = buildRange(start, h, cnx, cny, cnz, cxx, cxy, cxz), cb = buildRange(start + h, count - h, cnx, cny, cnz, cxx, cxy, cxz);
      nodeA[node] = ca; nodeB[node] = cb; // the children first: a build may grow (replace) the arrays
      return node;
    }
    const axis = ex > ey ? (ex > ez ? 0 : 2) : (ey > ez ? 1 : 2);
    const mid = (axis === 0 ? (cnx + cxx) : axis === 1 ? (cny + cxy) : (cnz + cxz)) * 0.5;
    let lnx = Infinity, lny = Infinity, lnz = Infinity, lxx = -Infinity, lxy = -Infinity, lxz = -Infinity;
    let rnx = Infinity, rny = Infinity, rnz = Infinity, rxx = -Infinity, rxy = -Infinity, rxz = -Infinity;
    let lo = start, hi = start + count - 1;
    while (lo <= hi) {
      const o = order[lo], c = o * 3, x = cent[c], y = cent[c + 1], z = cent[c + 2];
      if ((axis === 0 ? x : axis === 1 ? y : z) < mid) {
        if (x < lnx) lnx = x; if (x > lxx) lxx = x; if (y < lny) lny = y; if (y > lxy) lxy = y; if (z < lnz) lnz = z; if (z > lxz) lxz = z;
        lo++;
      } else {
        if (x < rnx) rnx = x; if (x > rxx) rxx = x; if (y < rny) rny = y; if (y > rxy) rxy = y; if (z < rnz) rnz = z; if (z > rxz) rxz = z;
        order[lo] = order[hi]; order[hi] = o; hi--;
      }
    }
    const left = lo - start; // both sides hold at least one: the lowest centroid is below the middle, the highest at or above it
    const ca = buildRange(start, left, lnx, lny, lnz, lxx, lxy, lxz), cb = buildRange(lo, count - left, rnx, rny, rnz, rxx, rxy, rxz);
    nodeA[node] = ca; nodeB[node] = cb;
    return node;
  };
  let cnx = Infinity, cny = Infinity, cnz = Infinity, cxx = -Infinity, cxy = -Infinity, cxz = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = cent[i * 3], y = cent[i * 3 + 1], z = cent[i * 3 + 2];
    if (x < cnx) cnx = x; if (x > cxx) cxx = x; if (y < cny) cny = y; if (y > cxy) cxy = y; if (z < cnz) cnz = z; if (z > cxz) cxz = z;
  }
  const root = n > 0 ? buildRange(0, n, cnx, cny, cnz, cxx, cxy, cxz) : -1;
  const tree = { root, order, bounds: nodeBounds.subarray(0, used * 6), nodeA: nodeA.slice(0, used), nodeB: nodeB.slice(0, used), nodeStart: nodeStart.slice(0, used), nodeCount: nodeCount.slice(0, used) };
  refit(tree, bounds);
  return tree;
}

// TASKS.csv #3361 — a compact batch's own tree over its instances, kept with the batch while its placements are unchanged (the same base
// array, size, moves (#3117) and world matrix). Adding or removing a 514-point survey beside two clouds of 543,820 points rebuilt every
// instance's box (~1 s); now only the new batch's tree is built, and the small top tree over the batches and the other objects.
// #3360: a survey batch's boxes are its symbols' spheres' (centre +- radius, no matrix product), refitted on the same tree when a zoom
// resizes the symbols in place (geophysPts.js rescale: sampled scales differ), so a grown symbol's rim is no longer missed.
const BATCH_TREES = new WeakMap();
const scaleSample = (base, n) => { let s = ""; const step = Math.max(1, Math.floor(n / 16)); for (let k = 0; k < n; k += step) s += `${base[k * 16]},`; return s; };
export function batchTree(o) { // exported for the tests
  const cp = o.userData.compact, n = cp.rows.length, sphere = o.userData.geophysSurvey != null;
  const key = `${n}|${cp.moves || 0}|${sphere}|${o.matrixWorld.elements.join(",")}`, scales = sphere ? scaleSample(cp.base, n) : "";
  const kept = BATCH_TREES.get(o);
  if (kept && kept.key === key && kept.base === cp.base) {
    if (kept.scales !== scales) { refit(kept.tree, sphereBounds(o, n)); kept.scales = scales; }
    return kept.tree;
  }
  let bounds;
  if (sphere) bounds = sphereBounds(o, n);
  else {
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    bounds = new Float64Array(n * 6);
    for (let k = 0; k < n; k++) boxInto(bb, _instM.fromArray(cp.base, k * 16).premultiply(o.matrixWorld), bounds, k * 6);
  }
  const tree = buildTree(n, bounds);
  BATCH_TREES.set(o, { key, base: cp.base, scales, tree });
  return tree;
}
function sphereBounds(o, n) {
  const bounds = new Float64Array(n * 6);
  for (let k = 0; k < n; k++) {
    const r = instanceSphere(o, k, _corner), b = k * 6;
    bounds[b] = _corner.x - r; bounds[b + 1] = _corner.y - r; bounds[b + 2] = _corner.z - r;
    bounds[b + 3] = _corner.x + r; bounds[b + 4] = _corner.y + r; bounds[b + 5] = _corner.z + r;
  }
  return bounds;
}
// new item boxes on a built tree: each leaf the union of its items', each inner node of its children's (a child is always numbered after
// its parent, so a pass from the last node up)
function refit(t, items) {
  const B = t.bounds;
  for (let node = t.nodeA.length - 1; node >= 0; node--) {
    let nx = Infinity, ny = Infinity, nz = Infinity, xx = -Infinity, xy = -Infinity, xz = -Infinity;
    const a = t.nodeA[node], leaf = a < 0, src = leaf ? items : B;
    const st = leaf ? t.nodeStart[node] : 0, m = leaf ? t.nodeCount[node] : 2;
    for (let j = 0; j < m; j++) {
      const o = leaf ? t.order[st + j] * 6 : (j ? t.nodeB[node] : a) * 6;
      if (src[o] < nx) nx = src[o]; if (src[o + 1] < ny) ny = src[o + 1]; if (src[o + 2] < nz) nz = src[o + 2];
      if (src[o + 3] > xx) xx = src[o + 3]; if (src[o + 4] > xy) xy = src[o + 4]; if (src[o + 5] > xz) xz = src[o + 5];
    }
    const o = node * 6;
    B[o] = nx; B[o + 1] = ny; B[o + 2] = nz; B[o + 3] = xx; B[o + 4] = xy; B[o + 5] = xz;
  }
}

/**
 * Build an object-level BVH over `objects` (a flat list, exactly as it would have been passed to
 * THREE.Raycaster.intersectObjects). Uses each object's CURRENT matrixWorld — the caller must
 * rebuild if objects move; see ViewerModule's signature check. A compact batch is one item here,
 * its instances in a tree of its own (#3361).
 */
export function buildPickIndex(objects) {
  const items = [], rest = [], surveys = [];
  let boxedCount = 0;
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i];
    if (!o) continue;
    // TASKS.csv #1643 — a compact batch (layerBatches.js) stands for its instances: one box each, from the shared geometry's box
    // through the instance's own placement, exactly as for the member objects it replaced
    if (o.userData?.compact && o.userData.geophysSurvey != null) { // #3360: its tree read (and refitted if resized) per query
      batchTree(o);
      surveys.push({ obj: o, slot: i });
      boxedCount += o.userData.compact.rows.length;
      continue;
    }
    if (o.userData?.compact) {
      const sub = batchTree(o);
      if (sub.root >= 0) { items.push({ obj: o, slot: i, sub }); boxedCount += o.userData.compact.rows.length; }
      continue;
    }
    if (isBoxBounded(o)) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      // computeBoundingBox can still yield NaN for a degenerate/empty geometry — treat that as
      // "cannot be bounded" rather than trusting a NaN box that would swallow or drop hits.
      const bb = o.geometry.boundingBox;
      if (!bb || Number.isNaN(bb.min.x) || Number.isNaN(bb.max.x)) { rest.push({ obj: o, slot: i }); continue; }
      items.push({ obj: o, slot: i, sub: null });
      boxedCount++;
    } else {
      rest.push({ obj: o, slot: i });
    }
  }
  const n = items.length, bounds = new Float64Array(n * 6);
  for (let i = 0; i < n; i++) {
    const { obj, sub } = items[i];
    if (sub) bounds.set(sub.bounds.subarray(sub.root * 6, sub.root * 6 + 6), i * 6);
    else boxInto(obj.geometry.boundingBox, obj.matrixWorld, bounds, i * 6);
  }
  return {
    ...buildTree(n, bounds),
    objects: items.map((t) => t.obj),
    slots: Float64Array.from(items, (t) => t.slot),
    subs: items.map((t) => t.sub),
    surveys,
    rest,
    total: objects.length,
    boxedCount,
  };
}

// Ray/AABB slab test. Zero direction components are handled with an explicit in-range check rather
// than 1/0 = Infinity, which would produce a NaN (and a silently missed hit) whenever the ray origin
// sits exactly on a slab plane. -> the distance where the ray enters the box (0 from inside), or -1 (#3360: nearest-first pruning).
function hitsBox(b, nb, ox, oy, oz, dx, dy, dz) {
  let tmin = -Infinity, tmax = Infinity;
  if (dx !== 0) {
    const i = 1 / dx;
    let t1 = (b[nb] - ox) * i, t2 = (b[nb + 3] - ox) * i;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
  } else if (ox < b[nb] || ox > b[nb + 3]) return -1;
  if (dy !== 0) {
    const i = 1 / dy;
    let t1 = (b[nb + 1] - oy) * i, t2 = (b[nb + 4] - oy) * i;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
  } else if (oy < b[nb + 1] || oy > b[nb + 4]) return -1;
  if (dz !== 0) {
    const i = 1 / dz;
    let t1 = (b[nb + 2] - oz) * i, t2 = (b[nb + 5] - oz) * i;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1; if (t2 < tmax) tmax = t2;
  } else if (oz < b[nb + 2] || oz > b[nb + 5]) return -1;
  const t0 = tmin > 0 ? tmin : 0;
  return tmax >= t0 ? t0 : -1;
}

const _stack = new Int32Array(128), _subStack = new Int32Array(128);

// each item of tree t whose leaf the ray's box tests let through: visit(item index)
function walk(t, stack, ox, oy, oz, dx, dy, dz, visit) {
  let sp = 0;
  stack[sp++] = t.root;
  while (sp > 0) {
    const node = stack[--sp];
    if (hitsBox(t.bounds, node * 6, ox, oy, oz, dx, dy, dz) < 0) continue;
    const a = t.nodeA[node];
    if (a < 0) {
      const start = t.nodeStart[node], count = t.nodeCount[node];
      for (let i = start; i < start + count; i++) visit(t.order[i]);
    } else if (sp + 2 <= stack.length) { stack[sp++] = a; stack[sp++] = t.nodeB[node]; } // depth ~log2(n / LEAF_SIZE); the guard keeps a pathological tree inside the stack
  }
}

// TASKS.csv #3360 — a survey batch's tree walked nearer box first, a box skipped once SPHERE_KEEP hits are nearer than where the ray
// enters it (its instances' boxes enclose their spheres, see batchTree, so a sphere is never met before its box). At most SPHERE_BUDGET
// points tested: when the whole cloud is a few pixels every symbol overlaps the ray (543,820: ~0.5 s a hover), and the nearest found
// first are as good a pick as any there.
const SPHERE_BUDGET = 8192;
function walkNearest(t, stack, ox, oy, oz, dx, dy, dz, near, visit) {
  let sp = 0, left = SPHERE_BUDGET;
  stack[sp++] = t.root;
  while (sp > 0) {
    const node = stack[--sp], te = hitsBox(t.bounds, node * 6, ox, oy, oz, dx, dy, dz);
    if (te < 0 || (near.n === near.k && te >= near.d[0])) continue;
    const a = t.nodeA[node];
    if (a < 0) {
      const start = t.nodeStart[node], count = t.nodeCount[node];
      for (let i = start; i < start + count; i++) visit(t.order[i]);
      if ((left -= count) <= 0) return;
    } else if (sp + 2 <= stack.length) {
      const b = t.nodeB[node], ea = hitsBox(t.bounds, a * 6, ox, oy, oz, dx, dy, dz), eb = hitsBox(t.bounds, b * 6, ox, oy, oz, dx, dy, dz);
      if (ea >= 0 && eb >= 0) { if (ea <= eb) { stack[sp++] = b; stack[sp++] = a; } else { stack[sp++] = a; stack[sp++] = b; } } // the nearer popped first
      else if (ea >= 0) stack[sp++] = a;
      else if (eb >= 0) stack[sp++] = b;
    }
  }
}

// TASKS.csv #3360 — of one survey's points, the ray keeps the SPHERE_KEEP nearest shown ones: every consumer reads the nearest drawn hit, or
// (Identify) a short list nearest first; with symbols still sized for a far view the ray met ~516,000 of 543,820 (3.7 s in views alone)
const SPHERE_KEEP = 32;
class NearestK { // a max-heap on distance, of at most k entries
  constructor(k) { this.k = k; this.d = new Float64Array(k); this.i = new Int32Array(k); this.n = 0; }
  offer(d, i) {
    const D = this.d, I = this.i;
    if (this.n < this.k) {
      let c = this.n++;
      while (c > 0) { const p = (c - 1) >> 1; if (D[p] >= d) break; D[c] = D[p]; I[c] = I[p]; c = p; }
      D[c] = d; I[c] = i;
      return;
    }
    if (d >= D[0]) return;
    let c = 0;
    for (;;) {
      const l = 2 * c + 1, r = l + 1;
      let m = c, md = d;
      if (l < this.n && D[l] > md) { m = l; md = D[l]; }
      if (r < this.n && D[r] > md) m = r;
      if (m === c) break;
      D[c] = D[m]; I[c] = I[m]; c = m;
    }
    D[c] = d; I[c] = i;
  }
  each(fn) { for (let j = 0; j < this.n; j++) fn(this.i[j]); }
}

/**
 * Return the candidate objects a ray could possibly hit, in their ORIGINAL list order (so that
 * intersectObjects' stable distance sort resolves exact ties identically to a full linear scan).
 * Always a superset of what could actually be hit — see the correctness contract at the top.
 * TASKS.csv #3360 — a survey point is hit on its symbol's bounding sphere (its view's raycast, layerBatches.js), so an instance whose
 * sphere the ray misses is no candidate.
 */
export function queryPickIndex(idx, raycaster) {
  if (!idx) return [];
  const ray = raycaster.ray;
  const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
  const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
  const picked = [];
  if (idx.root >= 0) {
    walk(idx, _stack, ox, oy, oz, dx, dy, dz, (oi) => {
      const obj = idx.objects[oi], sub = idx.subs[oi], slot = idx.slots[oi];
      if (!sub) { picked.push({ obj, slot }); return; }
      const cp = obj.userData.compact, n = cp.rows.length;
      walk(sub, _subStack, ox, oy, oz, dx, dy, dz, (k) => picked.push({ obj: cp.view(k), slot: slot + (k + 1) / (n + 2) })); // #1643: an instance's view; its slot its batch's plus a fraction, so list order still breaks ties
    });
  }
  for (const { obj, slot } of idx.surveys || []) { // #3360
    if (obj.visible === false) continue;
    const sub = batchTree(obj), cp = obj.userData.compact, n = cp.rows.length;
    if (sub.root < 0) continue;
    const near = new NearestK(SPHERE_KEEP);
    walkNearest(sub, _subStack, ox, oy, oz, dx, dy, dz, near, (k) => {
      if (cp.hidden[k]) return;
      const d = sphereHitDistance(obj, k, ray);
      if (d >= 0) near.offer(d, k);
    });
    near.each((k) => picked.push({ obj: cp.view(k), slot: slot + (k + 1) / (n + 2) }));
  }
  for (let i = 0; i < idx.rest.length; i++) picked.push(idx.rest[i]);
  picked.sort((p, q) => p.slot - q.slot);
  const out = new Array(picked.length);
  for (let i = 0; i < picked.length; i++) out[i] = picked[i].obj;
  return out;
}
