// TASKS.csv #3126 (Matt, 2026-11-12, Perk-Rocky in Google Earth: every litho unit filled except And, the unit covering most of the map) — one of And's
// 43 holes crosses itself once in the written KML: in the project's metres its edge 38 passes about a centimetre from vertex 40, and the
// reprojection to longitude / latitude, rounded to 7 decimals (~1 cm), carries it across. So the check runs on the coordinates as written. Google Earth does not fill an invalid polygon, so the whole 20.6 km² unit
// showed as an outline. A ring that crosses itself is split at each crossing into simple loops before it is written: a crossing hole becomes
// two holes, a crossing outer ring two outer rings (polygonsFromRings then gives each hole to the outer ring holding it). Pure.
//
// splitSelfCrossing(ring) -> [ring, ...]: ring as [[x, y, ...], ...], closed or not; the loops come back open (no repeated first vertex), each
// starting at one of the ring's own vertices (never at a crossing point, which lies on the edge of the other loop: polygonsFromRings reads a
// ring's first vertex to tell what holds it). A simple ring comes back as it is.
const EPS = 1e-12;

// the proper crossing of segments a-b and c-d (inside both, not at an end) -> [x, y, t] | null
function crossing(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS * (Math.abs(rx) + Math.abs(ry)) * (Math.abs(sx) + Math.abs(sy))) return null; // parallel
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  const e = 1e-9;
  if (t <= e || t >= 1 - e || u <= e || u >= 1 - e) return null;
  return [a[0] + t * rx, a[1] + t * ry, t];
}

// the first crossing of two non-adjacent edges of an open ring (edge i: v[i] -> v[i + 1], the last one back to v[0]) -> { i, j, p } | null
// Edges are bucketed on a grid so a ring of thousands of vertices is not checked pair by pair.
function firstCrossing(v) {
  const n = v.length;
  if (n < 4) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, len = 0;
  for (let i = 0; i < n; i++) { const p = v[i], q = v[(i + 1) % n]; x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); len += Math.hypot(q[0] - p[0], q[1] - p[1]); }
  const cell = Math.max(len / n, (Math.max(x1 - x0, y1 - y0) || 1) / 512, 1e-9);
  const grid = new Map(), key = (gx, gy) => gx * 1048576 + gy;
  for (let i = 0; i < n; i++) {
    const p = v[i], q = v[(i + 1) % n];
    const gx0 = Math.floor((Math.min(p[0], q[0]) - x0) / cell), gx1 = Math.floor((Math.max(p[0], q[0]) - x0) / cell);
    const gy0 = Math.floor((Math.min(p[1], q[1]) - y0) / cell), gy1 = Math.floor((Math.max(p[1], q[1]) - y0) / cell);
    for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) { const k = key(gx, gy); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  }
  let best = null;
  for (const list of grid.values()) {
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      let i = list[a], j = list[b];
      if (i > j) [i, j] = [j, i];
      if (j - i < 2 || (i === 0 && j === n - 1)) continue; // neighbours share a vertex
      if (best && (i > best.i || (i === best.i && j >= best.j))) continue;
      const c = crossing(v[i], v[i + 1], v[j], v[(j + 1) % n]);
      if (c) best = { i, j, p: [c[0], c[1], ...(v[i].length > 2 ? [v[i][2] + c[2] * ((v[i + 1][2] ?? v[i][2]) - v[i][2])] : [])] };
    }
  }
  return best;
}

export function splitSelfCrossing(ring, maxLoops = 1000) {
  if (!ring || ring.length < 4) return ring ? [ring] : [];
  const closed = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  const start = closed ? ring.slice(0, -1) : ring.slice();
  const cuts = new Set(); // the crossing points made here (objects), never a loop's first vertex
  const out = [], todo = [start];
  let simple = true;
  while (todo.length) {
    const v = todo.pop();
    const c = out.length + todo.length < maxLoops ? firstCrossing(v) : null;
    if (!c) { out.push(v); continue; }
    simple = false;
    const { i, j, p } = c;
    cuts.add(p);
    todo.push([p, ...v.slice(i + 1, j + 1)], [p, ...v.slice(j + 1), ...v.slice(0, i + 1)]);
  }
  if (simple) return [ring];
  return out
    .filter((v) => v.length >= 3)
    .map((v) => { const k = v.findIndex((q) => !cuts.has(q)); return k > 0 ? [...v.slice(k), ...v.slice(0, k)] : v; })
    .filter((v) => { let a = 0; for (let i = 0, j = v.length - 1; i < v.length; j = i++) a += (v[j][0] - v[i][0]) * (v[j][1] + v[i][1]); return a !== 0; }); // only a loop with no area (collinear) is dropped: a sliver of a few cm² is still a loop
}
// every ring of a feature split where it crosses itself
export const splitRings = (rings) => (rings || []).flatMap((r) => splitSelfCrossing(r));
export const ringCrossesItself = (ring) => { const v = ring && ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring; return !!(v && firstCrossing(v)); };
