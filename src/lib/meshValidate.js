// TASKS.csv #860 — is a closed mesh a valid SOLID? isMeshClosed (meshQuery.js) answers "every edge in two triangles",
// which a self-intersecting shell also passes - and inside-tests by ray parity are wrong inside a self-intersection, so
// such a shell gives wrong volumes, wrong "Restrict to a modelled volume" membership and wrong Solid blocks. The #855
// review linked a figure-8 outline into a "closed" 0 m3 solid with 111 self-intersecting triangle pairs.
//
// validateSolid(positions, indices, { maxTriangles }) -> { triangles, openEdges, nonManifoldEdges, windingConflicts,
//   selfIntersectingPairs, checked, firstIntersection }
//   openEdges: edges used once; nonManifoldEdges: used more than twice; windingConflicts: edges traversed twice in the
//   same direction (neighbouring triangles facing opposite ways); selfIntersectingPairs: triangle pairs sharing no
//   vertex whose interiors cross (an edge of one passing through the other), found with a uniform grid over the
//   triangles' boxes. Above maxTriangles the intersection test is skipped (checked: false) - it is said, not guessed.
// Pure: no three.js.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// does segment p->q pass through the interior of triangle (a, b, c)? (Moller-Trumbore, ends and edges excluded)
function segHitsTri(p, q, a, b, c, eps) {
  const d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false; // parallel / coplanar: not counted
  const f = 1 / det, s = sub(p, a), u = f * dot(s, h);
  if (u <= eps || u >= 1 - eps) return false;
  const qv = cross(s, e1), v = f * dot(d, qv);
  if (v <= eps || u + v >= 1 - eps) return false;
  const t = f * dot(e2, qv);
  return t > eps && t < 1 - eps;
}

export function validateSolid(positions, indices, { maxTriangles = 200000 } = {}) {
  const nT = (indices.length / 3) | 0;
  // edges: key "lo,hi" -> [count, directed count lo->hi]
  const edges = new Map();
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const a = indices[3 * t + k], b = indices[3 * t + ((k + 1) % 3)];
    const lo = Math.min(a, b), hi = Math.max(a, b), key = lo * 4294967296 + hi;
    const e = edges.get(key) || [0, 0];
    e[0]++; if (a === lo) e[1]++;
    edges.set(key, e);
  }
  let openEdges = 0, nonManifoldEdges = 0, windingConflicts = 0;
  for (const [n, fwd] of edges.values()) {
    if (n === 1) openEdges++;
    else if (n > 2) nonManifoldEdges++;
    else if (fwd !== 1) windingConflicts++;
  }
  const out = { triangles: nT, openEdges, nonManifoldEdges, windingConflicts, selfIntersectingPairs: 0, checked: nT <= maxTriangles, firstIntersection: null };
  if (!out.checked || nT < 2) return out;
  // a uniform grid over the bounding box, cell ~ mean triangle size; each triangle registered in the cells its box covers
  const P = (i) => [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]];
  const boxes = new Float64Array(nT * 6);
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity], sumSize = 0;
  for (let t = 0; t < nT; t++) {
    const v = [P(indices[3 * t]), P(indices[3 * t + 1]), P(indices[3 * t + 2])];
    for (let d = 0; d < 3; d++) {
      const lo = Math.min(v[0][d], v[1][d], v[2][d]), hi = Math.max(v[0][d], v[1][d], v[2][d]);
      boxes[6 * t + d] = lo; boxes[6 * t + 3 + d] = hi;
      mn[d] = Math.min(mn[d], lo); mx[d] = Math.max(mx[d], hi);
      sumSize += hi - lo;
    }
  }
  const span = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) || 1;
  const cell = Math.max(span / 1000, (1.5 * sumSize) / (3 * nT) || span / 64); // ~1.5 x the mean triangle size
  const eps = 1e-9;
  const grid = new Map();
  const ci = (x, d) => Math.floor((x - mn[d]) / cell);
  for (let t = 0; t < nT; t++) {
    for (let i = ci(boxes[6 * t], 0); i <= ci(boxes[6 * t + 3], 0); i++)
      for (let j = ci(boxes[6 * t + 1], 1); j <= ci(boxes[6 * t + 4], 1); j++)
        for (let k = ci(boxes[6 * t + 2], 2); k <= ci(boxes[6 * t + 5], 2); k++) {
          const key = (i * 1024 + j) * 1024 + k;
          let l = grid.get(key); if (!l) grid.set(key, (l = [])); l.push(t);
        }
  }
  // each candidate pair is tested once: in the cell holding the low corner of the overlap of the two boxes (no Set of
  // pairs - at 150k triangles that Set alone cost more than the tests)
  for (const [key, list] of grid) {
    const k0 = key % 1024, j0 = Math.floor(key / 1024) % 1024, i0 = Math.floor(key / 1048576);
    for (let x = 0; x < list.length; x++) {
      const s = list[x], bs = 6 * s;
      for (let y = x + 1; y < list.length; y++) {
        const t = list[y], bt = 6 * t;
        if (boxes[bs + 3] < boxes[bt] || boxes[bt + 3] < boxes[bs] || boxes[bs + 4] < boxes[bt + 1] || boxes[bt + 4] < boxes[bs + 1] || boxes[bs + 5] < boxes[bt + 2] || boxes[bt + 5] < boxes[bs + 2]) continue;
        if (ci(Math.max(boxes[bs], boxes[bt]), 0) !== i0 || ci(Math.max(boxes[bs + 1], boxes[bt + 1]), 1) !== j0 || ci(Math.max(boxes[bs + 2], boxes[bt + 2]), 2) !== k0) continue;
        const a0 = indices[3 * s], a1 = indices[3 * s + 1], a2 = indices[3 * s + 2], b0 = indices[3 * t], b1 = indices[3 * t + 1], b2 = indices[3 * t + 2];
        if (a0 === b0 || a0 === b1 || a0 === b2 || a1 === b0 || a1 === b1 || a1 === b2 || a2 === b0 || a2 === b1 || a2 === b2) continue; // neighbours
        const A = [P(a0), P(a1), P(a2)], B = [P(b0), P(b1), P(b2)];
        let hit = false;
        for (let k = 0; k < 3 && !hit; k++) hit = segHitsTri(A[k], A[(k + 1) % 3], B[0], B[1], B[2], eps) || segHitsTri(B[k], B[(k + 1) % 3], A[0], A[1], A[2], eps);
        if (hit) { out.selfIntersectingPairs++; if (!out.firstIntersection) out.firstIntersection = A[0]; }
      }
    }
  }
  return out;
}

// a valid solid: closed, manifold, consistently wound, not self-intersecting (when checked)
export const isValidSolid = (v) => v.openEdges === 0 && v.nonManifoldEdges === 0 && v.windingConflicts === 0 && v.selfIntersectingPairs === 0;

// TASKS.csv #1058 (review #1016, explicit modeller) — turn an OPEN mesh's triangles to face one way. The fault-side tests
// (explicitTrim inputsBySide, crosscut splitAcrossSurface) read the side from the nearest triangle's own normal, so a
// fault with mixed winding (a 3DFACE soup from CAD keeps whatever order each face was drawn in) put picks on both sides
// at random: 30 picks west of a fault, 12 kept and 18 called "on the other side". A breadth-first walk over shared edges
// flips each neighbour that runs a shared edge the same way; vertices are matched by position (to 1 mm), since a 3DFACE
// soup repeats them per face. Each further connected piece is turned to agree with the first piece's mean normal; the
// first triangle keeps its winding, so an already consistent mesh comes back unchanged.
// -> { indices (new Uint32Array), flipped (triangles turned), conflicts (edges still run the same way: non-orientable) }
export function orientMesh(positions, indices) {
  const nT = (indices.length / 3) | 0, out = Uint32Array.from(indices);
  const ids = new Map(), weld = new Int32Array(positions.length / 3);
  for (let v = 0; v < weld.length; v++) {
    const key = `${Math.round(positions[3 * v] * 1000)},${Math.round(positions[3 * v + 1] * 1000)},${Math.round(positions[3 * v + 2] * 1000)}`;
    let id = ids.get(key); if (id === undefined) { id = ids.size; ids.set(key, id); } weld[v] = id;
  }
  const W = (t, k) => weld[out[3 * t + k]];
  const edges = new Map(); // undirected welded edge -> triangles using it
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const a = W(t, k), b = W(t, (k + 1) % 3); if (a === b) continue;
    const key = Math.min(a, b) * 4294967296 + Math.max(a, b);
    const l = edges.get(key); if (l) l.push(t); else edges.set(key, [t]);
  }
  const runs = (t, a, b) => { for (let k = 0; k < 3; k++) if (W(t, k) === a && W(t, (k + 1) % 3) === b) return true; return false; };
  const flip = (t) => { const x = out[3 * t + 1]; out[3 * t + 1] = out[3 * t + 2]; out[3 * t + 2] = x; };
  const comp = new Int32Array(nT).fill(-1), normals = [];
  let flipped = 0;
  for (let s = 0; s < nT; s++) {
    if (comp[s] >= 0) continue;
    const c = normals.length, queue = [s], members = [];
    comp[s] = c;
    while (queue.length) {
      const t = queue.pop(); members.push(t);
      for (let k = 0; k < 3; k++) {
        const a = W(t, k), b = W(t, (k + 1) % 3); if (a === b) continue;
        const list = edges.get(Math.min(a, b) * 4294967296 + Math.max(a, b));
        if (!list || list.length !== 2) continue; // open or non-manifold edge: no neighbour to agree with
        const u = list[0] === t ? list[1] : list[0];
        if (comp[u] >= 0) continue;
        if (runs(u, a, b)) { flip(u); flipped++; } // a neighbour runs the shared edge the opposite way when consistent
        comp[u] = c; queue.push(u);
      }
    }
    const n = [0, 0, 0];
    for (const t of members) {
      const p = (k) => { const i = 3 * out[3 * t + k]; return [positions[i], positions[i + 1], positions[i + 2]]; };
      const m = cross(sub(p(1), p(0)), sub(p(2), p(0))); n[0] += m[0]; n[1] += m[1]; n[2] += m[2];
    }
    if (c > 0 && dot(n, normals[0]) < 0) { for (const t of members) flip(t); flipped += members.length; n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2]; }
    normals.push(n);
  }
  let conflicts = 0;
  for (const [key, list] of edges) {
    if (list.length !== 2) continue;
    const a = Math.floor(key / 4294967296), b = key % 4294967296;
    if (runs(list[0], a, b) === runs(list[1], a, b)) conflicts++;
  }
  return { indices: out, flipped, conflicts };
}
