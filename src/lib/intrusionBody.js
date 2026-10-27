// TASKS.csv #821 — an INTRUSION from the geological map as a closed 3D body. The stratigraphic model (#817) leaves
// intrusive units out of the stack: a stock or plug is not a layer with a top and a base. Here each mapped polygon of
// the unit becomes a watertight solid: its top is the ground inside the polygon, its walls go down from the mapped
// outline to a flat base `depthM` below the lowest point of the outcrop, vertical or dipping so the body widens
// (outward) or narrows (inward) with depth. It is a construction from the map plus two numbers the geologist chooses,
// not a model fitted to data, and is reported as such; a closed body can be measured, exported, cut on sections and
// used to restrict an estimate like any other closed surface.
//
// intrusionBody(ring, groundAt, { depthM, wallDip, flare, stepM }) -> { positions (world E, N, Z), indices, topZ: [min,
//   max], baseZ, wallOffsetM: [min, max], planAreaM2, pinchedAtM (narrowing walls that close first: the depth reached) }
//   ring: the polygon's outer ring [[E, N], ...] (closed or not; holes are not modelled - the caller says so);
//   groundAt(E, N) -> elevation (NaN outside the terrain: refused, the top would be unknown);
//   wallDip: degrees from horizontal (90 = vertical walls); flare: "out" (widens with depth) | "in" (narrows);
//   stepM: the spacing of the outline and of the top's points (the top follows the ground at about this spacing).
// Throws (with a message for the user) when the outline is off the terrain or an inward taper would cross itself.
// Pure: no three.js (its earcut would add ~7 kB to the startup bundle: three is one startup chunk), no React.
import { t as tr } from "./i18n.js";

const area2 = (r) => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };

// the ring without its closing repeat, repeated or collinear points, counter-clockwise in plan: { corners, pts } where
// pts is a point every <= step along it, each with the corner edge it lies on and its place t along that edge
function cleanRing(ring, step) {
  let r = ring.filter((p, i) => i === 0 || Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) > 1e-6);
  if (r.length > 1 && Math.hypot(r[0][0] - r[r.length - 1][0], r[0][1] - r[r.length - 1][1]) < 1e-6) r = r.slice(0, -1);
  r = r.filter((p, i) => { // drop points on a straight run: the walls are offset at true corners only
    const a = r[(i - 1 + r.length) % r.length], b = r[(i + 1) % r.length];
    return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-9 * (Math.hypot(b[0] - a[0], b[1] - a[1]) ** 2 + 1);
  });
  if (r.length < 3) return null;
  if (area2(r) < 0) r = r.slice().reverse();
  const pts = [];
  r.forEach((p, i) => {
    const q = r[(i + 1) % r.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), k = Math.max(1, Math.ceil(L / step));
    for (let j = 0; j < k; j++) pts.push({ p: [p[0] + ((q[0] - p[0]) * j) / k, p[1] + ((q[1] - p[1]) * j) / k], e: i, t: j / k });
  });
  return { corners: r, pts };
}

const segX = (a, b, c, d) => { // proper intersection of segments ab and cd
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
};
// TASKS.csv #939 — is (x, y) inside the ring (even-odd)
const inRing = (x, y, r) => { let inside = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } return inside; };
export function selfIntersects(r) {
  const n = r.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue; // neighbours through the closing edge
    if (segX(r[i], r[(i + 1) % n], r[j], r[(j + 1) % n])) return true;
  }
  return false;
}

// Ear clipping of a simple polygon (either winding): [[a, b, c] index triples], counter-clockwise. O(n^2) per ear
// search, fine for the <= ~400-point outlines used here (cleanRing has already removed repeated points).
// TASKS.csv #937 — the base ring is long straight runs (a few corners, dozens of points along each edge). With an exact
// test, rounding made some of those points tiny convex ears (sliver triangles along the outline) and let ears whose
// diagonal ran along an edge over its intermediate points; after the Float32 scene buffer those triangles crossed the
// walls by ~1e-5 m and "Restrict to a modelled volume" refused about half the dipping-wall bodies. So, with a tolerance
// scaled to the outline: a point is an ear tip only if truly convex (a straight-run point is clipped later, once a
// neighbouring ear has made it a corner), and any other point inside the ear or ON its edges blocks it. Every triangle
// then has real area and every outline point is a corner of the cap.
export function earClip(pts) {
  const n = pts.length;
  if (n < 3) return [];
  const ccwRing = area2(pts) >= 0;
  let V = pts.map((_, i) => i);
  if (!ccwRing) V.reverse();
  let span = 0;
  for (const p of pts) span = Math.max(span, Math.abs(p[0] - pts[0][0]), Math.abs(p[1] - pts[0][1]));
  const eps = 1e-9 * Math.max(1, span * span);
  const cr = (a, b, c) => (pts[b][0] - pts[a][0]) * (pts[c][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[c][0] - pts[a][0]);
  const inside = (a, b, c, p) => cr(a, b, p) >= -eps && cr(b, c, p) >= -eps && cr(c, a, p) >= -eps; // on an edge counts
  const out = [];
  let guard = 0;
  while (V.length > 3 && guard++ < 4 * n * n) {
    let clipped = false;
    for (let i = 0; i < V.length; i++) {
      const a = V[(i - 1 + V.length) % V.length], b = V[i], c = V[(i + 1) % V.length];
      if (cr(a, b, c) <= eps) continue; // reflex, or a straight-run point (within rounding): not an ear tip yet
      let blocked = false;
      for (const v of V) {
        if (v === a || v === b || v === c) continue;
        if (inside(a, b, c, v)) { blocked = true; break; }
      }
      if (blocked) continue;
      out.push([a, b, c]);
      V.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // not simple: leave the rest (the caller's closed check would fail rather than hang)
  }
  if (V.length === 3 && cr(V[0], V[1], V[2]) > eps) out.push([V[0], V[1], V[2]]);
  if (out.length !== n - 2) throw new Error(tr("This outline could not be triangulated (it may cross itself)."));
  return out;
}

// Douglas-Peucker over a closed ring: the indices of the corners kept (in order), anchored at corner 0 and the corner
// farthest from it
export function simplifyRing(C, tol) {
  const n = C.length;
  let far = 0, fd = -1;
  C.forEach((p, i) => { const d = Math.hypot(p[0] - C[0][0], p[1] - C[0][1]); if (d > fd) { fd = d; far = i; } });
  const keep = new Set([0, far]);
  const dp = (a, b) => { // the path a -> b going forward (wrapping)
    const A = C[a], B = C[b], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    let best = -1, bi = -1;
    for (let i = (a + 1) % n; i !== b; i = (i + 1) % n) {
      const P = C[i], d = L < 1e-12 ? Math.hypot(P[0] - A[0], P[1] - A[1]) : Math.abs((B[0] - A[0]) * (A[1] - P[1]) - (A[0] - P[0]) * (B[1] - A[1])) / L;
      if (d > best) { best = d; bi = i; }
    }
    if (bi >= 0 && best > tol) { keep.add(bi); dp(a, bi); dp(bi, b); }
  };
  if (far !== 0) { dp(0, far); dp(far, 0); }
  return [...keep].sort((x, y) => x - y);
}

// the convex hull of a CCW ring as indices into it, in ring order (monotone chain)
export function hullIndices(C) {
  const idx = C.map((_, i) => i).sort((a, b) => C[a][0] - C[b][0] || C[a][1] - C[b][1]);
  const cross = (o, a, b) => (C[a][0] - C[o][0]) * (C[b][1] - C[o][1]) - (C[a][1] - C[o][1]) * (C[b][0] - C[o][0]);
  const half = (list) => { const h = []; for (const i of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], i) <= 0) h.pop(); h.push(i); } h.pop(); return h; };
  return [...half(idx), ...half(idx.slice().reverse())].sort((a, b) => a - b);
}

export function intrusionBody(ring, groundAt, { depthM = 500, wallDip = 90, flare = "out", stepM = 25 } = {}) {
  // at most ~400 outline points: a long outline gets a wider spacing (the inward-taper check is O(n^2))
  let per = 0;
  for (let i = 0; i < ring.length - 1; i++) per += Math.hypot(ring[i + 1][0] - ring[i][0], ring[i + 1][1] - ring[i][1]);
  const step = Math.max(stepM, per / 400);
  const cr = cleanRing(ring, step);
  if (!cr) throw new Error(tr("This polygon has fewer than three distinct points."));
  const r = cr.pts.map((q) => q.p);
  const topZ = r.map(([x, y]) => groundAt(x, y));
  if (topZ.some((z) => !Number.isFinite(z))) throw new Error(tr("Part of this polygon is beyond the terrain, so the top of the body is unknown there. Fetch or import a terrain that covers it."));
  let baseZ = Math.min(...topZ) - Math.max(1, depthM), pinchedAtM = null;

  // The base outline. Vertical walls: the outline itself. Dipping walls: a mapped outline wiggles at the scale of its
  // vertices (metres) while the walls move it by tens to hundreds of metres, and offsetting every wiggle makes the
  // outline cross itself. So the base is the offset of a SIMPLIFIED outline (Douglas-Peucker over the true corners,
  // tolerance ~0.3 x the largest offset, doubled up to three times if it still crosses): the mitre vector at each kept
  // corner (outward bisector / cos of the half-angle, capped at ~1.4x), blended along each simplified edge. Each top point
  // is lofted to the place on that edge matching its share of the outline's length between the two kept corners, moved
  // by its own height / tan(dip). The top keeps the true outline; only the walls are simplified.
  const C = cr.corners, nc = C.length, n = r.length, sign = flare === "in" ? -1 : 1;
  const cot = wallDip >= 89.99 ? 0 : 1 / Math.tan((Math.max(1, wallDip) * Math.PI) / 180);
  const cornerAt = new Map(); // corner index -> outline point index
  cr.pts.forEach((q, i) => { if (q.t === 0) cornerAt.set(q.e, i); });
  const cum = [0];
  for (let i = 1; i <= n; i++) cum.push(cum[i - 1] + Math.hypot(r[i % n][0] - r[i - 1][0], r[i % n][1] - r[i - 1][1]));
  const hMax = Math.max(...topZ) - baseZ;
  let base = r.map((p) => [p[0], p[1]]), simplifiedTo = nc;
  if (cot) {
    let ok = false;
    // tolerance: 0.3 x the largest offset, but at most 0.15 x the outline's size so a small outcrop keeps its shape;
    // walls that widen with depth fall back to the outline's CONVEX HULL (an outward offset of a convex outline never
    // crosses itself; at offsets larger than the outcrop the true buffer is nearly convex anyway)
    let dia = 0;
    for (const p of C) dia = Math.max(dia, Math.hypot(p[0] - C[0][0], p[1] - C[0][1]));
    const tries = [];
    for (let k = 0, tol = Math.max(1e-6, Math.min(0.3 * hMax * cot, 0.15 * dia)); k < 4; k++, tol *= 2) tries.push(() => simplifyRing(C, tol));
    if (sign > 0) tries.push(() => hullIndices(C));
    for (const next of tries) {
      if (ok) break;
      const K = next();
      if (K.length < 3) continue;
      const S = K.map((k) => C[k]), ns = S.length;
      const mitre = S.map((p, i) => {
        const a = S[(i - 1 + ns) % ns], b = S[(i + 1) % ns];
        const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
        const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
        const n1 = [e1[1] / l1, -e1[0] / l1], n2 = [e2[1] / l2, -e2[0] / l2]; // outward normals (right of a CCW ring)
        let bx = n1[0] + n2[0], by = n1[1] + n2[1];
        const bl = Math.hypot(bx, by);
        if (bl < 1e-9) { bx = n2[0]; by = n2[1]; } else { bx /= bl; by /= bl; }
        const cosHalf = Math.max(0.7, bx * n2[0] + by * n2[1]); // at most ~1.4x: a sharp corner would otherwise throw a spike far out (a square keeps its exact 1.41x)
        return [bx / cosHalf, by / cosHalf];
      });
      const b = new Array(n), span = new Array(n);
      for (let j = 0; j < ns; j++) {
        const A = cornerAt.get(K[j]), B = cornerAt.get(K[(j + 1) % ns]);
        const cA = cum[A], len = ((cum[B] - cA) + cum[n]) % cum[n] || cum[n];
        for (let i = A, guard = 0; guard < n; i = (i + 1) % n, guard++) {
          if (guard && i === B) break;
          const f = (((cum[i] - cA) + cum[n]) % cum[n]) / len, h = (topZ[i] - baseZ) * cot * sign;
          const q0 = S[j], q1 = S[(j + 1) % ns], m0 = mitre[j], m1 = mitre[(j + 1) % ns];
          b[i] = [q0[0] + (q1[0] - q0[0]) * f + (m0[0] + (m1[0] - m0[0]) * f) * h, q0[1] + (q1[1] - q0[1]) * f + (m0[1] + (m1[1] - m0[1]) * f) * h];
          span[i] = [q1[0] - q0[0], q1[1] - q0[1]];
        }
      }
      // an edge that turned round against its simplified edge (a shrinking outline passed through itself) is a crossing
      const flipped = b.some((q, i) => { const k = (i + 1) % n; return (b[k][0] - q[0]) * span[i][0] + (b[k][1] - q[1]) * span[i][1] < 0; });
      // #939 — narrowing walls must stay under the outcrop: a coarse simplification (an L outline taken as a triangle) put
      // 321 of 512 base points outside it; such a try is skipped like a crossing one
      if (area2(b) > 0 && !flipped && !selfIntersects(b) && (sign > 0 || b.every((q) => inRing(q[0], q[1], r)))) { base = b; ok = true; simplifiedTo = ns; }
    }
    if (!ok && sign < 0) {
      // narrowing walls, when the offset outline crosses itself: each point shrinks toward the outline's centroid so its
      // inward move is about its height / tan(dip) on average (a shape's "radius" for this is 2 x area / perimeter). A
      // blob-shaped outcrop stays simple; the body pinches out where the move reaches that radius.
      const A = area2(r), R = (2 * A) / cum[n];
      let cx = 0, cy = 0;
      for (let i = 0; i < n; i++) { const p = r[i], q = r[(i + 1) % n], w = p[0] * q[1] - q[0] * p[1]; cx += (p[0] + q[0]) * w; cy += (p[1] + q[1]) * w; }
      cx /= 6 * A; cy /= 6 * A;
      // a body that closes before the chosen depth ends where its base is a fifth of the outline (reported)
      if ((Math.max(...topZ) - baseZ) * cot > 0.8 * R) {
        const z = Math.max(...topZ) - (0.8 * R) / cot;
        if (z < Math.min(...topZ) - 1) { baseZ = z; pinchedAtM = Math.min(...topZ) - z; }
      }
      const k = r.map((_, i) => 1 - ((topZ[i] - baseZ) * cot) / R);
      // TASKS.csv #939 — for a crescent, L or horseshoe outcrop the centroid lies outside the outline, so shrinking toward
      // it slid the base into the empty embayment (352 of 352 base points outside a crescent's outline) with walls far
      // flatter than asked: refused, with the same message as any other inward offset that cannot be built
      if (Math.min(...k) > 0.05 && inRing(cx, cy, r)) {
        const b = r.map((p, i) => [cx + (p[0] - cx) * k[i], cy + (p[1] - cy) * k[i]]);
        if (area2(b) > 0 && !selfIntersects(b) && b.every((q) => inRing(q[0], q[1], r))) { base = b; ok = true; simplifiedTo = 0; }
      }
    }
    if (!ok) {
      throw new Error(sign < 0
        ? tr("Walls dipping {dip}° inward cross over before reaching {depth} m: the body would pinch out first. Use steeper walls or a shallower depth.", { dip: wallDip, depth: depthM })
        : tr("Walls dipping {dip}° outward make this outline cross itself at depth (a narrow neck or inlet). Use steeper walls or a shallower depth.", { dip: wallDip, depth: depthM }));
    }
  }

  // top cap: earcut of the outline, then uniform midpoint subdivision until edges are about `step` (capped), every
  // vertex on the ground; the outline's subdivided points become the walls' top edge
  const tris = earClip(r);
  const P = r.map((p) => [p[0], p[1]]);
  const ccw = (a, b, c, Q) => (Q[b][0] - Q[a][0]) * (Q[c][1] - Q[a][1]) - (Q[b][1] - Q[a][1]) * (Q[c][0] - Q[a][0]) > 0;
  let T = tris.map((t) => (ccw(t[0], t[1], t[2], P) ? [t[0], t[1], t[2]] : [t[0], t[2], t[1]])); // CCW in plan (earcut does not promise a winding)
  let maxE = 0;
  for (const [a, b, c] of T) for (const [u, v] of [[a, b], [b, c], [c, a]]) maxE = Math.max(maxE, Math.hypot(P[u][0] - P[v][0], P[u][1] - P[v][1]));
  let levels = 0;
  while (levels < 4 && maxE / 2 ** levels > 4 * step && T.length * 4 ** (levels + 1) <= 60000) levels++;
  // boundary edges are split too: keep, for each outline edge, the chain of points along it
  const mid = new Map();
  const midOf = (u, v) => {
    const k = u < v ? `${u},${v}` : `${v},${u}`;
    if (!mid.has(k)) { P.push([(P[u][0] + P[v][0]) / 2, (P[u][1] + P[v][1]) / 2]); mid.set(k, P.length - 1); }
    return mid.get(k);
  };
  let chains = r.map((_, i) => [i, (i + 1) % n]); // outline edge i as a list of vertex ids, start to end
  for (let l = 0; l < levels; l++) {
    const next = [];
    for (const [a, b, c] of T) { const ab = midOf(a, b), bc = midOf(b, c), ca = midOf(c, a); next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
    T = next;
    chains = chains.map((ch) => ch.flatMap((v, j) => (j ? [midOf(ch[j - 1], v), v] : [v])));
  }
  const topRing = chains.flatMap((ch) => ch.slice(0, -1)); // the outline's vertex ids, CCW
  const m = topRing.length;

  // base outline at the same points: interpolated between the base corners of each original outline edge
  const baseRing = [];
  chains.forEach((ch, i) => {
    const a = base[i], b = base[(i + 1) % n], k = ch.length - 1;
    for (let j = 0; j < k; j++) baseRing.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  });

  const nTop = P.length, positions = new Float64Array((nTop + m) * 3);
  P.forEach(([x, y], i) => { positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = groundAt(x, y); });
  baseRing.forEach(([x, y], j) => { const i = nTop + j; positions[i * 3] = x; positions[i * 3 + 1] = y; positions[i * 3 + 2] = baseZ; });
  for (let i = 0; i < nTop; i++) if (!Number.isFinite(positions[i * 3 + 2])) positions[i * 3 + 2] = Math.min(...topZ); // an interior point just off a terrain edge
  const idx = [];
  for (const [a, b, c] of T) idx.push(a, b, c); // top, CCW from above = outward (up)
  for (let j = 0; j < m; j++) { // walls: outward
    const t0 = topRing[j], t1 = topRing[(j + 1) % m], b0 = nTop + j, b1 = nTop + ((j + 1) % m);
    idx.push(t0, b0, b1, t0, b1, t1);
  }
  const btris = earClip(baseRing);
  for (const [a, b, c] of btris) { if (ccw(a, b, c, baseRing)) idx.push(nTop + a, nTop + c, nTop + b); else idx.push(nTop + a, nTop + b, nTop + c); } // base: clockwise from above = facing down
  const offs = base.map((q, i) => Math.hypot(q[0] - r[i][0], q[1] - r[i][1]) * sign);
  // TASKS.csv #939 — the wall dip actually built at each outline point (atan(height / horizontal move)): the simplified
  // or centroid-shrunk base can make it differ from the dip asked for, and the caller says so
  let dMin = 90, dMax = 0;
  r.forEach((p, i) => { const mv = Math.hypot(base[i][0] - p[0], base[i][1] - p[1]), h = topZ[i] - baseZ; const d = mv > 1e-6 ? (Math.atan(h / mv) * 180) / Math.PI : 90; dMin = Math.min(dMin, d); dMax = Math.max(dMax, d); });
  return { positions, indices: Uint32Array.from(idx), topZ: [Math.min(...topZ), Math.max(...topZ)], baseZ, wallOffsetM: [Math.min(...offs), Math.max(...offs)], planAreaM2: area2(r), baseCorners: simplifiedTo, corners: nc, pinchedAtM, wallDipDeg: [dMin, dMax] };
}
