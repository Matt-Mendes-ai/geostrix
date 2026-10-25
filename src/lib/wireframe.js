// TASKS.csv #570 — EXPLICIT wireframing: outline a body on each section, link the outlines, get a closed solid. The
// #494 review: "auditors and many vein domains still expect an explicit, hand-controlled solid"; implicit modelling
// stays the app's main route, this is the hand-controlled one beside it.
//
// linkOutlines(outlines, { n }) -> { positions (flat E, N, Z), indices, sections, volume, warnings }
//   outlines: [{ points: [{ x, y, z }] (a closed loop, >= 3 points, not repeating the first), ax, ay, bx, by (the
//   section line) }] in any order. Steps:
//   1. order the sections along their common normal (the first section's), by each outline's centroid;
//   2. resample every loop to n points (128) at equal arc length - a corner falling between two samples is cut a
//      little (a 80 x 50 m rectangle at n = 64 lost 0.09 % of its area), so volumes are good to a fraction of a percent;
//   3. give every loop the same winding in one shared frame (first section's horizontal direction, and up);
//   4. for each neighbouring pair, rotate the second loop's start to the one that minimizes the summed distance
//      between paired points measured from each loop's centroid (so a shifted outline still pairs shape to shape);
//      TASKS.csv #874 — unless both outlines carry a TIE vertex (a point with `tie: true`, Shift+click in the section
//      window): then the two ties pair with each other, as a Leapfrog / Micromine tie line does;
//   4b. TASKS.csv #874 — strips whose two triangles face opposite ways are FOLDED (the outlines' points did not pair up:
//      a 100 x 20 m rectangle linked to a 20 x 100 m one folded 36 of 64 quads and added 26 % volume): counted and
//      reported per pair, in `twisted` and a warning;
//   5. a strip of triangles between each pair; flat end caps (ear-clipped in that same frame) on the first and last
//      outline - the solid ENDS at the end sections (it is not extrapolated half a spacing beyond them);
//   6. wound outward (signed volume positive) - every edge in exactly two triangles, so volumetrics accepts it.
// Pure: no three.js.
import { t as tr } from "./i18n.js"; // TASKS.csv #786

function centroid(pts) {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p.x; y += p.y; z += p.z; }
  return { x: x / pts.length, y: y / pts.length, z: z / pts.length };
}

// equal arc-length resampling of a closed loop, starting at its first point
export function resampleLoop(pts, n) {
  const m = pts.length, seg = [];
  let total = 0;
  for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % m]; const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); seg.push(d); total += d; }
  if (!(total > 0)) throw new Error(tr("An outline has all its points in one place."));
  const out = [];
  let i = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k * total) / n;
    while (acc + seg[i] < target - 1e-9 && i < m - 1) { acc += seg[i]; i++; }
    const t = seg[i] > 0 ? (target - acc) / seg[i] : 0;
    const a = pts[i], b = pts[(i + 1) % m];
    out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) });
  }
  return out;
}

// ear clipping of a simple polygon given in 2D ([u, v], counter-clockwise); returns index triples. Resampled outlines
// have runs of collinear points (16 along each side of a rectangle at n = 64): a flat vertex is clipped as a zero-area
// triangle - it must still be emitted, or its two edges (shared with the side strips) would be left open - and a point
// lying ON a candidate ear's edge does not block it (only points strictly inside do).
function earClip(pts2) {
  const idx = pts2.map((_, i) => i), tris = [];
  let span = 0;
  for (const p of pts2) for (const q of [pts2[0]]) span = Math.max(span, Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]));
  const eps = 1e-9 * Math.max(1, span * span);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const strictlyInside = (p, a, b, c) => cross(a, b, p) > eps && cross(b, c, p) > eps && cross(c, a, p) > eps;
  let guard = 0;
  while (idx.length > 3 && guard++ < 100000) {
    let clipped = false;
    // prefer real (convex) ears; take a flat one only when no convex ear is free
    for (const wantFlat of [false, true]) {
      for (let k = 0; k < idx.length; k++) {
        const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
        const a = pts2[i0], b = pts2[i1], c = pts2[i2], cr = cross(a, b, c);
        if (wantFlat ? Math.abs(cr) > eps : cr <= eps) continue;
        let ear = true;
        if (!wantFlat) for (const j of idx) { if (j === i0 || j === i1 || j === i2) continue; if (strictlyInside(pts2[j], a, b, c)) { ear = false; break; } }
        if (!ear) continue;
        tris.push([i0, i1, i2]); idx.splice(k, 1); clipped = true; break;
      }
      if (clipped) break;
    }
    if (!clipped) return null; // TASKS.csv #860 — no ear left: the outline crosses itself (it used to be fanned silently)
  }
  if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
  return tris;
}

// TASKS.csv #860 — does a closed 2D loop cross itself? (non-adjacent segments that properly intersect; O(n^2), n small)
export function loopSelfIntersects(q) {
  const m = q.length, o = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
    if (j === i + 1 || (i === 0 && j === m - 1)) continue;
    const a = q[i], b = q[(i + 1) % m], c = q[j], d = q[(j + 1) % m];
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  }
  return false;
}

export function linkOutlines(outlines, { n = 128 } = {}) {
  const usable = (outlines || []).filter((o) => o.points?.length >= 3).map((o, i) => ({ ...o, section: o.section || String(i + 1) })); // #860: named in messages
  if (usable.length < 2) throw new Error(tr("At least two sections need an outline of that name."));
  const warnings = [];
  // TASKS.csv #860 — refuse what cannot be linked into a well-defined solid, instead of reporting a volume for it
  const label = (o) => o.section;
  const bySection = new Map();
  usable.forEach((o, i) => { const k = o.section ?? `${o.ax},${o.ay},${o.bx},${o.by}`; bySection.set(k, [...(bySection.get(k) || []), label(o, i)]); });
  for (const names of bySection.values()) if (names.length > 1) throw new Error(tr("Two outlines of this name are on section {s}. A body that branches is linked one branch at a time: give each branch its own name (for example VeinA-N and VeinA-S) and link each.", { s: names[0] }));
  const az = (o) => Math.atan2(o.bx - o.ax, o.by - o.ay);
  usable.forEach((o, i) => {
    const d = Math.abs(((az(o) - az(usable[0])) % Math.PI + Math.PI) % Math.PI);
    if (Math.min(d, Math.PI - d) > (10 * Math.PI) / 180) throw new Error(tr("Section {s} is not parallel to section {s0} ({deg}° apart). Outlines are linked between parallel sections only.", { s: label(o, i), s0: label(usable[0], 0), deg: ((Math.min(d, Math.PI - d) * 180) / Math.PI).toFixed(0) }));
  });
  usable.forEach((o, i) => {
    let ux0 = o.bx - o.ax, uy0 = o.by - o.ay; const l0 = Math.hypot(ux0, uy0) || 1; ux0 /= l0; uy0 /= l0;
    const q = o.points.map((p) => [p.x * ux0 + p.y * uy0, p.z]);
    if (loopSelfIntersects(q)) throw new Error(tr("The outline on section {s} crosses itself. Redraw it as one loop that does not cross.", { s: label(o, i) }));
  });
  // shared frame: u = the first section's horizontal direction, w = its normal, v = up
  const s0 = usable[0];
  let ux = s0.bx - s0.ax, uy = s0.by - s0.ay; const ul = Math.hypot(ux, uy) || 1; ux /= ul; uy /= ul;
  const wx = uy, wy = -ux;
  const items = usable.map((o) => ({ ...o, c: centroid(o.points) })).map((o) => ({ ...o, off: o.c.x * wx + o.c.y * wy }));
  items.sort((a, b) => a.off - b.off);
  for (let i = 1; i < items.length; i++) if (Math.abs(items[i].off - items[i - 1].off) < 1) throw new Error(tr("The outlines on {a} and {b} lie in the same plane (under 1 m apart), so there is nothing to link between them.", { a: items[i - 1].section, b: items[i].section }));
  const to2 = (p) => [p.x * ux + p.y * uy, p.z];
  const loops = items.map((o) => {
    // #874 — a tie vertex becomes the loop's first point (resampling starts there, the winding fix keeps it first)
    const ti = o.points.findIndex((p) => p.tie);
    let r = resampleLoop(ti > 0 ? [...o.points.slice(ti), ...o.points.slice(0, ti)] : o.points, n);
    let area = 0; const q = r.map(to2);
    for (let i = 0; i < n; i++) { const a = q[i], b = q[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) r = [r[0], ...r.slice(1).reverse()]; // counter-clockwise in (u, up)
    r.area2 = Math.abs(area) / 2;
    r.section = o.section;
    r.tied = ti >= 0;
    return r;
  });
  const biggest = Math.max(...loops.map((r) => r.area2));
  for (const r of loops) if (!(r.area2 > 1e-4 * biggest)) throw new Error(tr("The outline on section {s} encloses almost no area: it is a line, not an outline.", { s: r.section })); // a pinch-out to 0.1 % still links
  // align each loop's start with the previous one's
  for (let s = 1; s < loops.length; s++) {
    const A = loops[s - 1], B = loops[s], cA = centroid(A), cB = centroid(B);
    if (A.tied && B.tied) continue; // #874 — tied: index 0 pairs with index 0
    let best = 0, bestD = Infinity;
    for (let k = 0; k < n; k++) {
      let d = 0;
      for (let i = 0; i < n; i++) { const a = A[i], b = B[(i + k) % n]; d += ((a.x - cA.x) - (b.x - cB.x)) ** 2 + ((a.y - cA.y) - (b.y - cB.y)) ** 2 + ((a.z - cA.z) - (b.z - cB.z)) ** 2; }
      if (d < bestD) { bestD = d; best = k; }
    }
    const sec = B.section, tied = B.tied;
    loops[s] = B.map((_, i) => B[(i + best) % n]);
    loops[s].section = sec; loops[s].tied = tied;
  }
  // #874 — folded strip quads: the normals of a quad's two triangles (a b c, a c d) point opposite ways
  const twisted = [];
  for (let s = 0; s < loops.length - 1; s++) {
    let k = 0;
    for (let i = 0; i < n; i++) {
      const a = loops[s][i], b = loops[s][(i + 1) % n], c = loops[s + 1][(i + 1) % n], d = loops[s + 1][i];
      const nrm = (p, q, r) => { const u = [q.x - p.x, q.y - p.y, q.z - p.z], v = [r.x - p.x, r.y - p.y, r.z - p.z]; return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; };
      const n1 = nrm(a, b, c), n2 = nrm(a, c, d);
      if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < 0) k++;
    }
    if (k) twisted.push({ from: loops[s].section, to: loops[s + 1].section, folded: k, of: n });
  }
  for (const t of twisted) warnings.push(tr("between {a} and {b} {k} of {n} strips are folded (the two outlines' points do not pair up, so the volume there is unreliable): mark a tie point on both outlines (Shift+click a vertex while editing) and link again", { a: t.from, b: t.to, k: t.folded, n: t.of }));
  const positions = [], indices = [];
  loops.forEach((L) => L.forEach((p) => positions.push(p.x, p.y, p.z)));
  const V = (s, i) => s * n + (i % n);
  for (let s = 0; s < loops.length - 1; s++) for (let i = 0; i < n; i++) {
    const a = V(s, i), b = V(s, i + 1), c = V(s + 1, i + 1), d = V(s + 1, i);
    indices.push(a, b, c, a, c, d);
  }
  // end caps: counter-clockwise loops in (u, up) -> one cap reversed so both face outward once the whole is oriented
  const cap = (s, flip) => {
    const tris = earClip(loops[s].map(to2));
    if (!tris) throw new Error(tr("The outline on section {s} could not be closed with a flat cap (it crosses itself after resampling). Simplify it and link again.", { s: loops[s].section }));
    for (const [i, j, k] of tris) flip ? indices.push(V(s, i), V(s, k), V(s, j)) : indices.push(V(s, i), V(s, j), V(s, k));
  };
  cap(0, true); cap(loops.length - 1, false);
  // orient outward (signed volume taken about the first vertex: UTM coordinates would swamp it about the origin)
  let v6 = 0;
  const o = [positions[0], positions[1], positions[2]];
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map((k) => [positions[3 * k] - o[0], positions[3 * k + 1] - o[1], positions[3 * k + 2] - o[2]]);
    v6 += a[0] * (b[1] * c[2] - b[2] * c[1]) + a[1] * (b[2] * c[0] - b[0] * c[2]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
  }
  if (v6 < 0) { for (let t = 0; t < indices.length; t += 3) { const x = indices[t + 1]; indices[t + 1] = indices[t + 2]; indices[t + 2] = x; } v6 = -v6; }
  return { positions: Float64Array.from(positions), indices: Uint32Array.from(indices), sections: loops.length, volume: v6 / 6, warnings, twisted, tied: loops.filter((L) => L.tied).length };
}
